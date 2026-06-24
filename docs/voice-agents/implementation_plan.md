# Track B — AI Booking: Implementation Plan
## Symptoms → Doctor → Slot → Confirm

> Phase 0 findings and proposed implementation plan. Awaiting user approval to proceed.

---

## Background

Track B takes over from Track A's `RegistrationResult` handoff (a saved patient with `patientId`, `organisationId`, `language`, `patientName`). It owns Steps 3–6 of the voice-assisted booking flow and 5 API route handlers.

---

## Codebase Ground Truth (Phase 0 Investigation)

### Doctor Model
- **Table:** `users` (Prisma model: `User`) — doctors are users with `role = 'doctor'`
- **Specialty:** `specialty String?` field — single string value (e.g. `"Cardiology"`)
- **Availability:** `is_active`, `working_hours` ("09:00-17:00"), `working_days`, `max_patients_per_day`, `slot_duration`
- **Fee:** `consultation_fee Float @default(500)`
- **No separate Doctor model exists** — everything is in `User`

### Slot Model
- **Model:** `AppointmentSlot` (`@@map("appointment_slots")`)
- **Key fields:** `doctor_id`, `date DateTime`, `start_time String`, `end_time String`, `is_available`, `is_booked`, `booked_by`
- **Double-booking guard:** `is_booked` flag + transactional `update` at booking time
- **Auto-generation:** `getOrCreateDailySlots(doctorId, dateStr, {organizationId})` in `app/actions/doctor-actions.ts` creates slots from doctor's working hours if none exist — **will reuse this**

### Appointment Model
- **Model:** `appointments` (lowercase, no `@@map`)
- **Key fields:** `appointment_id String @unique`, `patient_id`, `doctor_id`, `doctor_name`, `department`, `appointment_date`, `slot_id String? @unique`, `booking_channel`, `status`, `organizationId`
- **Dual-portal visibility:** Both patient portal and doctor portal query the same `appointments` table. Creating a record with correct `doctor_id + patient_id + organizationId` is sufficient — **no extra work needed**

### AI/LLM Stack
- `OPENAI_API_KEY` is configured in `.env`
- `openai ^6.22.0` is already installed
- Existing pattern in `app/lib/ai-service.ts`: direct fetch to OpenAI GPT-4o
- **Will reuse this pattern** for symptom NLU

### Tenant Isolation
- `getTenantPrisma(orgId)` from `backend/db.ts` auto-injects `organizationId` on all DB operations
- Every Track B query will use this — **org scoping is structurally guaranteed**

### Contracts
- `lib/contracts/` does **not exist yet** — Track B will create it (Day 0 seam artifact)
- `VoiceSession` will be mocked using browser Web SpeechRecognition + SpeechSynthesis

---

## User Review Required

> [!IMPORTANT]
> **Mock VoiceSession Strategy**: Since Track A's voice kernel is not yet implemented, the booking page will use a local mock `VoiceSession` that leverages the browser's native `SpeechRecognition` API (Chrome/Edge) for STT and `SpeechSynthesis` for TTS. This mock will be deleted at Track A integration time. Confirm this is acceptable.

> [!IMPORTANT]
> **URL-Param Handoff**: The `RegistrationResult` (patientId, orgId, language, patientName) will be passed to the voice booking page via URL search params (e.g. `/patient/appointment/voice?patientId=AVN-...&orgId=...`). This avoids any server-side session dependency and lets Track B run fully standalone. Confirm this is the desired integration approach.

> [!WARNING]
> **No New Schema Models**: All required functionality uses existing `User`, `AppointmentSlot`, and `appointments` models. No `prisma migrate` is needed. If you want a `VoiceBookingSession` log table added, that can be added additively in Phase 1.

> [!NOTE]
> **Booking Channel**: Voice-booked appointments will use `booking_channel = "patient_portal"`. This is consistent with how the existing manual patient portal booking works and will allow future analytics to distinguish voice-booked appointments if a `"voice"` channel is added later.

---

## Open Questions

