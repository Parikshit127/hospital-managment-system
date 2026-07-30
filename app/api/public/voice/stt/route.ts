import { NextResponse } from 'next/server';
import { SarvamAIClient } from 'sarvamai';
import OpenAI from 'openai';

// ─── Provider: Sarvam AI (Primary) ──────────────────────────────────────────
async function transcribeWithSarvam(fileBuffer: Buffer, fileName: string, mimeType: string, languageCode: string) {
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) throw new Error('SARVAM_API_KEY not configured');

  const client = new SarvamAIClient({ apiSubscriptionKey: sarvamKey });
  const isAuto = languageCode === 'auto';
  const isEnglish = languageCode === 'en-IN';

  // Create a fresh File from the buffer so Sarvam gets its own copy
  const file = new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType });

  const response = await client.speechToText.transcribe({
    file,
    model: "saaras:v3",
    // Sarvam's own auto-detect sentinel — used when the patient's language
    // hasn't been picked/detected yet.
    language_code: (isAuto ? 'unknown' : languageCode) as any,
    // If English is selected but they speak an Indian name, we want Latin script (translit), not Devanagari.
    mode: isEnglish ? "translit" : "transcribe",
  });

  return response;
}

// ─── Provider: Groq Whisper (Free Fallback) ─────────────────────────────────
async function transcribeWithGroqWhisper(fileBuffer: Buffer, fileName: string, mimeType: string, languageCode: string) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  // The OpenAI SDK works with Groq's API — same interface, different baseURL
  const groq = new OpenAI({
    apiKey: groqKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const isAuto = languageCode === 'auto';
  // Map our language codes to Whisper's ISO-639-1 codes; omit the hint
  // entirely when unknown so Whisper auto-detects.
  const whisperLang = languageCode === 'hi-IN' ? 'hi' : languageCode === 'en-IN' ? 'en' : undefined;

  // Create a fresh File from the buffer so Groq gets its own copy
  const file = new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType });

  const response = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    ...(whisperLang ? { language: whisperLang } : {}),
    response_format: isAuto ? 'verbose_json' : 'json',
  } as any);

  return {
    transcript: response.text || '',
    detectedLanguageCode: isAuto
      ? ((response as any).language?.toLowerCase().startsWith('hin') ? 'hi-IN' : 'en-IN')
      : languageCode,
  };
}

// ─── Main Route Handler ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const langCode = formData.get('language_code') as string || 'en-IN';

    // Buffer the file data ONCE so both providers can read it independently.
    // Without this, Sarvam's failed attempt consumes the File stream,
    // leaving Groq with nothing to read.
    const uploadedFile = file as File;
    const arrayBuffer = await uploadedFile.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const fileName = uploadedFile.name || 'audio.webm';
    const mimeType = uploadedFile.type || 'audio/webm';

    // ── 1. Try Sarvam AI (Primary) ────────────────────────────────────────
    if (process.env.SARVAM_API_KEY) {
      try {
        const response: any = await transcribeWithSarvam(fileBuffer, fileName, mimeType, langCode);
        console.log('[STT] ✅ Sarvam succeeded');
        const detectedLanguageCode = langCode === 'auto'
          ? (String(response.language_code || '').toLowerCase().startsWith('hi') ? 'hi-IN' : 'en-IN')
          : langCode;
        return NextResponse.json({ ...response, detectedLanguageCode, provider: 'sarvam' });
      } catch (error: any) {
        console.warn('[STT] ⚠️ Sarvam failed:', error?.message || error);
        // Fall through to Groq Whisper
      }
    }

    // ── 2. Try Groq Whisper (Free Fallback) ───────────────────────────────
    if (process.env.GROQ_API_KEY) {
      try {
        const response = await transcribeWithGroqWhisper(fileBuffer, fileName, mimeType, langCode);
        console.log('[STT] ✅ Groq Whisper fallback succeeded');
        return NextResponse.json({ ...response, provider: 'groq-whisper' });
      } catch (error: any) {
        console.warn('[STT] ⚠️ Groq Whisper also failed:', error?.message || error);
        // Fall through to empty response
      }
    }

    // ── 3. Return empty → client falls back to browser SpeechRecognition ──
    console.warn('[STT] ❌ All providers failed, returning empty transcript');
    return NextResponse.json({ transcript: '', provider: 'none' });

  } catch (error: any) {
    console.error('[STT] Unexpected error:', error);
    return NextResponse.json({ transcript: '', provider: 'error' });
  }
}
