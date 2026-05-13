# HospitalOS — Enterprise HIMS Upgrade Master Plan

## Executive Summary

**Audit Date:** May 12, 2026
**Benchmark:** KareXpert Product Features V3.0 (634 features across 45 modules)
**Codebase:** ~176 pages, ~433 TS/TSX files, ~120+ Prisma models, 3620-line schema

### Current Module Readiness

| Module | Coverage | Verdict |
|--------|----------|---------|
| OPD (Outpatient) | ~75% | Strong core. Missing: call center, recurring appointments, waitlist, priority queue |
| IPD (Inpatient) | ~65% | Good billing + nursing. Missing: OT integration, movement tracking, clearance workflow, daycare |
| Emergency | ~30% | AI triage + emergency admit only. Missing: ER dashboard, unknown patient, MLC workflow, bulk registration |
| OT (Operation Theatre) | **0%** | **Entirely unbuilt.** Only a text field exists |
| Pharmacy | ~75% | Full dispensing + inventory. Missing: CPOE pipeline, barcode scanning, generic substitution UI, controlled substance register |
| Billing | ~80% | Enterprise-grade GL + GST + Tally. Missing: OTP discount auth, billing ordersets, scheme entity, addendum tracking |
| CRM | **0%** | **Does not exist.** Only a `lead_source` field + basic feedback form |

### Critical Structural Issues Found

1. **Git merge conflict markers** in `app/reception/register/page.tsx` (lines 393-420) — LIVE BUG
2. **11 admin pages orphaned** from sidebar navigation (unreachable without direct URL)
3. **IPD billing pages missing** from IPD manager sidebar
4. **Billing fragmented** across 5+ route groups (finance, reception, ipd, admin, pharmacy)
5. **Duplicate schema models**: `billing_records` vs `invoices`, `PreAuthorization` vs `InsurancePreAuth`
6. **OPD config split-brain**: `OPDConfig` model + separate `module_config` JSON blob store different settings
7. **Slot duration mismatch**: OPD config says 15 min default, but `getOrCreateDailySlots` hardcodes 20 min

---

## Phase 1 — Structural Fixes & Quick Wins (Week 1)

> Fix bugs, clean up navigation, resolve schema inconsistencies. Zero new features — just make what exists work properly.

### 1.1 Fix Live Bugs

**Git merge conflict in registration page**
- File: `app/reception/register/page.tsx` (lines 393-420)
- Action: Resolve conflict markers, test registration flow
- Priority: P0 — this can crash the registration page

**Slot duration mismatch**
- File: `app/actions/doctor-actions.ts` → `getOrCreateDailySlots()`
- Issue: Hardcoded `SLOT_DURATION=20`, `START_HOUR=9`, `END_HOUR=17` ignoring OPD config
- Fix: Read from `module_config` or `OPDConfig` table instead of hardcoding

### 1.2 Fix Navigation & Sidebar

**Add missing sidebar links for IPD manager:**
- File: `app/components/layout/Sidebar.tsx`
- Add: `/ipd/billing` (IPD Billing), `/ipd/discharge-settlement` (Discharge Settlement)
- Add: `/ipd/case-sheet` (Case Sheet), `/ipd/audit-trail` (Audit Trail)

**Add missing admin sidebar links:**
- Add to admin nav: Analytics, Workflows, Templates, Notifications, Integrations, Branches, Roles, MFA Setup, API Docs
- Group under expandable "Settings" and "Advanced" sections

**Consolidate orphaned routes:**
- Move `/discharge/admin` → `/ipd/discharge-admin`
- Move `/insurance` content → `/finance/insurance`

### 1.3 Schema Cleanup

**Remove duplicate models:**
- Deprecate `billing_records` — confirm all code uses `invoices` model, then remove
- Merge `PreAuthorization` and `InsurancePreAuth` into one model (keep `InsurancePreAuth` which is richer)
- Migration: rename references, add redirects

**Unify OPD config:**
- Merge `OPDConfig` model fields into `module_config` system OR vice versa
- Pick one source of truth, delete the other

### 1.4 Add Global Patient Search

**New component:** `app/components/layout/GlobalPatientSearch.tsx`
- Keyboard shortcut: `Cmd+K` / `Ctrl+K`
- Search by: name, phone, patient ID, UHID
- Results show: name, ID, last visit, department
- Click navigates to role-appropriate patient view
- Available to: reception, doctor, nurse, ipd_manager, finance, admin

---

## Phase 2 — OT Module (Weeks 2-4)

> Build the entire Operation Theatre module from scratch. This is the biggest gap — 0% coverage vs 17 features required.

### 2.1 Schema Design

