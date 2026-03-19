# HospitalOS — Reception & Patient Portal Improvement Plan

> **Scope:** Reception Module + Patient Portal
> **Goal:** Production-grade UX, security, and reliability
> **Approach:** Phase-by-phase, each phase independently shippable
> **Current State:** Functionally complete MVP — needs hardening, polish, and missing critical features

---

## Current State Assessment

### Reception Module (Score: 6.5/10)
- 7 pages, 15+ server actions, AI triage engine
- Functional but uses `alert()` for errors, `any` types everywhere, hardcoded department lists
- No duplicate patient detection, no real-time queue updates, no accessibility
- Token display leaks patient names on public screens
- Two triage engines (reception-actions + triage-actions) with duplicate logic

### Patient Portal (Score: 6/10)
- 12 pages, Razorpay payments, AI health assessment
- Clean mobile-first UI with bottom navigation
- No appointment rescheduling, no messaging, no vitals charts
- Weak session tokens, no forgot-password flow, no audit logging
- Lab results show raw values with no normal range indicators

---

## Phase 1: Foundation Fixes (Week 1)
> Fix the broken fundamentals before adding features. Every subsequent phase depends on this.

### 1.1 — Global Toast Notification System
**Problem:** All errors use `alert()` or `console.error`. Users see nothing when actions fail.
**Solution:** Create a reusable Toast/Notification provider.

**Files to create/modify:**
- `app/components/ui/ToastProvider.tsx` — Context + auto-dismiss toast system
- `app/layout.tsx` — Wrap app with ToastProvider
- Replace every `alert()` and `console.error` across reception and patient portal pages

**Acceptance criteria:**
- Success toasts (green) for: registration, booking, check-in, payment, profile update
- Error toasts (red) for: all API failures, validation errors, network issues
- Warning toasts (amber) for: duplicate patient detected, slot conflict, low stock
- Toasts auto-dismiss in 5s, dismissible on click, stack up to 3

---

### 1.2 — Type Safety Overhaul
**Problem:** Extensive use of `any` type throughout both modules. Runtime crashes possible.
**Solution:** Create shared type definitions and enforce them.

**Files to create/modify:**
- `app/types/reception.ts` — Patient, Appointment, Queue, Triage types
- `app/types/patient-portal.ts` — PatientDashboard, LabResult, Prescription, Vitals types
- Update all reception pages and patient portal pages to use typed interfaces
- Update all action files to return typed responses

**Acceptance criteria:**
- Zero `any` types in reception and patient portal modules
- All server actions return `{ success: boolean; data?: T; error?: string }` pattern
- All component props typed with interfaces

---

### 1.3 — Input Validation Layer
**Problem:** Minimal validation. Phone accepts anything, age can be negative, Aadhaar not checksummed.
**Solution:** Zod schemas for all forms, validated both client-side and server-side.

**Files to create/modify:**
- `app/lib/validations/patient.ts` — Patient registration schema
- `app/lib/validations/appointment.ts` — Booking/cancellation schemas
- `app/lib/validations/triage.ts` — Triage input schemas
- `app/lib/validations/profile.ts` — Profile update schemas
- Update `register-patient.ts`, `reception-actions.ts`, `triage-actions.ts`, `patient-actions.ts`

**Validation rules to implement:**
- **Name:** 2-100 chars, no numbers, trim whitespace
- **Phone:** Indian format (10 digits, starts with 6-9), with `+91` prefix handling
- **Age:** Integer 0-120, or DOB picker with auto-age calculation
- **Aadhaar:** 12 digits + Verhoeff checksum validation (optional field)
- **Email:** RFC 5322 format when provided
- **Address:** 10-500 chars when provided
- **Vitals ranges:** BP (60-250/40-150), HR (30-250), Temp (90-110°F), SpO2 (50-100%)

**Acceptance criteria:**
- Inline validation errors shown on blur (not just on submit)
- Server-side Zod validation on every action (defense in depth)
- Error messages are human-readable ("Phone must be 10 digits starting with 6-9")

---

### 1.4 — Error Boundaries & Loading States
**Problem:** Pages crash on null data. Some pages have no loading skeleton. No error recovery.
**Solution:** Wrap each module with error boundaries, standardize loading states.

**Files to create/modify:**
- `app/components/ErrorBoundary.tsx` — Catch render errors, show retry button
- `app/reception/error.tsx` — Reception error UI
- `app/patient/error.tsx` — Patient portal error UI
- `app/reception/loading.tsx` — Reception loading skeleton
- `app/patient/loading.tsx` — Patient portal loading skeleton
- Standardize loading skeletons across all pages

