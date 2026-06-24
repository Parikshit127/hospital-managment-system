# Track B — AI Booking (Symptoms → Doctor → Slot → Confirm)
## Task Tracking File — Phase 5 Complete (ALL PHASES DONE)


---

## 1. Overall Goal

Implement **Track B** of the "AI Voice-Assisted Patient Registration & Appointment Booking" feature.
Starting from a registered patient (represented by a `RegistrationResult`), the flow covers:
- **Step 3:** Voice symptom capture → NLU/LLM → specialty routing + emergency red-flag detection
- **Step 4:** Live doctor query (org + specialty scoped) → voice selection → doctor cards
- **Step 5:** Live slot fetch → voice selection → slot cards
- **Step 6:** Transactional appointment creation → confirmation card + optional email → visibility on both patient & doctor portals

All endpoints are new Route Handler files owned by Track B. The voice kernel is consumed via the `VoiceSession` interface (mock during dev). Schema changes are additive-only.

---

## 2. Codebase Investigation Findings

### 2.1 Doctor Model (User table)
- **Model:** `User` (`@@map("users")`)
- **Specialty field:** `specialty String?` — single string (e.g. "Cardiology", "General")
- **Availability fields:** 
  - `working_hours String @default("09:00-17:00")` 
  - `working_days String?` (e.g. "Mon-Sat" or "Mon,Wed,Fri")
  - `max_patients_per_day Int?`
  - `is_active Boolean @default(true)`
  - `slot_duration Int @default(20)`
- **Doctors are `User` records with `role = 'doctor'`** — no separate Doctor table
- **Fee fields:** `consultation_fee Float @default(500)`, `follow_up_fee Float @default(300)`
- **Org scoping:** `organizationId String` + `getTenantPrisma()` middleware auto-injects
- **Existing usage:** `db.user.findMany({ where: { role: 'doctor', is_active: true } })` in `app/patient/appointments/actions.ts`

### 2.2 Slot Model (AppointmentSlot table)
- **Model:** `AppointmentSlot` (`@@map("appointment_slots")`)
- **Key fields:**
  - `id String @id @default(uuid())`
  - `organizationId String`
  - `doctor_id String` (FK → User.id)
  - `date DateTime`
  - `start_time String` (e.g. "09:00")
  - `end_time String` (e.g. "09:30")
  - `slot_type String @default("walkin")` // walkin | scheduled | blocked
  - `is_available Boolean @default(true)`
  - `is_booked Boolean @default(false)` 
  - `booked_by String?` // patient_id
- **Double-booking prevention:** Combination of `is_booked` flag + transactional `update` during booking. The `getOrCreateDailySlots()` function in `app/actions/doctor-actions.ts` auto-generates slots from the doctor's `working_hours` + `slot_duration` if none exist for a given date.
- **Slot generation logic:** `getOrCreateDailySlots(doctorId, dateStr, { organizationId })` — reuse this.

### 2.3 Appointment Model (appointments table)
- **Model:** `appointments` (lowercase, no @@map)
- **Key fields:**
  - `id Int @id @default(autoincrement())`
  - `appointment_id String @unique` (e.g. "APT-{timestamp}-{rand}")
  - `patient_id String` (FK → OPD_REG.patient_id)
  - `doctor_name String?`
  - `doctor_id String?`
  - `department String?`
  - `status String @default("Pending")` // Pending | Scheduled | Completed | Cancelled
  - `reason_for_visit String?`
  - `appointment_date DateTime @default(now())`
  - `slot_id String? @unique` (FK link to AppointmentSlot)
  - `booking_channel String? @default("walk_in")` // **use "patient_portal" for voice bookings**
  - `payment_mode String @default("ONLINE")` // ONLINE | PAV | FREE
  - `payment_status String @default("PENDING")`
  - `organizationId String`

### 2.4 Shared Source of Truth for Dual-Portal Visibility
- **Confirmed:** Both patient portal and doctor portal read from the **same `appointments` table**.
- Patient portal: `db.appointments.findMany({ where: { patient_id: session.id } })`
- Doctor portal: Uses `getPatientQueue()` from `app/actions/doctor-actions.ts` which queries `appointments` filtered by `doctor_id` or `doctor_name`.
- **Conclusion:** Any appointment created with correct `doctor_id`, `patient_id`, and `organizationId` will automatically appear on both portals. No extra work needed.

### 2.5 Patient Model (OPD_REG table)
- **Model:** `OPD_REG` (no @@map)
- **Patient ID format:** `AVN-{year}-{00001}` (prefix from OrganizationConfig.uhid_prefix)
- **`patient_id` is the primary string identifier** used across the system

