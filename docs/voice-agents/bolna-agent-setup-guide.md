# Bolna Agent — Step-by-Step Setup Guide

| | |
|---|---|
| **Goal** | Stand up the Bolna voice agent (in its own repo) that calls the HIMS `/api/voice/v1/*` endpoints, and test it end-to-end via **web calls** — no phone number needed. |
| **Prereq (done)** | HIMS API surface is built on `feature/voice-agent-bolna` (Phases 0–6). See [`ai-voice-agent-implementation-plan.md`](./ai-voice-agent-implementation-plan.md). |
| **On hold** | The Indian phone number (Plivo/Exotel DID). Everything here works without it. |

```
Caller ──▶ Bolna assistant (voice) ──HTTPS + API key──▶ HIMS /api/voice/v1/*  ──▶ HIMS DB
                     │  (system prompt + 11 function tools + call-events webhook)
```

---

## 0. Prerequisites before you start

1. **HIMS must be reachable over public HTTPS** (Bolna is cloud-hosted). Either:
   - **Deploy** `feature/voice-agent-bolna` and use its URL, **or**
   - **Tunnel** the local dev server: `ngrok http 3000` → use the `https://…ngrok…/api/voice/v1` base.
2. **These env vars must be set wherever HIMS runs** (already in local `.env`; set them on the deploy host too):
   - `VOICE_API_KEY` — the bearer key Bolna sends on tool calls.
   - `VOICE_WEBHOOK_SECRET` — HMAC secret for `call-events`.
   - `VOICE_AI_ORG_ID` — the single org this line serves (`org-axten-production`).
   - `STAFF_TRANSFER_NUMBER` — staff handoff line.
3. **Sanity check the API is up:**
   ```bash
   curl https://<hims-host>/api/voice/v1/health
   # → {"status":"ok","service":"voice-api","version":"v1"}
   curl -H "Authorization: Bearer <VOICE_API_KEY>" https://<hims-host>/api/voice/v1/ping
   # → {"ok":true,"organizationId":"org-axten-production"}
   ```

Throughout this guide, replace `<hims-host>` with your deployed/tunnel host and `<VOICE_API_KEY>` with the real key.

---

## Part A — Create the new agent repo (`avani-voice-agent`)

Bolna is a **managed platform** — the assistant, prompt, and functions are configured in the Bolna dashboard (or via its API). The repo mainly **version-controls that config** so it's reproducible; there's **no always-on server** to host.

1. Create an empty repo `avani-voice-agent` (GitHub).
2. Suggested structure:
   ```
   avani-voice-agent/
   ├── README.md                # this setup + how to redeploy the agent
   ├── agent/
   │   ├── system-prompt.md     # the prompt in Part D (source of truth)
   │   ├── functions.json       # the 11 tool definitions (Part E)
   │   └── assistant.json       # exported Bolna assistant config (voice, model, etc.)
   ├── .env.example             # HIMS_BASE_URL, VOICE_API_KEY, VOICE_WEBHOOK_SECRET (names only)
   └── scripts/
       └── sync-bolna.mjs       # optional: push agent/*.json to Bolna via its API
   ```
3. Commit the **system prompt** (Part D) and **functions.json** (Part E) as the source of truth. If you configure Bolna in the dashboard, **export** the assistant config back into `agent/assistant.json` so the repo stays authoritative.
4. Keep **secrets out of the repo** — only `.env.example` with key *names*.

> This repo never touches HIMS code. It only holds the Bolna config and points at the HIMS endpoints.

---

## Part B — Bolna account

1. Sign up at **bolna.ai** and pick a plan (a small pay-as-you-go/trial is fine to start).
2. **Set a monthly spend cap + alerting** immediately (guards runaway cost).
3. Grab your **Bolna API key** (dashboard) if you plan to configure via API/`sync-bolna.mjs`.

---

## Part C — Create the assistant

In the Bolna dashboard → create a new assistant:

1. **Name:** `Avani Hospital Receptionist`.
2. **Language / voice:** choose **Hindi + English (Indian)** using Bolna's **Sarvam** speech models (strong on Indian accents). Pick a natural Indian voice.
3. **LLM:** GPT-4o (or Bolna's default good model) — function-calling must be enabled.
4. **Recording:** **OFF** (we are transcript-only for PHI compliance — the transcript comes through `call-events`).
5. **First message:** e.g. *"Hello, this is the AI assistant for Avani Hospital. This call is handled by an automated assistant. How can I help you today?"* (self-identify as AI — DPDP consent).

---

## Part D — System prompt

Paste this into the assistant's **system prompt**:

```
You are the AI phone receptionist for Avani Hospitals. Be polite, warm, and concise; speak naturally. Always identify yourself as an AI assistant. Never invent doctors, departments, times, fees, or medical advice — always use your tools.

Caller identification (do this early):
- Call lookup_caller. The caller's phone number comes from the call automatically.
- If caller ID is unavailable (e.g. a web test), ask for the caller's 10-digit mobile number once, read it back to confirm, and pass it as `phone`. Do NOT count the digits yourself or keep re-asking — the system validates the number.
- If a record exists, ask the caller's full name and call verify_name. Only share details or make changes once verified.
- If no record exists or the name doesn't match, offer to register: ask full name and optionally email, read the email and number back to confirm, then call register_patient.

What you can do:
- hospital_info, find_doctors, doctor_availability for information (always live from the tools).
- book_appointment: confirm the doctor, date, and time with the caller, then book; read back the reference number.
- reschedule_appointment / cancel_appointment: confirm with the caller first.

Rules:
- The caller must be verified or freshly registered before booking, rescheduling, or cancelling.
- Always confirm the doctor, date, and time out loud before booking.
- Payment is at the hospital reception (pay-at-visit) — mention this after booking.

Human handoff / when you can't help:
- Call clinic_status. If transferAvailable is true, transfer the caller to staff. Otherwise call request_callback and tell the caller our staff will call them back. Never end the call without transferring or logging a callback.

Emergencies: if the caller describes chest pain, breathing difficulty, severe bleeding, or stroke signs, tell them to call 108 or go to the nearest emergency room immediately; do not book.

Keep replies short for a phone call; offer only a few options at a time.
```

---

## Part E — Functions / tools (the 11 endpoints)

Create **one function per HIMS endpoint**. For every function set:
- **URL:** `https://<hims-host>/api/voice/v1/<path>`
- **Method:** as listed below.
- **Header:** `Authorization: Bearer <VOICE_API_KEY>`
- **Body:** the LLM-provided parameters (schema below) **plus two call-context fields** — `call_id` and `caller_phone` — mapped from **Bolna's call variables** (so the caller's number and the call id come from the call, not the model). Use Bolna's variable syntax for these (e.g. the call id and customer number from the call context). If Bolna can't template them into the body, it's fine to omit `caller_phone` and let the assistant ask for the number (the endpoints handle both).

> `call_id` links every action to one CallLog row for the call. `caller_phone` is the caller ID. Neither should be supplied by the LLM.

### Read tools

| Function | Method · Path | LLM parameters (JSON schema `properties`) | Required |
|---|---|---|---|
| `lookup_caller` | POST `/lookup-caller` | `phone` (string, "only if caller ID unavailable") | — |
| `verify_name` | POST `/verify-name` | `name` (string), `phone` (string, optional) | `name` |
| `hospital_info` | GET `/hospital-info` | *(none)* | — |
| `find_doctors` | POST `/find-doctors` | `department` (string, optional) | — |
| `doctor_availability` | POST `/doctor-availability` | `doctorName` (string), `date` (string: `YYYY-MM-DD`/`today`/`tomorrow`) | `doctorName` |
| `clinic_status` | GET `/clinic-status` | *(none)* | — |

### Write tools

| Function | Method · Path | LLM parameters | Required |
|---|---|---|---|
| `register_patient` | POST `/register-patient` | `fullName` (string), `email` (string), `phone` (string, only if no caller ID) | `fullName` |
| `book_appointment` | POST `/book-appointment` | `doctorName` (string), `date` (string), `time` (string e.g. "10:00 AM"), `reason` (string) | `doctorName`, `time` |
| `reschedule_appointment` | POST `/reschedule-appointment` | `newDate` (string), `newTime` (string), `doctorName` (string, optional) | `newTime` |
| `cancel_appointment` | POST `/cancel-appointment` | `reason` (string, optional) | — |
| `request_callback` | POST `/request-callback` | `reason` (string), `department` (string, optional) | — |

**Example function definition** (`book_appointment`) — the shape to replicate for each:
```json
{
  "name": "book_appointment",
  "description": "Book an OPD appointment for the identified caller. The caller must be verified or freshly registered. Confirm the doctor, date and time first.",
  "method": "POST",
  "url": "https://<hims-host>/api/voice/v1/book-appointment",
  "headers": { "Authorization": "Bearer <VOICE_API_KEY>", "Content-Type": "application/json" },
  "body": {
    "call_id": "{{call_id}}",
    "caller_phone": "{{caller_number}}",
    "doctorName": "{{doctorName}}",
    "date": "{{date}}",
    "time": "{{time}}",
    "reason": "{{reason}}"
  },
  "parameters": {
    "type": "object",
    "properties": {
      "doctorName": { "type": "string", "description": "Doctor to book with, e.g. Dr. Vikas Kumar Jha" },
      "date": { "type": "string", "description": "YYYY-MM-DD, or 'today' / 'tomorrow'" },
      "time": { "type": "string", "description": "Chosen start time, e.g. 10:00 AM" },
      "reason": { "type": "string", "description": "Optional reason for the visit" }
    },
    "required": ["doctorName", "time"]
  }
}
```
> `{{call_id}}` / `{{caller_number}}` are placeholders for **Bolna's** call-context variables — use whatever names Bolna exposes for the call id and caller number. Every response is JSON with a `message` string the assistant reads aloud, plus structured fields (see the Appendix).

