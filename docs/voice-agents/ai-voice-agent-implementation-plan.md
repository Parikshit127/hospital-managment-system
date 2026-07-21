# Implementation Plan — AI Voice Receptionist on Bolna (HIMS side)

| Field | Value |
|---|---|
| **Implements** | [`ai-voice-agent-prd.md`](./ai-voice-agent-prd.md) (Bolna direction; supersedes the Vapi+Twilio plan) |
| **Branch** | `feature/voice-agent-bolna` (off `feature/ai-voice-assistant`; never merge to `main` without review) |
| **Scope of THIS plan** | The **HIMS repo** work only — the `/api/voice/v1/*` API surface + `call-events`, plus refactor/retire of the Vapi glue. The Bolna agent config lives in a **separate repo** (coordination only, not built here). |
| **On hold (do later, on your signal)** | **Only** the **Telephony — Indian DID (Plivo/Exotel) + KYC** (the long-pole KYC item), in §9. **HIMS Phases 0–6 are built & committed.** Everything else — the HIMS endpoints **and the Bolna agent (§6)** — is in scope now. |
| **Author date** | 2026-07-21 |

> Follows the PRD exactly. Reuses the existing booking engine, data model, and Call Center UI; only the thin Vapi "envelope" is replaced by clean REST endpoints. No assumptions — every reuse target below was verified to exist on `feature/ai-voice-assistant`.

---

## 1. What changes vs. what stays (from PRD §5, verified)

| Existing asset | Action | How, in this plan |
|---|---|---|
| `lib/booking/appointment-service.ts` (`createVoiceAppointment`, `bookingChannel:'voice_ai'`) | **Reuse as-is** | Called unchanged by the write endpoints |
| `app/lib/voice/vapi-booking.ts` (book/register/reschedule/cancel/callback) | **Reuse logic, re-wrap** | Extract the pure functions into a provider-neutral core; REST endpoints call them |
| `app/lib/voice/vapi-tools.ts` (lookup/verify/hospital-info/find-doctors/availability/clinic-status) | **Reuse logic, re-wrap** | Same — keep the functions, drop the Vapi tool-call dispatcher |
| `CallLog` + `CallTranscript` models & migration | **Reuse** | Keep. Write `provider='bolna'`, `channel='voice_ai'` |
| Call Center UI (`app/call-center/{dashboard,logs,logs/[id]}`) | **Reuse** | Already reads `channel='voice_ai'` + transcripts — unchanged |
| Nav + `call_center` role gating + retention purge cron | **Reuse** | Unchanged (`VOICE_TRANSCRIPT_RETENTION_DAYS` + purge already exist) |
| `app/api/webhooks/vapi/route.ts` | **Retire / rewrite** | Replaced by `/api/voice/v1/*` tool endpoints + `/api/voice/v1/call-events` |
| `scripts/setup-vapi-tools.mjs` | **Retire** | Vapi-specific; Bolna config lives in the separate agent repo |
| `scripts/test-vapi-webhook.mjs`, `scripts/seed-voice-call-logs.mjs` | **Adapt** | Repoint to the new endpoints |
| `.env` `VAPI_*`, `TWILIO_*`, US `VOICE_AI_DID` | **Retire** | Replaced by a HIMS API key (+ Bolna/DID later, on hold) |

**Verified facts this plan relies on:**
- `/api/voice/` is already exempt from the session gate (`proxy.ts:103`) → `/api/voice/v1/*` needs **no middleware change**; it self-authenticates via API key.
- The Vapi webhook already has a reusable auth pattern (`X-Vapi-Secret` / `Authorization: Bearer` / HMAC) — the new endpoints reuse this shape with a `VOICE_API_KEY`.
- `CallLog.provider` exists (currently `'vapi'`); we write `'bolna'` — no schema change needed.
- Org resolution is single-tenant via `VOICE_AI_ORG_ID`; DB access is org-scoped via `getTenantPrisma(orgId)`.

---

## 2. Target API surface (from PRD §6)

All under `/api/voice/v1/…`, **API-key authenticated**, org resolved from `VOICE_AI_ORG_ID`.

**Read** — `lookup-caller` · `verify-name` · `hospital-info` · `find-doctors` · `doctor-availability` · `clinic-status`
**Write** — `register-patient` · `book-appointment` · `reschedule-appointment` · `cancel-appointment` · `request-callback`
**Call logging** — `call-events` (Bolna posts status + end-of-call transcript → `CallLog` + `CallTranscript`)

**Contract principle:** every endpoint takes an explicit JSON body (the caller phone + a Bolna `call_id` are passed in the request, replacing the old Vapi tool-call envelope), and returns a clean JSON result — no Vapi-specific `{ results: [...] }` wrapper.

---

## 3. Phased build (HIMS repo)

Each phase is a reviewable unit ending in a test. Commit per logical unit **on `feature/voice-agent-bolna`** only. **No work on `main`.**