### 2.6 Self-Register API (existing, Track A owned)
- **Route:** `POST /api/patient/self-register`
- **Payload:** `{ org_slug, full_name, phone, email, age, gender, date_of_birth, address, blood_group, department, emergency_contact_name, emergency_contact_phone }`
- **Returns:** `{ success, patient_id, setup_link }`
- **Used by:** `app/patient/register/page.tsx` (manual form)

### 2.7 Existing Public Org API
- `GET /api/public/organizations` — returns all active orgs (Track A owns this; B can read)
- **Departments:** No dedicated public departments API exists yet. Track A spec calls for `GET /api/organisations/:orgId/departments`. This may or may not have been built. NOT owned by B.

### 2.8 Existing Booking Infrastructure (reuse)
- `getOrCreateDailySlots()` in `app/actions/doctor-actions.ts` — **REUSE** for slot generation
- `notifyPatient()` in `app/lib/notify-patient.ts` — **REUSE** for email/WhatsApp notifications
- `getTenantPrisma(orgId)` in `backend/db.ts` — **REUSE** for all DB queries (auto-injects orgId scoping)
- Appointment ID format: `APT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`

### 2.9 AI/LLM Infrastructure
- **Existing:** `app/lib/ai-service.ts` uses OpenAI GPT-4o via `OPENAI_API_KEY` (env var confirmed)
- **Available package:** `openai ^6.22.0` already installed
- **Pattern:** Raw fetch to `https://api.openai.com/v1/chat/completions` with `gpt-4o`
- **For symptom NLU:** Will call GPT-4o with a constrained system prompt + symptom→specialty reference map