**Acceptance criteria:**
- Every page has a loading skeleton (no white flashes)
- Runtime errors show "Something went wrong" + retry button (not blank screen)
- Network failures show offline indicator with retry

---

### 1.5 — Consolidate Duplicate Code
**Problem:** Two separate triage engines, two UHID generators, duplicate department lists.
**Solution:** Single source of truth for shared logic.

**Files to create/modify:**
- `app/lib/uhid.ts` — Single UHID generator used by both registration and triage
- `app/lib/triage-engine.ts` — Unified triage engine (AI + rule-based fallback)
- `app/lib/constants/departments.ts` — Department list from DB with fallback to constants
- `app/lib/constants/symptoms.ts` — Symptom catalog (replaces hardcoded arrays)
- Remove duplicate functions from `triage-actions.ts` and `reception-actions.ts`

**Acceptance criteria:**
- One UHID format across entire system (configurable per org via OrganizationConfig)
- One triage engine called from both reception triage and patient assessment
- Department list fetched from DB `Department` table, cached 5 minutes

---

## Phase 2: Reception UX Overhaul (Week 2)
> Make the reception workflow fast, reliable, and production-ready.

### 2.1 — Smart Patient Registration
**Problem:** No duplicate detection, no existing patient lookup, hardcoded departments, missing fields.
**Solution:** Complete registration overhaul.

**Changes:**
- Add **duplicate detection** on phone number + name (fuzzy match) before registration
  - If match found → show existing patient card with "Use existing" or "Register new" options
- Add **existing patient search** bar at top of registration form ("Already registered? Search here")
- **New fields:** Date of Birth (auto-calculate age), Blood Group, Emergency Contact (name + phone + relationship), Consent checkbox
- **Department dropdown** pulled from DB `Department` table (not hardcoded 4 options)
- **Address field** changed to textarea (3 rows)
- **Phone field** with `+91` prefix and 10-digit mask
- After registration → auto-redirect to appointment booking (not just success screen)

