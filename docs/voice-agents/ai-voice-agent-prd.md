# PRD — AI Voice Receptionist (India) on Bolna

**Status:** Approved direction · **Owner:** Voice team · **Last updated:** 2026-07-21
**Supersedes:** the Vapi + Twilio plan and the Path A "Mumbai media anchor" runbook.

---

## 1. Objective

Let anyone in India call a normal Indian phone number and reach an AI receptionist that
answers queries, registers patients, and books/reschedules/cancels appointments — handing off
to human staff when needed. It must be **legal in India, cheap to run, and fast to ship.**

## 2. Background & decision

Our first build used **Vapi + Twilio**. Vapi runs in the **US**, and India's TRAI rule
requires domestic calls to be anchored (signalling + audio) on **Indian** infrastructure — so
Indian numbers fail on Vapi with `403 Domestic Anchored Terms Not Met`. This is a regulatory
rule, so **no carrier swap (Exotel/Plivo/Twilio) fixes it**.

Two ways forward were evaluated:

- **Path A — keep Vapi, add a Mumbai media-anchor server.** Cheap infra but the anchor is the
  toll-bypass pattern the rule targets → **legally grey**. Rejected.
- **Path B — use an India-hosted voice-AI engine.** Legally clean. **Chosen.**

**Engine decision: Bolna** — effectively "Vapi, built in India."

| Requirement | Why Bolna wins |
|---|---|
| Legal in India | India-hosted; connects to Indian carriers natively — no TRAI anchoring problem |
| Fast to ship | Managed platform with function-calling (like Vapi) — reuse our prompt + tool design |
| Cheapest | ≈ ₹4–6/min all-in for the AI; among the lowest in the market |
| Calls our HIMS | Native function-calling / webhooks → the agent hits our HIMS REST endpoints directly |
| Indian callers | Uses Sarvam speech models → strong on Indian accents & languages |
| Production-grade | Powers 1M+ calls/month at 99.9% uptime |

**Repo strategy (per team lead):** the voice agent lives in a **separate repo** that only
calls HIMS **API endpoints**. HIMS stays the source of truth; the voice system is decoupled and
independently deployable.

## 3. Architecture

```
Indian caller
   │  PSTN (domestic — anchored by the Indian carrier, compliant)
   ▼
Plivo / Exotel Indian DID   (the number people dial)
   ▼
Bolna  (India-hosted voice AI: speech-to-text → LLM → text-to-speech, in India)
   │  function calls over HTTPS (API-key auth)
   ▼
HIMS API surface  (new, thin REST endpoints wrapping existing services)
   ▼
HIMS database  (patients, appointments, doctors, call logs — unchanged core)
```

- **Voice-agent repo (new):** Bolna agent config, system prompt, tool/function definitions,
  and any thin glue. No always-on server required if functions call HIMS directly.
- **HIMS repo (this one):** exposes a small, stable, authenticated **API surface** for the
  agent, and keeps the Call Center UI to view calls.

## 4. Scope

**In scope (v1):** inbound calls only; caller lookup + name verification; hospital info;
find doctors + availability; book / reschedule / cancel appointment; patient registration;
callback request; human handoff (transfer to staff line); call logging + transcript storage;
Call Center UI to review calls.

**Out of scope (v1):** outbound campaigns; SMS/WhatsApp confirmations (later); payments over
call; multi-hospital routing.

---

## 5. What we already built — reuse / change / retire

Everything sits on branch `origin/feature/ai-voice-assistant`. The **business logic and data
model are fully reusable**; only the Vapi-specific "envelope" glue is replaced.

| Asset (existing) | Action | Notes |
|---|---|---|
| `lib/booking/appointment-service.ts` (`createVoiceAppointment`, `bookingChannel:'voice_ai'`) | **Reuse as-is** | Core booking logic — provider-agnostic |
| `app/lib/voice/vapi-booking.ts` (book/register/reschedule/cancel/callback) | **Reuse logic, re-wrap** | Move the logic behind clean REST endpoints; drop the Vapi tool-call envelope |
| `app/lib/voice/vapi-tools.ts` (lookup/verify/hospital-info/find-doctors/availability/clinic-status) | **Reuse logic, re-wrap** | Same — the functions stay, the Vapi adapter goes |
| `prisma` `CallLog` + `CallTranscript` models & migration | **Reuse** | Keep. Set `provider = 'bolna'`. `provider` field already anticipated multi-provider |
| Call Center UI (`app/call-center/dashboard`, `logs`, `logs/[id]`) | **Reuse** | Reads `channel='voice_ai'` rows + transcripts — unchanged |
| Nav + `call_center` role gating | **Reuse** | Unchanged |
| `app/api/webhooks/vapi/route.ts` | **Retire / rewrite** | Replace with (a) HIMS API endpoints for tools + (b) a Bolna call-events endpoint that writes `CallLog`/`CallTranscript` |
| `scripts/setup-vapi-tools.mjs` | **Retire** | Vapi-specific; replaced by Bolna agent config in the new repo |
| `scripts/test-vapi-webhook.mjs`, `seed-voice-call-logs.mjs` | **Adapt** | Repoint to the new endpoints |
| `.env` `VAPI_*`, `TWILIO_*`, US `VOICE_AI_DID` | **Retire** | Replaced by Bolna + Indian DID + a HIMS API key |
| `docs/voice-agents/ai-voice-call-assistant-plan.md` | **Superseded** | This PRD replaces it |

