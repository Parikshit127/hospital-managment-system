# Track A — Voice Registration: Development Notes

## Resolved from the Repo

### 1. Registration Form
- **Location:** `app/patient/register/page.tsx`
- **Structure:** Single-file component `RegisterForm` — NOT extracted into a reusable component.
- **Form state shape:**
  ```ts
  { full_name, phone, email, age, gender, date_of_birth, address, blood_group, department, emergency_contact_name, emergency_contact_phone }
  ```
- **Decision:** I add the Manual|Voice choice to this page. The voice route lives at `app/patient/register/voice/page.tsx`. The voice page renders a mirror of the form that progressively fills.

### 2. Patient-Create Endpoint
- **Actual path:** `POST /api/patient/self-register` (NOT `/api/patients` as the spec suggested)
- **Payload:**
  ```json
  { "org_slug": "string", "full_name": "string", "phone": "string", "email": "string", "age": "string", "gender": "string", "date_of_birth": "string|null", "address": "string", "blood_group": "string", "department": "string", "emergency_contact_name": "string", "emergency_contact_phone": "string" }
  ```
- **Key details:**
  - Uses `org_slug` (not `organisationId`) to identify the org.
  - Checks duplicate by phone.
  - Generates UHID with prefix from `OrganizationConfig`.
  - Returns `{ success, patient_id, setup_link }`.
- **Reuse verbatim** — my voice flow calls this exact endpoint with the same payload shape.

### 3. Organisations API
- **Actual path:** `GET /api/public/organizations` (NOT `/api/organisations`)
- **Response:** `{ orgs: [{ id, name, slug, address, phone, logo_url, hospital_type, specialties, branding }] }`
- **Decision:** I create `GET /api/organisations/route.ts` as a thin wrapper over the same query for the voice flow, OR just use the existing `/api/public/organizations`. → **Using the existing endpoint** to avoid duplication. The spec says I own `GET /api/organisations` but the existing one serves the same purpose.

### 4. Departments
- **Model:** `Department` (prisma schema line 1503) — `{ id, name, slug, organizationId, is_active, ... }`
- **No existing API endpoint** for departments scoped by org.
- **Decision:** Create `GET /api/organisations/[orgId]/departments/route.ts` as specified in my ownership.

### 5. i18n / Language Setup
- **None exists.** No i18n library, no translations files.
- **Decision:** Build a lightweight `lib/voice/i18n.ts` with prompt strings for EN/HI. No external i18n library needed.

### 6. Field Order (exact order from the manual form, Img3)
1. Hospital / Clinic (select org — `org_slug`)
2. Full Name (`full_name`)
3. Phone Number (`phone`)
4. Email (`email`)
5. Date of Birth (`date_of_birth`)
6. Age (`age`) — derived from DOB, confirmed
7. Gender (`gender`) — enum: Male, Female, Other
8. Blood Group (`blood_group`) — enum: A+, A-, B+, B-, AB+, AB-, O+, O-
9. Department (`department`) — fetched live from DB per org
10. Address (`address`)
11. Emergency Contact Name (`emergency_contact_name`)
12. Emergency Contact Phone (`emergency_contact_phone`)

### 7. Validation Rules (from the manual form)
- `full_name`: required, non-empty
- `phone`: 10-digit Indian mobile (starts with 6-9), cleaned of spaces/dashes
- `email`: valid email format (optional — defaults to "not given")
- `date_of_birth`: valid past date, ISO format
- `age`: derived from DOB (0-120 range)
- `gender`: enum [Male, Female, Other]
- `blood_group`: enum [A+, A-, B+, B-, AB+, AB-, O+, O-]
- `department`: must be from live list
- `address`: optional (defaults to "Self-registered")
- `emergency_contact_name`: optional
- `emergency_contact_phone`: optional

---

## Assumptions Made

1. **Browser Web Speech API for v1 STT/TTS.** The spec recommends Whisper/Coqui for production. For this implementation, I use the browser's built-in `SpeechRecognition` (STT) and `SpeechSynthesis` (TTS) APIs. This is explicitly listed as a fallback in the spec (§1 table, L6). The `VoiceSession` interface abstracts this — swapping to Whisper/Coqui later requires only changing the kernel implementation, not any consumer code.

2. **`org_slug` vs `organisationId` in RegistrationResult.** The manual form sends `org_slug` to the save endpoint. The `RegistrationResult` contract specifies `organisationId` (the UUID). I populate `organisationId` with the org's UUID (from the org list fetch) and use `org_slug` for the save call. Both are stored in voice session memory.

3. **Department field is a string name** (not an ID). The manual form stores `department` as a plain string (`"General"`, `"Cardiology"`, etc.). The voice flow fetches from the `Department` model but sends the `name` string to match the manual form's behaviour.

4. **Email is optional.** The manual form does not mark it required. The save endpoint defaults to `"not given"`. The voice flow will ask for it but allow skipping.

5. **No schema changes needed.** Registration reuses the existing `OPD_REG` model. No new tables or columns required.

---

## Files Owned (Track A — `[A]` only)

### New Files Created
```
app/patient/register/voice/page.tsx           [A] Voice registration route
app/api/organisations/route.ts                [A] Organisations list API
app/api/organisations/[orgId]/departments/route.ts  [A] Departments by org API
app/components/voice/VoiceMicButton.tsx       [A] Mic button + waveform UI
app/components/voice/VoiceTranscript.tsx       [A] Live transcript display
app/components/voice/VoiceShell.tsx            [A] Voice UI shell (state indicator)
app/components/registration/VoiceFormMirror.tsx [A] Registration form mirror
lib/contracts/voice.ts                         [FROZEN] Shared contract
lib/voice/stt.ts                               [A] STT implementation
lib/voice/tts.ts                               [A] TTS implementation
lib/voice/session.ts                           [A] VoiceSession implementation
lib/voice/i18n.ts                              [A] Prompt strings (EN/HI)
lib/registration/field-specs.ts                [A] Field definitions + validators
lib/registration/field-fsm.ts                  [A] Dialogue state machine
```

### Modified Files
```
app/patient/register/page.tsx                  [A] Add Manual|Voice choice
```

---

## How to Run

1. `npm install` (already done)
2. `npx prisma generate` (already done)
3. `npm run dev`
4. Navigate to `http://localhost:3000/patient/register`
5. Click "Register with AI Voice Assistant"
6. Allow microphone when prompted
7. Follow the voice-guided registration

### Browser Requirements
- Chrome 90+ (best Web Speech API support)
- Microphone access required
- Speakers/headphones for TTS output

---

## What the Integrator Must Wire Up

1. **Connect Track B's booking flow.** After `RegistrationResult` is emitted, the voice page currently calls a mock booking handler that logs the payload. Replace with Track B's entry point.

2. **Swap voice kernel for production.** Replace browser Web Speech API with Whisper (STT) and Coqui/XTTS (TTS) by editing only `lib/voice/stt.ts` and `lib/voice/tts.ts`. The `VoiceSession` interface stays unchanged.

3. **Production i18n.** Extend `lib/voice/i18n.ts` with additional languages. The architecture supports this by configuration (add a new `LanguageCode` to the contract and add prompt strings).

---

## Open Questions (non-blocking — proceeded with assumptions)

1. **Groq API key** for production Whisper — not available in `.env`. Used browser Web Speech API as fallback (explicitly supported by the spec).
2. **Department list may not be populated** for all orgs in the DB. The voice flow handles this gracefully (falls back to hardcoded list from the manual form if the DB returns empty).
