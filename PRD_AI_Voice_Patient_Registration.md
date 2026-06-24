# Product Requirements Document (PRD)
## AI Voice-Assisted Patient Registration & Appointment Booking

| Field | Value |
|---|---|
| **Product** | Axten Hospitals — Patient Portal (Avani platform) |
| **Feature** | AI Voice-Assisted Patient Registration & Appointment Booking Flow |
| **Document type** | Product Requirements Document |
| **Owner** | Product / Agentic AI Team |
| **Status** | Draft v1.0 — for review |
| **Related docs** | Technical Workflow Document (companion) |
| **Reference assets** | Img1: 7-layer voice architecture · Img2: Patient login · Img3: Manual registration form |

---

## 1. Overview

The patient portal currently offers a single registration path: a manual 12-field form (Img3). This feature adds a parallel **voice-driven path** that lets a patient register and book a first appointment entirely by speaking, in their chosen language, without changing the existing manual form.

The voice path is **additive and non-destructive**. The manual form remains exactly as-is. On the registration entry screen the patient now chooses between two clearly labelled options:

- **Fill Manually** → existing form (Img3), unchanged.
- **Register with AI Voice Assistant** → new guided voice flow described in this document.

The voice flow walks the patient through registration, captures symptoms, recommends a doctor by specialty, books a slot, and confirms — with every value confirmed aloud before it is saved, and every list (hospitals, departments, doctors, slots) fetched live from the database. Nothing is hardcoded or assumed.

---

## 2. Objective & Scope

### 2.1 Objective
Reduce friction and increase accessibility of patient onboarding by allowing hands-free, conversational registration and first-appointment booking, while guaranteeing the resulting data is identical in structure and integrity to the manual path.

### 2.2 In Scope
- A new "Register with AI Voice Assistant" entry option on the existing registration page.
- UI-based language selection (Step 1).
- Voice-assisted fill of all 12 registration fields in the **exact order** of the manual form (Step 2).
- Voice symptom collection and LLM-based specialty routing (Step 3).
- Live doctor recommendation from the database, scoped to the selected hospital (Step 4).
- Live slot fetch and voice-based slot selection (Step 5).
- Appointment creation, confirmation card, optional confirmation email, and reflection on both patient and doctor portals (Step 6).
- Reuse of the existing registration form component and the existing save endpoint.

### 2.3 Out of Scope (v1)
- Any change to the manual registration form (Img3) or login page (Img2).
- Voice-based login / authentication (voice flow is for new/registering patients only).
- Payments, billing, insurance capture.
- Clinical diagnosis or triage decisions (the assistant routes to a specialty; it does not diagnose).
- Voice-based rescheduling or cancellation of existing appointments.
- Multi-appointment or family/dependent booking in a single session.
- Always-on wake-word listening (v1 is button-initiated).
- Languages beyond the launch set (see NFR-2).

---

## 3. Background & Context

The portal is multi-tenant: patients are scoped to a hospital/clinic ("organisation"), reflected in the `AVN-YYYY-NNNNN` patient ID and the "Select Hospital / Clinic" dropdown. This scoping is **load-bearing** for the voice flow — the hospital chosen in Step 2 determines which departments, doctors, and slots are visible in Steps 4–5.

The reference architecture (Img1) defines the layered voice stack the implementation draws from:

| Layer | Purpose |
|---|---|
| L1 — Patient input | Button trigger, mic capture, audio stream |
| L2 — STT | Speech → text |
| L3 — NLU | Intent + entity extraction; symptom analysis |
| L4 — Agent brain | Orchestration, dialogue state, session memory |
| L5 — Tools | Hospital/doctor DB, appointment engine, email |
| L6 — TTS | Text → speech response |
| L7 — Output | Voice reply, UI cards, confirmation email, "Booked ✓" |

The PRD references these layers; concrete stack choices and rationale live in the companion Technical Workflow Document.