```prisma
// ========== OT MODULE ==========

model OTRoom {
  id              String   @id @default(uuid())
  organizationId  String
  room_name       String   // "OT-1", "OT-2", "Minor OT"
  room_type       String   // Major, Minor, Cath Lab, Endo Suite
  floor           String?
  wing            String?
  is_active       Boolean  @default(true)
  equipment       Json?    // ["ventilator", "c-arm", "laparoscopy"]
  
  organization Organization @relation(fields: [organizationId], references: [id])
  schedules    OTSchedule[]
  
  @@index([organizationId])
}

model SurgeryMaster {
  id              String   @id @default(uuid())
  organizationId  String
  surgery_code    String
  surgery_name    String
  category        String   // General, Ortho, Cardiac, Neuro, etc.
  sub_category    String?
  default_duration_mins Int @default(60)
  ot_room_type    String?  // Required room type
  requires_icu    Boolean  @default(false)
  billing_components Json? // surgeon fee, anesthesia fee, OT charges, consumables template
  is_active       Boolean  @default(true)
  
  organization Organization @relation(fields: [organizationId], references: [id])
  
  @@unique([organizationId, surgery_code])
  @@index([organizationId])
}

model SurgeryRequest {
  id              String   @id @default(uuid())
  organizationId  String
  request_number  String   @unique
  patient_id      String
  admission_id    String?
  appointment_id  String?
  requesting_doctor_id String
  surgery_master_id    String?
  surgery_name    String
  surgery_category String?
  urgency         String   @default("Elective") // Elective, Urgent, Emergency
  clinical_notes  String?
  diagnosis       String?
  icd_codes       Json?
  status          String   @default("Requested") // Requested, Approved, Scheduled, PAC_Pending, PAC_Cleared, Ready, InProgress, Completed, Cancelled
  requested_date  DateTime?
  approved_by     String?
  approved_at     DateTime?
  cancelled_reason String?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  
  organization Organization @relation(fields: [organizationId], references: [id])
  schedule     OTSchedule?
  pac          PACClearance?
  checklist    OTChecklist?
  notes        SurgeryNote[]
  team         SurgeryTeamMember[]
  billing      SurgeryBilling?
  consumables  SurgeryConsumable[]
  
  @@index([organizationId])
  @@index([patient_id])
  @@index([status])
}

model OTSchedule {
  id              String   @id @default(uuid())
  organizationId  String
  surgery_request_id String @unique
  ot_room_id      String
  scheduled_date  DateTime
  start_time      String   // "09:00"
  end_time        String   // "11:00"
  actual_start    DateTime?
  actual_end      DateTime?
  wheel_in_time   DateTime?
  wheel_out_time  DateTime?
  status          String   @default("Scheduled") // Scheduled, InProgress, Completed, Cancelled, Delayed
  delay_reason    String?
  
  organization Organization @relation(fields: [organizationId], references: [id])
  ot_room      OTRoom       @relation(fields: [ot_room_id], references: [id])
  surgery      SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
  
  @@index([organizationId, scheduled_date])
  @@index([ot_room_id, scheduled_date])
}

model SurgeryTeamMember {
  id              String   @id @default(uuid())
  surgery_request_id String
  role            String   // Primary Surgeon, Asst Surgeon, Anesthetist, Scrub Nurse, Circulating Nurse
  doctor_id       String?
  staff_name      String
  specialty       String?
  
  surgery SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
  
  @@index([surgery_request_id])
}

model PACClearance {
  id              String   @id @default(uuid())
  surgery_request_id String @unique
  anesthetist_id  String?
  anesthetist_name String?
  asa_grade       String?  // ASA I-VI
  anesthesia_type String?  // General, Spinal, Epidural, Local, Regional
  airway_assessment Json?  // Mallampati, thyromental, neck mobility
  pre_op_investigations Json? // required labs, ECG, chest X-ray
  fitness_status  String   @default("Pending") // Pending, Fit, Unfit, ConditionallyFit
  conditions      String?  // conditions if conditionally fit
  notes           String?
  cleared_at      DateTime?
  created_at      DateTime @default(now())
  
  surgery SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
}

model OTChecklist {
  id              String   @id @default(uuid())
  surgery_request_id String @unique
  // WHO Surgical Safety Checklist (3 phases)
  sign_in         Json?    // Before anesthesia: identity, consent, site marked, allergies, airway risk, blood loss risk
  time_out        Json?    // Before incision: team intro, patient/procedure/site confirmed, antibiotic given, imaging displayed
  sign_out        Json?    // Before leaving OT: instrument/sponge count, specimen labeled, equipment issues, recovery plan
  sign_in_by      String?
  sign_in_at      DateTime?
  time_out_by     String?
  time_out_at     DateTime?
  sign_out_by     String?
  sign_out_at     DateTime?
  
  surgery SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
}

model SurgeryNote {
  id              String   @id @default(uuid())
  surgery_request_id String
  note_type       String   // Pre-Op, Intra-Op, Post-Op, Anesthesia
  content         String
  findings        String?
  complications   String?
  blood_loss_ml   Int?
  duration_mins   Int?
  created_by      String
  created_at      DateTime @default(now())
  
  surgery SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
  
  @@index([surgery_request_id])
}

model SurgeryConsumable {
  id              String   @id @default(uuid())
  surgery_request_id String
  item_name       String
  item_code       String?
  quantity        Int      @default(1)
  unit_price      Float?
  is_implant      Boolean  @default(false)
  batch_no        String?
  serial_no       String?  // for implants
  
  surgery SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
  
  @@index([surgery_request_id])
}

model SurgeryBilling {
  id              String   @id @default(uuid())
  surgery_request_id String @unique
  surgeon_fee     Float    @default(0)
  anesthesia_fee  Float    @default(0)
  ot_charges      Float    @default(0)
  consumable_total Float   @default(0)
  implant_total   Float    @default(0)
  total_amount    Float    @default(0)
  posted_to_ipd   Boolean  @default(false)
  invoice_id      String?
  
  surgery SurgeryRequest @relation(fields: [surgery_request_id], references: [id])
}
```