**Files to modify:**
- `app/reception/register/page.tsx` — Complete UI overhaul
- `app/actions/register-patient.ts` — Add duplicate check, new fields, consent tracking
- `prisma/schema.prisma` — Add `date_of_birth`, `blood_group`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relation`, `registration_consent` to OPD_REG

---

### 2.2 — Real-time Queue System
**Problem:** Queue refreshes every 30s via polling. No audio alerts. Hardcoded 15-min estimate.
**Solution:** Real-time queue with accurate wait times.

**Changes:**
- Replace `setInterval` polling with **Supabase Realtime** subscriptions on `appointments` table
- Calculate **dynamic wait times** based on doctor's average consultation duration (last 20 appointments)
- Store `avg_consultation_minutes` on User model (for doctors), recalculate daily
- **Audio notification** on token-display when current patient changes (configurable beep)
- **Queue reordering** via drag-and-drop (reception only, not patient-facing)
- **Priority queue** support: Emergency patients bypass queue with visual indicator

**Files to create/modify:**
- `app/lib/realtime.ts` — Supabase Realtime subscription helpers
- `app/reception/queue/page.tsx` — Replace polling with realtime, add drag-drop
- `app/reception/token-display/page.tsx` — Add audio alerts, priority indicators
- `app/actions/reception-actions.ts` — Dynamic wait time calculation
- `prisma/schema.prisma` — Add `avg_consultation_minutes` to User, `is_priority` to appointments

---

### 2.3 — Token Display Privacy & UX
**Problem:** Patient full names visible on public waiting room screens. No audio. No multi-language.
**Solution:** Privacy-first display with configurable masking.

**Changes:**
- **Patient name masking:** Show only first name + last initial (e.g., "Rahul K." instead of "Rahul Kumar")
- **Token-first display:** Large token number, small masked name
- Option to show **only token numbers** (configurable in admin settings → OrganizationConfig)
- **Audio announcement:** Browser Speech Synthesis API — "Token number 42, please proceed to Dr. Sharma, Room 3"
- **Estimated wait time** shown per patient (based on dynamic calculation from 2.2)
- **Multi-language display:** Hindi/English toggle (stored in OrganizationConfig)
- **Full-screen mode** with F11 detection + dedicated fullscreen button
- **Remove duplicate** `/opd/display` page — consolidate into single `/reception/token-display`

**Files to modify:**
- `app/reception/token-display/page.tsx` — Complete rewrite
- `app/opd/display/page.tsx` — Redirect to token-display
- `prisma/schema.prisma` — Add `queue_display_mode`, `queue_language` to OrganizationConfig

---

### 2.4 — Appointment Scheduling Improvements
**Problem:** No reschedule, no recurring slots, no buffer time, walk-ins not handled.
**Solution:** Complete scheduling upgrade.

**Changes:**
- **Reschedule flow:** Cancel old → book new in single operation (preserving appointment history)
- **Walk-in appointments:** "Walk-in" button at reception → auto-assigns next available slot or creates overflow
- **Buffer time:** 5-minute gap between slots (configurable per doctor in admin)
- **Slot preview in bulk creation:** Show "This will create X slots" before confirming
- **Overbooking prevention:** Lock slot immediately on selection (optimistic locking with 5-min hold)
- **Doctor leave integration:** Grey out slots for days doctor is on leave (from HR LeaveRequest)
- **Appointment confirmation:** WhatsApp + Email sent immediately on booking

**Files to modify:**
- `app/reception/appointments/page.tsx` — Add reschedule, walk-in, buffer time
- `app/actions/reception-actions.ts` — Reschedule action, walk-in action, slot locking
- `prisma/schema.prisma` — Add `buffer_minutes` to User (doctors), `is_walkin` to appointments, `slot_hold_until` to AppointmentSlot

---

### 2.5 — Patient Profile Page Enhancement
**Problem:** No edit capability, no documents, no export, tabs reload data every time.
**Solution:** Complete patient profile with inline editing and data caching.

**Changes:**
- **Inline editing** for all patient fields (click to edit, save on blur)
- **Document section:** Upload patient ID, insurance cards, previous records (stored in Supabase Storage)
- **Timeline view:** Chronological history of all interactions (registration, appointments, labs, admissions)
- **Quick actions:** Book appointment, order lab, create prescription (from patient profile)
- **Data export:** "Download patient summary" as PDF
- **Tab data caching:** Load all tabs on first render, switch instantly

**Files to modify:**
- `app/reception/patient/[id]/page.tsx` — Complete rewrite with timeline + editing
- `app/actions/reception-actions.ts` — Add update patient, upload document actions

---

## Phase 3: Patient Portal UX Overhaul (Week 3)
> Make the patient portal feel like a modern healthcare app.

### 3.1 — Appointment Rescheduling
**Problem:** Patients can only cancel and rebook. No reschedule flow.
**Solution:** One-step reschedule with slot selection.

**Changes:**
- **Reschedule button** on each upcoming appointment card
- Opens **date/time picker** with available slots (same doctor, next 30 days)
- Shows **fee difference** if slot price differs (unlikely but handled)
- Preserves original appointment reference for history
- **WhatsApp notification** to patient + doctor on reschedule

**Files to modify:**
- `app/patient/appointments/page.tsx` — Add reschedule button + modal
- `app/actions/patient-actions.ts` — Add `rescheduleAppointment()` action

---

### 3.2 — Vitals Dashboard with Charts
**Problem:** Vitals shown only as paginated table. No trends, no visual insights.
**Solution:** Interactive charts with trend analysis.

**Changes:**
- **Line charts** for each vital over time (BP systolic/diastolic, HR, Temp, SpO2)
- **Time range selector:** Last 7 days, 30 days, 90 days, 1 year
- **Normal range bands** highlighted on charts (green zone)
- **Anomaly indicators:** Red dots for out-of-range readings
- **Summary cards** with trend arrows (↑ improving, ↓ concerning)
- Keep table view as secondary tab

**Files to modify:**
- `app/patient/vitals/page.tsx` — Add chart view with Recharts
- `app/actions/patient-actions.ts` — Add `getVitalsTrend()` action with date range

---

### 3.3 — Lab Results with Normal Ranges
**Problem:** Lab results show raw values. No indication if results are normal/abnormal.
**Solution:** Annotated lab results with interpretation.

**Changes:**
- Add **normal_range_min**, **normal_range_max**, **unit** fields to `lab_test_inventory`
- Display results with **color-coded indicators:** Green (normal), Amber (borderline), Red (abnormal)
- **Visual bar** showing where result falls within range
- **AI interpretation:** One-line plain-English explanation ("Your blood sugar is slightly elevated")
- **Historical comparison:** "Previous: 110 mg/dL → Current: 135 mg/dL (↑23%)"

**Files to modify:**
- `app/patient/labs/page.tsx` — Add range indicators, interpretation
- `prisma/schema.prisma` — Add `normal_range_min`, `normal_range_max`, `unit` to lab_test_inventory
- `app/actions/lab-actions.ts` — Include ranges in lab result responses

---

### 3.4 — Patient Notification Center
**Problem:** No in-app notifications. Patients don't know when lab results are ready or appointments change.
**Solution:** Notification center with real-time updates.

**Changes:**
- **Notification bell** in patient portal header with unread count badge
- **Notification types:** Appointment reminder (1 day before), Lab result ready, Prescription update, Payment receipt, Queue position update
- **Notification preferences:** Patient can toggle which notifications they want (WhatsApp, Email, In-app)
- Stored in existing `Notification` table (add patient_id support)
- **Real-time push** via Supabase Realtime on Notification table changes

**Files to create/modify:**
- `app/patient/notifications/page.tsx` — Full notification list
- `app/components/patient/NotificationBell.tsx` — Header bell with dropdown
- `app/actions/patient-actions.ts` — `getPatientNotifications()`, `markNotificationRead()`
- `prisma/schema.prisma` — Add `patient_id` to Notification model, add `NotificationPreference` model

---

### 3.5 — Forgot Password Flow
**Problem:** No password recovery. Patient must visit hospital physically if password lost.
**Solution:** OTP-based password reset.

**Changes:**
- **"Forgot Password?"** link on login page
- **Step 1:** Enter Patient ID + registered phone/email
- **Step 2:** Send OTP via WhatsApp (primary) or Email (fallback)
- **Step 3:** Enter OTP (6-digit, 5-minute expiry)
- **Step 4:** Set new password (same validation rules as setup)
- **Rate limiting:** Max 3 OTP requests per hour per patient

**Files to create/modify:**
- `app/patient/forgot-password/page.tsx` — Multi-step reset flow
- `app/actions/patient-actions.ts` — `requestPasswordReset()`, `verifyOTP()`, `resetPassword()`
- `app/lib/otp.ts` — OTP generation, storage (in DB with expiry), verification
- `prisma/schema.prisma` — Add `PasswordResetOTP` model

---

### 3.6 — Profile Photo & Enhanced Profile
**Problem:** Generic avatar with initials. No photo upload. Emergency contacts not prominent.
**Solution:** Complete profile enhancement.

**Changes:**
- **Photo upload** with crop/resize (max 2MB, stored in Supabase Storage)
- **Emergency contact** section prominently displayed (not buried in profile)
- **Medical summary card:** Blood group, allergies (red badges), chronic conditions
- **Insurance section:** Policy number, provider, coverage details, expiry date
- **Download health card:** PDF with QR code containing patient ID (scannable at reception)

**Files to modify:**
- `app/patient/profile/page.tsx` — Add photo upload, medical summary, insurance section
- `app/actions/patient-actions.ts` — `uploadProfilePhoto()`, `updateMedicalSummary()`

---

## Phase 4: Security & Compliance (Week 4)
> Healthcare data requires the highest security standards.

### 4.1 — Audit Logging for Patient Portal
**Problem:** No audit trail for patient data access. Compliance risk.
**Solution:** Log every patient portal action.

**Events to log:**
- Login/logout (with IP, device info)
- View medical records, lab results, prescriptions
- Book/cancel/reschedule appointments
- Make payments
- Update profile
- Download PDFs
- Change password

**Files to modify:**
- `app/actions/patient-actions.ts` — Add `logAudit()` calls to every action
- `app/lib/audit.ts` — Extend to support patient audit events

---

### 4.2 — Session Security Hardening
**Problem:** Legacy JSON session parsing, weak tokens, no inactivity timeout for patients.
**Solution:** Secure session management.

**Changes:**
- Remove legacy JSON parsing in `getPatientSession()` (line 178 of session.ts)
- Remove hardcoded fallback `org-avani-default`
- Add **inactivity timeout** (30 minutes for patient portal)
- Add **concurrent session detection** — show "Active on another device" warning
- Add **session fingerprinting** — hash of user-agent + IP for anomaly detection
- Rate limit: **5 failed login attempts → 15-minute lockout**

**Files to modify:**
- `app/lib/session.ts` — Remove legacy code, add fingerprinting
- `middleware.ts` — Add patient session timeout
- `app/actions/patient-actions.ts` — Add rate limiting wrapper

---

### 4.3 — Data Privacy Controls
**Problem:** Patient data fully visible. No consent tracking. No data export/deletion.
**Solution:** Privacy-first data handling.

**Changes:**
- **Consent management:** Track what patient consented to (data processing, marketing, research)
- **Data export:** "Download my data" button → generates ZIP with all records, labs, prescriptions, vitals as JSON + PDFs
- **Data masking:** Phone shows as `9876****21` in non-essential views
- **Lab report URLs:** Signed URLs with 15-minute expiry (not static barcode-based paths)

**Files to create/modify:**
- `app/patient/settings/privacy/page.tsx` — Privacy controls page
- `app/actions/patient-actions.ts` — `exportMyData()`, `updateConsent()`
- `app/api/reports/lab/pdf/route.ts` — Switch to signed URL verification

---

## Phase 5: Performance & Polish (Week 5)
> Make it fast, accessible, and delightful.

### 5.1 — Client-side Caching with SWR
**Problem:** Every page navigation re-fetches all data from DB.
**Solution:** SWR (stale-while-revalidate) for client-side caching.

**Changes:**
- Install `swr` package
- Create custom hooks: `usePatientDashboard()`, `useAppointments()`, `useVitals()`, `useLabResults()`
- **Stale data shown instantly**, background revalidation on focus/interval
- **Optimistic updates** for: appointment booking, profile updates, notification read
- **Cache invalidation** on mutations (book appointment → invalidate appointments cache)

**Files to create:**
- `app/lib/hooks/usePatientData.ts` — SWR hooks for patient portal
- `app/lib/hooks/useReceptionData.ts` — SWR hooks for reception

---

### 5.2 — Accessibility (WCAG 2.1 AA)
**Problem:** Color-only indicators, missing ARIA labels, poor keyboard navigation.
**Solution:** Full accessibility pass.

**Changes:**
- **All buttons** get `aria-label` (especially icon-only buttons)
- **All modals** get `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close
- **Status badges** include text + icon (not just color): "✓ Completed", "⏳ Pending", "✗ Cancelled"
- **Form inputs** properly linked with `<label htmlFor>`
- **Tables** get `scope="col"` on headers
- **Skip navigation** link at top of page
- **Focus visible** outlines on all interactive elements
- **Color contrast** audit — ensure all text meets 4.5:1 ratio
- **Keyboard navigation** for all actions (Tab, Enter, Escape, Arrow keys)