---

## 4. Personas

- **First-time patient (primary).** May be elderly, low-literacy, visually impaired, or simply prefers speaking. Wants to register and see a doctor without typing on a form.
- **Caregiver registering on behalf.** Speaks for a patient who cannot.
- **Multilingual patient.** Comfortable in Hindi or a regional language, not in English form labels.
- **Hospital staff (secondary).** Benefits from clean, schema-valid records and correct portal reflection; should never have to clean up malformed voice-entered data.

---

## 5. User Stories & Acceptance Criteria

**US-1 — Choose a path**
As a patient, I want to choose between manual and voice registration so I can use whichever suits me.
- AC: Both options visible on the registration page; "Fill Manually" leads to the unchanged form; "Register with AI Voice Assistant" leads to the new flow.

**US-2 — Pick my language**
As a patient, I want to select my language before speaking so the assistant talks to me in a language I understand.
- AC: Language is selected via UI (tap), not voice; all subsequent prompts/responses use it; the choice is stored for the session.

**US-3 — Register by voice**
As a patient, I want the assistant to ask for each detail and confirm it, so my record is correct.
- AC: Fields are asked in the exact order of Img3; each answer is read back and confirmed before acceptance; I can correct any field; the saved record is identical in structure to a manual submission.

**US-4 — Be understood / corrected**
As a patient, when the assistant mishears me, I want it to retry or let me fix it.
- AC: Low-confidence input triggers a re-prompt; after N retries the assistant offers manual fallback for that field (on-screen tap/keypad) without losing prior fields.

**US-5 — Describe symptoms and get routed**
As a patient, I want to say what's wrong and be pointed to the right kind of doctor.
- AC: Symptoms are captured by voice; the system maps them to one or more specialties; the patient is told the recommended specialty before doctors are listed; no diagnosis is stated.

**US-6 — Safety on emergencies**
As a patient describing a medical emergency, I want to be told to seek urgent care, not silently booked into a routine slot.
- AC: Red-flag symptoms trigger an emergency advisory (e.g., advise calling 108 / going to the ER) and the flow pauses normal booking.

**US-7 — Pick a real doctor**
As a patient, I want to choose from doctors who actually exist at my hospital and match my need.
- AC: Doctor list is fetched live, scoped to the selected hospital and matched specialty; read aloud; patient selects by voice; selection is confirmed.

**US-8 — Pick a real slot**
As a patient, I want to choose from times the doctor is actually available.
- AC: Slots are fetched live for the chosen doctor; read aloud; patient selects by voice; selection is confirmed.

**US-9 — Get confirmation**
As a patient, I want clear confirmation that my appointment is booked.
- AC: A confirmation UI card is shown; an optional email is sent; the appointment appears on both the patient portal and the doctor portal.

---

## 6. Functional Requirements

Requirements are grouped by flow step. **MUST** = mandatory for v1.

### FR-0 — Entry & Consent
- **FR-0.1 (MUST):** Display two options on the registration page: "Fill Manually" and "Register with AI Voice Assistant".
- **FR-0.2 (MUST):** "Fill Manually" routes to the existing form with zero changes.
- **FR-0.3 (MUST):** On entering the voice flow, capture explicit consent to voice capture and processing (DPDP-aligned) before the microphone is enabled.
- **FR-0.4 (MUST):** Microphone activation is button-initiated (no always-on listening in v1).

### FR-1 — Step 1: Language Selection
- **FR-1.1 (MUST):** Present a UI-based (tap) language selector; selection is **not** by voice.
- **FR-1.2 (MUST):** Support the launch language set (English, Hindi at minimum — see NFR-2).
- **FR-1.3 (MUST):** Persist the selected language for the whole session; all STT, NLU, and TTS operate in it.

