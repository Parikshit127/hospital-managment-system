// lib/voice/stt.ts — [A] Speech-to-Text implementation
// Phase 3A: WebSocket streaming STT via AudioWorklet + Groq Whisper.
//
// Architecture overview:
//   boolean path (unchanged) → Web Speech API (zero-latency local short-circuit)
//   text path    (new)       → AudioWorklet captures PCM → WebSocket → Groq Whisper
//
// The `boolean` fast path is intentionally left 100% untouched — it was
// purpose-built as a zero-latency short-circuit for yes/no confirmations.
// Only the `text` path has been refactored.

import type { LanguageCode } from '@/lib/contracts/voice';
import { STT_LANG_MAP } from './i18n';

export interface STTResult {
  text: string;
  confidence: number;
}

export function isSTTSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// ─── WebSocket URL helper ─────────────────────────────────────────────────────

/**
 * Build the WebSocket URL for the STT server.
 * In development (http) → ws://
 * In production  (https) → wss://
 * Falls back to the current page origin so this works behind any reverse proxy.
 */
function getSttWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws/stt`;
}

// ─── AudioContext + AudioWorklet helpers ──────────────────────────────────────

/**
 * Load the PcmProcessor AudioWorklet module once per AudioContext instance.
 * The worklet file is served from /public/worklets/pcm-processor.js.
 *
 * IMPORTANT — rejection eviction:
 *   We store the Promise itself (not just the resolved value) so concurrent
 *   calls to ensureWorkletLoaded() on the same context share one addModule()
 *   call. However, if addModule() rejects (e.g. context was suspended at call
 *   time, or the dev server was cold after a terminal restart), the rejected
 *   Promise must be evicted from the cache. If we kept it, every subsequent
 *   call for the same AudioContext would immediately re-throw the same
 *   AbortError without ever retrying — which is the exact symptom of the
 *   "works once, broken on restart" bug.
 */
const workletLoadCache = new Map<AudioContext, Promise<void>>();

async function ensureWorkletLoaded(ctx: AudioContext): Promise<void> {
  if (!workletLoadCache.has(ctx)) {
    // Use an absolute URL rather than a root-relative path.
    // Some Chromium builds treat root-relative paths ('/worklets/...') as
    // having an opaque origin inside the AudioWorkletGlobalScope, causing
    // addModule() to throw AbortError even though the file exists and the
    // Content-Type is correct. An absolute URL forces the browser's worklet
    // loader to use the full origin, which is always unambiguous.
    const workletUrl = `${self.location.origin}/worklets/pcm-processor.js`;
    const p = ctx.audioWorklet
      .addModule(workletUrl)
      .catch((err) => {
        // Evict so the next call gets a fresh attempt instead of re-throwing
        // the cached rejection (e.g. after a cold dev-server restart).
        workletLoadCache.delete(ctx);
        throw err;
      });
    workletLoadCache.set(ctx, p);
  }
  return workletLoadCache.get(ctx)!;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Listen for speech input.
 *
 * expectedType === 'boolean':
 *   Uses the Web Speech API fast path (100% unchanged from v1).
 *   Returns immediately on the first yes/no word detected.
 *
 * expectedType === 'text' (default):
 *   Phase 3A — AudioWorklet + WebSocket streaming to Groq Whisper.
 *   Audio starts streaming to the server the moment the user speaks.
 *   By the time VAD detects silence, the server already has all the audio
 *   buffered and needs only a single Groq API call to produce the transcript.
 */
export async function listenOnce(
  language: LanguageCode,
  timeoutMs: number = 15000,
  expectedType: 'boolean' | 'text' = 'text'
): Promise<STTResult> {
  if (!isSTTSupported()) {
    throw new Error('Microphone access is not supported in this browser');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new Error('Microphone access was denied');
  }

  return new Promise((resolve, reject) => {
    // 1. Setup AudioContext for VAD (Voice Activity Detection)
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();

    // ── CRITICAL: resume immediately, inside the synchronous user-gesture call
    // stack. If we defer resume() until after the WebSocket "ready" message
    // arrives (1–2 async hops later), Chromium considers the gesture expired
    // and refuses to resume — causing addModule() to throw AbortError on a
    // still-suspended context.
    audioContext.resume().catch(() => {});

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // ─────────────────────────────────────────────────────────────────────────
    // FAST LOCAL PATH FOR BOOLEAN / SIMPLE RESPONSES
    // This block is 100% unchanged from Phase 1. Do not modify.
    // ─────────────────────────────────────────────────────────────────────────
    if (expectedType === 'boolean') {
      console.log('[STT] Using fast local STT path for boolean response');
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = STT_LANG_MAP[language];
      recognition.continuous = false; // Stop immediately after the first phrase
      recognition.interimResults = true;
      
      let localResolved = false;
      const localFinish = (text: string, conf: number) => {
        if (localResolved) return;
        localResolved = true;
        recognition.stop();
        stream.getTracks().forEach(track => track.stop());
        try { audioContext.close(); } catch(e) {}
        resolve({ text, confidence: conf });
      };

      recognition.onresult = (e: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript;
          } else {
            interimTranscript += e.results[i][0].transcript;
          }
        }
        if (finalTranscript.trim()) {
          localFinish(finalTranscript.trim(), e.results[e.resultIndex][0].confidence);
          return;
        }

        // Fast path: if the interim transcript has a clear yes/no, finish instantly!
        const interimStr = interimTranscript.trim().toLowerCase();
        if (interimStr) {
          const words = interimStr.split(/\s+/);
          const hasBool = words.some(w => /^(yes|yeah|yep|ok|okay|हाँ|हां|no|nope|नहीं)$/.test(w));
          if (hasBool) {
            localFinish(interimStr, 0.9);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('[STT] Local recognition error:', e.error);
        if (e.error === 'network' || e.error === 'service-not-allowed') {
          console.warn('[STT] Local STT blocked (likely Brave browser). Falling back to Sarvam.');
          if (!localResolved) {
            localResolved = true;
            recognition.stop();
            stream.getTracks().forEach(track => track.stop());
            try { audioContext.close(); } catch(e) {}
            // Transparently retry using the text path (Sarvam)
            resolve(listenOnce(language, timeoutMs, 'text'));
          }
        } else {
          // For other errors like 'no-speech', just return empty string so the FSM retries
          localFinish('', 0);
        }
      };

      recognition.onend = () => {
        localFinish('', 0);
      };

      setTimeout(() => {
        localFinish('', 0);
      }, timeoutMs);

      recognition.start();
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 3A — WEBSOCKET STREAMING STT PATH (text responses)
    // ─────────────────────────────────────────────────────────────────────────

    const langCode = language === 'hi' ? 'hi-IN' : 'en-IN';
    let resolved = false;
    let ws: WebSocket | null = null;
    let workletNode: AudioWorkletNode | null = null;

    /** Clean up all resources regardless of how we exit. */
    const cleanup = () => {
      stream.getTracks().forEach(track => track.stop());
      try { audioContext.close(); } catch (_) {}
      clearTimeout(maxTimeout);
      clearTimeout(silenceTimer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    /** Resolve the outer Promise and clean up. */
    const finish = (text: string, confidence: number) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ text, confidence });
    };

    /** Tell the server that the user has stopped speaking. */
    // Also stops the fallback MediaRecorder if it is running, so the fallback
    // path respects the same VAD silence window instead of a fixed 5-s timer.
    let stopFallbackRecorder: (() => void) | null = null;
    const signalEndOfSpeech = () => {
      if (stopFallbackRecorder) {
        stopFallbackRecorder();
        stopFallbackRecorder = null;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // Flush any pending PCM in the worklet before signalling end
      workletNode?.port.postMessage({ type: 'stop' });
      ws.send(JSON.stringify({ type: 'end_of_speech' }));
      console.log('[STT-WS] end_of_speech sent to server');
    };

    // ── Global hard timeout ───────────────────────────────────────────────────
    const maxTimeout = setTimeout(() => {
      console.warn('[STT-WS] Hard timeout reached');
      if (!resolved) {
        signalEndOfSpeech();
        // Give server 3 s to respond before we give up
        setTimeout(() => finish('', 0), 3_000);
      }
    }, timeoutMs);

    // ── VAD silence detection (carried over, unchanged logic) ─────────────────
    let isSpeaking = false;
    let silenceTimer: ReturnType<typeof setTimeout>;
    let endOfSpeechSent = false;

    const resetSilenceTimer = (ms: number) => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (!resolved && !endOfSpeechSent) {
          endOfSpeechSent = true;
          signalEndOfSpeech();
        }
      }, ms);
    };

    // 5-second initial window for the patient to start speaking
    resetSilenceTimer(5_000);

    const detectSilence = () => {
      if (resolved) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;

      // Lowered threshold to catch quiet speakers (same as v1)
      if (average > 5) {
        if (!isSpeaking) {
          console.log('[STT-WS] Speech detected! (Volume:', Math.round(average), ')');
          isSpeaking = true;
        }
        // 1 200 ms post-speech silence window (same as v1)
        resetSilenceTimer(1_200);
      }

      requestAnimationFrame(detectSilence);
    };

    // ── Fallback: if WS fails, drop back to the HTTP Sarvam path ─────────────
    const httpFallback = () => {
      console.warn('[STT-WS] WebSocket failed — falling back to HTTP Sarvam path');
      // Rebuild a fresh MediaRecorder from the same stream (already open).
      // The stream was not stopped yet so this works.
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }
      const fallbackChunks: Blob[] = [];
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = (e) => { if (e.data.size > 0) fallbackChunks.push(e.data); };
      mr.onstop = async () => {
        if (fallbackChunks.length === 0) { finish('', 0); return; }
        const cleanMime = mimeType.split(';')[0];
        const blob = new Blob(fallbackChunks, { type: cleanMime });
        const ext = cleanMime.includes('mp4') ? 'mp4' : cleanMime.includes('ogg') ? 'ogg' : 'webm';
        const fd = new FormData();
        fd.append('file', blob, `audio.${ext}`);
        fd.append('language_code', langCode);
        try {
          const res = await fetch('/api/public/voice/stt', { method: 'POST', body: fd });
          if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
          const data = await res.json();
          finish(data.transcript || '', 1);
        } catch {
          finish('', 0);
        }
      };

      mr.start();

      // Register a stop handle so signalEndOfSpeech() (triggered by VAD silence
      // detection) can cut the recording the moment the user stops speaking,
      // rather than waiting out a fixed timer. The VAD loop is already running
      // at this point (started unconditionally above).
      stopFallbackRecorder = () => {
        if (mr.state !== 'inactive') mr.stop();
      };

      // Hard ceiling: if VAD never fires (e.g. total silence), stop after 8 s.
      // This is intentionally generous — the 1.2 s VAD window handles the
      // normal case; this only catches "user forgot to speak" scenarios.
      setTimeout(() => {
        if (mr.state !== 'inactive') mr.stop();
      }, 8_000);
    };

    // ── Open WebSocket & bootstrap AudioWorklet ───────────────────────────────
    const wsUrl = getSttWsUrl();
    console.log('[STT-WS] Opening WebSocket:', wsUrl);

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[STT-WS] WebSocket constructor failed:', err);
      httpFallback();
      return;
    }

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[STT-WS] Connected — sending init');
      ws!.send(JSON.stringify({ type: 'init', lang: langCode }));
    };

    ws.onmessage = (event) => {
      let msg: { type: string; text?: string; lang?: string; message?: string };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ready':
          // Server is ready — start the AudioWorklet capture pipeline
          console.log('[STT-WS] Server ready, starting AudioWorklet');
          startAudioWorklet();
          break;

        case 'transcript':
          // Interim result — the FSM doesn't use this yet but it could show
          // a "hearing…" UI indicator in the future.
          console.log('[STT-WS] Interim transcript:', msg.text);
          break;

        case 'final':
          console.log('[STT-WS] Final transcript:', msg.text);
          finish(msg.text ?? '', 1);
          break;

        case 'error':
          console.error('[STT-WS] Server error:', msg.message);
          finish('', 0);
          break;
      }
    };

    ws.onerror = (event) => {
      console.error('[STT-WS] WebSocket error', event);
      if (!resolved) httpFallback();
    };

    ws.onclose = (event) => {
      console.log(`[STT-WS] Closed (code=${event.code})`);
      // If we close before resolving (e.g. server crash), finish with empty
      if (!resolved) {
        finish('', 0);
      }
    };

    // ── AudioWorklet capture pipeline ─────────────────────────────────────────

    const startAudioWorklet = async () => {
      // Check for AudioWorklet support (all modern browsers, but not very old Safari)
      if (!audioContext.audioWorklet) {
        console.warn('[STT-WS] AudioWorklet not supported — using ScriptProcessorNode shim');
        startScriptProcessorFallback();
        return;
      }

      // ── CRITICAL: resume the AudioContext before calling addModule() ──────────
      // Browsers create AudioContext in 'suspended' state due to the autoplay
      // policy. Calling audioWorklet.addModule() on a suspended context throws
      // AbortError in Chromium 116+. This resume() is always permitted here
      // because listenOnce() is invariably called from a user-gesture handler.
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          console.log('[STT-WS] AudioContext resumed (was suspended)');
        } catch (resumeErr) {
          console.error('[STT-WS] AudioContext.resume() failed:', resumeErr);
          startScriptProcessorFallback();
          return;
        }
      }

      ensureWorkletLoaded(audioContext)
        .then(() => {
          workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

          // The worklet posts Int16Array buffers via its MessagePort.
          workletNode.port.onmessage = (evt) => {
            if (resolved) return;
            if (evt.data instanceof ArrayBuffer) {
              // Forward raw PCM binary frame to the server
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(evt.data);
              }
            }
            // 'stopped' ack — no action needed
          };

          // Connect: mic source → worklet (worklet has no audio output to connect)
          source.connect(workletNode);

          // Start the VAD loop
          console.log('[STT-WS] Listening started (AudioWorklet)...');
          detectSilence();
        })
        .catch((err) => {
          // Use warn (not error): the AbortError here is gracefully handled by
          // the ScriptProcessor fallback, but Next.js Turbopack renders a
          // full-screen error overlay for any console.error in dev.
          console.warn('[STT-WS] AudioWorklet load failed, falling back to ScriptProcessor:', err?.message ?? err);
          startScriptProcessorFallback();
        });
    };


    /**
     * Legacy ScriptProcessorNode shim for browsers that don't support AudioWorklet
     * (Safari < 14.5, some older Android WebViews) or when addModule() fails
     * (e.g. the Chromium worklet AbortError).
     *
     * Self-contained VAD: volume is measured natively inside onaudioprocess
     * (RMS of the raw frame) rather than via the global RAF/analyser loop, which
     * throttles in background tabs and raced with this node. Capture is routed
     * through a zero-gain node so the processor keeps running WITHOUT feeding the
     * mic back to the speakers (the feedback loop that kept volume artificially
     * high so silence was never detected).
     * @deprecated Remove once Safari < 14.5 share drops below 1%.
     */
    const startScriptProcessorFallback = () => {
      const bufferSize = 4096;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

      const inputSampleRate = audioContext.sampleRate;
      const targetSampleRate = 16_000;
      const ratio = inputSampleRate / targetSampleRate;

      // RMS amplitude (time-domain, 0..1) above which a frame counts as speech.
      // ~-40 dBFS — low enough for quiet speakers, high enough to ignore room noise.
      const SPEECH_RMS_THRESHOLD = 0.01;

      // A ScriptProcessorNode only runs while connected to a destination, but we
      // must NOT route the mic to the speakers (acoustic feedback keeps the
      // measured volume high → silence is never detected). Routing through a
      // muted gain node keeps the node "pulled" while emitting pure silence.
      const mutedGain = audioContext.createGain();
      mutedGain.gain.value = 0;

      const teardownProcessor = () => {
        try { processor.onaudioprocess = null; } catch (_) {}
        try { source.disconnect(processor); } catch (_) {}
        try { processor.disconnect(); } catch (_) {}
        try { mutedGain.disconnect(); } catch (_) {}
      };
      // Let signalEndOfSpeech() (VAD silence OR hard timeout) tear the capture
      // graph down immediately, so PCM stops streaming the moment speech ends.
      stopFallbackRecorder = teardownProcessor;

      processor.onaudioprocess = (evt) => {
        if (resolved) return;
        const channelData = evt.inputBuffer.getChannelData(0);

        // ── Native VAD: measure this frame's RMS directly from the audio
        //    callback (reliable even when the tab is backgrounded). ──────────
        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);
        if (rms > SPEECH_RMS_THRESHOLD) {
          if (!isSpeaking) {
            console.log('[STT-WS] Speech detected (ScriptProcessor RMS:', rms.toFixed(3), ')');
            isSpeaking = true;
          }
          // 1.2 s post-speech silence window (matches the AudioWorklet path).
          resetSilenceTimer(1_200);
        }

        // ── Downsample to 16 kHz Int16 PCM and stream to the server. ────────
        const outputLength = Math.floor(channelData.length / ratio);
        const pcm16 = new Int16Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
          const srcPos = i * ratio;
          const idx = Math.floor(srcPos);
          const frac = srcPos - idx;
          const a = channelData[idx] ?? 0;
          const b = channelData[idx + 1] ?? a;
          const s = Math.max(-1, Math.min(1, a + frac * (b - a)));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(pcm16.buffer);
        }
      };

      // Connect through the muted gain (no feedback) so the processor stays pulled.
      source.connect(processor);
      processor.connect(mutedGain);
      mutedGain.connect(audioContext.destination);

      console.log('[STT-WS] Listening started (ScriptProcessorNode fallback, native VAD)...');
      // NOTE: intentionally NOT calling the global detectSilence() RAF loop here.
      // This path drives resetSilenceTimer() from its own onaudioprocess RMS
      // measurement above — a single, reliable silence-detection source.
    };

    // ── VAD loop start ────────────────────────────────────────────────────────
    // detectSilence() is NOT called here. It is started exactly once, by the
    // capture path that initialises:
    //   • startAudioWorklet().then(...)  → starts the global detectSilence() RAF
    //     loop (reads the shared analyser).
    //   • startScriptProcessorFallback() → does NOT use detectSilence(); it
    //     drives resetSilenceTimer() from its own native onaudioprocess RMS VAD.
    //
    // Calling detectSilence() here would start a second concurrent RAF loop
    // racing the AudioWorklet path's loop to call resetSilenceTimer(1_200),
    // continuously cancelling each other's setTimeout so the silence window
    // never expires and the app waits out the full 15-second hard timeout.
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// requestMicPermission — unchanged from v1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request microphone permission from the browser.
 * Returns true if permission is granted.
 */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately — we just needed permission
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error('Mic permission error:', err);
    return false;
  }
}