**Bottom line:** we keep the hard parts (booking engine, data model, Call Center UI) and only
swap the thin telephony/AI layer. Estimated ~70–80% of existing work is reused.

## 6. HIMS work — the API surface to expose (this repo)

Build a small, versioned, **API-key-authenticated** set of endpoints (e.g. under
`/api/voice/v1/…`) that wrap the existing service functions:

**Read**
- `POST /api/voice/v1/lookup-caller` — match phone → patient
- `POST /api/voice/v1/verify-name` — confirm caller identity
- `GET  /api/voice/v1/hospital-info` — hours, address, departments
- `POST /api/voice/v1/find-doctors` — by specialty/name
- `POST /api/voice/v1/doctor-availability` — open slots
- `GET  /api/voice/v1/clinic-status` — open/closed + can-transfer-now

**Write**
- `POST /api/voice/v1/register-patient`
- `POST /api/voice/v1/book-appointment`
- `POST /api/voice/v1/reschedule-appointment`
- `POST /api/voice/v1/cancel-appointment`
- `POST /api/voice/v1/request-callback`

**Call logging**
- `POST /api/voice/v1/call-events` — Bolna posts status + end-of-call transcript; we write
  `CallLog` (`provider='bolna'`, `channel='voice_ai'`) + `CallTranscript`.

Security: shared secret / API key in a header, IP allowlist Bolna if available, HMAC-verify the
`call-events` payload. Reuse the verification pattern already in the Vapi webhook.

## 7. Voice-agent repo work (new)

1. Create the new repo (e.g. `avani-voice-agent`).
2. In **Bolna**: create the assistant, paste the **system prompt** (adapt the existing Vapi
   prompt), pick voice + Indian-language settings.
3. Define **functions/tools** in Bolna, each pointing at a HIMS endpoint above (URL + API key
   header + JSON schema of args).
4. Configure **human handoff** → transfer to `STAFF_TRANSFER_NUMBER` (`+91 96534 59901`).
5. Configure **call-events webhook** → HIMS `/api/voice/v1/call-events`.
6. Version the agent config/prompt in the repo (export from Bolna or infra-as-code).

## 8. Telephony (Indian number)

1. Open a **Plivo** (recommended, self-serve) or **Exotel** account.
2. Complete **Indian-DID KYC** (business proof, address) — start early, can take days.
3. Buy an **Indian DID** and connect it to the Bolna agent (Bolna has native Plivo & Exotel
   integrations).
4. Route inbound calls on that number → the Bolna assistant.

---

## 9. Prerequisites — what we need right now to start

| # | Need | Owner | Blocker? |
|---|---|---|---|
| 1 | **Bolna account** (sign up, pick plan) | Voice team | No — free/trial to start |
| 2 | **Plivo or Exotel account + Indian DID** (start KYC now) | Ops/Admin | **Yes — long pole (days)** |
| 3 | **HIMS API key** mechanism + decision on endpoint auth | Backend | No |
| 4 | **New repo** created for the agent | Voice team | No |
| 5 | Existing HIMS deployed with public HTTPS (already true) | — | Done ✓ |
| 6 | Staff transfer line confirmed (`+91 96534 59901`) | Ops | Done ✓ |

**You can start today with #1, #3, #4 in parallel while #2 (the number) clears KYC.** The agent
logic can be fully tested on Bolna via web/test calls before the phone number is live.

## 10. Production cost (estimate)

Costs are **usage-based**. Two levers: **Bolna AI minutes** (~₹4–6/min all-in) and
**carrier inbound minutes + DID rental** (~₹0.5/min + ~₹500/mo). No always-on servers needed —
HIMS is already deployed and Bolna is managed.

| Scenario | Calls/day (≈3 min avg) | Bolna AI (@₹5.5) | Telephony (@₹0.5 + DID) | **Approx / month** |
|---|---|---|---|---|
| Low | 30 (~2,700 min/mo) | ₹14,850 | ₹1,850 | **≈ ₹16,700 (~$200)** |
| Medium | 100 (~9,000 min/mo) | ₹49,500 | ₹5,000 | **≈ ₹54,500 (~$650)** |

**One-time:** internal dev effort only (build the API surface + agent config). No hardware, no
media-anchor server (that was Path A), no license fees.

> Figures are planning estimates. Confirm exact per-minute rates with **Bolna** (whether
> telephony/LLM are bundled or separate) and your **carrier** quote before go-live. Set a
> monthly spend cap + alerting in Bolna to avoid runaway cost.

## 11. Milestones

1. **M1 — Prereqs:** Bolna + carrier accounts, KYC started, new repo, API-key scheme.
2. **M2 — HIMS API surface:** ship the `/api/voice/v1/*` endpoints (wrap existing services) + `call-events`.
3. **M3 — Agent build:** Bolna assistant + prompt + functions wired to the endpoints; test via web calls.
4. **M4 — Number live:** attach Indian DID, end-to-end test call, human-handoff test.
5. **M5 — Production:** spend cap, monitoring, Call Center UI verified, go-live.

## 12. Risks / open items

- **KYC timeline** for the Indian DID is the main schedule risk — start immediately.
- Confirm Bolna's **function-calling latency + Indian-language quality** with a real test call.
- Confirm **data-privacy/consent** wording for callers (recording + PHI) with hospital admin.
- Confirm exact **billing model** with Bolna (bundled vs separate telephony/LLM).
- Decide transcript **retention** (reuse existing `VOICE_TRANSCRIPT_RETENTION_DAYS` + purge cron).