### FR-2 — Step 2: Voice-Assisted Registration Fill
- **FR-2.1 (MUST):** The assistant greets the patient and collects fields in the **exact order** of Img3:
  1. Hospital / Clinic · 2. Full Name · 3. Phone Number · 4. Email · 5. Date of Birth · 6. Age · 7. Gender · 8. Blood Group · 9. Department · 10. Address · 11. Emergency Contact Name · 12. Emergency Contact Phone.
- **FR-2.2 (MUST):** "Hospital / Clinic" options are fetched **live** from the organisations table — no hardcoded list.
- **FR-2.3 (MUST):** "Department" options are fetched **live** and **scoped to the selected hospital** — no hardcoded list.
- **FR-2.4 (MUST):** Each captured value is **read back and confirmed** by the patient before it is accepted. No value is accepted on a single unconfirmed utterance.
- **FR-2.5 (MUST):** Nothing is assumed or auto-filled except values derivable-and-confirmable from patient input (e.g., Age may be derived from DOB and then confirmed).
- **FR-2.6 (MUST):** The on-screen view mirrors the existing registration form and populates progressively as fields are confirmed; the patient may correct any field by tap/keypad at any time.
- **FR-2.7 (MUST):** Apply the same validation rules as the manual form (e.g., 10-digit phone, valid email, required fields, enum values for Gender/Blood Group/Department).
- **FR-2.8 (MUST):** For voice-hostile fields (Email, Phone, DOB), support character/digit read-back and a "spell it" / on-screen keypad fallback (see §10).
- **FR-2.9 (MUST):** After all fields are confirmed, save the patient using the **same persistence path as the manual form**, producing a structurally identical record. Save is transactional.
- **FR-2.10 (MUST):** On save success, the patient exists with a valid patient ID and the flow proceeds to Step 3.

### FR-3 — Step 3: Symptom Collection
- **FR-3.1 (MUST):** After save, the assistant asks the patient to describe symptoms by voice.
- **FR-3.2 (MUST):** Symptom text is analysed by NLU/LLM to extract clinical concepts and map to one or more **specialties/departments**.
- **FR-3.3 (MUST):** The assistant states the recommended specialty to the patient before listing doctors. It does **not** state a diagnosis.
- **FR-3.4 (MUST):** **Emergency red-flag detection** — if symptoms indicate an emergency (e.g., chest pain with breathlessness, signs of stroke, severe bleeding, suicidal ideation), the assistant issues an emergency advisory (e.g., call 108 / go to the nearest ER) and does not silently proceed to routine OPD booking.
- **FR-3.5 (SHOULD):** Specialty mapping is backed by a maintained symptom→specialty reference (guardrail), not free-form LLM output alone.

### FR-4 — Step 4: Doctor Recommendation
- **FR-4.1 (MUST):** Query the **live** doctor database for doctors matching the resolved specialty, **scoped to the selected hospital**, and currently accepting appointments.
- **FR-4.2 (MUST):** Read the matched doctors aloud (name + specialty, optionally next availability) and render them as UI cards.
- **FR-4.3 (MUST):** The patient selects a doctor by voice; the selection is confirmed.
- **FR-4.4 (MUST):** If no doctors match, fall back gracefully (broaden to related specialty / General Medicine, or offer manual selection) — never invent a doctor.

### FR-5 — Step 5: Appointment Slot Selection
- **FR-5.1 (MUST):** Fetch **live** available slots for the selected doctor from the calendar/slots service.
- **FR-5.2 (MUST):** Read available slots aloud and render them as UI cards.
- **FR-5.3 (MUST):** The patient selects a slot by voice; the selection is confirmed.
- **FR-5.4 (MUST):** If no slots are available, offer next available date or an alternative doctor — never offer a slot that isn't live.