### 2.2 Pages to Build

| Page | Route | Description |
|------|-------|-------------|
| OT Dashboard | `/ot/dashboard` | Today's surgeries, OT room status, upcoming schedule, KPIs |
| OT Calendar | `/ot/calendar` | Weekly/daily OT room calendar with drag scheduling |
| Surgery Requests | `/ot/requests` | Incoming surgery requests (from IPD/OPD) with approve/reject |
| Schedule Surgery | `/ot/schedule` | Assign OT room + time + team to approved request |
| PAC Clearance | `/ot/pac` | Anesthetist pre-op assessment form |
| OT Worklist | `/ot/worklist` | Today's surgery list with status tracking |
| WHO Checklist | `/ot/checklist/[surgeryId]` | 3-phase WHO Surgical Safety Checklist |
| Surgery Notes | `/ot/notes/[surgeryId]` | Pre-op, intra-op, post-op documentation |
| OT Billing | `/ot/billing` | Surgery billing component breakdown |
| OT Reports | `/ot/reports` | OT utilization, surgery stats, cancellation rate |
| OT Master Setup | `/admin/ot-setup` | OT rooms, surgery master, billing components |

### 2.3 Server Actions

**File:** `app/actions/ot-actions.ts`

Functions to implement:
- `createSurgeryRequest()` — from IPD admission or OPD doctor
- `approveSurgeryRequest()` — HOD/surgeon approval
- `scheduleSurgery()` — assign room, time, team
- `getOTCalendar()` — room-wise daily/weekly view
- `getOTWorklist()` — today's surgeries with status
- `savePACClearance()` — anesthetist assessment
- `saveOTChecklist()` — WHO 3-phase checklist
- `recordWheelIn()` / `recordWheelOut()` — patient tracking
- `startSurgery()` / `completeSurgery()` — status progression
- `saveSurgeryNote()` — pre/intra/post-op notes
- `addSurgeryConsumable()` — consumable/implant tracking
- `generateSurgeryBill()` — billing component breakdown
- `postSurgeryChargestoIPD()` — auto-post to IPD bill
- `cancelSurgery()` — with reason
- `rescheduleSurgery()` — change room/time
- `getOTStats()` — utilization, cancellation rate, avg duration

---

## Phase 3 — Emergency Module (Weeks 3-4)

> Upgrade from 30% to production-grade ER.

### 3.1 Schema Additions

