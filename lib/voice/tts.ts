// lib/voice/tts.ts — [A] Text-to-Speech implementation
// Phase 3B+: WebSocket streaming TTS with native event-driven resolution.
//
// Overview
// ────────
// speakText() opens a WebSocket to /api/ws/tts, sends one JSON frame, and
// receives N binary frames (one WAV per sentence). Each chunk is decoded with
// decodeAudioData() and scheduled on the AudioContext clock for gapless
// playback.
//
// Resolution Strategy (event-driven, not math-based)
// ───────────────────────────────────────────────────
// The speakText() promise resolves ONLY when the very last AudioBufferSourceNode
// fires its native `onended` event — i.e., when audio physically stops coming
// out of the speakers. No setTimeout, no nextPlayTime arithmetic.
//
// Race condition handling:
//   • The server sends all binary frames and "done" within ~10 ms.
//   • decodeAudioData() is async and may not have resolved when "done" fires.
//   • We use two counters:
//       totalChunksExpected — snapshot of chunksReceived when "done" arrives.
//       chunksEnded         — incremented in every node's onended.
//   • When chunksEnded === totalChunksExpected (> 0), we resolve.
//   • Because the counters are compared in BOTH the "done" handler AND each
//     onended, whichever finishes last wins — no timing assumption needed.
//
// Barge-in protection:
//   • stopSpeaking() increments a module-level `sessionId` counter BEFORE
//     calling node.stop(). Every onended closure captures the session ID at
//     the time the node is created. If the captured ID no longer matches the
//     current module-level ID, the onended callback is a no-op.
//   • This is automatically correct across nested/overlapping speakText calls.
//
// Fallback chain (unchanged from v1):
//   Sarvam WAV via WS → Google MP3 via WS → browser SpeechSynthesis

import type { LanguageCode } from '@/lib/contracts/voice';
import { TTS_LANG_MAP } from './i18n';

// ─── AudioContext singleton ───────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

// ─── Active-session state ─────────────────────────────────────────────────────

/** The open WebSocket for the current TTS session. Closed by stopSpeaking(). */
let activeSocket: WebSocket | null = null;

/** All AudioBufferSourceNodes scheduled for the current session.
 *  Stored so stopSpeaking() can call .stop() on all of them. */
let activeSourceNodes: AudioBufferSourceNode[] = [];

/** AudioContext clock: next available start time for sequential scheduling. */
let nextPlayTime = 0;

/**
 * Monotonically increasing session counter.
 * Incremented by stopSpeaking() so that onended closures from a stopped
 * session can detect they are stale and avoid resolving the new session.
 */
let sessionId = 0;

// ─── Auto-stop on page leave / navigation ────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { stopSpeaking(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopSpeaking(); }
  });

  // Next.js client-side navigation (popstate / router.push)
  window.addEventListener('popstate', () => { stopSpeaking(); });
}

// ─── iOS / autoplay unlock ────────────────────────────────────────────────────

export function unlockAudio() {
  if (typeof window === 'undefined') return;

  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }

  // Resume the context on a user-gesture tick so iOS lifts its autoplay block
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

// ─── isTTSSupported ───────────────────────────────────────────────────────────

export function isTTSSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.speechSynthesis;
}

// ─── stopSpeaking ─────────────────────────────────────────────────────────────

export function stopSpeaking(): void {
  // 1. Invalidate the current session BEFORE stopping nodes.
  //    Any onended closure that fires after this point will see a stale
  //    sessionId and silently skip its safeResolve() call.
  sessionId++;

  // 2. Kill the open WebSocket so the server stops sending chunks
  if (activeSocket) {
    try { activeSocket.close(); } catch { /* ignore */ }
    activeSocket = null;
  }

  // 3. Stop all scheduled AudioBufferSourceNodes.
  //    The Web Audio API fires onended synchronously or on the next event loop
  //    tick after .stop(). The sessionId bump above ensures those callbacks
  //    are no-ops.
  for (const node of activeSourceNodes) {
    try { node.stop(); } catch { /* already stopped — safe to ignore */ }
  }
  activeSourceNodes = [];
  nextPlayTime = 0;

  // 4. Stop browser SpeechSynthesis fallback (if it was used)
  if (isTTSSupported()) {
    window.speechSynthesis.cancel();
  }

  // 5. Stop legacy HTMLAudioElement (Google TTS path, kept for compatibility)
  if (typeof window !== 'undefined' && (window as any)._currentAudio) {
    const audio = (window as any)._currentAudio as HTMLAudioElement;
    audio.pause();
    audio.currentTime = 0;
    (window as any)._currentAudio = null;
  }
}

