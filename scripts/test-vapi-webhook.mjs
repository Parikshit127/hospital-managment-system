/**
 * scripts/test-vapi-webhook.mjs
 * Dev-only: simulates Vapi server messages hitting the local webhook, so we can
 * verify CallLog + CallTranscript persistence WITHOUT placing a real phone call.
 *
 * Run (dev server must be running with fresh .env):
 *   set -a; source .env; set +a; node scripts/test-vapi-webhook.mjs
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
  ? process.env.NEXT_PUBLIC_APP_URL
  : 'http://localhost:3000';
const URL = `${BASE}/api/webhooks/vapi`;
const SECRET = process.env.VAPI_WEBHOOK_SECRET;
const CALL_ID = 'test-webhook-call-001';

async function post(payload) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Vapi-Secret': SECRET ?? '' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  if (!SECRET) {
    console.error('VAPI_WEBHOOK_SECRET not in env — run: set -a; source .env; set +a; node ...');
    process.exit(1);
  }

  // 1) status-update: call in progress
  const s1 = await post({
    message: {
      type: 'status-update',
      status: 'in-progress',
      call: { id: CALL_ID },
      customer: { number: '+919812309999' },
      phoneNumber: { number: '+16263821254' },
    },
  });
  console.log('status-update  →', s1.status, s1.body);

  // 2) end-of-call-report: with transcript
  const now = Date.now();
  const s2 = await post({
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      startedAt: new Date(now - 75_000).toISOString(),
      endedAt: new Date(now).toISOString(),
      durationSeconds: 75,
      call: { id: CALL_ID },
      customer: { number: '+919812309999' },
      phoneNumber: { number: '+16263821254' },
      analysis: { summary: 'Caller asked about visiting hours; assistant answered.' },
      artifact: {
        transcript: 'AI: Hello... User: What are your visiting hours?...',
        messages: [
          { role: 'system', message: 'You are the hospital assistant.' },
          { role: 'bot', message: 'Hello, this is the AI assistant for Avani Hospital. How can I help you?' },
          { role: 'user', message: 'What are your visiting hours?' },
          { role: 'bot', message: 'Visiting hours are 4 to 7 PM daily. Anything else?' },
          { role: 'user', message: 'No, thank you.' },
        ],
      },
    },
  });
  console.log('end-of-call    →', s2.status, s2.body);

  // 3) invalid signature should be rejected
  const bad = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Vapi-Secret': 'wrong-secret' },
    body: JSON.stringify({ message: { type: 'status-update', status: 'ended', call: { id: 'x' } } }),
  });
  console.log('bad-secret     →', bad.status, '(expected 401)');
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
