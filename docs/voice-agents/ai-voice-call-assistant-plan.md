# AI Voice Call Assistant — Implementation Plan

| Field | Value |
|---|---|
| **Feature** | Inbound AI voice call assistant (answer calls, resolve queries, book/reschedule/check appointments, register new patients) |
| **Branch** | `feature/ai-voice-assistant` (never merge to `main` without review) |
| **Telephony + Voice platform** | **Vapi** (conversation + STT/TTS/turn-taking). **Dev/testing: free Vapi number.** Production: bring-your-own Indian DID (Twilio, or Exotel/Plivo via SIP — all require India KYC) |
| **Conversation LLM** | Our own **GPT-4o** via Vapi "custom LLM" (reuses existing NLU + emergency red-flags) |
| **Tenancy** | Single organization (this deployment) |
| **Storage** | **Transcript-only** — call audio is discarded after STT; no recordings persisted |
| **Availability** | 24/7 full service |
| **Status** | Phases 0–6 COMPLETE & verified. Feature build done. |
| **Author date** | 2026-07-20 |

> This plan **extends existing infrastructure**; it is not greenfield. Read §1 before starting so we reuse, not duplicate.

---

## 1. What already exists (reuse — do not rebuild)

The codebase already has a **browser-based** AI voice booking subsystem ("Track A / Track B", see `docs/voice-agents/`). The missing piece for this feature is the **telephony channel** and **real call persistence**. Reuse these:

| Concern | Existing asset | Reuse how |
|---|---|---|
| Booking engine | `lib/booking/appointment-service.ts` → `createVoiceAppointment()` (transactional, idempotent, org-scoped, `slot_id @unique` guard, `P2002` handling) | Call directly; parametrize hardcoded `booking_channel:'patient_portal'` → `'voice_ai'` |
| Slot availability | `lib/booking/slot-service.ts` (`getAvailableSlotsForDoctor`, `isSlotStillAvailable`, `findNextAvailableDate`) + `getOrCreateDailySlots()` in `app/actions/doctor-actions.ts` | Call directly. **Fix gap:** subtract `DoctorLeave` (currently ignored) |
| Doctors | `lib/booking/doctor-service.ts` (doctors are `User` rows with `role='doctor'`) | Call directly |
| Symptom → specialty NLU + emergency red-flags | `lib/booking/symptom-nlu.ts`, `app/api/voice/nlu/symptoms/route.ts` | Call directly (emergency advisory instead of silent booking) |
| Patient lookup | `checkDuplicatePatient(phone)` in `app/actions/register-patient.ts` | Caller-ID lookup |
| Patient registration | `registerPatient()` + `generateUHID()` (`AVN-YYYY-NNNNN`) in `app/actions/register-patient.ts` | In-call registration (the never-wired "Track A" write path) |
| Confirmations | `app/lib/notify-patient.ts` (SMS/WhatsApp) | Fire-and-forget confirmation |
| Call log model | `CallLog` (`prisma/schema.prisma`) — **currently unused, zero writers** | Extend + become its first writer |
| Call-center UI shell | `app/call-center/{dashboard,logs,book}` — stubs with `// Fetch real data here when backend is wired up` | Wire dashboard/logs to real data |
| Vocabulary | `call_type ∈ {Inbound, Outbound, Follow-up}`, `outcome ∈ {Booked, Cancelled, Rescheduled, Enquiry, NoAnswer, Busy}` (from `app/call-center/logs/page.tsx`) | Extend outcome set |

### Conventions to follow (from discovery)
- **Prisma:** `import { prisma } from '@/backend/db'`; tenant-scoped `getTenantPrisma(orgId)`; register new models in `TENANT_SCOPED_MODELS` (`backend/db.ts`).
- **Auth (webhook, no session):** verify caller by **HMAC-SHA256** (Razorpay pattern in `app/api/razorpay/verify-payment/route.ts`); resolve `organizationId` from config, not a session.
- **Auth (actions/routes with session):** `requireTenantContext()` (`backend/tenant.ts`) / `resolveRouteAuth()` (`app/lib/route-auth.ts`).
- **Secrets:** `app/lib/secure-config.ts` — DB-first (`OrganizationConfig`, AES-256-GCM, `enc:v1:` prefix, `enable_*` flags), env fallback. Single-org → env is fine for v1.
- **Audit:** `logAudit({ action, module, entity_type, entity_id, details })` from `app/lib/audit.ts`, fire-and-forget (`.catch(()=>{})`), `details = JSON.stringify(...)`.
- **API routes:** `NextResponse.json(...)`, whole handler in `try/catch`, `{ success, ... }` / `{ error }` envelopes.
- **Middleware:** `proxy.ts` (Next 16 rename) with `ROLE_ROUTES` / `PERMISSION_ROUTES` maps.