---

### 5.3 — Mobile Optimization
**Problem:** Tables not optimized for mobile. Touch targets too small. Forms feel cramped.
**Solution:** Mobile-first responsive overhaul.

**Changes:**
- **Tables → Cards** on mobile (< 768px): Convert all data tables to card layouts
- **Touch targets:** Minimum 44x44px for all interactive elements
- **Form fields:** Full-width on mobile with appropriate keyboard types (tel, email, number)
- **Bottom sheet modals** on mobile (instead of center modals)
- **Pull-to-refresh** on patient portal pages
- **Swipe gestures:** Swipe left on appointment card to cancel/reschedule

---

### 5.4 — Dark Mode
**Problem:** Only token display has dark mode. Rest is light-only.
**Solution:** System-wide dark mode support.

**Changes:**
- Leverage existing `next-themes` package (already installed)
- Create dark color palette matching current emerald theme
- Toggle in patient portal settings + reception header
- **Auto-detect** system preference
- Token display always dark (regardless of setting)

---

## Phase 6: Advanced Features (Week 6+)
> Features that differentiate from competitors.

### 6.1 — Queue Position for Patients
- Patient portal shows **live queue position** after check-in
- "You are #3 in line. Estimated wait: 12 minutes"
- Push notification when 2 positions away
- "Your turn! Proceed to Room 3" notification