### Phase 0 — Branch + decisions (no feature code) ✅ branch done
- [x] Branch `feature/voice-agent-bolna` created off `feature/ai-voice-assistant`.
- [ ] **Auth decision:** shared `VOICE_API_KEY` in an `Authorization: Bearer` (or `X-Voice-Api-Key`) header for tool endpoints; **HMAC** (`VOICE_WEBHOOK_SECRET`) for `call-events`. (Reuse the existing verify helper shape.)
- [ ] **Env plan:** add `VOICE_API_KEY`, `VOICE_WEBHOOK_SECRET`; keep `VOICE_AI_ORG_ID`, `STAFF_TRANSFER_NUMBER`, `VOICE_TRANSCRIPT_RETENTION_DAYS`. Mark `VAPI_*`/`TWILIO_*` for retirement (Phase 6).
- **Exit:** decisions recorded; env keys listed in `.env.example`.

### Phase 1 — Provider-neutral core (refactor, no behavior change) ✅ DONE
- [ ] Extract the pure logic from `vapi-booking.ts` + `vapi-tools.ts` into a provider-agnostic module (e.g. `app/lib/voice/core/`), each function typed `(input) → result` with **no Vapi envelope** and no telephony-metadata coupling (caller phone + call id become explicit inputs).
- [ ] Keep return shapes structured (`{ ok, data, message }`) so both REST and the legacy webhook can call them during transition.
- **Test:** existing simulated-call behavior still passes via the core functions (unit-level); typecheck + lint clean.

### Phase 2 — API foundation + auth ✅ DONE
- [ ] `app/lib/voice/api-auth.ts` — verify `VOICE_API_KEY` (constant-time), resolve `organizationId` from `VOICE_AI_ORG_ID`; a separate HMAC verify for `call-events`.
- [ ] `app/api/voice/v1/health/route.ts` — unauthenticated `GET` returning `{ status:'ok' }` for connectivity checks (like the old webhook health).
- [ ] Confirm `/api/voice/` proxy exemption already covers `/api/voice/v1/*` (it does — no change).
- **Test:** health reachable; a protected stub returns 401 without the key, 200 with it.

### Phase 3 — Read endpoints ✅ DONE
- [ ] `POST lookup-caller`, `POST verify-name`, `GET hospital-info`, `POST find-doctors`, `POST doctor-availability`, `GET clinic-status` — each validates the key, parses body, calls the Phase-1 core, returns JSON.
- [ ] Carry over the existing behaviors: no name leak on lookup, DoctorLeave-aware availability, IST clinic hours, spoken-phone tolerance.
- **Test:** integration tests hitting each endpoint against real DB data (verify true/false, multi-match, no-match, real doctors/slots); zero appointment/patient writes.

### Phase 4 — Write endpoints ✅ DONE
- [ ] `POST register-patient`, `book-appointment`, `reschedule-appointment`, `cancel-appointment`, `request-callback` — call the reused engine (`createVoiceAppointment` with `bookingChannel:'voice_ai'`; reschedule/cancel free the old slot; callback → `CRMLead`).
- [ ] Identity + `CallLog` linkage keyed on the Bolna `call_id` passed in the request (replaces `provider_call_id` from the Vapi envelope).
- **Test:** end-to-end register→book→reschedule→cancel + callback against DB with cleanup (mirror the Phase-4 Vapi test we already have); appointments visible on patient + doctor portals; idempotent.

### Phase 5 — `call-events` (call logging + transcript) ✅ DONE
- [ ] `POST /api/voice/v1/call-events` — HMAC-verify; handle Bolna's status + end-of-call payloads; upsert `CallLog` (`provider='bolna'`, `channel='voice_ai'`, idempotent on Bolna call id) + `CallTranscript` (transcript-only); write a `VOICE_CALL_RECEIVED` audit row.
- [ ] Map Bolna's transcript/message shape → our `turns` format (adapter, once Bolna's payload is confirmed — flag as an open item in §10).
- **Test:** simulated Bolna payloads create/finalize a `CallLog` + `CallTranscript`; replay is idempotent; row shows in Call Center UI.

### Phase 6 — Retire Vapi glue + cleanup ✅ DONE
- [ ] Delete `app/api/webhooks/vapi/route.ts` and `scripts/setup-vapi-tools.mjs`; the core logic they used now lives in Phase-1 module + Phase 3–4 endpoints.
- [ ] Adapt `scripts/test-vapi-webhook.mjs` + `scripts/seed-voice-call-logs.mjs` to the new endpoints (rename to `test-voice-api.mjs` / keep seed).
- [ ] `.env` / `.env.example`: retire `VAPI_*`, `TWILIO_*`, US `VOICE_AI_DID`; document `VOICE_API_KEY`, `VOICE_WEBHOOK_SECRET`.
- [ ] Call Center UI: confirm it renders `provider='bolna'` rows (it filters on `channel='voice_ai'` — provider-agnostic; verify the detail view label).
- [ ] Mark `ai-voice-call-assistant-plan.md` as **superseded by the PRD** (add a banner; keep for history).
- **Test:** typecheck + lint clean project-wide; no dangling Vapi references; Call Center UI unaffected.

---

