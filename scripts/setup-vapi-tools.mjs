/**
 * scripts/setup-vapi-tools.mjs
 * Registers the AI Voice Call Assistant's read-only tools on your Vapi assistant.
 *
 * Idempotent: matches existing tools by function name (creates or updates), then
 * attaches them to the assistant via model.toolIds. Each tool points at your
 * public webhook URL and carries the shared secret so calls authenticate.
 *
 * Run (pass your current public webhook URL, i.e. ngrok + /api/webhooks/vapi):
 *   set -a; source .env; set +a
 *   node scripts/setup-vapi-tools.mjs https://<your-ngrok>.ngrok-free.dev/api/webhooks/vapi
 *
 * Re-run this whenever the ngrok URL changes.
 */
const API = 'https://api.vapi.ai';
const KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const SECRET = process.env.VAPI_WEBHOOK_SECRET;
const WEBHOOK_URL = process.argv[2];

if (!KEY || !ASSISTANT_ID || !SECRET) {
  console.error('Missing VAPI_API_KEY / VAPI_ASSISTANT_ID / VAPI_WEBHOOK_SECRET in env.');
  process.exit(1);
}
if (!WEBHOOK_URL || !WEBHOOK_URL.startsWith('http')) {
  console.error('Pass your public webhook URL as the first argument, e.g.\n  node scripts/setup-vapi-tools.mjs https://xxx.ngrok-free.dev/api/webhooks/vapi');
  process.exit(1);
}

const server = { url: WEBHOOK_URL, headers: { 'x-vapi-secret': SECRET } };

const TOOLS = [
  {
    name: 'lookup_caller',
    description: "Check whether the current caller's phone number matches an existing patient record. Returns whether a record exists WITHOUT revealing the patient's name. Call this first for any caller.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'verify_caller_name',
    description: "Verify the caller's identity by matching a full name they speak against the patient record on their phone number. Only proceed to help or disclose details once verified.",
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The full name the caller says' } },
      required: ['name'],
    },
  },
  {
    name: 'get_hospital_info',
    description: "Get the hospital's name, address, phone, and the list of departments/specialties. Use for general enquiries.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'find_doctors',
    description: 'List doctors, optionally filtered by department/specialty, with their consultation fee and working hours. Never invent doctors.',
    parameters: {
      type: 'object',
      properties: { department: { type: 'string', description: 'Optional department/specialty to filter by, e.g. "Cardiology"' } },
      required: [],
    },
  },
  {
    name: 'get_doctor_availability',
    description: "Get a doctor's available appointment time slots for a date. Reads live availability and accounts for the doctor's leave. Do not book — this only reads availability.",
    parameters: {
      type: 'object',
      properties: {
        doctorName: { type: 'string', description: 'The doctor name, e.g. "Vikas" or "Dr. Vikas Kumar Jha"' },
        date: { type: 'string', description: "Date as YYYY-MM-DD, or 'today' / 'tomorrow'. Defaults to today." },
      },
      required: ['doctorName'],
    },
  },
];

async function api(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return json;
}

async function main() {
  // 1. Existing tools (to update instead of duplicate)
  const existing = await api('/tool', 'GET');
  const byName = new Map();
  for (const t of Array.isArray(existing) ? existing : []) {
    const n = t?.function?.name;
    if (n) byName.set(n, t.id);
  }

  const toolIds = [];
  for (const t of TOOLS) {
    const payload = {
      type: 'function',
      async: false,
      function: { name: t.name, description: t.description, parameters: t.parameters },
      server,
    };
    if (byName.has(t.name)) {
      const id = byName.get(t.name);
      await api(`/tool/${id}`, 'PATCH', payload);
      toolIds.push(id);
      console.log(`updated  ${t.name} (${id})`);
    } else {
      const created = await api('/tool', 'POST', payload);
      toolIds.push(created.id);
      console.log(`created  ${t.name} (${created.id})`);
    }
  }

  // 2. Attach to the assistant (preserve existing model config, just set toolIds)
  const assistant = await api(`/assistant/${ASSISTANT_ID}`, 'GET');
  const model = assistant.model ?? {};
  const merged = Array.from(new Set([...(model.toolIds ?? []), ...toolIds]));
  await api(`/assistant/${ASSISTANT_ID}`, 'PATCH', { model: { ...model, toolIds: merged } });
  console.log(`\nAttached ${toolIds.length} tools to assistant ${ASSISTANT_ID}.`);
  console.log('Tools now point at:', WEBHOOK_URL);
}

main().catch((e) => {
  console.error('\nSETUP FAILED:', e.message);
  console.error('If the assistant PATCH failed, create/verify the tools above and add them manually in the Vapi dashboard (Assistant → Tools).');
  process.exit(1);
});
