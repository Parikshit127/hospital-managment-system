/**
 * app/api/ws/tts/route.ts — Phase 3B WebSocket TTS Handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements "Sentence-Level Parallel Chunking" to eliminate the 3–11 s
 * waterfall caused by waiting for a full TTS response before playback.
 *
 * Protocol:
 *
 *  Browser → Server (Text frame):
 *    { type: "speak", text: string, language: "en" | "hi" }
 *
 *  Server → Browser:
 *    • Binary frame     = raw WAV bytes for one sentence (in sentence order)
 *    • Text frame       = { type: "done" }   — all chunks dispatched
 *    • Text frame       = { type: "error", message: string }
 *
 * Strategy:
 *   1. Split incoming text into sentences on . ? ! । (Devanagari danda).
 *   2. Fire one Sarvam TTS API call per sentence IN PARALLEL.
 *   3. Once a sentence resolves, send its WAV buffer as a binary frame
 *      immediately — the client starts playing chunk 0 while chunks 1…N
 *      are still being fetched.
 *   4. Chunks are sent in sentence order (not arrival order) so the client
 *      can use a simple sequential scheduler without reordering logic.
 *      We achieve this with a promise chain that sends each resolved buffer
 *      only after the previous one has been dispatched.
 */

import type { WebSocket, WebSocketServer } from 'ws';
import type { NextRequest } from 'next/server';
import type { RouteContext } from 'next-ws/server';
import { SarvamAIClient } from 'sarvamai';

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

// ── Text helpers ──────────────────────────────────────────────────────────────

/**
 * Sanitize text the same way the HTTP TTS route does to keep audio identical.
 */
function sanitizeForTTS(raw: string): string {
  return raw
    .replace(/\//g, ' or ')       // "Surgery/Oncology" → "Surgery or Oncology"
    .replace(/—/g, ',')            // em-dash → comma
    .replace(/\b10-digit\b/gi, 'ten digit')
    .replace(/\bMale\b/g, 'Mayle')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split text into sentence-sized chunks on . ? ! and the Devanagari danda (।).
 * Empty or whitespace-only segments are dropped. Very short leftover fragments
 * (< 3 chars) are merged with the previous sentence to avoid spurious API
 * calls for trailing punctuation.
 */
function splitSentences(text: string): string[] {
  // Split AFTER the terminator, keeping the terminator attached to the left side.
  const raw = text.split(/(?<=[.?!।])\s+/);
  const sentences: string[] = [];

  for (const seg of raw) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // Merge tiny leftovers (e.g. a bare "।" split fragment) into previous
    if (trimmed.length < 3 && sentences.length > 0) {
      sentences[sentences.length - 1] += ' ' + trimmed;
    } else {
      sentences.push(trimmed);
    }
  }

  // If splitting produced nothing useful, treat the whole text as one chunk
  return sentences.length > 0 ? sentences : [text.trim()];
}

// ── Sarvam AI TTS ─────────────────────────────────────────────────────────────

/**
 * Fetch WAV audio from Sarvam AI for a single sentence.
 * Returns a Buffer of raw WAV bytes, or null on failure.
 */
async function fetchSarvamWav(
  sentence: string,
  targetLang: string,
): Promise<Buffer | null> {
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) return null;

  try {
    const client = new SarvamAIClient({ apiSubscriptionKey: sarvamKey });

    const response = await client.textToSpeech.convert({
      model: 'bulbul:v3',
      text: sentence,
      target_language_code: targetLang as any,
      speaker: 'ritu',
      // Slightly faster than the 1.0 default so the assistant sounds snappier.
      pace: 1.1,
    });

    // Sarvam returns { audios: string[] } — each element is a base64 WAV.
    const audios: string[] | undefined = (response as any).audios;
    if (!audios || audios.length === 0) return null;

    // Concatenate all returned audio slices (usually just one per request).
    const buffers = audios.map((b64) => Buffer.from(b64, 'base64'));
    return Buffer.concat(buffers);
  } catch (err: any) {
    console.warn('[WS-TTS] Sarvam failed for sentence:', err?.message ?? err);
    return null;
  }
}

// ── Google Translate TTS (free fallback) ──────────────────────────────────────

/**
 * Fetch MP3 audio from the Google Translate TTS endpoint.
 * Returns a Buffer of raw MP3 bytes, or null on failure.
 * Note: the client must handle MP3 vs WAV distinction; for Google TTS we send
 * the raw bytes and the client uses decodeAudioData which handles MP3 natively
 * in all modern browsers.
 */