```prisma
model ERRegistration {
  id              String   @id @default(uuid())
  organizationId  String
  er_number       String   @unique // ER-20260512-001
  patient_id      String?  // null for unknown patients
  patient_name    String   // "Unknown Male ~30y" for unidentified
  is_unknown      Boolean  @default(false)
  age_estimate    String?  // for unknown patients
  gender          String?
  brought_by      String?  // ambulance, self, police, bystander
  arrival_mode    String?  // Walking, Wheelchair, Stretcher, Ambulance
  arrival_time    DateTime @default(now())
  chief_complaint String
  triage_level    String?  // ESI 1-5
  triage_color    String?  // Red, Orange, Yellow, Green, Blue
  triage_nurse_id String?
  triage_time     DateTime?
  attending_doctor_id String?
  bed_id          String?
  status          String   @default("Triaged") // Triaged, UnderTreatment, Observation, AdmittedToIP, Discharged, LAMA, Death, Referred
  is_mlc          Boolean  @default(false)
  disposition     String?  // Discharged, Admitted, Transferred, LAMA, Death
  disposition_time DateTime?
  admission_id    String?  // if admitted to IP
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  
  organization Organization @relation(fields: [organizationId], references: [id])
  mlc_record   MLCRecord?
  er_vitals    ERVitals[]
  er_orders    EROrder[]
  er_notes     ERNote[]
  
  @@index([organizationId])
  @@index([status])
  @@index([triage_level])
}

model MLCRecord {
  id              String   @id @default(uuid())
  er_registration_id String @unique
  mlc_number      String   @unique
  case_type       String   // RTA, Assault, Poisoning, Burns, Suicide Attempt, Snake Bite, Dog Bite, Industrial, Other
  police_station  String?
  fir_number      String?
  io_name         String?  // Investigating Officer
  io_contact      String?
  brought_by_name String?
  brought_by_relation String?
  brought_by_id_proof String?
  injury_description String?
  injury_time     DateTime?
  alcohol_involved Boolean @default(false)
  police_informed Boolean @default(false)
  police_informed_at DateTime?
  magistrate_statement Boolean @default(false)
  wound_certificate_issued Boolean @default(false)
  created_at      DateTime @default(now())
  
  er_registration ERRegistration @relation(fields: [er_registration_id], references: [id])
}

model ERVitals {
  id              String   @id @default(uuid())
  er_registration_id String
  recorded_at     DateTime @default(now())
  recorded_by     String
  bp_systolic     Int?
  bp_diastolic    Int?
  heart_rate      Int?
  respiratory_rate Int?
  temperature     Float?
  spo2            Int?
  gcs_eye         Int?     // Glasgow Coma Scale
  gcs_verbal      Int?
  gcs_motor       Int?
  gcs_total       Int?
  pain_scale      Int?
  blood_sugar     Float?
  
  er_registration ERRegistration @relation(fields: [er_registration_id], references: [id])
  
  @@index([er_registration_id])
}

model EROrder {
  id              String   @id @default(uuid())
  er_registration_id String
  order_type      String   // Lab, Radiology, Medication, Procedure, Blood
  order_details   String
  priority        String   @default("Stat") // Stat, Urgent, Routine
  status          String   @default("Ordered") // Ordered, InProgress, Completed, Cancelled
  ordered_by      String
  ordered_at      DateTime @default(now())
  completed_at    DateTime?
  
  er_registration ERRegistration @relation(fields: [er_registration_id], references: [id])
  
  @@index([er_registration_id])
}

model ERNote {
  id              String   @id @default(uuid())
  er_registration_id String
  note_type       String   // Assessment, Procedure, Progress, Discharge
  content         String
  created_by      String
  created_at      DateTime @default(now())
  
  er_registration ERRegistration @relation(fields: [er_registration_id], references: [id])
  
  @@index([er_registration_id])
}
```

### 3.2 Pages to Build

| Page | Route | Description |
|------|-------|-------------|
| ER Dashboard | `/er/dashboard` | Active patients by triage level, bed map, wait times, KPIs |
| ER Tracking Board | `/er/tracking-board` | Real-time patient status board (for wall display) |
| ER Registration | `/er/register` | Quick registration (known + unknown patient) |
| MLC Registration | `/er/mlc/[erId]` | Medico-Legal Case form |
| ER Triage | `/er/triage/[erId]` | ESI/MTS triage scoring (upgrade from AI-only) |
| ER Patient View | `/er/patient/[erId]` | Vitals, orders, notes, procedures for active ER patient |
| ER Billing | `/er/billing` | ER-specific billing (advance deposit + interim + final) |
| ER-to-IP Transfer | `/er/transfer/[erId]` | Structured transfer to inpatient with bed selection |
| ER Reports | `/er/reports` | TAT, triage distribution, disposition stats |
| Bulk Registration | `/er/bulk-register` | Mass casualty intake form |

### 3.3 Server Actions

**File:** `app/actions/er-actions.ts`

Functions:
- `registerERPatient()` — quick registration (known/unknown)
- `registerUnknownPatient()` — auto-generates temporary ID
- `triageERPatient()` — ESI 1-5 scoring with auto-bed assignment for ESI 1-2
- `getERDashboard()` — active patients grouped by triage level
- `getERTrackingBoard()` — real-time board data
- `createMLCRecord()` — MLC documentation
- `recordERVitals()` — with GCS auto-calculation
- `createEROrder()` — stat lab/radiology/medication orders
- `saveERNote()` — clinical documentation
- `transferERtoIP()` — ER → IPD with data carry-over
- `dischargeERPatient()` — ER discharge with billing settlement
- `getERBilling()` — interim + final bill for ER stay
- `bulkRegisterER()` — mass casualty registration
- `getERStats()` — TAT, triage distribution, occupancy