// ─── speakText ────────────────────────────────────────────────────────────────

/**
 * Synthesise and play `text` in `language` using the Phase 3B WS pipeline.
 *
 * Resolves when the very last AudioBufferSourceNode fires its native `onended`
 * event — i.e., when audio physically stops coming out of the speakers.
 */
export async function speakText(
  text: string,
  language: LanguageCode,
): Promise<void> {
  // Stop any previous playback (also bumps sessionId)
  stopSpeaking();

  // Ensure AudioContext is alive and resumed (iOS unlock)
  if (!audioCtx) { unlockAudio(); }
  if (!audioCtx) {
    // AudioContext unavailable → fall through to browser TTS
    return new Promise((resolve) => fallbackSpeak(text, language, resolve));
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Seed nextPlayTime slightly ahead of now so the first chunk starts
  // immediately rather than mid-decode.
  nextPlayTime = audioCtx.currentTime + 0.1;

  // Capture the session ID for this call. Every closure below that touches
  // safeResolve captures this value and guards against stale invocations.
  const mySessionId = sessionId;

  return new Promise<void>((resolve) => {
    const wsScheme =
      typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? 'wss'
        : 'ws';
    const wsUrl = `${wsScheme}://${window.location.host}/api/ws/tts`;

    const socket = new WebSocket(wsUrl);
    activeSocket = socket;

    // ── Session counters ───────────────────────────────────────────────────
    /** Number of binary frames received from the server. */
    let chunksReceived = 0;

    /**
     * Snapshot of chunksReceived at the moment "done" arrives.
     * -1 means "done" hasn't arrived yet.
     */
    let totalChunksExpected = -1;

    /**
     * Number of AudioBufferSourceNodes whose onended has fired naturally
     * (i.e., audio finished playing to the DAC, not stopped by barge-in).
     * When this equals totalChunksExpected the promise resolves.
     */
    let chunksEnded = 0;

    let resolved = false;

    /**
     * Serialized scheduling chain. Chunks arrive from the server in sentence
     * order, but arrayBuffer()/decodeAudioData() are async and finish at
     * different times (shorter clips decode faster). Each chunk's scheduling
     * step is chained onto this promise so nextPlayTime slots are claimed in
     * arrival order — see enqueueChunk() below for the full rationale.
     */
    let scheduleChain: Promise<void> = Promise.resolve();

    // Guard: only resolve once, and only if this session is still active.
    const safeResolve = () => {
      if (resolved || sessionId !== mySessionId) return;
      resolved = true;
      resolve();
    };

    // ── Core resolution logic ─────────────────────────────────────────────
    //
    // Called from two places: each node's onended AND the "done" handler.
    // Whichever executes last (i.e., whichever of the async decode pipeline
    // or the server "done" message is slowest) will find both conditions
    // satisfied and trigger the resolve.
    const checkDone = () => {
      if (
        totalChunksExpected >= 0 &&          // "done" has arrived
        chunksEnded === totalChunksExpected   // every node has finished
      ) {
        if (totalChunksExpected === 0) {
          // Edge: "done" with zero chunks — shouldn't happen (fallback handles
          // this earlier), but guard anyway.
          safeResolve();
        } else {
          console.log(
            `[TTS] All ${totalChunksExpected} chunk(s) played to completion — resolving`,
          );
          safeResolve();
        }
      }
    };

    // ── scheduleChunk ─────────────────────────────────────────────────────

    /**
     * Decode a WAV/MP3 ArrayBuffer and schedule it on the AudioContext clock.
     *
     * The node's onended callback:
     *   1. Checks the session ID — if this session was interrupted, it is a
     *      no-op. The new session's safeResolve is untouched.
     *   2. Increments chunksEnded and calls checkDone().
     */
    const scheduleChunk = (arrayBuffer: ArrayBuffer): Promise<void> => {
      if (!audioCtx) return Promise.resolve();

      return audioCtx.decodeAudioData(arrayBuffer).then((audioBuffer) => {
        if (!audioCtx) return;
        // Bail if this session was already interrupted while we were decoding.
        if (sessionId !== mySessionId) return;

        const safeStart = Math.max(nextPlayTime, audioCtx.currentTime + 0.01);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        activeSourceNodes.push(source);

        source.onended = () => {
          // Remove from tracking list regardless of interruption
          activeSourceNodes = activeSourceNodes.filter((n) => n !== source);

          // Barge-in protection: if sessionId has advanced, this node was
          // stopped by stopSpeaking() — do NOT resolve the (now-gone) promise.
          if (sessionId !== mySessionId) return;

          chunksEnded++;
          console.log(
            `[TTS] Node ended — ${chunksEnded}/${totalChunksExpected === -1 ? '?' : totalChunksExpected} complete`,
          );
          checkDone();
        };

        source.start(safeStart);
        // Shave a little off each chunk's tail when advancing the clock so the
        // next sentence starts before this one's trailing silence finishes.
        // Sarvam pads each per-sentence WAV with sentence-final silence; with
        // gapless sequential playback that padding stacks up and sounds slow.
        // Trimming ~0.1s removes the dead air without clipping speech (we never
        // trim more than the buffer is long).
        const TAIL_TRIM = 0.1; // seconds of inter-sentence padding to remove
        nextPlayTime = safeStart + Math.max(audioBuffer.duration - TAIL_TRIM, 0.05);

        console.log(
          `[TTS] Chunk scheduled at ${safeStart.toFixed(3)}s, ` +
          `duration=${audioBuffer.duration.toFixed(3)}s, ` +
          `nextPlay=${nextPlayTime.toFixed(3)}s`,
        );
      }).catch((err) => {
        console.warn('[TTS] decodeAudioData failed for chunk:', err);
        // A failed decode means this chunk will never produce an onended
        // event. Treat it as if it "ended" so we don't hang.
        if (sessionId !== mySessionId) return;
        chunksEnded++;
        checkDone();
      });
    };

    // ── enqueueChunk: ordered scheduler ─────────────────────────────────────
    //
    // The server streams one binary frame per sentence, in sentence order. But
    // converting a Blob to an ArrayBuffer and then decodeAudioData() are BOTH
    // async, and they resolve at different times — a short trailing sentence
    // (e.g. "Say yes to continue.") decodes faster than a long opening one.
    //
    // scheduleChunk() claims the next slot on the AudioContext clock
    // (nextPlayTime) at the moment its decode finishes. If we let each chunk
    // schedule itself the instant it decoded, the fastest-decoding clip would
    // grab the earliest slot and play FIRST — which is exactly the "sentences
    // come out shuffled" bug.
    //
    // Fix: chain the scheduling so each chunk claims its slot strictly in
    // arrival (sentence) order. Decode work still overlaps network I/O for the
    // next frame; only the brief slot-assignment is serialized, so there is no
    // audible gap.
    const enqueueChunk = (abPromise: Promise<ArrayBuffer>) => {
      scheduleChain = scheduleChain.then(() =>
        abPromise
          .then((ab) => scheduleChunk(ab))
          .catch((err) => {
            console.warn('[TTS] chunk convert/schedule failed:', err);
            // Conversion failed before scheduleChunk could run — count it as
            // ended so checkDone() can still resolve the session.
            if (sessionId !== mySessionId) return;
            chunksEnded++;
            checkDone();
          }),
      );
    };

    // ── Socket event handlers ──────────────────────────────────────────────

    socket.onopen = () => {
      console.log('[TTS] WS open — sending speak request');
      socket.send(JSON.stringify({ type: 'speak', text, language }));
    };

    socket.onmessage = (event) => {
      if (sessionId !== mySessionId) return; // session interrupted

      if (event.data instanceof Blob) {
        // Binary frame = WAV/MP3 audio for one sentence.
        // Enqueue in arrival order so playback order matches sentence order.
        chunksReceived++;
        enqueueChunk(event.data.arrayBuffer());

      } else if (event.data instanceof ArrayBuffer) {
        // Some environments deliver binary directly as ArrayBuffer.
        chunksReceived++;
        enqueueChunk(Promise.resolve(event.data));

      } else if (typeof event.data === 'string') {
        // JSON control frame
        try {
          const msg = JSON.parse(event.data) as { type: string; message?: string };

          if (msg.type === 'done') {
            console.log(`[TTS] Server done — ${chunksReceived} chunk(s) received`);
            socket.close();

            if (chunksReceived === 0) {
              // No audio at all → fall back to browser TTS
              console.warn('[TTS] No audio chunks received — using browser fallback');
              fallbackSpeak(text, language, safeResolve);
              return;
            }

            // Freeze the expected count. checkDone() will now resolve as
            // soon as every node's onended has fired. If all onended callbacks
            // already fired before "done" arrived (unlikely but possible for
            // very short audio), checkDone() resolves immediately here.
            totalChunksExpected = chunksReceived;
            console.log(
              `[TTS] Expecting ${totalChunksExpected} onended event(s) ` +
              `(${chunksEnded} already fired)`,
            );
            checkDone();

          } else if (msg.type === 'error') {
            console.error('[TTS] Server error:', msg.message);
            socket.close();
            if (chunksReceived === 0) {
              fallbackSpeak(text, language, safeResolve);
            } else {
              // Partial audio already scheduled — wait for whatever ended
              totalChunksExpected = chunksReceived;
              checkDone();
            }
          }
        } catch {
          console.warn('[TTS] Malformed JSON from server:', event.data);
        }
      }
    };

    socket.onerror = (err) => {
      console.warn('[TTS] WebSocket error:', err);
      // onclose fires immediately after onerror — handled there
    };

    socket.onclose = (evt) => {
      activeSocket = null;
      console.log(`[TTS] Socket closed (code=${evt.code})`);

      if (resolved || sessionId !== mySessionId) return;

      if (chunksReceived === 0) {
        // Connection dropped before we received any audio
        console.warn('[TTS] Socket closed with no audio — using browser fallback');
        fallbackSpeak(text, language, safeResolve);
      } else if (totalChunksExpected === -1) {
        // Closed before "done" arrived — treat received chunks as total
        totalChunksExpected = chunksReceived;
        checkDone();
      }
      // If totalChunksExpected was already set, onended callbacks will resolve
    };

    // Safety net: if audio hangs for any reason (device sleep, context
    // suspend, browser bug), force-resolve after a generous ceiling.
    // 30 s covers even the longest realistic TTS response.
    // safeResolve's `resolved` guard makes this idempotent.
    const safetyTimeout = setTimeout(() => {
      if (!resolved && sessionId === mySessionId) {
        console.warn('[TTS] Safety timeout fired — force-resolving');
        safeResolve();
      }
    }, 30_000);

    // Clear the safety timeout when the socket closes (normal path) or when
    // the promise resolves via the fallback path before the socket closes.
    // Because safeResolve is idempotent, a late safetyTimeout fire is harmless,
    // but clearing it avoids unnecessary work.
    socket.addEventListener('close', () => clearTimeout(safetyTimeout), { once: true });
  });
}

// ─── Browser SpeechSynthesis fallback ────────────────────────────────────────
// Preserved verbatim from the v1 implementation.

function findBestVoice(language: LanguageCode): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const langCode = TTS_LANG_MAP[language] || 'en-IN';
  const targetLangPrefix = langCode.split('-')[0];

  const femaleVoice = voices.find(
    (v) =>
      v.lang.startsWith(targetLangPrefix) &&
      (v.name.toLowerCase().includes('female') ||
        v.name.toLowerCase().includes('girl') ||
        v.name.toLowerCase().includes('woman') ||
        v.name.toLowerCase().includes('zira') ||
        v.name.toLowerCase().includes('lekha') ||
        v.name.toLowerCase().includes('aditi')),
  );
  if (femaleVoice) return femaleVoice;

  const langVoice = voices.find(
    (v) => v.lang === langCode || v.lang.startsWith(targetLangPrefix),
  );
  if (langVoice) return langVoice;

  if (language === 'hi') {
    const hiVoice = voices.find((v) => v.lang.startsWith('hi'));
    if (hiVoice) return hiVoice;
  }

  return null;
}

