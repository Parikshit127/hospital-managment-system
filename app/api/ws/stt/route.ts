/**
 * app/api/ws/stt/route.ts — Phase 3A WebSocket STT Handler
 * ─────────────────────────────────────────────────────────────────────────────
 * This route handles the WebSocket connection opened by `lib/voice/stt.ts`.
 *
 * Protocol (binary + JSON text frames on the same socket):
 *
 *  Browser → Server:
 *    • Binary frame  = Int16 PCM audio at 16 000 Hz mono (from AudioWorklet)
 *    • Text frame    = JSON control message, one of:
 *        { type: "init",           lang: "en-IN" | "hi-IN" }   (first message)
 *        { type: "end_of_speech" }                               (VAD fired)
 *        { type: "abort" }                                       (user cancelled)
 *
 *  Server → Browser:
 *    • Text frame    = JSON status message, one of:
 *        { type: "ready" }                                 (server ready, send audio)
 *        { type: "transcript", text: string }             (interim result)
 *        { type: "final",      text: string, lang: string } (final transcript + translation)
 *        { type: "error",      message: string }
 *
 * STT Strategy (Groq Whisper — REST-only):
 *   Groq Whisper does not have a streaming WebSocket API; it is a REST
 *   endpoint that accepts a complete audio file. The latency improvement
 *   over the previous HTTP approach comes from a different source:
 *
 *   OLD path:  Patient stops → silence timer fires → MediaRecorder finalises
 *              → browser UPLOADS blob to server → server calls Groq → transcript.
 *              Upload alone costs 0.5–2 s for a 15 s utterance on mobile.
 *
 *   NEW path:  Audio streams to server VIA WebSocket in real-time while the
 *              patient is still speaking. By the time the browser sends
 *              `end_of_speech`, the server ALREADY HAS all the audio buffered.
 *              The only remaining cost is the Groq API round-trip itself.
 *
 *   Additionally, we send a preliminary Groq call after the first PROBE_MS ms
 *   of speech to get an early interim transcript while the user is still
 *   talking, eliminating any dead-air perception.
 *
 * Translation (Hindi only):
 *   If lang === "hi-IN", we call the existing `/api/public/voice/translate`
 *   route *server-side* after the final transcript is received, eliminating
 *   the extra HTTP round-trip that the old client-side translate call required.
 */

import type { WebSocket, WebSocketServer } from 'ws';
import type { NextRequest } from 'next/server';
import type { RouteContext } from 'next-ws/server';
import OpenAI from 'openai';