---

## Phase 4 — OPD Enhancements (Week 4-5)

> Close the remaining 25% gap in OPD.

### 4.1 Call Center Module

**New role:** `CALL_CENTER`

**Pages:**
- `/call-center/dashboard` — call stats, bookings, queue
- `/call-center/book` — patient search by phone → quick register → book appointment
- `/call-center/logs` — call history with outcomes

**Schema:**
```prisma
model CallLog {
  id              String   @id @default(uuid())
  organizationId  String
  agent_id        String
  patient_phone   String
  patient_name    String?
  call_type       String   // Inbound, Outbound, Follow-up
  outcome         String   // Booked, Cancelled, Rescheduled, Enquiry, NoAnswer, Busy
  appointment_id  String?
  duration_seconds Int?
  notes           String?
  created_at      DateTime @default(now())
  
  organization Organization @relation(fields: [organizationId], references: [id])
  
  @@index([organizationId])
  @@index([agent_id])
  @@index([patient_phone])
}
```

### 4.2 Remaining OPD Features

| Feature | What to Build |
|---------|---------------|
| Recurring appointments | Add `recurrence_rule` (JSON: frequency, count, end_date) to appointments model. UI: "Repeat weekly for 6 weeks" in booking modal |
| Appointment waitlist | New `AppointmentWaitlist` model. When slots full, patient joins waitlist. Auto-notify when slot opens (cancellation) |
| Priority queue | Add `priority` field to appointments (VIP/Elderly/Disabled/Regular). Queue sorting respects priority. Visual badge on token display |
| Counselling module | New `/counselling` route group. `CounsellingSession` model with request/draft/confirm/cancel lifecycle. Financial counselling before admission |
| Appointment reminders cron | Scheduled job: find tomorrow's appointments where `reminder24Sent=false`, send WhatsApp/SMS, set flag |
| Doctor leave management | `DoctorLeave` model (doctor_id, from_date, to_date, leave_type). Block slot creation on leave days. Show on calendar |
| Configurable mandatory fields | `RegistrationFieldConfig` model. Admin toggle per field. Registration form dynamically renders required/optional |

---

## Phase 5 — Pharmacy Enhancements (Week 5-6)

> Close the remaining 25% gap.

### 5.1 Features to Add

| Feature | Implementation |
|---------|---------------|
| **CPOE pipeline** | Add verification step between doctor order and dispensing: Pharmacist reviews → Verify (check dose/interaction/allergy) → Dispense. New status: `Ordered → Verified → Dispensing → Dispensed`. Add `verified_by`, `verified_at` fields to `pharmacy_orders` |
| **Generic substitution UI** | On dispense page: when a branded drug is prescribed, auto-query `pharmacy_medicine_master` for same `generic_name`. Show alternatives with price comparison. Pharmacist can substitute with 1 click |
| **Barcode scanning** | Add barcode field to `pharmacy_batch_inventory`. On dispense: scan barcode → auto-select batch. Use `navigator.mediaDevices` for camera-based scanning on tablets |
| **Controlled substance register** | New `NarcoticRegister` model: drug_name, batch, quantity_in, quantity_out, balance, patient_id, prescriber_id, witness_id. Double-sign for dispensing narcotics (`is_narcotic` flag already exists in medicine master) |
| **Pull sheet generation** | New action: `generatePullSheet(wardId)` — query `WardStock` below par level → generate pick list sorted by rack location → print/PDF |
| **IP medication ordering screen** | Dedicated page `/pharmacy/ip-orders` — shows active IPD patients with medication schedules. Ward-wise view. Batch dispensing for floor stock |
| **Drug interaction alerts in doctor UI** | Inject `checkPrescriptionSafety()` call into `app/doctor/components/PharmacyTab.tsx` → show warning banner before doctor finalizes prescription |

---

## Phase 6 — Billing & Finance Enhancements (Week 6-7)

> Close remaining gaps and fix fragmentation.

### 6.1 Fix Billing Fragmentation

**Consolidate billing navigation:**
- Create unified `/billing` route group with sub-routes:
  - `/billing/op` — OP billing (move from `/reception/billing`)
  - `/billing/ip` — IP billing (move from `/ipd/billing`)
  - `/billing/er` — ER billing (new)
  - `/billing/pharmacy` — keep separate but cross-link
- Keep role-based access: receptionist sees OP, IPD manager sees IP, finance sees all
- Add "Billing" section to every relevant role's sidebar

### 6.2 New Billing Features