> [!IMPORTANT]
> 1. **Payment mode for voice bookings**: Should voice-booked appointments default to `PAV` (Pay at Visit) to avoid Razorpay integration complexity, or `ONLINE`? Recommended: **PAV** — simpler, no payment gateway round-trip in the voice flow.
> 2. **LLM confidence threshold**: If GPT-4o returns a specialty with <60% confidence, should we (a) pick General Medicine, or (b) ask the patient to choose manually? Recommended: **(a) fall back to General Medicine automatically** with a spoken advisory.
> 3. **Slot date default**: If the patient doesn't specify a date, should the system default to tomorrow, or ask explicitly? Recommended: **ask the patient "When would you like the appointment?"**.

---

## Proposed Changes

### Phase 1 — Frozen Contracts + Service Layer

---

#### [NEW] [voice.ts](file:///d:/Workspace/Projects/hospital-managment-system/lib/contracts/voice.ts)
The Day-0 frozen seam. Defines `LanguageCode`, `RegistrationResult`, and `VoiceSession` exactly as specified in the Work Split doc.

#### [NEW] [symptom-nlu.ts](file:///d:/Workspace/Projects/hospital-managment-system/lib/booking/symptom-nlu.ts)
GPT-4o powered symptom → specialty mapper.
- System prompt constrained by a curated `SPECIALTY_REFERENCE` map (30 specialties × ~5 symptoms each)
- Red-flag keyword detection (pre-LLM fast path) + LLM confirmation
- Returns `{ specialties: string[], redFlags: string[], isEmergency: boolean, confidence: number }`
- Has a deterministic fallback: if OpenAI fails → returns `{ specialties: ['General Medicine'], isEmergency: false }`

#### [NEW] [doctor-service.ts](file:///d:/Workspace/Projects/hospital-managment-system/lib/booking/doctor-service.ts)
- `getDoctorsBySpecialty(orgId, specialty, available?)` — case-insensitive specialty match, falls back to General Medicine if 0 results
- Returns `DoctorCard[]` with `{ id, name, specialty, consultationFee, workingHours, workingDays }`

#### [NEW] [slot-service.ts](file:///d:/Workspace/Projects/hospital-managment-system/lib/booking/slot-service.ts)
- `getAvailableSlotsForDoctor(orgId, doctorId, dateStr)` — calls `getOrCreateDailySlots()`, filters `is_available && !is_booked`, returns `SlotCard[]`

#### [NEW] [appointment-service.ts](file:///d:/Workspace/Projects/hospital-managment-system/lib/booking/appointment-service.ts)
- `createVoiceAppointment({ patientId, doctorId, slotId, orgId, reason, idempotencyKey })` — transactional: verify slot still free → mark booked → create appointment → return `appointmentId`
- **Idempotency**: checks for existing appointment with same `idempotencyKey` (stored as `reason_for_visit` prefix) before creating

---

### Phase 2 — API Route Handlers

---

#### [NEW] [route.ts — POST /api/voice/nlu/symptoms](file:///d:/Workspace/Projects/hospital-managment-system/app/api/voice/nlu/symptoms/route.ts)
```
POST /api/voice/nlu/symptoms
Body: { symptomText: string, organisationId: string }
Response: { specialties: string[], redFlags: string[], isEmergency: boolean, confidence: number }
```
- Server-side validation of `organisationId` against DB before calling LLM
- Rate limiting: max 10 calls/min per orgId (in-memory counter, resets on serverless cold start)

#### [NEW] [route.ts — GET /api/organisations/[orgId]/doctors](file:///d:/Workspace/Projects/hospital-managment-system/app/api/organisations/[orgId]/doctors/route.ts)
```
GET /api/organisations/:orgId/doctors?specialty=Cardiology&available=true
Response: { doctors: DoctorCard[] }
```
- Server-side validates `orgId` exists in DB before querying
- Specialty filter: case-insensitive `contains` + exact match priority

#### [NEW] [route.ts — GET /api/doctors/[doctorId]/slots](file:///d:/Workspace/Projects/hospital-managment-system/app/api/doctors/[doctorId]/slots/route.ts)
```
GET /api/doctors/:doctorId/slots?date=2026-06-20&orgId=...
Response: { slots: SlotCard[], date: string }
```
- `orgId` required as query param (server validates doctor belongs to that org)
- Calls `getOrCreateDailySlots()`, returns only `is_available && !is_booked` slots