---

## 2. End-to-end architecture

```
Caller dials Twilio Indian DID
        │
        ▼
Twilio (PSTN) ──SIP/import──▶ Vapi Assistant
        │   • STT + TTS + turn-taking + barge-in (Vapi)
        │   • conversation driven by OUR GPT-4o (custom LLM)
        │   • recording DISABLED (transcript-only)
        │
        │  HTTPS: tool-calls (mid-call) + end-of-call-report
        ▼
Next.js app  app/api/webhooks/vapi/route.ts   (HMAC-verified, no user session)
        │  resolve org via VOICE_AI_ORG_ID
        ├── CallLog lifecycle (create on start → update on end, persist transcript)
        ├── Tool endpoints (function-calling):
        │     lookupCaller · verifyName · deptDoctorInfo · getAvailability
        │     bookAppointment · rescheduleAppointment · cancelAppointment
        │     registerPatient · requestCallback · transferToStaff
        └── Reuse lib/booking/* + register-patient + notify-patient
```

**Design seam:** the app is a stateless **tool provider + persistence layer**. If we ever move off Vapi (e.g. to raw Twilio Media Streams + our self-hosted Groq/Sarvam pipeline for cost/data-residency), only the telephony layer changes — the tool endpoints and persistence stay identical.

---

## 3. Data model changes (additive-only)

Extend the existing `CallLog`; add one `CallTranscript` model. All new fields nullable/defaulted → safe migration.

```prisma
model CallLog {
  // ... all existing fields kept as-is ...
  // ── AI voice-assistant additions (additive, nullable/defaulted) ──
  channel             String    @default("manual")    // manual | voice_ai
  direction           String?                          // inbound | outbound
  provider            String?                          // vapi | twilio
  provider_call_id    String?   @unique                // Vapi call id — idempotency key
  from_number         String?
  to_number           String?
  status              String    @default("completed")  // ringing|in_progress|completed|failed|transferred|abandoned
  language            String?                          // en | hi
  patient_id          String?                          // FK → OPD_REG once verified/registered
  verification_status String?   @default("unverified") // unverified | phone_matched | name_confirmed
  handoff_status      String?                          // none | transfer_attempted | transferred | callback_created
  callback_lead_id    String?                          // FK → CRMLead.id
  started_at          DateTime?
  ended_at            DateTime?

  patient     OPD_REG?        @relation(fields: [patient_id], references: [patient_id])
  appointment appointments?   @relation(fields: [appointment_id], references: [appointment_id])
  transcript  CallTranscript?

  @@index([patient_id])
  @@index([provider_call_id])
  @@index([organizationId, created_at])
}

model CallTranscript {                 // transcript-only PHI store
  id             String   @id @default(uuid())
  call_log_id    String   @unique
  organizationId String
  turns          Json     @default("[]")   // [{ role:"assistant"|"caller", text, ts }]
  summary        String?
  language       String?
  created_at     DateTime @default(now())
  call_log       CallLog      @relation(fields: [call_log_id], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id])
  @@index([organizationId])
}
```

Also required:
- Back-relations: `Organization.call_transcripts`, `OPD_REG.call_logs`, `appointments.call_logs`.
- Register `CallLog` (already listed) + `CallTranscript` in `TENANT_SCOPED_MODELS` (`backend/db.ts`).
- New `appointments.booking_channel` value `"voice_ai"` (free-string, additive — no enum change).
- Migration authored via `npx prisma migrate dev` following `prisma/migrations/` naming.

---

## 4. Environment variables / external accounts

You (human) obtain these; code references named placeholders only — nothing invented.

| Var | Purpose | Who provides |
|---|---|---|
| `VAPI_API_KEY` | Vapi private API key | You — create Vapi account |
| `VAPI_WEBHOOK_SECRET` | HMAC secret to verify Vapi server messages (`X-Vapi-Signature`) | You — set in Vapi assistant `server.secret` |
| `VAPI_ASSISTANT_ID` | The configured Vapi assistant | You — after assistant is created |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio creds (number import into Vapi) | You — create Twilio account |
| `VOICE_AI_DID` | The assistant's phone number (**free Vapi number for dev**; Indian DID in production) | You — from Vapi dashboard |
| `VOICE_AI_ORG_ID` | Single organization UUID this line serves | You — from DB |
| `STAFF_TRANSFER_NUMBER` | Staff line for human handoff | You |
| `STAFF_TRANSFER_TIMEOUT_SECONDS` | Ring timeout before callback fallback (**default 20**) | Default set |
| Reused (present) | `OPENAI_API_KEY`, `SARVAM_API_KEY`, `GROQ_API_KEY` | Already in `.env` |

