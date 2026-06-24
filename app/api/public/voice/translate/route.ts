import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// ─── Provider: Sarvam Translate (Primary) ───────────────────────────────────
async function translateWithSarvam(text: string, sourceLang: string, targetLang: string) {
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) throw new Error('SARVAM_API_KEY not configured');

  const res = await fetch('https://api.sarvam.ai/translate', {
    method: 'POST',
    headers: {
      'api-subscription-key': sarvamKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      source_language_code: sourceLang,
      target_language_code: targetLang,
      speaker_gender: 'Male', // generic
      mode: 'formal',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sarvam Translate API failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.translated_text || text;
}

// ─── Provider: Groq LLM (Free Fallback) ─────────────────────────────────────
async function translateWithGroq(text: string, sourceLang: string, targetLang: string) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  // Use the OpenAI SDK with Groq's baseURL — same API, completely free
  const groq = new OpenAI({
    apiKey: groqKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  // Map Sarvam language codes to human-readable names for the prompt
  const langNames: Record<string, string> = {
    'hi-IN': 'Hindi',
    'en-IN': 'English',
    'hi': 'Hindi',
    'en': 'English',
  };

  const sourceLabel = langNames[sourceLang] || sourceLang;
  const targetLabel = langNames[targetLang] || targetLang;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a translator for a hospital registration system. Translate the user's text from ${sourceLabel} to ${targetLabel}. Return ONLY the translated text, nothing else. If the text contains names, transliterate them to Latin script (e.g., "राहुल शर्मा" → "Rahul Sharma"). Keep the translation natural and accurate.`,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content?.trim() || text;
}

// ─── Main Route Handler ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { text, sourceLang, targetLang } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // ── 1. Try Sarvam Translate (Primary) ─────────────────────────────────
    if (process.env.SARVAM_API_KEY) {
      try {
        const translatedText = await translateWithSarvam(text, sourceLang, targetLang);
        console.log('[Translate] ✅ Sarvam succeeded');
        return NextResponse.json({ translatedText, provider: 'sarvam' });
      } catch (error: any) {
        console.warn('[Translate] ⚠️ Sarvam failed:', error?.message || error);
        // Fall through to Groq
      }
    }

    // ── 2. Try Groq LLM (Free Fallback) ──────────────────────────────────
    if (process.env.GROQ_API_KEY) {
      try {
        const translatedText = await translateWithGroq(text, sourceLang, targetLang);
        console.log('[Translate] ✅ Groq LLM fallback succeeded');
        return NextResponse.json({ translatedText, provider: 'groq' });
      } catch (error: any) {
        console.warn('[Translate] ⚠️ Groq also failed:', error?.message || error);
        // Fall through to returning original text
      }
    }

    // ── 3. Return original text (graceful degradation) ────────────────────
    console.warn('[Translate] ❌ All providers failed, returning original text');
    return NextResponse.json({ translatedText: text, provider: 'none' });

  } catch (error: any) {
    console.error('[Translate] Unexpected error:', error);
    return NextResponse.json({ translatedText: 'error' }, { status: 500 });
  }
}