#### [NEW] [route.ts — POST /api/appointments](file:///d:/Workspace/Projects/hospital-managment-system/app/api/appointments/route.ts)
```
POST /api/appointments
Body: { patientId, doctorId, slotId, organisationId, reason?, idempotencyKey }
Response: { success, appointmentId, appointmentDate, doctor }
```
- Validates patient belongs to org, doctor belongs to org
- Transactional: lock slot → create appointment → return confirmation
- Idempotent: duplicate `idempotencyKey` returns existing appointment (200 not 409)

#### [NEW] [route.ts — POST /api/notifications/appointment-confirmation](file:///d:/Workspace/Projects/hospital-managment-system/app/api/notifications/appointment-confirmation/route.ts)
```
POST /api/notifications/appointment-confirmation
Body: { patientId, appointmentId, organisationId }
Response: { success }
```
- Fetches patient contact info, doctor name, appointment date from DB
- Calls `notifyPatient()` for email + WhatsApp confirmation
- Non-blocking (fire and forget within the handler)

---

### Phase 3 — UI Components

---

#### [NEW] [DoctorCard.tsx](file:///d:/Workspace/Projects/hospital-managment-system/components/booking/DoctorCard.tsx)
Doctor selection card with name, specialty badge, fee, working hours, "Select" button. Animated highlight on selection.

#### [NEW] [SlotCard.tsx](file:///d:/Workspace/Projects/hospital-managment-system/components/booking/SlotCard.tsx)
Time slot card with start/end time, visual availability indicator. Grid layout for multiple slots.

#### [NEW] [ConfirmationCard.tsx](file:///d:/Workspace/Projects/hospital-managment-system/components/booking/ConfirmationCard.tsx)
Success state with appointment ID, doctor name, date/time, QR-like confirmation, links to patient portal.

#### [NEW] [EmergencyAdvisory.tsx](file:///d:/Workspace/Projects/hospital-managment-system/components/booking/EmergencyAdvisory.tsx)
Full-screen emergency alert with red styling, detected symptoms listed, "Call 108" CTA, "Continue to manual booking" option.

#### [NEW] [VoiceBookingStatus.tsx](file:///d:/Workspace/Projects/hospital-managment-system/components/booking/VoiceBookingStatus.tsx)
Microphone button with animated wave (listening), spinner (thinking), speaker icon (speaking). Live transcript display below.

---

### Phase 4 — Voice Booking Page

---

#### [NEW] [page.tsx — /patient/appointment/voice](file:///d:/Workspace/Projects/hospital-managment-system/app/patient/appointment/voice/page.tsx)
Main orchestration page. Multi-step flow:
1. Welcome + consent → extract `RegistrationResult` from URL params
2. **Step 3:** Speak symptoms → call NLU API → if emergency → `EmergencyAdvisory`; else → state specialty
3. **Step 4:** Fetch doctors → read aloud → `DoctorCard[]` grid → voice/tap selection → confirm
4. **Step 5:** Date prompt → fetch slots → read aloud → `SlotCard[]` grid → voice/tap selection → confirm
5. **Step 6:** Create appointment → show `ConfirmationCard` → trigger confirmation notification

Mock `VoiceSession`:
```ts
const mockSession: VoiceSession = {
  language: lang,
  listen: () => new Promise(resolve => { /* SpeechRecognition */ }),
  speak: (text) => { /* SpeechSynthesis */ return Promise.resolve(); },
  get: (key) => sessionStore[key],
  set: (key, value) => { sessionStore[key] = value; },
};
```

---

## Verification Plan

### Automated (API-level)
- `POST /api/voice/nlu/symptoms` with chest pain → expect `isEmergency: true`
- `POST /api/voice/nlu/symptoms` with headache → expect `specialties: ['Neurology']`, `isEmergency: false`
- `GET /api/organisations/:orgId/doctors?specialty=General` → expect array of doctors
- `GET /api/doctors/:doctorId/slots?date=tomorrow&orgId=...` → expect slots array
- `POST /api/appointments` → expect `appointmentId` in response

### Manual Portal Verification
- After booking via voice page → check appointment appears in `/patient/appointments`
- Check same appointment appears in `/doctor/overview` under that doctor's queue
- Confirm `booking_channel = "patient_portal"` in DB

### Cross-Cutting
- Test with invalid `orgId` → 403 response (no data leak)
- Test duplicate `idempotencyKey` → 200 with same `appointmentId` (idempotency confirmed)
- Test slot already booked → slot re-fetch and re-offer (no double-booking)