// WebSocket upgrades require the Node.js runtime and must never be statically
// optimised.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// next-ws routes only export `UPGRADE`, which Next's typed-route validator does
// not recognise — during `next build` that surfaces as TS2559 ("no properties in
// common with RouteHandlerConfig") and fails the build, because the module shares
// no recognised HTTP-method export. Exporting a minimal GET handler gives the
// validator the property it needs. This endpoint is WebSocket-only, so a plain
// HTTP request gets a 426 "Upgrade Required".
export function GET(): Response {
  return new Response('This endpoint requires a WebSocket upgrade.', { status: 426 });
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** 16 kHz mono — must match PcmProcessor TARGET_SAMPLE_RATE */
const SAMPLE_RATE = 16_000;
/** Bytes per sample (Int16 = 2 bytes) */
const BYTES_PER_SAMPLE = 2;
/** After this many ms of buffered audio, fire a preliminary Groq call
 *  to get an interim transcript while the user is still speaking.  */
const PROBE_MS = 3_000;
/** Max audio to buffer (15 s failsafe — same as the old listenOnce timeout) */
const MAX_BUFFER_MS = 15_000;

const PROBE_BYTES = (SAMPLE_RATE * BYTES_PER_SAMPLE * PROBE_MS) / 1_000;   // ~96 000
const MAX_BYTES   = (SAMPLE_RATE * BYTES_PER_SAMPLE * MAX_BUFFER_MS) / 1_000; // ~480 000

// ── WAV helper ────────────────────────────────────────────────────────────────

/**
 * Wrap raw Int16 PCM data in a minimal RIFF WAV header.
 * Groq Whisper (and Sarvam) accept WAV/WebM/MP4/OGG; WAV is the simplest
 * to generate without additional encoding libraries.
 */
function buildWav(pcmBuffer: Buffer): Buffer {
  const numChannels  = 1;
  const bitsPerSample = 16;
  const byteRate = (SAMPLE_RATE * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const wav = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  // RIFF chunk
  wav.write('RIFF', offset);              offset += 4;
  wav.writeUInt32LE(36 + dataSize, offset); offset += 4;
  wav.write('WAVE', offset);              offset += 4;

  // fmt  sub-chunk
  wav.write('fmt ', offset);             offset += 4;
  wav.writeUInt32LE(16, offset);          offset += 4; // PCM format chunk size
  wav.writeUInt16LE(1, offset);           offset += 2; // AudioFormat = PCM
  wav.writeUInt16LE(numChannels, offset); offset += 2;
  wav.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  wav.writeUInt32LE(byteRate, offset);    offset += 4;
  wav.writeUInt16LE(blockAlign, offset);  offset += 2;
  wav.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data sub-chunk
  wav.write('data', offset);             offset += 4;
  wav.writeUInt32LE(dataSize, offset);   offset += 4;
  pcmBuffer.copy(wav, offset);

  return wav;
}

// ── Groq Whisper transcription ────────────────────────────────────────────────

/**
 * Send accumulated PCM audio to Groq Whisper and return the transcript string.
 * Falls back to an empty string on error so the FSM can retry.
 */
async function transcribeWithGroq(
  pcmChunks: Buffer[],
  langCode: string,
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn('[WS-STT] GROQ_API_KEY not set — cannot transcribe');
    return '';
  }

  const groq = new OpenAI({
    apiKey: groqKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  // Concatenate all chunks into one PCM buffer, then wrap in WAV.
  const pcmBuffer = Buffer.concat(pcmChunks);
  if (pcmBuffer.length === 0) return '';

  const wavBuffer = buildWav(pcmBuffer);
  const whisperLang = langCode === 'hi-IN' ? 'hi' : 'en';
  const fileName    = langCode === 'hi-IN' ? 'audio_hi.wav' : 'audio_en.wav';

  try {
    // The OpenAI SDK accepts a `File` object — construct one from our buffer.
    const audioFile = new File([new Uint8Array(wavBuffer)], fileName, { type: 'audio/wav' });

    const response = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      language: whisperLang,
      response_format: 'json',
    });

    return response.text?.trim() ?? '';
  } catch (err: any) {
    console.error('[WS-STT] Groq Whisper error:', err?.message ?? err);
    return '';
  }
}

// ── Server-side translation (Hindi → English) ─────────────────────────────────

/**
 * Translate a Hindi transcript to English via our existing Sarvam translate route.
 * Runs server-to-server (localhost), so there's no browser upload round-trip.
 */
async function translateHindiToEnglish(hindiText: string): Promise<string> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/public/voice/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: hindiText,
        sourceLang: 'hi-IN',
        targetLang: 'en-IN',
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.translatedText && data.translatedText !== 'error')
      ? data.translatedText
      : '';
  } catch (err) {
    console.error('[WS-STT] Translation error:', err);
    return '';
  }
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

/**
 * `UPGRADE` is the next-ws v2 convention for WebSocket route handlers.
 * It supersedes the deprecated `SOCKET` export from v1.
 * It is called once per connection upgrade.
 *
 * Parameter order (v2 UpgradeHandler):
 *   @param client  - The ws.WebSocket instance for this connection.
 *   @param server  - The shared ws.WebSocketServer instance.
 *   @param request - The Next.js NextRequest (replaces raw IncomingMessage).
 *   @param context - Route context containing dynamic params (unused here).
 */