Add the new keys to `.env.example` (documentation only, no values).

---

## 5. Phased build plan

Each phase is a reviewable unit ending in a manual test. **Do not start the next phase without confirmation.** Commit per logical unit on `feature/ai-voice-assistant`.

### Phase 0 — Accounts & number (human-led, no app code)
**Dev-first approach: use Vapi's free number now; provision the Indian DID in parallel (KYC takes days).**
- [ ] Create **Vapi** account (dashboard.vapi.ai); copy the **private API key** → `VAPI_API_KEY`.
- [ ] Create a **basic assistant** in the dashboard: default provider LLM + a simple first-message greeting that self-identifies as an AI assistant. **No custom LLM / webhook / tools yet** (those arrive in Phase 2–3). Set `recordingEnabled: false`. Copy the assistant id → `VAPI_ASSISTANT_ID`.
- [ ] **Get a free Vapi phone number** (Phone Numbers → create free Vapi number) and attach the assistant to it. Copy → `VOICE_AI_DID`.
- [ ] Smoke-test: use the dashboard **"Talk to Assistant"** web widget (no number needed), then **call the free number** and confirm the greeting.
- [ ] (Parallel, not blocking) Begin the **Indian DID** process: Twilio Regulatory Bundle (business + Indian address proof) **or** an Indian CPaaS (Exotel/Plivo) via SIP. Swap it in for `VOICE_AI_DID` once approved — no code change.
- **Exit criteria:** a call to the free Vapi number (or the web widget) reaches your greeting.

### Phase 1 — Schema + call-logging skeleton + wire the UI stubs ✅ DONE
- [ ] Apply the §3 schema diff; `prisma migrate dev`; add models to `TENANT_SCOPED_MODELS`.
- [ ] Create `app/actions/call-center-actions.ts`: `getCallLogs(filters)`, `getCallLogDetail(id)`, `getCallCenterStats()` — org-scoped via `requireTenantContext()`.
- [ ] Wire `app/call-center/dashboard/page.tsx` + `logs/page.tsx` (remove the "wire up backend" stubs) to real data; add a detail view scaffold.
- [ ] Seed a couple of `CallLog` rows for rendering.
- **Test:** seeded calls render with correct stats/filters; typecheck + lint pass.

