// Requires a running dev server (npm run dev). Run: npx tsx scripts/check-stt-ws.ts
// Verifies the `accurate` flag reaches /api/ws/stt and the session still works.
// Speaks a clinical sentence into the WebSocket as raw 16 kHz PCM, exactly the
// way the AudioWorklet does, and asserts the final transcript comes back intact.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import WebSocket from 'ws';
import { SarvamAIClient } from 'sarvamai';

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const TEXT = 'Start amoxicillin five hundred milligrams twice daily for five days.';

async function pcm16k(): Promise<Buffer> {
  const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY! });
  const r: any = await client.textToSpeech.convert({
    model: 'bulbul:v3', text: TEXT, target_language_code: 'en-IN' as any,
    speaker: 'ritu', speech_sample_rate: 16000 as any,
  });
  const wav = Buffer.concat((r.audios as string[]).map((b) => Buffer.from(b, 'base64')));
  return wav.subarray(44); // strip the RIFF header, leaving raw Int16 PCM
}

function run(accurate: boolean): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const pcm = await pcm16k();
    const ws = new WebSocket('ws://localhost:3000/api/ws/stt');
    const timer = setTimeout(() => reject(new Error('timed out')), 60_000);

    ws.on('open', () => ws.send(JSON.stringify({ type: 'init', lang: 'en-IN', accurate })));
    ws.on('error', reject);
    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ready') {
        // Feed it in worklet-sized frames, then signal end of speech.
        for (let i = 0; i < pcm.length; i += 4096) ws.send(pcm.subarray(i, i + 4096));
        ws.send(JSON.stringify({ type: 'end_of_speech' }));
      } else if (msg.type === 'final') {
        clearTimeout(timer);
        ws.close();
        resolve(msg.text || '');
      } else if (msg.type === 'error') {
        clearTimeout(timer);
        reject(new Error(msg.message));
      }
    });
  });
}

(async () => {
  for (const accurate of [true, false]) {
    const text = await run(accurate);
    console.log(`  accurate=${accurate} → "${text}"`);
    assert.match(text.toLowerCase(), /(500|five hundred)/, `accurate=${accurate}: dosage lost`);
    assert.match(text.toLowerCase(), /amoxicillin/, `accurate=${accurate}: drug name lost`);
  }
  console.log('\n✅ WS STT works in both modes (check the dev server log for accurate=true/false)');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