## 4. Testing strategy (per phase)
Unit tests on the Phase-1 core; endpoint integration tests (auth 401/200, each read/write, idempotency, DB cleanup) hitting the local server; a `scripts/test-voice-api.mjs` harness that simulates the Bolna calls end-to-end (like the current webhook test). Portal-visibility check after booking. Everything runs against the existing DB with clearly-marked, self-cleaning test rows.

## 5. Env vars (this repo)
- **Add:** `VOICE_API_KEY` (tool endpoint auth), `VOICE_WEBHOOK_SECRET` (call-events HMAC).
- **Keep:** `VOICE_AI_ORG_ID`, `STAFF_TRANSFER_NUMBER`, `VOICE_TRANSCRIPT_RETENTION_DAYS`, `OPENAI_API_KEY`, `SARVAM_API_KEY`, `GROQ_API_KEY`, `CRON_SECRET`.
- **Retire (Phase 6):** `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET`, `TWILIO_*`, US `VOICE_AI_DID`.

---

## 6. Bolna agent — setup (separate repo, IN SCOPE)

The agent lives in a **new repo** (e.g. `avani-voice-agent`). It is **not on hold** — it can be built and fully tested via Bolna **web/test calls before** any phone number is live (only the Indian DID is on hold, §9). This HIMS branch exposes the endpoints; the steps below wire Bolna to them. Actionable once the HIMS endpoints (Phases 2–5) are deployed and reachable.

**Bolna setup checklist (PRD §7):**
1. **Account** — sign up for Bolna (free/trial), pick a plan, set a **monthly spend cap + alerting** (guard runaway cost).
2. **Repo** — create `avani-voice-agent`; version the agent config + prompt (export from Bolna, or infra-as-code).
3. **Assistant** — create it; choose voice + **Indian-language settings** (Sarvam speech models); **disable recording** (transcript-only — matches our PHI policy).
4. **System prompt** — adapt the existing prompt: identity, verify-before-write, spoken phone/email tolerance, emergency → 108/ER, and the handoff rules.
5. **Functions/tools** — define **one Bolna function per HIMS endpoint** (`lookup-caller`, `verify-name`, `hospital-info`, `find-doctors`, `doctor-availability`, `clinic-status`, `register-patient`, `book-appointment`, `reschedule-appointment`, `cancel-appointment`, `request-callback`). For each: point at `https://<hims-host>/api/voice/v1/<name>`, add the **`VOICE_API_KEY`** auth header, and set the JSON arg schema.
6. **Human handoff** — transfer to `STAFF_TRANSFER_NUMBER` (`+91 96534 59901`); fall back to `request-callback` when transfer is unavailable / after-hours (never drop the call).
7. **Call-events webhook** — point Bolna's status + end-of-call webhook at `https://<hims-host>/api/voice/v1/call-events`, signed with **`VOICE_WEBHOOK_SECRET`** (HMAC).
8. **Test (no number needed)** — run Bolna web/test calls against the live HIMS endpoints; verify info, availability, register → book → reschedule → cancel, handoff/callback, and that `CallLog` (`provider='bolna'`) + `CallTranscript` are written and visible in the Call Center UI.

> Dependency: only the HIMS endpoints must be reachable — **not** the phone number. The DID (§9) is needed only for real PSTN calls, not for this web-call testing.

---

## 7. Milestone mapping (PRD §11)
- **M2 — HIMS API surface** = Phases 1–5 of this plan (the core deliverable of this branch).
- **M1 (Bolna account) + M3 (Bolna agent build)** = §6 — **in scope, actionable now**; M3 is testable via Bolna web calls once M2 endpoints are live (no number needed).
- **M4 (number live) + M5 (production go-live)** need the Indian DID → **gated by §9 (telephony on hold)**.

---

## 8. Risks / open items (PRD §12)
- **Bolna `call-events` payload shape** must be confirmed before finalizing the Phase-5 adapter (transcript/message fields). Build against a documented sample; keep the mapper isolated.
- Confirm Bolna's **function-call auth** mechanism (custom header vs. bearer) so the endpoint auth matches — the endpoints already accept a bearer/custom-key, so low risk.
- **Consent/PHI wording** for callers — confirm with hospital admin (reuse transcript-only + retention policy already in place).
- Transcript **retention** — already handled (`VOICE_TRANSCRIPT_RETENTION_DAYS` + purge cron); no new work.

---

## 9. ⏸️ ON HOLD — do NOT start until you say so

**Only the telephony / phone-number item is on hold.** Everything else — the HIMS endpoints (Phases 1–6) **and the Bolna agent (§6)** — is in scope now.

1. **Telephony — Indian DID (Plivo / Exotel) + KYC** (PRD §8): open the carrier account, complete Indian-DID KYC (business + address proof — multi-day), buy the DID, connect it to the Bolna agent, route inbound → assistant. **KYC is the main schedule risk.**

**Naturally gated by the number (not separately "on hold"):** the **real end-to-end PSTN call test** and **production go-live** (PRD M4–M5) need the live DID, so they wait on it — but the agent itself is fully testable via Bolna **web/test calls** beforehand.

I will only begin the **telephony / number** work when you explicitly tell me to.

---

*Do not merge to `main`. Changes are committed to `feature/voice-agent-bolna` after your review; push only on your explicit go-ahead.*