### 6.2 — Telehealth Ready
- Video consultation booking option (mark appointment as "Video")
- Jitsi Meet / Daily.co integration for video calls
- Consultation notes saved same as in-person

### 6.3 — Multi-language Support (i18n)
- Hindi + English for patient portal (minimum)
- Language selector in header
- All static text in translation files
- Dynamic content (doctor notes, lab results) remain in original language

### 6.4 — Patient Document Vault
- Upload and store medical documents (scans, reports, insurance cards)
- Categorized: Prescriptions, Lab Reports, Insurance, ID Proof, Other
- Share specific documents with doctor during appointment
- Stored in Supabase Storage with encryption

### 6.5 — Smart Appointment Suggestions
- AI suggests follow-up timing based on diagnosis
- Preventive care reminders (annual checkup, dental, eye)
- Vaccination schedule tracking
- "Patients like you also visited: Dermatology" recommendations

---

## Implementation Priority Matrix

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| Phase 1: Foundation Fixes | Medium | Critical | **P0 — Do First** |
| Phase 2: Reception UX | High | High | **P0 — Do First** |
| Phase 3: Patient Portal UX | High | High | **P1 — Do Next** |
| Phase 4: Security | Medium | Critical | **P1 — Do Next** |
| Phase 5: Performance & Polish | Medium | Medium | **P2 — After Core** |
| Phase 6: Advanced Features | High | Medium | **P3 — Roadmap** |