| Feature | Implementation |
|---------|---------------|
| **OTP discount authorization** | On discount request: generate 6-digit OTP → send to approver's phone → approver enters OTP in UI → discount applied. New `DiscountOTP` model with expiry |
| **Billing ordersets** | `BillingOrderSet` model: name, items (array of service_id + qty + default_price). One-click add entire orderset to invoice. Useful for health check packages, minor procedures |
| **Formal addendum billing** | Add `is_addendum` flag + `parent_invoice_id` to invoices. Addendum gets separate number (INV-001-A1). Audit trail shows original vs addendum items |
| **Discount scheme entity** | `DiscountScheme` model: name, type (percentage/flat), value, applicable_services, valid_from, valid_to, auto_apply rules. Link schemes to payer groups |
| **Billing category at admission** | Add `billing_category` to admissions (General/Semi-Private/Private/Deluxe/VIP). Auto-select tariff rate based on category. UI selector during admission |

### 6.3 Schema Cleanup

- Remove `billing_records` model (confirm zero active usage first)
- Merge `PreAuthorization` into `InsurancePreAuth` (keep richer model)
- Add migration to move any existing `PreAuthorization` data

---

## Phase 7 — CRM Module (Weeks 7-8)

> Build integrated CRM from scratch.

### 7.1 Schema Design

```prisma
// ========== CRM MODULE ==========

model CRMLead {
  id              String   @id @default(uuid())
  organizationId  String
  lead_number     String   @unique
  patient_id      String?  // linked if converted
  name            String
  phone           String
  email           String?
  source          String   // Website, Social Media, Referral, Walk-in, Campaign, Doctor Referral
  source_detail   String?  // specific campaign name, referring doctor, etc.
  status          String   @default("New") // New, Contacted, Interested, Appointment_Booked, Converted, Lost
  assigned_to     String?  // staff member
  department_interest String?
  doctor_interest String?
  notes           String?
  last_contacted  DateTime?
  follow_up_date  DateTime?
  converted_at    DateTime?
  lost_reason     String?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  
  organization Organization @relation(fields: [organizationId], references: [id])
  activities   CRMActivity[]
  
  @@index([organizationId])
  @@index([status])
  @@index([source])
  @@index([assigned_to])
}

model CRMActivity {
  id              String   @id @default(uuid())
  lead_id         String
  activity_type   String   // Call, WhatsApp, Email, SMS, Meeting, Note
  direction       String?  // Inbound, Outbound
  content         String
  outcome         String?  // Connected, No Answer, Interested, Not Interested, Callback
  performed_by    String
  performed_at    DateTime @default(now())
  
  lead CRMLead @relation(fields: [lead_id], references: [id])
  
  @@index([lead_id])
}

model CRMCampaign {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  campaign_type   String   // WhatsApp, SMS, Email
  target_audience String?  // All, Lapsed_6months, Department_specific, Custom
  message_template String
  scheduled_at    DateTime?
  status          String   @default("Draft") // Draft, Scheduled, Running, Completed
  total_recipients Int     @default(0)
  delivered       Int      @default(0)
  opened          Int      @default(0)
  converted       Int      @default(0)
  created_by      String
  created_at      DateTime @default(now())
  
  organization Organization @relation(fields: [organizationId], references: [id])
  
  @@index([organizationId])
}

model DoctorReferralNetwork {
  id              String   @id @default(uuid())
  organizationId  String
  doctor_name     String
  specialty       String?
  hospital        String?
  phone           String?
  email           String?
  referral_count  Int      @default(0)
  last_referral   DateTime?
  payout_percentage Float? // referral fee %
  is_active       Boolean  @default(true)
  created_at      DateTime @default(now())
  
  organization Organization @relation(fields: [organizationId], references: [id])
  
  @@index([organizationId])
}

model PatientEngagement {
  id              String   @id @default(uuid())
  organizationId  String
  patient_id      String
  last_visit      DateTime?
  visit_count     Int      @default(0)
  total_revenue   Float    @default(0)
  engagement_score Int     @default(0) // 0-100 based on recency, frequency, monetary
  risk_level      String?  // Active, At_Risk, Lapsed, Lost
  next_follow_up  DateTime?
  tags            Json?    // ["diabetes", "cardiac", "vip"]
  
  organization Organization @relation(fields: [organizationId], references: [id])
  
  @@unique([organizationId, patient_id])
  @@index([risk_level])
}
```

### 7.2 Pages to Build

| Page | Route | Description |
|------|-------|-------------|
| CRM Dashboard | `/crm/dashboard` | Lead funnel, conversion rate, source analytics, team performance |
| Lead Management | `/crm/leads` | Lead list with status pipeline (kanban or table view) |
| Lead Detail | `/crm/leads/[id]` | Activity timeline, notes, conversion actions |
| Campaigns | `/crm/campaigns` | WhatsApp/SMS/Email campaign builder and analytics |
| Referral Network | `/crm/referrals` | External doctor referral tracking and payout management |
| Patient Engagement | `/crm/engagement` | RFM scoring, at-risk patients, re-engagement triggers |
| Feedback Analysis | `/crm/feedback` | NPS trends, department-wise ratings, sentiment analysis |
| CRM Reports | `/crm/reports` | Source ROI, conversion funnel, campaign performance |

