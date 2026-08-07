/**
 * Self-check for the provider chain in app/lib/stt.ts.
 *
 * Run: npx tsx scripts/check-stt.ts
 *
 * Synthesises a clip with Sarvam TTS, then transcribes it back — first through
 * the normal chain, then with Sarvam disabled so the Groq Whisper fallback is
 * the one under test. The failure this guards against is a chain that looks
 * healthy because the primary provider always answers: the fallback rots
 * untested until the day it is the only thing left, which is exactly what
 * happened to the doctor notes path on a revoked OpenAI key.
 *
 * Hits live APIs, so it is manual — not part of `npm run typecheck`.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SarvamAIClient } from 'sarvamai';
import { transcribeSpeech, mimeFromFilename } from '../app/lib/stt';

// Minimal .env loader — this runs outside Next, which normally does it for us.
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

// A sentence with the two things that actually matter in a clinical note and
// are the first to break: a drug name and a dosage number.
const SPOKEN = 'Start the patient on amoxicillin five hundred milligrams twice daily.';

async function synthesise(): Promise<Buffer> {
  const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY! });
  const response: any = await client.textToSpeech.convert({
    model: 'bulbul:v3',
    text: SPOKEN,
    target_language_code: 'en-IN' as any,
    speaker: 'ritu',
  });
  const audios: string[] = response.audios ?? [];
  assert.ok(audios.length > 0, 'Sarvam TTS returned no audio — cannot run the check');
  return Buffer.concat(audios.map((b64) => Buffer.from(b64, 'base64')));
}

function assertUsable(result: { transcript: string; provider: string }, label: string) {
  console.log(`  ${label} → [${result.provider}] "${result.transcript}"`);
  assert.ok(result.transcript.trim().length > 0, `${label}: empty transcript`);
  // Numbers are the safety-critical token; "500" and "five hundred" both pass.
  assert.match(
    result.transcript.toLowerCase(),
    /(500|five hundred)/,
    `${label}: dosage lost from the transcript`,
  );
}

async function main() {
  assert.ok(process.env.SARVAM_API_KEY, 'SARVAM_API_KEY not set');
  assert.ok(process.env.GROQ_API_KEY, 'GROQ_API_KEY not set');

  console.log('Synthesising test clip…');
  // The clip comes from Sarvam TTS, so a Sarvam billing failure stops this
  // check before it can test anything — including the Groq fallback, which
  // would still be fine. Say which it is rather than failing as an assertion.
  let wav: Buffer;
  try {
    wav = await synthesise();
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('insufficient_quota') || msg.includes('No credits')) {
      console.error('\n⚠️  Sarvam has no credits — top up at dashboard.sarvam.ai.');
      console.error('   This check needs Sarvam TTS to generate its test clip, so it');
      console.error('   cannot run. The Groq fallback is unaffected and still serving.');
      // Set the code rather than exit() — a hard exit here trips a libuv
      // assertion on Windows while the HTTP handle is still closing.
      process.exitCode = 2;
      return;
    }
    throw err;
  }
  const args = [wav, 'check.wav', mimeFromFilename('check.wav')] as const;

  console.log('1. Normal chain (Sarvam primary):');
  const primary = await transcribeSpeech(...args, { languageCode: 'en-IN' });
  assertUsable(primary, 'chain');
  assert.strictEqual(primary.provider, 'sarvam', 'expected Sarvam to serve as primary');

  console.log('2. Sarvam disabled — Groq Whisper fallback:');
  const sarvamKey = process.env.SARVAM_API_KEY;
  delete process.env.SARVAM_API_KEY;
  try {
    const fallback = await transcribeSpeech(...args, { languageCode: 'en-IN' });
    assertUsable(fallback, 'fallback');
    assert.strictEqual(fallback.provider, 'groq-whisper', 'expected the Groq fallback');
  } finally {
    process.env.SARVAM_API_KEY = sarvamKey;
  }

  console.log('3. No providers configured — degrades, does not throw:');
  const groqKey = process.env.GROQ_API_KEY;
  delete process.env.SARVAM_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const none = await transcribeSpeech(...args, { languageCode: 'en-IN' });
    assert.strictEqual(none.provider, 'none');
    assert.strictEqual(none.transcript, '');
  } finally {
    process.env.SARVAM_API_KEY = sarvamKey;
    process.env.GROQ_API_KEY = groqKey;
  }

  console.log('\n✅ STT provider chain OK');
}

main().catch((err) => {
  console.error('\n❌ STT check failed:', err.message);
  process.exit(1);
});