---

## Database Schema Changes Summary

```
OPD_REG (modify):
  + date_of_birth          DateTime?
  + blood_group            String?
  + emergency_contact_name String?
  + emergency_contact_phone String?
  + emergency_contact_relation String?
  + registration_consent   Boolean @default(false)
  + profile_photo_url      String?

appointments (modify):
  + is_walkin              Boolean @default(false)
  + is_priority            Boolean @default(false)
  + rescheduled_from       String?   // original appointment ID

AppointmentSlot (modify):
  + slot_hold_until        DateTime?

User (modify, for doctors):
  + avg_consultation_minutes Int?   @default(15)
  + buffer_minutes           Int?   @default(5)

OrganizationConfig (modify):
  + queue_display_mode     String?  @default("name_masked")  // "name_masked" | "token_only" | "full_name"
  + queue_language          String?  @default("en")           // "en" | "hi" | "both"
  + uhid_prefix             String?  // already exists

lab_test_inventory (modify):
  + normal_range_min       Float?
  + normal_range_max       Float?
  + unit                   String?

Notification (modify):
  + patient_id             String?

NEW: PasswordResetOTP
  - id                     String @id
  - patient_id             String
  - otp_hash               String
  - expires_at             DateTime
  - attempts               Int @default(0)
  - used                   Boolean @default(false)
  - created_at             DateTime @default(now())

NEW: NotificationPreference
  - id                     String @id
  - patient_id             String @unique
  - whatsapp_enabled       Boolean @default(true)
  - email_enabled          Boolean @default(true)
  - in_app_enabled         Boolean @default(true)
  - appointment_reminders  Boolean @default(true)
  - lab_results            Boolean @default(true)
  - payment_receipts       Boolean @default(true)

NEW: PatientConsent
  - id                     String @id
  - patient_id             String
  - consent_type           String   // "data_processing" | "marketing" | "research"
  - granted                Boolean
  - granted_at             DateTime
  - ip_address             String?
```

---

## Files Affected Summary

### New Files to Create (~20 files)
```
app/types/reception.ts
app/types/patient-portal.ts
app/lib/validations/patient.ts
app/lib/validations/appointment.ts
app/lib/validations/triage.ts
app/lib/validations/profile.ts
app/lib/uhid.ts
app/lib/triage-engine.ts
app/lib/constants/departments.ts
app/lib/constants/symptoms.ts
app/lib/realtime.ts
app/lib/otp.ts
app/lib/hooks/usePatientData.ts
app/lib/hooks/useReceptionData.ts
app/components/ui/ToastProvider.tsx
app/components/ErrorBoundary.tsx
app/components/patient/NotificationBell.tsx
app/patient/forgot-password/page.tsx
app/patient/notifications/page.tsx
app/patient/settings/privacy/page.tsx
```

### Existing Files to Modify (~25 files)
```
app/layout.tsx
app/reception/page.tsx
app/reception/register/page.tsx
app/reception/appointments/page.tsx
app/reception/queue/page.tsx
app/reception/triage/page.tsx
app/reception/token-display/page.tsx
app/reception/patient/[id]/page.tsx
app/patient/dashboard/page.tsx
app/patient/appointments/page.tsx
app/patient/appointments/book/page.tsx
app/patient/vitals/page.tsx
app/patient/labs/page.tsx
app/patient/profile/page.tsx
app/patient/login/page.tsx
app/actions/reception-actions.ts
app/actions/register-patient.ts
app/actions/triage-actions.ts
app/actions/patient-actions.ts
app/actions/lab-actions.ts
app/lib/session.ts
app/lib/audit.ts
middleware.ts
prisma/schema.prisma
app/opd/display/page.tsx
```

---

## How We'll Work

We'll go **phase by phase, file by file**. For each task:
1. I'll show you the exact changes before writing code
2. You approve or adjust the approach
3. I implement and you review
4. We test the specific feature
5. Move to next task

**Ready to start Phase 1.1 (Toast Notification System)?**