function fallbackSpeak(
  text: string,
  language: LanguageCode,
  resolve: () => void,
) {
  if (!isTTSSupported()) {
    console.warn('[TTS] SpeechSynthesis not supported, text:', text);
    resolve();
    return;
  }

  let resolved = false;
  const safeResolve = () => {
    if (!resolved) {
      resolved = true;
      resolve();
    }
  };

  const doSpeak = () => {
    // Clear any stale queue once before we begin this fallback utterance(s).
    window.speechSynthesis.cancel();

    const MAX_CHUNK = 200;
    if (text.length > MAX_CHUNK) {
      // Long text — split into sentence-sized chunks and read them in order.
      //
      // speakChunks() speaks each chunk DIRECTLY via speakUtteranceOnce(),
      // NOT via speakText(). speakText() begins with stopSpeaking(), which
      // bumps the module-level sessionId; calling it recursively here would
      // strand the caller's speakText() promise (its captured mySessionId
      // would no longer match, so its safeResolve becomes a permanent no-op)
      // and shuffle the chunk order. Speaking utterances directly keeps the
      // sequence ordered and lets the caller's promise resolve normally.
      const chunks = splitIntoChunks(text, MAX_CHUNK);
      speakChunks(chunks, language).then(safeResolve);
      return;
    }

    // Short text — a single utterance is enough.
    speakUtteranceOnce(text, language).then(safeResolve);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak();
  } else {
    const handler = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
    window.speechSynthesis.onvoiceschanged = handler;
    setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    }, 1000);
  }
}

