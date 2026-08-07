/**
 * Speech-to-text for completed audio files (server-side).
 *
 * Provider order — Sarvam first, Groq Whisper second:
 *   Groq's Whisper (both `whisper-large-v3` and the `-turbo` distillation) was
 *   verified to reliably misidentify Hindi speech as German, while Sarvam
 *   (`saaras:v3`) returned the correct script and `language_code` at confidence
 *   1.0 for the same clips. See the benchmark note in `app/api/ws/stt/route.ts`.
 *   Whisper is the fallback, not the primary, for exactly that reason.
 *
 * Model choice matters more than the host: Groq serves OpenAI's Whisper
 * weights, so accuracy is Whisper's, not Groq's. `-turbo` is a distilled
 * variant that trades word accuracy for latency — correct for a live patient
 * conversation, wrong for dictation nobody is waiting on. Callers that don't
 * care about latency get the accurate model by default.
 *
 * Streaming audio does NOT belong here — see `app/api/ws/stt/route.ts`, which
 * transcribes raw PCM frames mid-utterance and shares no logic with this.
 */

import { SarvamAIClient } from 'sarvamai';
import OpenAI from 'openai';

export interface SttOptions {
  /** 'en-IN' | 'hi-IN' | 'auto'. Default 'auto' (Sarvam detects). */
  languageCode?: string;
  /** Groq Whisper variant. Default is the accurate one; opt into turbo for latency. */
  whisperModel?: 'whisper-large-v3' | 'whisper-large-v3-turbo';
  /** Vocabulary hint biasing Whisper towards domain terms (~224 token ceiling). */
  prompt?: string;
}

export interface SttResult {
  transcript: string;
  detectedLanguageCode: string;
  provider: 'sarvam' | 'groq-whisper' | 'none';
  /** Raw provider payload, for callers that need provider-specific fields. */
  raw?: any;
}

// ─── Provider: Sarvam AI (primary) ──────────────────────────────────────────
async function transcribeWithSarvam(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  languageCode: string,
) {
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) throw new Error('SARVAM_API_KEY not configured');

  const client = new SarvamAIClient({ apiSubscriptionKey: sarvamKey });
  const isAuto = languageCode === 'auto';
  const isEnglish = languageCode === 'en-IN';

  // Fresh File from the buffer so Sarvam gets its own copy
  const file = new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType });

  return client.speechToText.transcribe({
    file,
    model: 'saaras:v3',
    // Sarvam's own auto-detect sentinel — used when the language isn't known yet.
    language_code: (isAuto ? 'unknown' : languageCode) as any,
    // If English is selected but they speak an Indian name, we want Latin script
    // (translit), not Devanagari.
    mode: isEnglish ? 'translit' : 'transcribe',
  });
}

// ─── Provider: Groq Whisper (fallback) ──────────────────────────────────────
async function transcribeWithGroqWhisper(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  languageCode: string,
  model: string,
  prompt?: string,
) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  // The OpenAI SDK works with Groq's API — same interface, different baseURL
  const groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });

  const isAuto = languageCode === 'auto';
  // Map our language codes to Whisper's ISO-639-1 codes; omit the hint entirely
  // when unknown so Whisper auto-detects.
  const whisperLang =
    languageCode === 'hi-IN' ? 'hi' : languageCode === 'en-IN' ? 'en' : undefined;

  const file = new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType });

  const response = await groq.audio.transcriptions.create({
    file,
    model,
    ...(whisperLang ? { language: whisperLang } : {}),
    ...(prompt ? { prompt } : {}),
    response_format: isAuto ? 'verbose_json' : 'json',
  } as any);

  return {
    transcript: response.text || '',
    detectedLanguageCode: isAuto
      ? ((response as any).language?.toLowerCase().startsWith('hin') ? 'hi-IN' : 'en-IN')
      : languageCode,
    raw: response,
  };
}

/**
 * Transcribe a complete audio file, trying each configured provider in turn.
 * Never throws on a provider failure — an empty transcript is returned so the
 * caller can fall back (e.g. to browser SpeechRecognition) or just show nothing.
 */
export async function transcribeSpeech(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  opts: SttOptions = {},
): Promise<SttResult> {
  const languageCode = opts.languageCode || 'auto';
  const whisperModel = opts.whisperModel || 'whisper-large-v3';

  if (process.env.SARVAM_API_KEY) {
    try {
      const response: any = await transcribeWithSarvam(fileBuffer, fileName, mimeType, languageCode);
      console.log('[STT] ✅ Sarvam succeeded');
      return {
        transcript: response.transcript || '',
        detectedLanguageCode:
          languageCode === 'auto'
            ? String(response.language_code || '').toLowerCase().startsWith('hi')
              ? 'hi-IN'
              : 'en-IN'
            : languageCode,
        provider: 'sarvam',
        raw: response,
      };
    } catch (error: any) {
      console.warn('[STT] ⚠️ Sarvam failed:', error?.message || error);
      // Fall through to Groq Whisper
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const response = await transcribeWithGroqWhisper(
        fileBuffer, fileName, mimeType, languageCode, whisperModel, opts.prompt,
      );
      console.log(`[STT] ✅ Groq ${whisperModel} fallback succeeded`);
      return { ...response, provider: 'groq-whisper' };
    } catch (error: any) {
      console.warn('[STT] ⚠️ Groq Whisper also failed:', error?.message || error);
    }
  }

  console.warn('[STT] ❌ All providers failed, returning empty transcript');
  return { transcript: '', detectedLanguageCode: languageCode, provider: 'none' };
}

/** Best-effort MIME type from a filename, for callers that only have a name. */
export function mimeFromFilename(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'mp4' || ext === 'm4a') return 'audio/mp4';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'mp3') return 'audio/mpeg';
  return 'audio/webm';
}
