import { NextResponse } from 'next/server';
import { SarvamAIClient } from 'sarvamai';

// Sanitize text before sending to Sarvam TTS.
function sanitizeForTTS(raw: string): string {
  return raw
    .replace(/\//g, ' or ')   // "Surgery/Oncology" → "Surgery or Oncology"
    .replace(/—/g, ',')        // em-dash → comma
    .replace(/\b10-digit\b/gi, 'ten digit')
    .replace(/\bMale\b/g, 'Mayle')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Provider: Google Translate TTS (Free Fallback) ─────────────────────────
async function fetchGoogleTTS(text: string, languageCode: string): Promise<string[]> {
  // Map our lang codes to Google Translate lang codes
  const tl = languageCode === 'hi' ? 'hi' : 'en';

  // Google Translate limits to ~200 chars. We chunk by words up to 150 chars.
  const words = text.split(' ');
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length < 150) {
      current += (current ? ' ' : '') + word;
    } else {
      if (current) chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);

  const base64Audios: string[] = [];

  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${tl}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    if (!res.ok) {
      throw new Error(`Google TTS failed with status ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    base64Audios.push(base64);
  }

  return base64Audios;
}

export async function POST(req: Request) {
  try {
    const { text, languageCode } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const targetLang = languageCode === 'hi' ? 'hi-IN' : 'en-IN';
    const speaker = 'ritu';
    const sanitizedText = sanitizeForTTS(text);

    // ── 1. Try Sarvam AI TTS (Primary) ──────────────────────────────────
    const sarvamKey = process.env.SARVAM_API_KEY;
    if (sarvamKey) {
      try {
        const client = new SarvamAIClient({
          apiSubscriptionKey: sarvamKey,
        });

        const response = await client.textToSpeech.convert({
          model: "bulbul:v3",
          text: sanitizedText,
          target_language_code: targetLang as any,
          speaker: speaker,
          // Slightly faster than the 1.0 default so the assistant sounds snappier.
          pace: 1.1,
        });

        console.log('[TTS] ✅ Sarvam succeeded');
        return NextResponse.json({ ...response, provider: 'sarvam' });
      } catch (error: any) {
        console.warn('[TTS] ⚠️ Sarvam failed:', error?.message || error);
        // Fall through to next provider
      }
    }

    // ── 2. Try Google Translate TTS (Free Fallback) ─────────────────────
    try {
      const base64Audios = await fetchGoogleTTS(sanitizedText, languageCode);
      console.log('[TTS] ✅ Google Translate fallback succeeded');
      return NextResponse.json({ audios: base64Audios, provider: 'google-tts' });
    } catch (error: any) {
      console.warn('[TTS] ⚠️ Google TTS fallback failed:', error?.message || error);
      // Fall through to browser fallback
    }

    // ── 3. Return empty → client falls back to browser SpeechSynthesis ──
    console.log('[TTS] ℹ️ Returning empty audio → client will use browser SpeechSynthesis');
    return NextResponse.json({ audios: [], provider: 'browser-fallback' });

  } catch (error: any) {
    console.error('[TTS] Unexpected error:', error);
    return NextResponse.json({ audios: [], provider: 'error-fallback' });
  }
}