### FR-6 — Step 6: Booking Confirmation
- **FR-6.1 (MUST):** Create the appointment in the database (patient, doctor, slot, hospital), transactionally.
- **FR-6.2 (MUST):** Show a confirmation UI card with appointment details.
- **FR-6.3 (SHOULD):** Send a confirmation email (optional, configurable).
- **FR-6.4 (MUST):** The appointment must appear correctly on **both** the patient portal and the doctor portal.
- **FR-6.5 (MUST):** On booking failure, retain all captured data and surface a recoverable error; do not lose the registered patient.

---

## 7. Non-Functional Requirements

- **NFR-1 — Performance / latency.** Target per-turn round-trip ≤ 3s end-to-end; STT result ≤ 1.5s for a short utterance; TTS playback starts ≤ 1s after response generation. The UI shows a "listening / thinking / speaking" state so latency is never silent.
- **NFR-2 — Language support.** Launch: English + Hindi. Architecture must allow adding languages by configuration, not code rewrites. STT/NLU/TTS components must each support the active language set.
- **NFR-3 — Database integrity.** The voice path writes the **same schema** as the manual form. No new/parallel patient schema. Writes are transactional and idempotent (a retried save must not create duplicates). No orphan appointments (an appointment always references a valid patient, doctor, slot, and hospital).
- **NFR-4 — Tenant isolation.** All department/doctor/slot queries after Step 2 are scoped to the selected `organisation_id`. Cross-tenant data must never surface in any list or be writable.
- **NFR-5 — Privacy / PHI & compliance.** Audio and transcripts are PHI. Audio is not persisted beyond processing unless the patient consents; data encrypted in transit and at rest; consent captured before mic activation; aligned with India's DPDP Act 2023. STT/TTS provider choice must respect PHI handling (see Technical Workflow Doc for self-hosted vs hosted trade-offs).
- **NFR-6 — Accessibility & transparency.** Voice is itself an accessibility feature. Additionally: a live on-screen transcript mirrors the conversation; the registration form is visually populated and tap-editable; manual fallback is available at every step. The assistant clearly identifies itself as an AI assistant.
- **NFR-7 — Reliability / fallback.** A failure in any voice layer (STT/NLU/TTS) must degrade gracefully to manual input for that step without discarding collected data. Network timeouts retain session state.
- **NFR-8 — Compatibility.** Must run within the existing codebase, routing, auth, and DB schema. No regression to the manual form or login.
- **NFR-9 — Browser/device support.** Define and test a supported matrix (modern Chromium + mobile browsers at minimum), with clear messaging where mic/audio is unsupported.

---

## 8. Strict Rules / Guardrails (cross-cutting)

These are non-negotiable and are enforced in both product and technical specs:

1. **No hardcoded data.** Hospitals, departments, doctors, and slots are always fetched live from the database.
2. **Exact field order.** Registration fields are collected in the precise order of the manual form (Img3).
3. **Confirm before save.** Every collected value is confirmed by the patient before it is stored.
4. **No assumptions.** Values come only from patient voice input or from live database lookups (the sole exception being a derived-and-confirmed Age from a confirmed DOB).
5. **Schema-identical writes.** The voice path saves data exactly as the manual form would.
6. **No clinical diagnosis.** The assistant routes to a specialty and never asserts a diagnosis; emergencies trigger an advisory, not a silent booking.

---

## 9. Success Metrics

| Metric | Definition | Target (initial) |
|---|---|---|
| Voice completion rate | Sessions that start the voice flow and reach "Booked ✓" | ≥ 60% pilot, ≥ 75% mature |
| Time to register + book | Median wall-clock from greeting to confirmation | ≤ 4 min |
| Field correction rate | Avg confirmations rejected/corrected per session | ≤ 1.5 fields/session |
| STT accuracy | Word error rate per language on registration utterances | ≤ 10% EN, ≤ 15% HI |
| Specialty acceptance | % of recommendations the patient accepts without override | ≥ 80% |
| Fallback-to-manual rate | % of sessions/fields that drop to manual entry | ≤ 15% |
| Cross-portal consistency | Appointments correctly visible on both portals | 100% (hard requirement) |
| Confirmation delivery | Confirmation card shown; email delivered when enabled | 100% card / ≥ 98% email |
| Data integrity defects | Malformed/orphan records from voice path | 0 |