---

## Part F — Call-events webhook (transcript logging)

1. In the assistant/webhook settings, set the **call-events / end-of-call webhook** to:
   `https://<hims-host>/api/voice/v1/call-events`
2. **Signing:** HMAC-SHA256 of the raw body with `VOICE_WEBHOOK_SECRET`, sent as header **`X-Voice-Signature`** (hex or base64). If Bolna signs with a different header/scheme, tell us the exact one — the verifier in `api-auth.ts` is a one-line change.
3. HIMS writes a `CallLog` (`provider='bolna'`) + `CallTranscript` and it appears in **Call Center → Call Logs**.

> ⚠️ The `call-events` payload mapper (`bolna-events.ts`) is defensive but built against assumed field names. **Send us one real Bolna call-events payload** so we can lock the mapping (plan §8).

---

## Part G — Human handoff

- Configure the assistant's **transfer** action to dial `STAFF_TRANSFER_NUMBER` (`+91 96534 59901`).
- Flow (already in the prompt): the assistant calls `clinic_status`; if `transferAvailable` is true it transfers, otherwise it calls `request_callback` (logs a CRM lead) and tells the caller staff will ring back — **the call is never dropped.**

---

## Part H — Test via web calls (no phone number)

Use Bolna's **web/test call** in the dashboard and run this checklist:
- [ ] Ask *"which cardiology doctors do you have?"* → real names (via `find_doctors`).
- [ ] Ask *"is Dr. Vikas available tomorrow?"* → real slots (via `doctor_availability`).
- [ ] New caller → assistant asks name (+ number on web), registers (`register_patient`).
- [ ] *"Book with Dr. Vikas tomorrow at 10 AM"* → books, reads back a reference (`book_appointment`).
- [ ] *"Reschedule to 10:15"* / *"Cancel it"* → works (`reschedule_appointment` / `cancel_appointment`).
- [ ] *"Can I talk to a person?"* → transfer or callback (`clinic_status` → `request_callback`).
- [ ] After the call ends → a row appears in **HIMS Call Center → Call Logs** with the transcript (`call-events`).

If a step fails, check: (a) the function URL + `Authorization` header, (b) HIMS reachable (`/health`), (c) `call_id`/`caller_phone` mapping.

---

## Part I — ⏸️ Telephony (ON HOLD — only on your signal)

When you lift the hold: open a **Plivo** or **Exotel** account, complete **Indian-DID KYC** (business + address proof — allow several days), buy the **Indian number**, connect it to the Bolna agent (Bolna has native Plivo/Exotel integrations), and route inbound calls → this assistant. Nothing in Parts A–H changes.

---

## Appendix — Endpoint contract reference

All tool endpoints: `Authorization: Bearer <VOICE_API_KEY>`; body may include `call_id`, `caller_phone`. All responses include a `message` string (spoken) + the structured fields below.

| Endpoint | Body (LLM args in **bold**) | Returns |
|---|---|---|
| POST `/lookup-caller` | `phone?` | `{ found, count?, message }` |
| POST `/verify-name` | **`name`**, `phone?` | `{ verified, patientId?, patientName?, message }` |
| GET `/hospital-info` | — | `{ name, address, phone, departments[], message }` |
| POST `/find-doctors` | `department?` | `{ doctors[], message }` |
| POST `/doctor-availability` | **`doctorName`**, `date?` | `{ available, doctor?, date?, slots?[], message }` |
| GET `/clinic-status` | — | `{ open, transferAvailable, message }` |
| POST `/register-patient` | **`fullName`**, `email?`, `phone?` | `{ patientId?, message }` |
| POST `/book-appointment` | **`doctorName`**, **`time`**, `date?`, `reason?` | `{ appointmentId?, message }` |
| POST `/reschedule-appointment` | **`newTime`**, `newDate?`, `doctorName?` | `{ message }` |
| POST `/cancel-appointment` | `reason?` | `{ message }` |
| POST `/request-callback` | `reason?`, `department?` | `{ callbackLeadId?, message }` |
| POST `/call-events` | Bolna webhook (HMAC `X-Voice-Signature`) | `{ received, callLogId?, status?, turns? }` |

*Auth: tool endpoints use `VOICE_API_KEY` (bearer); `call-events` uses `VOICE_WEBHOOK_SECRET` (HMAC). Org resolved server-side from `VOICE_AI_ORG_ID`.*