async function fetchGoogleTTSWav(
  sentence: string,
  languageCode: string,
): Promise<Buffer | null> {
  const tl = languageCode === 'hi' ? 'hi' : 'en';
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(sentence)}&tl=${tl}&client=tw-ob`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    console.warn('[WS-TTS] Google TTS fallback failed:', err?.message ?? err);
    return null;
  }
}

// ── Per-sentence fetch (Sarvam → Google fallback) ────────────────────────────

/**
 * Fetch audio for a single sentence, trying Sarvam first then Google TTS.
 * Returns null if both providers fail so the caller can skip silently.
 */
async function fetchSentenceAudio(
  sentence: string,
  language: string,
): Promise<Buffer | null> {
  const targetLang = language === 'hi' ? 'hi-IN' : 'en-IN';
  const sanitized  = sanitizeForTTS(sentence);

  // 1. Primary: Sarvam AI
  const sarvamBuf = await fetchSarvamWav(sanitized, targetLang);
  if (sarvamBuf) return sarvamBuf;

  // 2. Fallback: Google Translate TTS
  const googleBuf = await fetchGoogleTTSWav(sanitized, language);
  if (googleBuf) return googleBuf;

  return null;
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

/**
 * `UPGRADE` is the next-ws v2 convention for WebSocket route handlers.
 *
 * @param client  - ws.WebSocket for this connection
 * @param server  - Shared ws.WebSocketServer
 * @param request - NextRequest (for headers, URL, etc.)
 * @param context - Route context (dynamic params — unused here)
 */
export function UPGRADE(
  client: WebSocket,
  server: WebSocketServer,
  request: NextRequest,
  context: RouteContext<'/api/ws/tts'>,
) {
  console.log('[WS-TTS] Client connected');

  let closed = false;

  /** Send a JSON text frame, guarded against closed sockets. */
  const sendJson = (payload: Record<string, unknown>) => {
    if (!closed && client.readyState === client.OPEN) {
      client.send(JSON.stringify(payload));
    }
  };

  /** Send a binary frame (WAV/MP3 bytes), guarded against closed sockets. */
  const sendBinary = (buf: Buffer) => {
    if (!closed && client.readyState === client.OPEN) {
      client.send(buf);
    }
  };

  client.on('message', (raw, isBinary) => {
    if (closed) return;

    // We only expect JSON text frames from the client
    if (isBinary) {
      console.warn('[WS-TTS] Unexpected binary frame from client — ignoring');
      return;
    }

    let msg: { type: string; text?: string; language?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn('[WS-TTS] Malformed JSON — ignoring');
      return;
    }

    if (msg.type !== 'speak') {
      console.warn(`[WS-TTS] Unknown message type: ${msg.type}`);
      return;
    }

    const text     = (msg.text ?? '').trim();
    const language = msg.language ?? 'en';

    if (!text) {
      sendJson({ type: 'done' });
      return;
    }

    const sentences = splitSentences(text);
    console.log(`[WS-TTS] Synthesising ${sentences.length} sentence(s) in parallel (lang=${language})`);

    // ── Parallel fetch, ordered dispatch ──────────────────────────────────────
    // Launch ALL sentence fetches concurrently so network latency overlaps.
    // Then iterate in sentence order and send each buffer as soon as it's
    // available — meaning the client can start playing sentence 0 while
    // sentences 1…N are still downloading.
    const promises = sentences.map((s) => fetchSentenceAudio(s, language));

    (async () => {
      let sentCount = 0;

      for (let i = 0; i < promises.length; i++) {
        if (closed) break;

        try {
          const buf = await promises[i];

          if (closed) break;

          if (buf && buf.length > 0) {
            console.log(`[WS-TTS] Sending chunk ${i + 1}/${sentences.length} (${buf.length} bytes)`);
            sendBinary(buf);
            sentCount++;
          } else {
            console.warn(`[WS-TTS] Chunk ${i + 1} produced no audio — skipping`);
          }
        } catch (err: any) {
          console.error(`[WS-TTS] Chunk ${i + 1} error:`, err?.message ?? err);
        }
      }

      console.log(`[WS-TTS] Done — sent ${sentCount}/${sentences.length} chunks`);
      sendJson({ type: 'done' });
    })().catch((err) => {
      console.error('[WS-TTS] Unexpected pipeline error:', err);
      sendJson({ type: 'error', message: String(err?.message ?? err) });
    });
  });

  client.on('close', (code, reason) => {
    closed = true;
    console.log(`[WS-TTS] Client disconnected (code=${code}, reason=${reason.toString() || 'none'})`);
  });

  client.on('error', (err) => {
    console.error('[WS-TTS] WebSocket error:', err.message);
  });
}