/**
 * Speak a single piece of text via the browser SpeechSynthesis engine and
 * resolve when it finishes (onend), errors (onerror), or a safety timeout
 * elapses.
 *
 * This helper deliberately does NOT touch the module-level sessionId /
 * stopSpeaking() machinery, so it is safe to call sequentially in a loop
 * without invalidating the caller's speakText() session. Interruption is
 * handled one level up in speakChunks(), which checks sessionId between
 * chunks. A direct stopSpeaking() (barge-in / navigation) calls
 * window.speechSynthesis.cancel(), which fires the active utterance's
 * onend/onerror and resolves this promise promptly.
 */
function speakUtteranceOnce(text: string, language: LanguageCode): Promise<void> {
  return new Promise((resolve) => {
    if (!isTTSSupported()) { resolve(); return; }

    const langCode = TTS_LANG_MAP[language] || 'en-IN';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voice = findBestVoice(language);
    if (voice) {
      utterance.voice = voice;
      console.log(`[TTS] Browser fallback using voice: ${voice.name} (${voice.lang})`);
    } else {
      console.warn(`[TTS] No voice found for ${langCode}, using default`);
    }

    utterance.onend = finish;
    utterance.onerror = (e) => {
      console.warn('[TTS] Browser SpeechSynthesis error:', e);
      finish();
    };

    window.speechSynthesis.speak(utterance);

    // Safety timeout — some browsers never fire onend
    setTimeout(finish, Math.max(text.length * 80, 5000));
  });
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?।])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Speak a list of text chunks sequentially via the browser SpeechSynthesis
 * fallback, in order (chunk 0, then chunk 1, …).
 *
 * IMPORTANT: this must NOT call speakText() — that would call stopSpeaking(),
 * bump the module-level sessionId, and both (a) strand the caller's promise
 * and (b) reorder/cut off playback. Each chunk is spoken directly via
 * speakUtteranceOnce().
 *
 * Barge-in / navigation: we snapshot the current sessionId and bail before
 * speaking the next chunk if it has advanced (i.e. stopSpeaking() ran because
 * the user navigated away or a new speakText() started). This stops the
 * remaining chunks from being read after a legitimate interruption.
 */
async function speakChunks(chunks: string[], language: LanguageCode): Promise<void> {
  const mySessionId = sessionId;
  for (const chunk of chunks) {
    // Interruption guard — stop reading the rest of the sequence if this
    // session was invalidated while the previous chunk was playing.
    if (sessionId !== mySessionId) return;
    await speakUtteranceOnce(chunk, language);
  }
}

// ─── preloadVoices (unchanged from v1) ───────────────────────────────────────

/**
 * Preload browser voices — some browsers load voices asynchronously.
 */
export function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isTTSSupported()) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };

    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 2000);
  });
}