### 2.10 Contracts
- `lib/contracts/` directory does **NOT exist yet** — must create it (Track B creates it for both tracks, since it's Day 0 frozen seam work)
- The `VoiceSession` interface and `RegistrationResult` type from the spec must be created here

### 2.11 File Ownership (Track B's files)
Per Work Split doc:
```
app/
  patient/appointment/voice/page.tsx                  [B] — booking continuation route
  api/
    organisations/[orgId]/doctors/route.ts            [B]
    doctors/[doctorId]/slots/route.ts                 [B]
    appointments/route.ts                             [B]
    voice/nlu/symptoms/route.ts                       [B]
    notifications/appointment-confirmation/route.ts   [B]

components/
  booking/                                            [B] — doctor cards, slot cards, confirm

lib/
  contracts/                                          [B] — (frozen seam, created Day 0)
  booking/                                            [B] — symptom client, doctor/slot/appt svc
```

### 2.12 Key Assumptions & Decisions
1. `lib/contracts/voice.ts` must be created — it's a Day 0 frozen seam artifact owned by B since A hasn't created it yet.
2. The voice page (`app/patient/appointment/voice/page.tsx`) will use a **mock `VoiceSession`** that uses browser `SpeechRecognition` API + `SpeechSynthesis` API as the actual kernel — clean enough for v1.
3. No new Prisma models needed — `appointments` + `AppointmentSlot` + `User` cover everything.
4. No schema migration needed — all required fields already exist.
5. `booking_channel` will be set to `"patient_portal"` for voice-booked appointments.
6. Specialty matching: case-insensitive `contains` query on `User.specialty` field + exact match fallback to General Medicine.
7. LLM model: `gpt-4o` via existing `app/lib/ai-service.ts` pattern (raw fetch + `OPENAI_API_KEY`).
8. Emergency detection: Curated red-flag keyword list + GPT-4o confirmation — conservative approach.
9. For the booking page, the `RegistrationResult` is passed via URL search params (patientId, orgId, language, name) — no server-side session dependency so B runs standalone.
10. Slot date: If not specified, default to tomorrow (first available weekday).

---

## 3. Execution Phases

### Phase 0 — Investigation & Planning ✅ COMPLETE
- [x] Read all 3 spec docs
- [x] Investigate Prisma schema (User/doctor, AppointmentSlot, appointments, OPD_REG)
- [x] Understand existing booking infrastructure (actions.ts, getOrCreateDailySlots)
- [x] Confirm dual-portal shared source of truth
- [x] Confirm AI/LLM stack (OpenAI key present, gpt-4o pattern)
- [x] Map Track B file ownership
- [x] Create this task.md

---

### Phase 1 — Frozen Contracts + Service Layer ✅ COMPLETE
**Files created:**
1. `lib/contracts/voice.ts` — `RegistrationResult`, `VoiceSession`, `LanguageCode`, API shape contracts
2. `lib/booking/symptom-nlu.ts` — GPT-4o symptom→specialty mapper + deterministic red-flag fast path
3. `lib/booking/doctor-service.ts` — `getDoctorsBySpecialty`, `getDoctorById`, `getAvailableSpecialties`
4. `lib/booking/slot-service.ts` — `getAvailableSlotsForDoctor`, `isSlotStillAvailable`, `findNextAvailableDate`
5. `lib/booking/appointment-service.ts` — `createVoiceAppointment` (transactional, idempotent, PAV mode)

---

### Phase 2 — API Route Handlers ✅ COMPLETE
**Files created:**
1. `app/api/voice/nlu/symptoms/route.ts` — `POST` — org-validated, rate-limited, delegates to `analyseSymptoms()`; returns `availableSpecialties` when confidence < 0.5
2. `app/api/organisations/[orgId]/doctors/route.ts` — `GET?specialty=&available=true` — org-scoped doctor list; returns `availableSpecialties` when 0 results so UI can show manual picker
3. `app/api/doctors/[doctorId]/slots/route.ts` — `GET?date=&orgId=` — validates doctor belongs to org; returns `nextAvailableDate` when 0 slots on requested date
4. `app/api/appointments/route.ts` — `POST` — full field validation (400), org+patient+doctor checks (404), slot-conflict (409), delegates to `createVoiceAppointment()`
5. `app/api/notifications/appointment-confirmation/route.ts` — `POST` — fire-and-forget `notifyPatient()`; never blocks on notification failure (FR-6.5)

---

### Phase 3 — UI Components ✅ COMPLETE
**Files created:**
1. `components/booking/DoctorCard.tsx` — doctor selection card + `DoctorCardList` grid wrapper; specialty-colour map, voice-readable index badges, selected/loading/disabled states
2. `components/booking/SlotCard.tsx` — time slot card + `SlotCardList` wrapper; AM/PM formatting, time-period labels (Morning/Afternoon/Evening), 4-column grid, empty state with `nextAvailableDate` CTA
3. `components/booking/ConfirmationCard.tsx` — booking success card; animated ripple check, prominent appointment ID, PAV payment advisory, portal CTA
4. `components/booking/EmergencyAdvisory.tsx` — fullscreen overlay with `role="alert"`, focus management, pulsing warning icon, Call 108 + tel: link, Continue Manually secondary action
5. `components/booking/VoiceBookingStatus.tsx` — 4 distinct states (idle/listening/thinking/speaking); pulsing rings, spinning arc, equalizer bars, typewriter effect, step progress tracker

---

### Phase 4 — Voice Booking Page (Agent Orchestration) ✅ COMPLETE
**File created:**
1. `app/patient/appointment/voice/page.tsx` — full multi-step booking orchestration page:
   - **RegistrationResult handoff:** reads from URL search params (`patientId`, `organisationId`, `language`, `patientName`); falls back to hardcoded `mockRegistrationResult` for local dev (`AXT-2026-00200 / org-avani-default`)
   - **Mock VoiceSession:** created via `createMockVoiceSession()` factory; uses `window.SpeechRecognition` / `window.webkitSpeechRecognition` for STT + `window.speechSynthesis` for TTS; fully SSR-safe (all `window` access gated behind `typeof window !== 'undefined'`); resolves gracefully if API unavailable
   - **State machine:** `useReducer` with explicit `BookingStep` union type (`welcome | symptoms | doctors | slots | confirming | confirmed | emergency | error`) — no ambiguous boolean flags
   - **Orchestration:** `runSymptomStep()` → `runDoctorStep()` → `runSlotStep()` → `runBookingStep()` — each is an async function that calls the relevant API, speaks result, listens for voice selection, and dispatches to the next step
   - **Voice selection parsing:** `parseVoiceDoctorChoice()` + `parseVoiceSlotChoice()` — handles ordinal words ("first", "second"), number utterances, and name/time mentions; tap fallback always available
   - **Error cases handled:** no doctors → retry with General Medicine → error state; no slots → speak nextAvailableDate → show CTA; slot conflict (409) → re-fetch slots; booking failure → error overlay with retry + manual booking escape; emergency → `EmergencyAdvisory` fullscreen overlay
   - **Components wired:** `VoiceBookingStatus`, `DoctorCardList`, `SlotCardList`, `ConfirmationCard`, `EmergencyAdvisory`
   - **Notification:** fire-and-forget POST to `/api/notifications/appointment-confirmation` after successful booking
   - **Wrapped in `<Suspense>`** as required by Next.js for pages using `useSearchParams()`

---

### Phase 5 — Integration Test & Verification ✅ COMPLETE
**All 6 verification items checked; 1 bug found and fixed:**

1. **API Routes (static + live-ready):** All 5 routes verified for correct status codes (400/404/409/429/200/201) and response shapes. `availableSpecialties` populated when confidence < 0.5 in NLU route. Slot conflict returns 409. Idempotency key checked before any DB write.

2. **Dual-portal visibility:** Confirmed via code analysis. `appointments` table receives both `patient_id` and `doctor_id`. Patient portal query (`patient_id = session.id`) and doctor portal query (`doctor_id = effectiveDoctorId` in `getPatientQueue()`) both match voice-booked appointments. `booking_channel = 'patient_portal'`, `status = 'Scheduled'`.

3. **Emergency red-flag detection:** Deterministic keyword scan (`EMERGENCY_RED_FLAGS` list, 25+ phrases) runs before LLM. `isEmergency: true` returned with `confidence: 1.0`. Voice page dispatches `EMERGENCY_DETECTED` → transitions to `'emergency'` step → `EmergencyAdvisory` fullscreen overlay. `runDoctorStep` is never called (early `return` in `runSymptomStep`).

4. **No-doctor fabrication prevention:** `doctor-service.ts` only queries real DB; returns empty array if no match. `runDoctorStep` retries with General Medicine once (step-4 doctor-fetch fallback), then emits `SET_ERROR` if still empty. API returns `availableSpecialties` (real DB specialties) when `doctors.length === 0`.

5. **Idempotency:** `findExistingByIdempotencyKey` query runs first; if found, returns existing `appointment_id` immediately with no DB writes. P2002 constraint error (concurrent booking) also caught and mapped to 409. Verified via code inspection and logic trace.

6. **🐛 BUG FIXED — Low-confidence NLU fallback (Locked Decision §6):**
   - **Bug:** Phase 4 voice page silently fell back to `nlu.specialties?.[0] ?? 'General Medicine'` when NLU confidence was low, violating the locked decision.
   - **Fix:** Added `isLowConfidence` check (`confidence < 0.5 || !specialties.length`). On low confidence, dispatches `LOW_CONFIDENCE_DETECTED` action which transitions to new `'low_confidence'` step. Speaks the NLU's reasoning aloud + reads department names. Shows amber-bordered department picker grid with all real DB departments. "Describe symptoms again" retry button re-enters `runSymptomStep()`.
   - **Files modified:** `app/patient/appointment/voice/page.tsx` — state shape, action union, reducer, `runSymptomStep()` logic, `STEP_MAP`, `STEP_LABELS`, UI render section.
   - **NLU route was already correct:** Returns `availableSpecialties` when `confidence < 0.5` — no change needed.

**Live test script:** `scratch/phase5_verify.mjs` — runs against `http://localhost:3000`, auto-discovers orgId/doctorId, covers all 6 items.

---

## 4. Critical Context & Open Items

| Item | Status | Note |
|------|--------|------|
| `lib/contracts/` exists? | ❌ No | Must create in Phase 1 |
| Track A's VoiceSession impl | ❌ Not ready | Using mock with Web Speech API |
| Track A's organisations API | ✅ Exists | `GET /api/public/organizations` |
| Track A's departments API | ❓ Unknown | B doesn't own this — use org name for scoping |
| Schema migration needed | ❌ No | All models pre-exist |
| OPENAI_API_KEY configured | ✅ Yes | In .env |
| Email service configured | ✅ Yes | nodemailer / SMTP in .env |
| `booking_channel` value for voice | 📝 Decision | Will use `"patient_portal"` |

---

## 5. Phase Status Summary

| Phase | Status | Files |
|-------|--------|-------|
| 0 — Investigation & Planning | ✅ Complete | task.md |
| 1 — Contracts + Service Layer | ✅ Complete | lib/contracts/voice.ts, lib/booking/symptom-nlu.ts, lib/booking/doctor-service.ts, lib/booking/slot-service.ts, lib/booking/appointment-service.ts |
| 2 — API Route Handlers | ✅ Complete | app/api/voice/nlu/symptoms/route.ts, app/api/organisations/[orgId]/doctors/route.ts, app/api/doctors/[doctorId]/slots/route.ts, app/api/appointments/route.ts, app/api/notifications/appointment-confirmation/route.ts |
| 3 — UI Components | ✅ Complete | components/booking/DoctorCard.tsx, SlotCard.tsx, ConfirmationCard.tsx, EmergencyAdvisory.tsx, VoiceBookingStatus.tsx |
| 4 — Voice Booking Page | ✅ Complete | app/patient/appointment/voice/page.tsx |
| 5 — Integration & Verification | ✅ Complete | phase5_verification_report.md, scratch/phase5_verify.mjs; bug fix applied to page.tsx |

---

## 6. User Decisions (Locked)
| Decision | Choice | Rationale |
|----------|--------|----------|
| Payment mode | **PAV** (Pay at Visit) | Avoid payment gateway friction in voice flow |
| LLM low-confidence fallback | **Ask patient to clarify** | Never auto-route; show department list |
| Slot date selection | **Ask patient explicitly** | No assumed default date |
| VoiceSession mock | **Browser Web Speech API** | Approved for dev; swap at Track A integration |
| RegistrationResult handoff | **URL search params** | Approved; standalone Track B operation |

---
*Last updated: Phase 5 Complete — 2026-06-19. All phases done. Bug fix applied (low-confidence NLU fallback).*