---

## 10. Field Collection Strategy (voice-hostile fields)

| Field | Risk | Strategy |
|---|---|---|
| Email | High (spelling, symbols) | Offer "spell it letter by letter"; read back character-by-character; on-screen keyboard fallback; optional "skip — add later" if not required |
| Phone / Emergency phone | Medium (digit confusion) | Capture as digits; read back grouped (e.g., "98765 43210"); enforce 10 digits; on-screen keypad fallback |
| Date of Birth | Medium (format ambiguity) | Confirm in unambiguous form ("12 March 1990"); validate it is a valid past date |
| Age | Low | Derive from confirmed DOB, then confirm aloud; cross-check against spoken age if given |
| Gender / Blood Group / Department | Low-Med | Constrain to enum / live list; if utterance doesn't match, re-read the valid options |
| Hospital | Low | Match against live list with fuzzy matching; if ambiguous, read top candidates and ask the patient to choose |

---

## 11. Dependencies & Assumptions

- **Dependencies:** organisations API, departments API (org-scoped), patient create endpoint (existing), doctor query API (specialty + org scoped), slots/calendar API, appointment create endpoint, email service, and the chosen STT/NLU/TTS services.
- **Assumptions (to confirm against actual schema):** patient, doctor, department, organisation, appointment, and slot entities exist with the fields implied by Img3 and the booking flow; the doctor entity carries a specialty attribute; slots are queryable per doctor; both portals read appointments from a shared source of truth.

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| STT errors on Indian accents / Hinglish code-switching | Wrong data, frustration | High-quality multilingual STT; confirm-before-save; per-field retry + manual fallback |
| Symptom misclassification | Wrong specialty | LLM constrained by symptom→specialty reference; state specialty before listing doctors; allow override |
| Missed emergency | Patient safety | Red-flag detection (FR-3.4) with explicit advisory; pause routine booking |
| PHI leakage via cloud STT/TTS | Compliance breach | Prefer PHI-safe / self-hosted components; consent + encryption; no audio retention by default |
| Latency degrading UX | Drop-off | Latency budgets (NFR-1); visible state; streaming where possible |
| Duplicate patients on retry | Data integrity | Idempotent, transactional saves (NFR-3) |

---

## 13. Rollout Plan

- **Phase 0 — Internal pilot:** single hospital, English only, staff-supervised.
- **Phase 1 — Limited release:** add Hindi, a subset of departments, real patients with monitoring.
- **Phase 2 — General availability:** all departments, expanded languages, full metrics review against §9.

---

## Appendix A — Field → Schema Mapping (to confirm)

| # | Voice question (intent) | Form field (Img3) | Proposed DB field | Source |
|---|---|---|---|---|
| 1 | Which hospital/clinic? | Select Hospital / Clinic | `organisation_id` | Live list |
| 2 | Full name? | Full Name | `full_name` | Voice |
| 3 | Phone number? | Phone Number | `phone` | Voice |
| 4 | Email? | Email | `email` | Voice |
| 5 | Date of birth? | Date of Birth | `dob` | Voice |
| 6 | Age? | Age | `age` | Derived from DOB + confirm |
| 7 | Gender? | Gender | `gender` | Voice (enum) |
| 8 | Blood group? | Blood Group | `blood_group` | Voice (enum) |
| 9 | Department? | Department | `department` | Live list (org-scoped) |
| 10 | Address? | Address | `address` | Voice |
| 11 | Emergency contact name? | Emergency Contact Name | `emergency_contact_name` | Voice |
| 12 | Emergency contact phone? | Emergency Contact Phone | `emergency_contact_phone` | Voice |

*Field/table names are indicative and must be reconciled with the actual schema before implementation.*