export function UPGRADE(
  client: WebSocket,
  server: WebSocketServer,
  request: NextRequest,
  context: RouteContext<'/api/ws/stt'>,
) {
  console.log('[WS-STT] Client connected');

  // ── Session state ──────────────────────────────────────────────────────────
  let langCode = 'en-IN';           // Set by first "init" message
  const pcmChunks: Buffer[] = [];   // All audio received so far
  let totalBytes = 0;
  let probeDispatched = false;       // True after the first interim Groq call
  let finalDispatched = false;       // True after the final transcript is sent
  let aborted = false;

  /** Helper: send a JSON message to the browser. */
  const send = (payload: Record<string, unknown>) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(payload));
    }
  };

  /** Clamp and buffer incoming PCM bytes. */
  const appendAudio = (data: Buffer) => {
    if (totalBytes >= MAX_BYTES) return; // Hard cap
    const remaining = MAX_BYTES - totalBytes;
    const chunk = data.length <= remaining ? data : data.subarray(0, remaining);
    pcmChunks.push(chunk);
    totalBytes += chunk.length;
  };

  /**
   * Fire an interim (probe) Groq call after PROBE_MS of buffered audio.
   * This gives the user an early transcript so the UI can show a "hearing…"
   * indicator before speech is complete.
   */
  const dispatchProbe = async () => {
    if (probeDispatched || finalDispatched || aborted) return;
    probeDispatched = true;
    console.log(`[WS-STT] Probe: transcribing first ${PROBE_MS}ms of audio`);
    // Snapshot current chunks (don't include audio that arrives after this)
    const snapshot = pcmChunks.map(b => Buffer.from(b));
    const text = await transcribeWithGroq(snapshot, langCode);
    if (text && !finalDispatched && !aborted) {
      send({ type: 'transcript', text });
    }
  };

  /**
   * Process end-of-speech: run a final Groq transcription on ALL buffered
   * audio, optionally translate (Hindi), and send the `final` message.
   */
  const dispatchFinal = async () => {
    if (finalDispatched || aborted) return;
    finalDispatched = true;

    console.log(
      `[WS-STT] Final: transcribing ${totalBytes} bytes (${(totalBytes / (SAMPLE_RATE * BYTES_PER_SAMPLE)).toFixed(1)}s)`,
    );

    const rawText = await transcribeWithGroq(pcmChunks, langCode);
    let finalText = rawText;

    // Server-side translation for Hindi (eliminates the extra client HTTP call)
    if (langCode === 'hi-IN' && rawText) {
      const translated = await translateHindiToEnglish(rawText);
      if (translated) {
        console.log(`[WS-STT] Translated: "${translated}"`);
        finalText = translated;
      }
    }

    send({ type: 'final', text: finalText, lang: langCode });
    client.close();
  };

  // ── Event handlers ─────────────────────────────────────────────────────────

  client.on('message', (raw, isBinary) => {
    if (aborted) return;

    if (isBinary) {
      // Audio PCM frame from the AudioWorklet
      appendAudio(Buffer.from(raw as ArrayBuffer));

      // Trigger the probe transcription once enough audio has arrived
      if (!probeDispatched && totalBytes >= PROBE_BYTES) {
        dispatchProbe().catch(console.error);
      }
    } else {
      // Text control frame
      let msg: { type: string; lang?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn('[WS-STT] Malformed JSON control frame, ignoring');
        return;
      }

      switch (msg.type) {
        case 'init':
          langCode = msg.lang ?? 'en-IN';
          console.log(`[WS-STT] Init: lang=${langCode}`);
          send({ type: 'ready' });
          break;

        case 'end_of_speech':
          console.log('[WS-STT] End-of-speech received, dispatching final...');
          dispatchFinal().catch(console.error);
          break;

        case 'abort':
          aborted = true;
          console.log('[WS-STT] Aborted by client');
          client.close();
          break;

        default:
          console.warn(`[WS-STT] Unknown message type: ${msg.type}`);
      }
    }
  });

  client.on('close', (code, reason) => {
    aborted = true;
    console.log(`[WS-STT] Client disconnected (code=${code}, reason=${reason.toString() || 'none'})`);
  });

  client.on('error', (err) => {
    console.error('[WS-STT] WebSocket error:', err.message);
  });

  // Max-duration failsafe: force-close after MAX_BUFFER_MS even if the
  // client never sends end_of_speech (network drop, tab close, etc.)
  const failsafe = setTimeout(() => {
    if (!finalDispatched && !aborted && totalBytes > 0) {
      console.warn('[WS-STT] Failsafe timeout — dispatching final transcript');
      dispatchFinal().catch(console.error);
    }
  }, MAX_BUFFER_MS + 2_000);

  client.on('close', () => clearTimeout(failsafe));
}