---

## Phase 8 — IPD Enhancements (Week 8-9)

> Close remaining IPD gaps identified in audit.

### 8.1 Features to Add

| Feature | Implementation |
|---------|---------------|
| **Pre-admission booking** | New `AdmissionBooking` model with future date, expected bed category, linked estimate. Shows in IPD dashboard as "Expected Admissions" |
| **Facesheet / admission card printing** | PDF template with patient demographics, admission details, barcode, allergies, payer info. Route: `/api/ipd/facesheet/[admissionId]/pdf` |
| **Wristband printing** | Thermal printer template: patient name, UHID, DOB, allergies, barcode. Route: `/api/ipd/wristband/[admissionId]` |
| **Patient movement tracking** | `PatientMovement` model: admission_id, from_location, to_location (OT/Radiology/Dialysis/Physio), moved_at, returned_at. UI widget on nursing station |
| **Multi-department clearance** | `DischargeClearance` model: admission_id, department (Pharmacy/Lab/Finance/Nursing/Doctor), status (Pending/Cleared/Waived), cleared_by, cleared_at. Replace flat checklist with role-based sign-off workflow |
| **Discharge intimation** | When doctor marks "fit for discharge": auto-notify Pharmacy (pending meds), Finance (pending charges), Housekeeping (bed will free). WhatsApp to patient family |
| **Financial counselling** | `FinancialCounselling` model: admission_id, estimated_cost, deposit_required, payment_plan, counsellor_id, patient_consent. Required before elective admission |
| **Daycare workflow** | Dedicated `/ipd/daycare` page. Same-day admit-discharge path. Daycare package selection. Auto-discharge reminder at T+8 hours |
| **Consent management** | `PatientConsent_IPD` model: admission_id, consent_type (Admission/Surgery/Anesthesia/Blood/LAMA), form_url, signed_at, witness. Multi-consent per admission |
| **Room/Floor/Wing hierarchy** | Add `Floor`, `Wing` models. Link: Organization → Building → Wing → Floor → Ward → Room → Bed. Visual bed navigator |

---

## Phase 9 — Usability & Polish (Week 9-10)

> Make the entire system feel like one product, not a collection of modules.

### 9.1 UX Improvements

| Improvement | Details |
|-------------|---------|
| **Global patient search (Cmd+K)** | Already described in Phase 1. Cross-role patient lookup |
| **Role-specific quick actions** | Reception: Register → Book → Check-in in 3 clicks. Doctor: Start consultation → SOAP → Prescribe → Done in 1 page. Nurse: Vitals → Meds → Tasks on single dashboard |
| **Notification center** | Unified notification bell for all roles: lab results ready, pharmacy dispensed, bed available, approval needed, SLA breach |
| **Print center** | Centralized print management: invoices, prescriptions, discharge summaries, facesheets, wristbands, lab reports. Queue-based printing |
| **Keyboard shortcuts** | `N` = new patient, `B` = book appointment, `C` = check-in, `Q` = queue view. Customizable per role |
| **Mobile-responsive for clinical roles** | Doctor and nurse views must work on iPad. Touch-friendly vitals entry. Swipe between patients |
| **Dashboard customization** | Each role can pin/unpin widgets on their dashboard. Drag-to-reorder |

### 9.2 Missing Master Data

Several KareXpert masters that HospitalOS needs:

| Master | Purpose | Priority |
|--------|---------|----------|
| Tariff Master | Multi-tariff pricing per service per billing category | P0 |
| Holiday Calendar | Block appointments, adjust ER staffing | P1 |
| Doctor Off-Schedule | Leave/conference/unavailability tracking | P1 |
| UHID Pattern | Configurable patient ID format | P2 |
| Visit Pattern | Configurable visit number format | P2 |
| Appointment Reminder Master | Configurable reminder templates and timing | P1 |
| Surgery Master + Category + Code | OT procedure catalog (built in Phase 2) | P0 |
| Anesthesia Master | Anesthesia types and protocols | P1 |
| Body Part Master | For surgery site marking and injury documentation | P2 |
| Clinical Pathway Master | Standardized care pathways per diagnosis | P2 |

---

## Implementation Timeline