### Phase 2 — Inbound webhook + call lifecycle + transcript persistence ✅ DONE
- [ ] `app/api/webhooks/vapi/route.ts` (`POST`): verify the caller against `VAPI_WEBHOOK_SECRET` — accept **either** a plain `X-Vapi-Secret` header match **or** an `X-Vapi-Signature` HMAC-SHA256 of the raw body (Vapi's header differs by account/version). Resolve org from `VOICE_AI_ORG_ID`. Envelope is `{ message: { type, call, ... } }`.
- [ ] Handle Vapi message types: `status-update` (create `CallLog` on call start with `channel:'voice_ai'`, `direction:'inbound'`, `provider:'vapi'`, `provider_call_id`, `from_number`), and `end-of-call-report` (update `status`, `ended_at`, `duration_seconds`; persist `CallTranscript.turns` + `summary`). Idempotent on `provider_call_id`.
- [ ] Greeting script self-identifies as an AI assistant + states call handling (DPDP consent). Still **no tools** — greet + log only.
- [ ] `logAudit({ action:'VOICE_CALL_RECEIVED', module:'call-center', ... })`.
- **Test:** a real call connects, greets, and produces a `CallLog` + `CallTranscript`; replayed webhook does not duplicate.

### Phase 3 — Read-only tools (no writes) ✅ DONE
- [ ] Tool endpoints (function-calling from Vapi), each HMAC-verified:
  - `lookupCaller` — `checkDuplicatePatient(from_number)`; set `verification_status:'phone_matched'`.
  - `verifyName` — caller states name; confirm against matched record → `name_confirmed`; mismatch/no-match → mark for registration path.
  - `deptDoctorInfo` / FAQ — departments, doctors, timings, hospital info (live DB).
  - `getAvailability` — `getAvailableSlotsForDoctor` (+ `DoctorLeave` fix) / `findNextAvailableDate`.
- [ ] Register these as tools on the Vapi assistant.
- **Test:** caller hears real availability + info; verification true/false/multi-match/no-match all behave; zero DB writes.

### Phase 4 — Write path: book / register / reschedule / cancel ✅ DONE
- [ ] `bookAppointment` tool → `createVoiceAppointment()` with `booking_channel:'voice_ai'`, idempotency key = `provider_call_id`; link `CallLog.appointment_id` + `patient_id`; set `outcome:'Booked'`.
- [ ] **In-call registration** (new/unverified caller): confirm name, ask email, phone from caller ID → `registerPatient()` → continue booking same call; `outcome:'Registered'` (+`Booked` if they book).
- [ ] `rescheduleAppointment` / `cancelAppointment` tools — **and fix the existing bug: free the old slot** (`is_booked:false, is_available:true`).
- [ ] Emergency red-flag path → advise 108/ER, do **not** book.
- [ ] Fire-and-forget SMS/WhatsApp confirmation via `notify-patient.ts`.
- **Test:** existing-patient book; new-caller register-then-book; reschedule frees old slot; double-book blocked (409/`P2002`); appointment visible on **both** patient + doctor portals; emergency advisory fires.

### Phase 5 — Fallback / human handoff (transfer-first, never drop) ✅ DONE
- [ ] `transferToStaff` tool — during OPD hours, warm-transfer to `STAFF_TRANSFER_NUMBER`; on no-answer within `STAFF_TRANSFER_TIMEOUT_SECONDS` (default 20) → fall through to callback. Set `handoff_status`.
- [ ] `requestCallback` tool — create a `CRMLead` via `createLead()` (source `voice_ai`); set `callback_lead_id`, `outcome:'Callback'`, `handoff_status:'callback_created'`.
- [ ] Triggers: caller asks for a human, repeated STT misunderstanding, unsupported request, or after-hours transfer.
- **Test:** transfer answered → `transferred`; transfer timeout/after-hours → callback lead created; call never drops silently.

### Phase 6 — Admin call-log viewer + retention ✅ DONE
- [ ] Full call detail page: metadata, verification, linked appointment/patient, **transcript viewer**, callback link.
- [ ] Role-gate `/call-center/**` in `proxy.ts` (`ROLE_ROUTES`/`PERMISSION_ROUTES`) — transcripts contain PHI; restrict to admin/reception/call-center.
- [ ] Retention purge job (cron pattern like `app/api/cron/*` + `CRON_SECRET`) deleting `CallTranscript` older than the retention window (**default 1 year**).
- **Test:** unauthorized role blocked; transcript renders for authorized staff; purge deletes only expired transcripts.

---

## 6. Security / compliance checklist
- [ ] All webhook + tool endpoints HMAC-verify `VAPI_WEBHOOK_SECRET`; reject on mismatch (400).
- [ ] `organizationId` resolved from `VOICE_AI_ORG_ID` (single-org); never trust payload org.
- [ ] Recording disabled at Vapi; audio never persisted; `CallTranscript` is the only conversation store.
- [ ] Writes gated on verification (`name_confirmed` or freshly registered).
- [ ] Transcript/call-log access role-gated in `proxy.ts` (PHI).
- [ ] Supabase Postgres encrypts at rest by default (transcript column inherits).
- [ ] Greeting = AI self-identification + call-handling notice (DPDP).
- [ ] Transcript retention purge (default 1 year).
- [ ] Audit log on call received, booking, registration, transfer, callback.

---

## 7. Assumptions & defaults (change if needed)
1. **Languages v1:** English-first (best turnkey quality), Hindi as fast-follow (Vapi Hindi voice, or later swap TTS to Sarvam). Confirm if Hindi is required at launch.
2. **LLM:** our GPT-4o via Vapi custom-LLM (keeps prompt control + reuses `symptom-nlu`).
3. **`agent_id`** for AI calls = `"ai-voice-assistant"`.
4. **Transfer timeout** = 20s (~4 rings); **retention** = 1 year.
5. Single Twilio Indian DID → single org (`VOICE_AI_ORG_ID`).
6. Payment mode for voice bookings = **PAV (Pay at Visit)**, consistent with existing `createVoiceAppointment`.

## 8. Known gaps we will fix along the way
- `DoctorLeave` is not subtracted from generated slots (Phase 3/4).
- Existing reschedule/cancel paths don't free the old slot (Phase 4).
- Three different `appointment_id` schemes exist across creation paths — voice uses `createVoiceAppointment`'s scheme; no unification attempted here.

---

*Do not merge to `main`. Each phase stops for manual review/testing before the next begins.*