```
Phase 1: Structural Fixes          Week 1        (no new features — fix what's broken)
Phase 2: OT Module                 Weeks 2-4     (biggest gap, build from zero)
Phase 3: Emergency Module          Weeks 3-4     (parallel with OT)
Phase 4: OPD Enhancements          Weeks 4-5     (call center, waitlist, recurring)
Phase 5: Pharmacy Enhancements     Weeks 5-6     (CPOE, barcode, narcotics)
Phase 6: Billing Enhancements      Weeks 6-7     (consolidation + new features)
Phase 7: CRM Module                Weeks 7-8     (build from zero)
Phase 8: IPD Enhancements          Weeks 8-9     (clearance, movement, daycare)
Phase 9: Usability & Polish        Weeks 9-10    (Cmd+K, shortcuts, responsive)
```

### Team Allocation Suggestion

| Track | Developers | Focus |
|-------|------------|-------|
| Track A (2 devs) | Senior full-stack | OT Module + ER Module (Phases 2-3) |
| Track B (2 devs) | Full-stack | OPD + Pharmacy enhancements (Phases 4-5) |
| Track C (1 dev) | Frontend-heavy | Billing consolidation + CRM UI (Phases 6-7) |
| Track D (1 dev) | Backend-heavy | IPD enhancements + schema migrations (Phase 8) |
| You (lead) | Review + architecture | Phase 1 fixes, code review, integration testing |

---

## Industry Comparison: Where HospitalOS Stands

### vs. KareXpert (634 features)

| Area | KareXpert | HospitalOS Now | After Upgrade |
|------|-----------|----------------|---------------|
| OPD | 50 features | 37 (~74%) | 48 (~96%) |
| IPD/ADT | 23 features | 15 (~65%) | 22 (~96%) |
| ER | 13 features | 4 (~30%) | 12 (~92%) |
| OT | 17 features | 0 (0%) | 16 (~94%) |
| Pharmacy | 27 features | 20 (~74%) | 26 (~96%) |
| Billing (OP+IP) | 45 features | 36 (~80%) | 43 (~96%) |
| CRM* | Not in KareXpert | 0 | Full module |

*CRM is HospitalOS's differentiator — KareXpert doesn't have an integrated CRM.

### vs. Industry Leaders

| Capability | Practo/KareXpert | HospitalOS Now | HospitalOS After |
|------------|-----------------|----------------|------------------|
| AI-powered triage | No | **Yes** (GPT-4o) | Yes |
| AI SOAP notes | No | **Yes** | Yes |
| AI discharge summary | No | **Yes** (GPT-4o) | Yes |
| Voice transcription | No | **Yes** | Yes |
| ICD-10 auto-suggest | No | **Yes** | Yes |
| Real-time queue (WebSocket) | Basic | **Yes** (Supabase) | Yes |
| Patient portal + Razorpay | Basic | **Yes** | Yes |
| WhatsApp integration | Add-on | **Built-in** | Enhanced |
| Tally export | No | **Yes** | Yes |
| GL double-entry | Separate module | **Built-in** | Enhanced |
| GST compliance | Basic | **Full** (CGST/SGST/IGST) | Full |
| Multi-tenant SaaS | No (on-premise) | **Yes** | Yes |
| CRM integration | Third-party | None | **Built-in** |

### HospitalOS Competitive Advantages (keep and amplify)

1. **AI-first clinical workflow** — no competitor has AI triage + SOAP + discharge summary + voice built in
2. **Modern tech stack** — Next.js 15 / React 19 / Prisma / Supabase vs legacy Java/.NET stacks
3. **Multi-tenant SaaS** — deploy once, serve many hospitals vs per-hospital installation
4. **Built-in financial integration** — GL + GST + Tally vs bolt-on finance modules
5. **Real-time everything** — Supabase subscriptions for queue, beds, vitals vs polling-only
6. **WhatsApp native** — notifications built-in vs third-party SMS gateway only
7. **Patient portal with payments** — Razorpay checkout vs manual payment collection only

---

## Definition of Done (Per Feature)

Every feature shipped must include:

1. Prisma schema migration (tested up + down)
2. Server actions with input validation
3. UI page with loading/error/empty states
4. Role-based access check in middleware
5. Sidebar navigation link added
6. WhatsApp/notification hooks where applicable
7. Audit trail for sensitive operations
8. Mobile-responsive for clinical roles (doctor, nurse)
9. At least one API test for critical server actions
10. Screenshot/demo recorded before merge

---

## How to Use This Plan

1. Start with **Phase 1** immediately — fix the live bug and navigation issues
2. **Phases 2-3** can run in parallel (OT + ER are independent modules)
3. **Phases 4-8** are sequential per module but can overlap across tracks
4. Each phase produces a deployable increment — don't wait for everything
5. Review this plan weekly — mark completed items, adjust priorities based on client feedback
6. Use this file as the single source of truth for what's built vs what's pending
