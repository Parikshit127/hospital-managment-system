# HospitalOS — IPD Module: Industry-Grade Redesign Blueprint

> **Version**: 1.0 | **Date**: April 2026 | **Author**: Parikshit (Team Lead, Agentic AI & Web Dev)
> **Purpose**: A complete technical blueprint for upgrading HospitalOS IPD from its current state to an industry-best in-patient department module — comparable or better than Epic, Athenahealth, Practo, and Apollo/Fortis internal systems.
> **Audience**: Development team — this document is implementation-ready.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Core IPD Features — Detailed Breakdown](#2-core-ipd-features--detailed-breakdown)
3. [End-to-End IPD Workflow](#3-end-to-end-ipd-workflow)
4. [Financial Management (CRITICAL)](#4-financial-management-critical)
5. [Clinical Notes & Documentation](#5-clinical-notes--documentation)
6. [UI/UX & Ease of Use](#6-uiux--ease-of-use)
7. [File & Module Structure](#7-file--module-structure)
8. [Advanced Improvements — Making It Industry Best](#8-advanced-improvements--making-it-industry-best)
9. [Performance & Scalability](#9-performance--scalability)
10. [Key Problems in Existing Systems & Our Solutions](#10-key-problems-in-existing-systems--our-solutions)
11. [Implementation Strategy](#11-implementation-strategy)

---

## 1. Current State Assessment

### What Exists Today (Audited)

HospitalOS IPD currently has **13 pages**, **4 action files** (2,546 lines total), **16 Prisma models**, and **6 components**. The core flow works: admit → bed assign → ward rounds → diet → nursing tasks → interim bill → discharge settlement.

### Current Strengths

| Area | Status | Notes |
|------|--------|-------|
| Bed management | ✅ Functional | 7 statuses, matrix view, transfer workflow, 30s auto-refresh |
| Admission | ✅ Functional | Atomic transaction: bed update + admission + invoice + deposit in one |
| Ward rounds | ✅ Functional | SOAP-style (observations + plan_changes), visit fee tracking |
| Diet plans | ✅ Functional | 8 diet types with custom instructions |
| Nursing tasks | ✅ Functional | Create, assign, complete with notes; 4 task types |
| Medication admin | ✅ Schema ready | Model exists with 5 statuses, but **no UI page** |
| Shift handover | ✅ Schema ready | Model exists with JSON summary, but **no UI** |
| Daily accrual | ✅ Functional | Room + nursing charges with GST (0% ≤₹5000, 5% >₹5000), pricing tier multipliers |
| Charge posting | ✅ Functional | Multi-source posting with audit trail (IpdChargePosting) |
| Interim billing | ✅ Functional | Categorized bill with GST summary, deposits, payments |
| Discharge settlement | ✅ Functional | Multi-method split payment, deposit application, discount approval |
| Discharge PDF | ✅ Functional | HTML-based with vitals, labs, clinical notes, follow-up |
| Bill PDF | ✅ Functional | Itemized with GST, GSTIN, amount in words, payment history |
| Packages | ✅ Functional | Apply, break-open, utilization tracking |
| Estimates | ✅ Functional | Pre-admission estimates with 50% deposit calculation |
| Service master | ✅ Functional | CRUD with tariff rates per category |
| Census | ✅ Functional | Ward-by-ward occupancy tracking |
| AI discharge summary | ✅ Functional | OpenAI GPT integration for auto-drafting |

### Critical Gaps (What Needs to Be Built or Redesigned)

| Gap | Severity | Impact |
|-----|----------|--------|
| **No medication administration UI** | P0 | Nurses can't record med administration — core safety workflow missing |
| **No shift handover UI** | P0 | Handover is the #1 patient safety workflow for nursing — missing entirely |
| **No nursing assessment/care plan** | P0 | No structured nursing assessment (head-to-toe, Gordon's), no care plans |
| **No vitals charting in IPD** | P0 | Vitals exist in schema but IPD has no vitals entry/trending screen |
| **No NEWS/MEWS scoring** | P1 | No early warning score calculation from vitals — industry standard |
| **No TPA/insurance workflow** | P1 | Pre-auth, enhancement, query, claim — none of it exists for IPD |
| **No planned vs emergency admission** | P1 | Single admission path; no pre-auth, no emergency triage integration |
| **No Expected Discharge Date (EDD)** | P1 | Discharge planning should start on Day 1; no EDD tracking |
| **No deposit alerts** | P1 | No auto-alert at 80%/100% deposit consumed — patients get surprise bills |
| **No daily charge auto-accrual cron** | P1 | `accrueIPDDailyCharges()` exists but nothing calls it automatically |
| **No auto-posting from lab/pharmacy** | P1 | Lab and pharmacy orders don't auto-post charges to IPD bill |
| **Billing page is placeholder** | P1 | `/ipd/billing` is partially built — needs full running bill dashboard |
| **No concurrent editing protection** | P2 | Multiple users can edit the same admission simultaneously |
| **No bed cleaning SLA tracking** | P2 | Bed goes to "Cleaning" on discharge but no SLA or housekeeping notify |
| **No patient safety scoring** | P2 | No fall risk, pressure ulcer risk, aspiration risk |
| **No consent management for IPD** | P2 | Consent captured at registration; no procedure-specific consents |
| **No implant/consumable tracking** | P2 | No serial-level tracking for surgical implants per patient |
| **Nursing components partial** | P2 | QuickEntryConsole, HistorySidebar, NursingActionWorkspace exist but underbuilt |
| **No double-entry GL integration** | P2 | Charges post to invoice but not to an accounting journal |

---

## 2. Core IPD Features — Detailed Breakdown

### 2.1 Patient Admission

#### Purpose
Convert an OPD consultation or emergency presentation into a tracked inpatient stay with bed, doctor, insurance authorization, and billing meter active.

#### Two Admission Pathways

**Planned Admission:**
1. Doctor marks "Admit" from OPD consultation → creates admission intent
2. Pre-admission estimate generated (`createIpdEstimate()`) → shared with patient/TPA
3. TPA pre-authorization submitted (48 hours before admission) → tracked in `InsurancePreAuth` (new model)
4. Pre-auth approved → patient arrives → bed allocated → deposit collected → admission created
5. Package applied if applicable → billing meter starts

**Emergency Admission:**
1. Patient arrives in ER → triage → doctor decides to admit
2. Admission created immediately → bed allocated → emergency deposit collected
3. TPA pre-auth submitted within 6 hours (post-admission) → tracked with `is_emergency: true`
4. Pre-auth approved/denied handled asynchronously — billing continues regardless

#### Data Involved (Current + New Fields)

```
admissions (ENHANCED):
  + admission_type: enum (Planned | Emergency | DayCare | Observation)  // NEW
  + expected_discharge_date: DateTime                                     // NEW — set within 24h
  + attending_doctor_id: String                                          // NEW — FK to User (replaces doctor_name string)
  + referring_doctor_id: String                                          // NEW
  + primary_diagnosis_icd: String                                        // NEW — ICD-10 code
  + secondary_diagnoses: Json                                            // NEW — array of ICD-10
  + admission_source: enum (OPD | Emergency | Transfer | DirectAdmit)    // NEW
  + discharge_type: enum (Normal | LAMA | DAMA | Absconded | Death | Transfer) // NEW
  + discharge_disposition: String                                        // NEW — home, SNF, rehab, etc.
  + patient_class: enum (General | SemiPrivate | Private | Suite | ICU | NICU | PICU) // NEW
  + pre_auth_id: String                                                  // NEW — FK to InsurancePreAuth
  + consent_for_treatment: Boolean                                       // NEW
  + consent_for_procedures: Json                                         // NEW — per-procedure consents
  + advance_directive: String                                            // NEW — DNR, living will
  + isolation_type: enum (None | Contact | Droplet | Airborne | Reverse) // NEW
  + fall_risk_score: Int                                                 // NEW — Morse scale 0-125
  + pressure_ulcer_risk: Int                                             // NEW — Braden scale 6-23
  + allergy_alerts: Json                                                 // NEW — pulled from patient master
  + code_status: enum (Full | DNR | DNI | ComfortOnly)                   // NEW
```

#### Key Actions
- `admitPatientIPD()` — enhanced with admission_type, attending_doctor_id, pre_auth linkage
- `admitEmergency()` — NEW: fast-path admission with minimal required fields, post-facto pre-auth
- `setExpectedDischargeDate()` — NEW: mandatory within 24 hours of admission
- `updateAdmissionDiagnosis()` — NEW: ICD-10 coded diagnosis update

#### Dependencies
- **OPD/Doctor module**: Admission triggered from doctor consultation
- **Emergency module**: Emergency admission fast-path
- **Insurance module**: Pre-auth creation and tracking
- **Finance module**: Deposit collection, invoice creation
- **Bed management**: Bed allocation and status update

---

### 2.2 Bed / Ward / Room Management

#### Purpose
Real-time visibility into every bed across every ward and branch, with automated allocation, cleaning SLA, and surge management.

#### Current State
Good foundation — 7 statuses, matrix view, transfer workflow. Missing: cleaning SLA, housekeeping integration, surge prediction, gender/isolation rules.

#### Enhanced Design

**Bed Allocation Rules Engine** (NEW):
```
When allocating a bed, the system enforces rules in priority order:
1. Isolation requirement (Contact/Droplet/Airborne/Reverse → must be isolation room)
2. Gender match (no mixed-gender rooms unless private)
3. Patient class match (General/SemiPrivate/Private/Suite/ICU)
4. Doctor preference (preferred ward or floor)
5. Proximity to nursing station (for high-acuity patients)
6. Bed availability → first available matching bed
```

**Cleaning SLA Workflow** (NEW):
```
Bed status: Discharged → Cleaning (auto-triggered on discharge)
  → Housekeeping notified via push notification
  → SLA clock starts (default: 45 minutes for General, 60 minutes for ICU)
  → Housekeeping scans QR code on bed to mark "Cleaning Started"
  → Housekeeping scans again to mark "Cleaning Complete"
  → Bed status → Available
  → SLA breach → auto-escalate to ward manager after threshold
```

**New Prisma Fields for beds:**
```
beds (ENHANCED):
  + bed_number: String          // Human-readable: "ICU-03", "Ward-A-12"
  + room_number: String         // Physical room
  + floor: Int                  // Floor number
  + is_isolation: Boolean       // Isolation-capable
  + is_oxygen_port: Boolean     // Has oxygen port
  + is_suction_port: Boolean    // Has suction
  + is_monitor_equipped: Boolean // Has patient monitor
  + cleaning_started_at: DateTime  // NEW — for SLA tracking
  + cleaning_completed_at: DateTime // NEW
  + cleaning_sla_minutes: Int      // NEW — per bed type
  + last_occupied_by: String       // NEW — for infection tracking
```

#### Key Actions (New)
- `allocateBedByRules(admissionId, preferences)` — rule-engine-based allocation
- `startBedCleaning(bedId)` — housekeeping scans to start
- `completeBedCleaning(bedId)` — housekeeping scans to complete
- `getBedCleaningSLAReport()` — SLA compliance dashboard
- `predictBedAvailability(hours)` — ML-based: predicts beds freeing up in next N hours based on EDD

---

### 2.3 Doctor Assignment & Rounds

#### Purpose
Track the attending physician, consulting specialists, and daily ward round documentation with structured SOAP notes tied to billing.

#### Current State
Ward rounds work (observations + plan_changes + visit_fee). Missing: structured SOAP fields, consulting doctors, order entry from rounds, charge auto-posting.

#### Enhanced Design

**WardRound Model (ENHANCED):**
```
ward_rounds (ENHANCED):
  + subjective: String           // NEW — patient-reported symptoms, pain scale
  + objective: String            // NEW — exam findings, vitals summary
  + assessment: String           // NEW — diagnosis update, differential
  + plan: String                 // NEW — treatment changes, orders
  + icd_codes: Json              // NEW — diagnoses coded
  + orders_placed: Json          // NEW — lab/pharmacy/procedure orders from this round
  + round_type: enum (Attending | Consulting | Nursing | Specialist)  // NEW
  + doctor_id: String            // EXISTS — but should be required FK to User
  + next_review_in_hours: Int    // NEW — when to review again
  + escalation_required: Boolean // NEW — flag for urgent specialist consult
  + charge_posted: Boolean       // EXISTS
  + visit_fee: Decimal           // EXISTS
```

**Consulting Doctors** (NEW model):
```
model AdmissionConsultant {
  id              String   @id @default(uuid())
  admission_id    String
  doctor_id       String
  specialty       String
  consulted_at    DateTime @default(now())
  notes           String?
  status          String   @default("Active")  // Active, Completed
  organizationId  String
}
```

#### Key Actions (New)
- `recordStructuredWardRound({admission_id, subjective, objective, assessment, plan, orders})` — replaces current `recordWardRound`, auto-posts visit fee charge
- `requestConsultation(admissionId, specialtyOrDoctorId, reason)` — creates AdmissionConsultant, notifies doctor
- `getWardRoundTimeline(admissionId)` — chronological rounds with all doctors

---

### 2.4 Nursing Workflows

#### Purpose
The nursing module is the most-used surface in IPD — nurses interact with it every 15 minutes. It must be fast, task-oriented, and safety-focused.

#### Current State
Basic: NursingTask (create/complete), NursingNote (4 types), MedicationAdministration (schema only — no UI), ShiftHandover (schema only — no UI). Three nursing components exist but are underbuilt.

#### What Needs to Be Built

**A. Medication Administration (eMAR) — P0**

This is the single most critical patient safety workflow in IPD. Nurses need to:
1. See all scheduled medications for their patients (the MAR)
2. Scan patient wristband (or verify manually)
3. Scan medication barcode (or verify manually)
4. Record administration (given, held, refused, missed — with reason)
5. Document any PRN (as-needed) medications given
6. See drug-drug and drug-allergy alerts before administering

**MedicationAdministration Model (ENHANCED):**
```
medication_administrations (ENHANCED):
  + prescription_id: String      // NEW — link to original prescription/order
  + medication_code: String      // NEW — NDC or hospital formulary code
  + frequency: String            // NEW — BD, TDS, QID, OD, SOS, STAT
  + is_prn: Boolean              // NEW — as-needed medication
  + prn_reason: String           // NEW — why PRN was given
  + witness_id: String           // NEW — for controlled substances
  + barcode_verified: Boolean    // NEW — BCMA verification
  + allergy_override: Boolean    // NEW — administered despite allergy flag
  + allergy_override_reason: String // NEW
  + pain_score_before: Int       // NEW — 0-10 scale
  + pain_score_after: Int        // NEW — 0-10 recorded later
```

**B. Vitals Charting — P0**

IPD needs its own vitals entry screen (not just the OPD vital_signs model). Nurses record vitals every 1-4 hours depending on acuity.

**New Action:** `recordIPDVitals({admission_id, bp_systolic, bp_diastolic, heart_rate, temperature, respiratory_rate, spo2, pain_score, consciousness_level, urine_output_ml, blood_sugar})` — auto-calculates NEWS score, triggers alert if ≥5.

**C. NEWS/MEWS Early Warning Score — P0**

Auto-calculated from vitals:
| Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
|-----------|---|---|---|---|---|---|---|
| Resp rate | ≤8 | | 9-11 | 12-20 | | 21-24 | ≥25 |
| SpO2 (%) | ≤91 | 92-93 | 94-95 | ≥96 | | | |
| Temp (°C) | ≤35.0 | | 35.1-36.0 | 36.1-38.0 | 38.1-39.0 | ≥39.1 | |
| Systolic BP | ≤90 | 91-100 | 101-110 | 111-219 | | | ≥220 |
| Heart rate | ≤40 | | 41-50 | 51-90 | 91-110 | 111-130 | ≥131 |
| Consciousness | | | | Alert | | | V/P/U |

**Score thresholds:**
- 0-4: Routine monitoring
- 5-6: Increase frequency, alert nurse-in-charge
- 7+: Emergency response, page doctor immediately

**D. Shift Handover — P0**

**Enhanced ShiftHandover:**
```
shift_handovers (ENHANCED):
  + shift_type: enum (Day | Evening | Night)    // NEW
  + patients: Json                               // NEW — structured per-patient handover
    // Each patient: { admission_id, bed, name, diagnosis, news_score,
    //   key_concerns, pending_orders, medications_due, vitals_trend,
    //   fall_risk, isolation, code_status, plan_for_shift }
  + critical_alerts: Json                        // NEW — escalations, pending results
  + equipment_status: Json                       // NEW — crash cart checked, monitors, etc.
  + acknowledged_by: String                      // NEW — receiving nurse signs off
  + acknowledged_at: DateTime                    // NEW
```

**E. Nursing Assessment & Care Plans — P1**

```
model NursingAssessment {
  id              String   @id @default(uuid())
  admission_id    String
  assessment_type String   // "initial", "daily", "reassessment"
  consciousness   String   // AVPU or GCS
  pain_score      Int      // 0-10
  fall_risk_score Int      // Morse scale
  braden_score    Int      // Pressure ulcer risk
  nutrition_screen String  // MUST tool score
  skin_assessment Json     // Body map with wound/pressure areas
  mobility        String   // Independent, Assisted, Bedbound
  continence      String
  safety_measures Json     // Bed rails, restraints, call bell, etc.
  care_plan       Json     // Structured care plan items
  assessed_by     String
  organizationId  String
  created_at      DateTime @default(now())
}
```

---

### 2.5 Orders (Lab, Pharmacy, Procedures)

#### Purpose
All clinical orders originate from the doctor during ward rounds or as ad-hoc requests. Orders must auto-post charges to the IPD running bill.

#### Current State
Lab ordering exists in doctor module. Pharmacy ordering exists. But neither auto-posts charges to IPD invoice.

#### Enhanced Design — Order-to-Bill Pipeline

```
Doctor places order (ward round or ad-hoc)
  → Order created in source module (lab_orders / pharmacy_orders)
  → Order tagged with admission_id
  → On order completion/dispensing:
      → Auto-call postChargeToIpdBill({
          admission_id,
          source_module: "lab" | "pharmacy" | "procedure" | "ot",
          source_ref_id: order_id,
          description: test_name / drug_name,
          quantity,
          unit_price,
          tax_rate,
          hsn_sac_code
        })
      → IpdChargePosting record created (audit trail)
      → Invoice item added
      → Invoice totals recalculated with GST
      → Running bill updated in real-time
```

**New Actions:**
- `placeIPDOrder({admission_id, order_type, items})` — unified order entry for lab/pharmacy/procedure
- `onLabResulted(labOrderId)` — hook that auto-posts charge to IPD bill
- `onPharmacyDispensed(pharmacyOrderId)` — hook that auto-posts charge to IPD bill
- `onProcedureCompleted(procedureId)` — hook that auto-posts charge to IPD bill

---

### 2.6 Diet & Services Management

#### Current State
Diet plans work (8 types + instructions). Missing: meal tracking, kitchen integration, special requirements (allergies, religious), timing.

#### Enhanced Design

**DietPlan Model (ENHANCED):**
```
diet_plans (ENHANCED):
  + meal_schedule: Json         // NEW — { breakfast: "07:00", lunch: "12:30", snack: "16:00", dinner: "19:30" }
  + calorie_target: Int         // NEW — kcal/day
  + protein_target: Int         // NEW — g/day
  + fluid_restriction_ml: Int   // NEW — for renal/cardiac patients
  + allergens: Json             // NEW — pulled from patient master
  + religious_restrictions: String // NEW — vegetarian, halal, kosher
  + texture_modification: String // NEW — pureed, minced, soft, regular
  + feeding_route: enum (Oral | NGTube | PEG | TPN | NPO)  // NEW
  + reviewed_by_dietitian: Boolean // NEW
  + review_date: DateTime        // NEW
```

---

### 2.7 Discharge Process

#### Purpose
Discharge is the most error-prone and financially critical moment in the IPD stay. It must start on Day 1 (EDD setting), execute cleanly, and leave zero billing discrepancies.

#### Current State
Discharge works: settle bill → multi-payment → free bed → generate summary. Missing: EDD, discharge planning, pre-discharge checklist automation, medication reconciliation.

#### Enhanced Discharge Workflow

```
DAY 1 OF ADMISSION:
  → Set Expected Discharge Date (EDD) — mandatory within 24 hours
  → System begins tracking ALOS against EDD

DAY N-1 (PRE-DISCHARGE):
  → Doctor marks "Fit for Discharge" or "Discharge Planned for Tomorrow"
  → System triggers pre-discharge checklist:
      □ All pending lab results received
      □ All medications reconciled (discharge meds vs. inpatient meds)
      □ TPA final bill submitted (if cashless)
      □ All pending charges posted
      □ Follow-up appointment booked
      □ Patient education completed
      □ Transport arranged (if needed)
      □ AI discharge summary drafted → doctor reviews and signs

DAY N (DISCHARGE DAY):
  → Final bill generated with all charges
  → Deposits applied
  → TPA settlement received (or patient pays balance)
  → Discharge summary signed by attending doctor
  → Bed released → auto-set to "Cleaning"
  → Housekeeping notified
  → Patient receives: discharge summary, prescriptions, follow-up card, bill copy
  → WhatsApp: discharge summary + next appointment + medication reminders
  → ABDM: push discharge record to patient's ABHA
```

**New Fields for Discharge:**
```
admissions (DISCHARGE FIELDS):
  + fit_for_discharge_at: DateTime          // NEW — doctor marks fit
  + fit_for_discharge_by: String            // NEW — doctor who cleared
  + discharge_checklist: Json               // NEW — auto-tracked checklist status
  + medication_reconciliation: Json         // NEW — discharge meds list
  + discharge_instructions: String          // NEW — patient instructions
  + follow_up_appointment_id: String        // NEW — auto-booked follow-up
  + patient_education_completed: Boolean    // NEW
  + transport_arranged: Boolean             // NEW
```

---

### 2.8 Billing & Financial Handling

**See Section 4 for the full deep-dive.** Summary of what the billing system must handle:

- Advance deposits with 80%/100% consumption alerts
- Package billing with exclusion handling (implant overruns, extra ICU days, blood units)
- Itemized billing with real-time charge posting from lab/pharmacy/OT/nursing
- TPA/insurance pre-auth → enhancement → query → claim → settlement
- Interim billing for long-stay patients (every 7 days)
- Multi-method split payments at discharge
- Discount approval workflow (>5% requires manager, >15% requires CFO)
- Credit notes and refunds with audit trail
- GST handling (healthcare exemption + ₹5000/day room exception)
- Section 194J TDS on doctor fees
- Double-entry journal posting to GL for every financial event

---

## 3. End-to-End IPD Workflow

### 3.1 Planned Admission Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. OPD CONSULTATION                                             │
│    Doctor decides admission needed                              │
│    → Creates admission intent with diagnosis, expected LOS      │
│    → System generates pre-admission estimate                    │
│    → Patient/family receive estimate on WhatsApp/app            │
├─────────────────────────────────────────────────────────────────┤
│ 2. PRE-AUTHORIZATION (if insured)                               │
│    → TPA pre-auth form auto-generated from estimate             │
│    → Submitted to TPA/insurer                                   │
│    → Status tracked: Submitted → Approved/Denied/Query          │
│    → Query response handled → re-submitted                      │
│    → Approval amount and conditions recorded                    │
├─────────────────────────────────────────────────────────────────┤
│ 3. ADMISSION DAY                                                │
│    → Patient arrives at reception/admission desk                │
│    → Identity verified (photo + ABHA + wristband)               │
│    → Consent forms signed (treatment + procedures + data)       │
│    → Deposit collected (50% of estimate or ₹X based on class)   │
│    → Bed allocated by rules engine                              │
│    → Admission record created (atomic transaction)              │
│    → Wristband printed with barcode (patient_id + admission_id) │
│    → Attending doctor notified                                  │
│    → Nursing initial assessment scheduled                       │
│    → Diet plan assigned                                         │
│    → Expected Discharge Date set                                │
│    → Billing meter starts                                       │
├─────────────────────────────────────────────────────────────────┤
│ 4. DAILY CLINICAL WORKFLOW                                      │
│    Morning:                                                     │
│      → Night nurse completes shift handover to day nurse        │
│      → Day nurse records morning vitals (6:00 AM)               │
│      → NEWS score auto-calculated → alert if ≥5                 │
│      → Medication administration round (scheduled meds)         │
│      → Doctor ward round (8:00-11:00 AM)                        │
│        → SOAP note recorded                                     │
│        → Orders placed (lab, pharmacy, procedures)              │
│        → Diagnosis updated if needed                            │
│        → Visit fee auto-posted to bill                          │
│    Afternoon:                                                   │
│      → Lab results return → auto-posted to bill + EMR           │
│      → Pharmacy dispenses → auto-posted to bill                 │
│      → Afternoon vitals (2:00 PM)                               │
│      → Nursing tasks executed (wound care, PT, procedures)      │
│    Evening:                                                     │
│      → Day-to-evening shift handover                            │
│      → Evening vitals (6:00 PM)                                 │
│      → Evening medication round                                 │
│    Night:                                                       │
│      → Evening-to-night shift handover                          │
│      → Night vitals (10:00 PM, 2:00 AM, 6:00 AM)               │
│      → PRN medications as needed                                │
│                                                                 │
│    Daily Auto-Accrual (midnight cron):                          │
│      → Room charges posted                                      │
│      → Nursing charges posted                                   │
│      → Diet charges posted (if applicable)                      │
│      → Running bill updated                                     │
│      → Deposit consumption checked → alert if ≥80%              │
├─────────────────────────────────────────────────────────────────┤
│ 5. INTERIM BILLING (every 7 days for long-stay)                 │
│    → Interim bill generated with all charges to date            │
│    → Shared with patient/family                                 │
│    → If insured: enhancement request sent to TPA                │
│    → Additional deposit requested if balance low                │
├─────────────────────────────────────────────────────────────────┤
│ 6. PRE-DISCHARGE (Day N-1)                                      │
│    → Doctor marks "Fit for Discharge"                           │
│    → Pre-discharge checklist auto-triggered                     │
│    → Final charges posted (pending lab/pharmacy)                │
│    → AI discharge summary generated → doctor reviews            │
│    → TPA final bill submitted (if cashless)                     │
│    → Follow-up appointment auto-booked                          │
│    → Discharge medications prescribed                           │
├─────────────────────────────────────────────────────────────────┤
│ 7. DISCHARGE & SETTLEMENT (Day N)                               │
│    → Final bill presented to patient/family                     │
│    → Deposits applied to balance                                │
│    → TPA settlement received (or patient pays)                  │
│    → Split payment processed                                    │
│    → Invoice finalized                                          │
│    → Discharge summary signed                                   │
│    → Wristband removed, bed released → Cleaning                 │
│    → Patient receives: summary, Rx, follow-up, bill             │
│    → WhatsApp: everything sent digitally                        │
│    → Housekeeping notified → cleaning SLA starts                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Emergency Admission Flow

Same as above except:
- Step 1-2 happen simultaneously or post-admission
- Pre-auth submitted within 6 hours
- Minimal fields required at admission (name, vitals, triage level)
- Full demographics collected once patient is stabilized
- Bed allocation prioritizes ICU/Emergency beds

### 3.3 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Bed transfer** | BedTransfer record, billing auto-adjusts room rate from transfer datetime, old bed → Cleaning |
| **Doctor change** | New attending assigned, old doctor's ward round access becomes read-only for this patient, audit logged |
| **Emergency escalation (ICU step-up)** | Bed transfer to ICU, patient class auto-upgraded, billing rate changes, ICU monitoring activated |
| **ICU step-down** | Transfer to general ward, de-escalate monitoring, billing rate adjusts |
| **LAMA/DAMA** | Patient leaves against medical advice — special discharge type, consent form required, incomplete treatment flagged, bill still due |
| **Death** | Death timestamp, cause recorded, body to mortuary, death certificate workflow, insurance death claim, bed → Cleaning |
| **Patient absconded** | Flag admission, alert security, close billing with outstanding balance, report to police if required |
| **Readmission within 30 days** | Flag for clinical review (potential quality issue), link to previous admission |
| **Surgery during stay** | OT booking from IPD, OT charges auto-posted, implant tracking, post-op orders |
| **Cross-department consultation** | AdmissionConsultant record, consulting doctor's visit fee posted separately |

### 3.4 Multi-Department Interactions

```
IPD ←→ Lab:        Lab orders placed from ward round → results return → charges auto-posted
IPD ←→ Pharmacy:   Medication orders → dispensed → charges auto-posted → eMAR for administration
IPD ←→ OT:         Surgery scheduled → OT charges posted → post-op orders → recovery tracking
IPD ←→ Radiology:  Imaging orders → results in EMR → charges auto-posted
IPD ←→ Finance:    Every charge → journal entry → running bill → GL
IPD ←→ Insurance:  Pre-auth → enhancement → queries → final claim → settlement
IPD ←→ Kitchen:    Diet plan → kitchen gets meal orders → delivery tracking → dietary charges
IPD ←→ HR:         Nurse scheduling → shift assignments → ward coverage
IPD ←→ Housekeeping: Bed cleaning notifications → SLA tracking → bed availability
IPD ←→ Patient App: Running bill visible → deposit status → discharge summary → follow-up
```

---

## 4. Financial Management (CRITICAL)

### 4.1 Advance Deposits & Tracking

**Current:** Deposit collected at admission with auto-generated deposit number. `PatientDeposit` model exists with Active/Applied/Refunded statuses.

**Enhancement Required:**

```
Deposit Alert System (NEW):
  → On every charge posting, calculate: total_charges / total_deposits × 100
  → At 70%: Yellow alert on running bill dashboard (info)
  → At 80%: Amber alert + WhatsApp to patient/family + notification to finance desk
  → At 90%: Red alert + popup on nurse/doctor screens + auto-block non-emergency orders
  → At 100%: Block all new charges until enhanced deposit collected (override by manager)

Enhancement Request Workflow:
  → Auto-generate enhancement request with projected additional cost
  → Send to patient app + WhatsApp with payment link
  → Track: Requested → Paid → Applied
  → If TPA patient: send enhancement pre-auth to TPA
```

**New Action:** `checkDepositConsumption(admissionId)` — called after every charge posting, returns { percentage, alert_level, recommended_enhancement_amount }

### 4.2 Package vs. Itemized Billing

**Current:** IpdPackage, IpdAdmissionPackage with apply/break-open exist. Missing: package inclusion tracking, exclusion handling, package exhaustion alerts.

**Enhanced Package Billing:**

```
Package Applied:
  → Package amount recorded as billing cap
  → All charges post individually but tagged as "within package"
  → Package utilization tracked: consumed / total
  → UI shows: Package cap, consumed, remaining

Package Inclusions (tracked in real-time):
  → Room charges: X days of General/SemiPrivate/Private
  → OT charges: Included
  → Doctor visits: X rounds included
  → Lab tests: Specific panels included
  → Medications: Standard protocol included
  → Nursing: Included

Package Exclusions (charged separately — ALWAYS itemized):
  → Implants above cap (knee implant ₹X included, if actual > ₹X, delta charged)
  → Blood products / blood bank charges
  → ICU days beyond package (e.g., package includes 1 ICU day, actual = 3)
  → Non-formulary / specialty drugs
  → Extra investigations not in protocol
  → Extended stay beyond package validity

Package Break-Open:
  → When actual charges significantly exceed package
  → Package converted to itemized billing
  → All individual charges become line items
  → Applied amount becomes a credit/adjustment
```

### 4.3 Insurance / TPA Workflow

**New Model:**
```
model InsurancePreAuth {
  id                String   @id @default(uuid())
  admission_id      String?
  patient_id        String
  policy_id         String   // FK to insurance_policies
  tpa_id            String   // FK to insurance_providers
  pre_auth_number   String?  // TPA-assigned number
  requested_amount  Decimal
  approved_amount   Decimal?
  status            String   // Submitted | Approved | PartiallyApproved | Denied | QueryRaised | Enhanced
  submission_type   String   // Planned | Emergency
  diagnosis_icd     String
  procedure_codes   Json?
  documents         Json?    // URLs to supporting documents
  queries           Json?    // Array of { query, response, timestamp }
  enhancement_history Json?  // Array of { amount, status, timestamp }
  tpa_remarks       String?
  submitted_at      DateTime @default(now())
  responded_at      DateTime?
  organizationId    String
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
}
```

**TPA Workflow:**
```
1. Pre-Auth Submission
   → Auto-generate from estimate or admission data
   → Include: patient demographics, diagnosis, procedure, estimated cost, doctor, LOS
   → Submit via TPA portal API (or manual upload)
   → Track submission timestamp, TPA reference number

2. TPA Response
   → Approved: record approved amount, conditions
   → Partially Approved: record approved amount, disallowed items
   → Query Raised: capture query, route to doctor/finance for response
   → Denied: capture reason, notify patient (billing converts to cash)

3. Enhancement (during stay)
   → If charges approaching pre-auth limit
   → Auto-generate enhancement request with updated cost projection
   → Submit to TPA with supporting documents
   → Track enhancement status separately

4. Final Claim (at discharge)
   → Generate final claim with complete bill, discharge summary, investigation reports
   → Submit to TPA
   → Track: Submitted → Under Process → Settled → Shortfall → Write-off

5. Settlement
   → TPA pays X → record against claim
   → If shortfall: patient billed for balance
   → If overpayment: refund to TPA
   → Journal entries: Dr Bank/Cr TPA AR for settlement, Dr Disallowance Expense/Cr TPA AR for shortfall
```

### 4.4 Real-Time Billing Updates

**The Auto-Posting Pipeline (the core of the financial system):**

Every billable event in the hospital must auto-post to the IPD running bill in real-time. No manual data entry. No batch jobs.

```
EVENT SOURCES → AUTO-POSTING PIPELINE → IPD RUNNING BILL

Lab test resulted       → postChargeToIpdBill(source: "lab", ref: labOrderId)
Pharmacy dispensed      → postChargeToIpdBill(source: "pharmacy", ref: rxOrderId)
OT procedure done       → postChargeToIpdBill(source: "ot", ref: procedureId)
Ward round completed    → postChargeToIpdBill(source: "doctor_visit", ref: roundId)
Nursing procedure done  → postChargeToIpdBill(source: "nursing", ref: taskId)
Blood product issued    → postChargeToIpdBill(source: "blood_bank", ref: issueId)
Radiology completed     → postChargeToIpdBill(source: "radiology", ref: orderId)
Consumable used         → postChargeToIpdBill(source: "consumable", ref: issueId)
Implant used in OT      → postChargeToIpdBill(source: "implant", ref: serialNo)
Daily room charge       → postChargeToIpdBill(source: "room", auto-accrual)
Daily nursing charge    → postChargeToIpdBill(source: "nursing_daily", auto-accrual)
Diet charges            → postChargeToIpdBill(source: "diet", auto-accrual)
Ambulance               → postChargeToIpdBill(source: "ambulance", ref: tripId)

EACH postChargeToIpdBill():
  1. Creates invoice_item with quantity, rate, tax, HSN/SAC
  2. Creates IpdChargePosting (audit: who posted, when, from which module)
  3. Recalculates invoice totals (subtotal, discount, GST, net)
  4. Updates running bill cache (for real-time display)
  5. Checks deposit consumption → triggers alert if threshold crossed
  6. Posts journal entry to GL (Dr Patient AR / Cr Revenue by service line)
```

### 4.5 Double-Entry Journal Integration

**Every IPD financial event posts a journal entry. Here are the complete IPD journal entry types:**

| Event | Debit | Credit |
|-------|-------|--------|
| Patient deposit collected (cash) | Cash | Patient Advance (Liability) |
| Patient deposit collected (card/UPI) | Bank | Patient Advance (Liability) |
| Room charge accrued | Patient AR | IPD Room Revenue (4200) |
| Nursing charge accrued | Patient AR | IPD Nursing Revenue |
| Lab test charge posted | Patient AR | Lab Revenue (4400) |
| Pharmacy charge posted | Patient AR | Pharmacy Revenue (4500) + COGS entry |
| OT/procedure charge posted | Patient AR | OT Revenue (4300) |
| Doctor visit fee posted | Patient AR | Doctor Visit Revenue |
| Ward round doctor fee (Sec 194J) | Doctor Fee Expense | TDS Payable (10%) + Doctor Payable (90%) |
| TPA pre-auth approved | (memo entry — no journal) | |
| TPA claim submitted | TPA AR (sub-ledger) | Patient AR |
| TPA settlement received | Bank | TPA AR |
| TPA disallowance | Disallowance Expense | TPA AR |
| Patient payment at discharge (cash) | Cash | Patient AR |
| Deposit applied to bill | Patient Advance | Patient AR |
| Refund to patient | Patient Advance | Cash/Bank |
| Discount given | Discount Expense | Patient AR |
| Package applied | (marks charges as package-covered, net zero) | |
| Credit note | Revenue (reversal) | Patient AR |
| Write-off (uncollectable) | Bad Debt Expense | Patient AR |

### 4.6 Refunds & Adjustments

```
Refund Scenarios:
  1. Excess deposit after discharge → auto-calculate → refund workflow → approval → payment
  2. Overcharged service → credit note → invoice adjustment → refund if already paid
  3. TPA overpayment → refund to TPA → journal entry
  4. Cancelled service → reverse charge → reduce bill → refund if deposit applied

Refund Approval Workflow:
  → Amount ≤ ₹5,000: Auto-approved
  → ₹5,001 - ₹25,000: Finance manager approval
  → > ₹25,000: CFO approval
  → All refunds: audit trail + journal entry + patient notification
```

### 4.7 Running Bill Dashboard (NEW PAGE — replaces placeholder `/ipd/billing`)

```
Running Bill Dashboard shows:
┌──────────────────────────────────────────────────┐
│ PATIENT: Rahul Kumar | UHID: AVN-2026-00042      │
│ Admission: IPD-20260410-0012 | Day 5 of ~7       │
│ Doctor: Dr. Sharma | Ward: 3A | Bed: 3A-12       │
│ Class: Semi-Private | Package: Knee Replacement   │
├──────────────────────────────────────────────────┤
│ CHARGES                          DEPOSITS         │
│ ─────────                        ────────         │
│ Room (5 days)      ₹25,000      Deposit 1: ₹1,00,000  │
│ Nursing            ₹ 7,500      Deposit 2: ₹   50,000  │
│ Doctor visits (5)  ₹ 5,000      ──────────────────     │
│ Lab tests          ₹ 8,400      Total deposits: ₹1,50,000│
│ Pharmacy           ₹12,300      Applied:       ₹0       │
│ OT charges         ₹1,20,000    Available:     ₹1,50,000│
│ Implant            ₹  85,000                            │
│ Consumables        ₹  4,200    INSURANCE                │
│ Blood bank         ₹  3,500    ─────────                │
│ ────────────────                Pre-auth: ₹2,00,000     │
│ Subtotal:          ₹2,70,900    Approved: ₹1,85,000     │
│ Package cap:       ₹2,50,000    Utilized: ₹1,70,900     │
│ Package exclusions:₹  20,900    Remaining: ₹14,100      │
│ GST:               ₹   1,295                            │
│ ════════════════                                        │
│ TOTAL DUE:         ₹  22,195   ⚠️ Deposit at 87%       │
│ Less deposits:     -₹  22,195                           │
│ BALANCE:           ₹       0                            │
└──────────────────────────────────────────────────┘
```

---

## 5. Clinical Notes & Documentation

### 5.1 Doctor Notes (Structured SOAP)

**Template for Ward Round:**
```
SUBJECTIVE:
  Chief complaint: [auto-filled from admission diagnosis]
  Patient reports: [free text]
  Pain score: [0-10 slider]
  Sleep quality: [Good / Fair / Poor]
  Appetite: [Good / Fair / Poor / NPO]
  Other concerns: [free text]

OBJECTIVE:
  Vitals summary: [auto-pulled from latest nursing vitals entry]
  NEWS score: [auto-calculated, color-coded]
  Physical exam: [structured by system or free text]
  Lab highlights: [auto-pulled — abnormal results flagged in red]
  Imaging: [latest radiology results]

ASSESSMENT:
  Primary diagnosis: [ICD-10 searchable, auto-suggested from AI]
  Secondary diagnoses: [multi-select]
  Clinical impression: [free text]
  Prognosis: [Improving / Stable / Deteriorating / Critical]

PLAN:
  Medication changes: [add/modify/stop — flows to pharmacy]
  Lab orders: [one-click panel ordering]
  Procedure orders: [if any]
  Diet change: [dropdown]
  Nursing orders: [specific tasks]
  Discharge plan: [EDD update, conditions for discharge]
  Next review: [hours dropdown: 4h / 8h / 12h / 24h / 48h]
```

### 5.2 Nurse Notes & Vitals

**Vitals Entry (optimized for speed — all on one screen):**
```
BP: [systolic]/[diastolic] | HR: [bpm] | Temp: [°C] | RR: [/min] | SpO2: [%]
Pain: [0-10] | GCS/AVPU: [dropdown] | Blood Sugar: [mg/dL] | Urine Output: [ml]
→ NEWS auto-calculated and color-coded
→ Save takes < 3 seconds (single form, all fields on one row)
```

**Nursing Note Types:**
- Assessment: Initial/daily assessment using structured form
- Observation: Free-text clinical observation
- Intervention: What was done (wound care, suction, positioning)
- Evaluation: Response to intervention
- Handover: Shift summary (auto-generated from patient data)

### 5.3 Discharge Summary (AI-Assisted Auto-Draft)

**Template (auto-populated from clinical data):**
```
PATIENT INFORMATION: [auto-filled from admission]
ADMISSION DATE / DISCHARGE DATE / LOS: [auto-calculated]
ATTENDING PHYSICIAN: [auto-filled]

DIAGNOSIS AT ADMISSION: [from admission record]
DIAGNOSIS AT DISCHARGE: [from latest ward round assessment]
PROCEDURES PERFORMED: [from OT records + procedure orders]

HOSPITAL COURSE:
  [AI-generated narrative from ward round SOAP notes, organized chronologically]
  [Includes: key clinical events, interventions, response to treatment]

INVESTIGATION SUMMARY:
  [Auto-pulled table: Lab test | Date | Result | Reference range | Flag]
  [Imaging summaries]

TREATMENT GIVEN:
  [Auto-pulled from pharmacy orders: Drug | Dose | Route | Duration]

CONDITION AT DISCHARGE: [from final ward round]

DISCHARGE MEDICATIONS:
  [Auto-populated from discharge prescription]
  Drug | Dose | Frequency | Duration | Special instructions

FOLLOW-UP:
  [Auto-booked appointment date, doctor, department]
  [Warning signs to watch for]
  [Activity restrictions]
  [Diet recommendations from final diet plan]

SIGNATURES:
  Attending Physician: _______________
  Resident/JMO: _______________
```

### 5.4 Timeline View

All clinical events displayed in a single chronological timeline per patient:
```
Apr 10, 06:00 — Vitals recorded (NEWS: 2) — Nurse Priya
Apr 10, 08:30 — Ward round — Dr. Sharma — Assessment: Improving, Plan: step down antibiotics
Apr 10, 09:15 — Lab ordered: CBC, CRP — Dr. Sharma
Apr 10, 09:45 — Medication administered: Ceftriaxone 1g IV — Nurse Priya
Apr 10, 11:00 — Lab results: CRP 12 (↓ from 45) — Auto-flagged as improving
Apr 10, 11:30 — Diet changed: Soft → Regular — Dr. Sharma
Apr 10, 14:00 — Vitals recorded (NEWS: 1) — Nurse Meera
Apr 10, 14:30 — Pharmacy dispensed: Tab Paracetamol 500mg × 10 — Pharmacist Ravi
Apr 10, 18:00 — Shift handover: Day → Evening — Nurse Priya → Nurse Anita
Apr 10, 18:15 — Vitals recorded (NEWS: 1) — Nurse Anita
...
```

---

## 6. UI/UX & Ease of Use

### 6.1 Doctor Experience (Fast, Minimal Clicks)

**Design Principles:**
- Ward round on a patient should take < 3 minutes of screen time
- All relevant data visible on one screen (no tab-switching during rounds)
- Order entry is inline — doctor doesn't leave the patient context
- AI auto-suggests: diagnosis (ICD-10), medications, lab panels based on diagnosis

**Doctor IPD Dashboard:**
```
Left panel: My Patients (sorted by ward/bed)
  → Each patient shows: Name, Bed, Day#, NEWS score (color dot), pending results count
  → Click to expand inline (no page navigation)

Right panel: Selected Patient
  → Header: Name, Age, Diagnosis, Allergies (red banner), Code status
  → Vitals trend (sparkline for last 48h)
  → Latest lab results (abnormals highlighted)
  → Current medications
  → SOAP entry form (expandable, sticky at bottom)
  → Quick actions: Order Lab | Order Rx | Request Consult | Mark Fit for Discharge
```

### 6.2 Nurse Experience (Task-Oriented)

**Design Principles:**
- Nurse sees a task list, not a patient list (tasks sorted by time urgency)
- Vitals entry is one row, one click to save
- Medication administration has BCMA-like verification flow
- Shift handover auto-generates from patient data

**Nurse IPD Dashboard:**
```
Top bar: Current shift | Ward | Nurse name | Handover button

Main view: Task Timeline (sorted by scheduled_at)
  → 06:00 — Vitals: Bed 3A-12, Rahul Kumar [overdue in red if past]
  → 06:30 — Medication: Bed 3A-14, Injection Ceftriaxone 1g IV
  → 07:00 — Vitals: Bed 3A-14, Priya Mehta
  → 07:00 — Wound care: Bed 3A-08, Suresh Singh
  → ...

Each task card:
  → Tap to expand → shows patient context + vitals form or med admin form
  → Complete → auto-records timestamp + nurse ID
  → Missed → requires reason

Right panel (on tablet/desktop): Patient detail when task selected
```

### 6.3 Admin/Manager Experience (Control + Visibility)

**IPD Manager Dashboard:**
```
KPIs: Occupancy Rate | ALOS | Avg Revenue per Bed | Bed Turnover Rate | Pending Discharges | Deposit Alerts

Real-time Bed Board: Visual map of all wards → beds → color-coded by status
Revenue Dashboard: Today's charges posted (by source module), MTD revenue, outstanding AR
SLA Monitor: Bed cleaning SLAs, discharge SLA (time from fit-to-discharge to actual discharge)
Alerts: Deposit >90%, NEWS ≥5, SLA breaches, TPA query pending, pending approvals
```

### 6.4 Smart Alerts & Reminders

| Alert | Trigger | Recipient | Channel |
|-------|---------|-----------|---------|
| NEWS ≥ 5 | Vitals entry | Doctor + Nurse-in-charge | Push + screen flash |
| NEWS ≥ 7 | Vitals entry | Doctor + RMO + ICU team | Push + SMS + alarm |
| Deposit ≥ 80% | Charge posting | Finance desk + patient/family | Push + WhatsApp |
| Deposit ≥ 100% | Charge posting | Finance desk + manager | Push + block orders |
| TPA query pending > 2h | Timer | TPA desk + doctor | Push |
| Medication due in 15 min | Timer | Assigned nurse | Push |
| Medication overdue | Timer (scheduled_time + 30 min) | Nurse + nurse-in-charge | Push + escalation |
| Lab critical value | Lab result | Doctor + nurse | Push + SMS |
| Bed cleaning SLA breach | Timer | Housekeeping supervisor | Push |
| Expected discharge tomorrow | Daily 6 PM | Doctor + nurse + finance | Push |
| LAMA/DAMA risk | Patient behavior flags | Doctor + nursing manager | Push |

### 6.5 Mobile Considerations

- Nursing station pages must work on **10-inch tablets** at bedside
- Vitals entry optimized for **one-handed phone input** (large tap targets, numeric keyboards)
- Doctor ward round works on **iPad** in portrait mode
- Token/bed display works on **wall-mounted TV** (existing token-display pattern)

---

## 7. File & Module Structure

### 7.1 Existing Pages (Keep & Enhance)

```
/app/ipd/
├── page.tsx                              ← ENHANCE: Add deposit alerts, NEWS alerts, quick-actions
├── admissions-hub/page.tsx               ← ENHANCE: Add admission type filter, EDD column
├── admission/[id]/page.tsx               ← MAJOR ENHANCE: Add timeline, orders, TPA status, EDD
├── bed-matrix/page.tsx                   ← ENHANCE: Add cleaning SLA, allocation rules
├── billing/page.tsx                      ← REBUILD: Full running bill dashboard (currently placeholder)
├── census/page.tsx                       ← KEEP: Works well
├── nursing-station/page.tsx              ← ENHANCE: Task-timeline view, priority sorting
├── nursing-station/[admissionId]/page.tsx← ENHANCE: Full nursing workspace
├── transfer/page.tsx                     ← KEEP: Works well
├── ward-rounds/page.tsx                  ← ENHANCE: Structured SOAP, inline ordering
├── diet/page.tsx                         ← ENHANCE: Meal tracking, allergy display
├── discharge-settlement/[admissionId]/   ← ENHANCE: Pre-discharge checklist, TPA settlement
```

### 7.2 New Pages (Minimal — Only Where Needed)

```
/app/ipd/
├── medication-admin/page.tsx             ← NEW P0: eMAR for nurses
├── vitals/[admissionId]/page.tsx         ← NEW P0: IPD vitals charting + NEWS
├── handover/page.tsx                     ← NEW P0: Shift handover UI
```

### 7.3 Action Files (Keep & Extend)

```
/app/actions/
├── ipd-actions.ts                ← EXTEND: Add EDD, emergency admit, nursing assessment,
│                                    vitals recording, NEWS calc, medication admin
├── ipd-finance-actions.ts        ← EXTEND: Add deposit alerts, TPA workflow, auto-posting
│                                    hooks, GL journal entries, package tracking
├── ipd-master-actions.ts         ← KEEP: Service master, tariffs, packages
├── discharge-actions.ts          ← EXTEND: Add pre-discharge checklist, medication
│                                    reconciliation, follow-up booking
```

### 7.4 New Action Files

```
/app/actions/
├── ipd-nursing-actions.ts        ← NEW: Medication admin, vitals + NEWS, nursing assessment,
│                                    care plans, shift handover, task management
├── ipd-insurance-actions.ts      ← NEW: Pre-auth CRUD, enhancement, query handling,
│                                    claim submission, settlement tracking
├── ipd-automation-actions.ts     ← NEW: Daily accrual cron, deposit alerts, EDD reminders,
│                                    interim billing triggers, auto-posting hooks
```

### 7.5 Components (Enhance Existing + New)

```
/app/components/ipd/
├── AdmissionsDataGrid.tsx        ← ENHANCE: Add EDD, NEWS badge, deposit alert icon
├── RunningBillDashboard.tsx      ← NEW: Real-time bill with charges, deposits, TPA, package
├── PatientTimeline.tsx           ← NEW: Chronological event timeline
├── VitalsChart.tsx               ← NEW: Sparkline + trending for vitals with NEWS
├── DepositTracker.tsx            ← NEW: Visual deposit consumption bar with alerts
├── PreDischargeChecklist.tsx     ← NEW: Interactive checklist component

/app/components/ipd/nursing/
├── QuickEntryConsole.tsx         ← ENHANCE: Vitals row, med admin, task completion
├── HistorySidebar.tsx            ← ENHANCE: Patient context for nurse
├── NursingActionWorkspace.tsx    ← ENHANCE: Full workspace with MAR, vitals, tasks, notes
├── MedicationAdminCard.tsx       ← NEW: Single med admin with verification flow
├── ShiftHandoverForm.tsx         ← NEW: Structured handover with auto-populated data
├── NursingAssessmentForm.tsx     ← NEW: Initial/daily assessment form
├── NEWSScoreBadge.tsx            ← NEW: Color-coded NEWS display with threshold alerts
```

### 7.6 Prisma Schema Changes Summary

**Enhanced models:** admissions (17 new fields), beds (8 new fields), ward_rounds (8 new fields), DietPlan (7 new fields), MedicationAdministration (7 new fields), ShiftHandover (5 new fields)

**New models:** InsurancePreAuth, AdmissionConsultant, NursingAssessment, IPDVitals (separate from OPD vitals — IPD vitals have NEWS scoring and higher frequency)

### 7.7 API Routes

```
/app/api/
├── discharge/[admissionId]/bill/route.ts   ← ENHANCE: Add package summary, TPA status
├── discharge/[admissionId]/pdf/route.ts    ← ENHANCE: Add structured SOAP timeline
├── ipd/daily-accrual/route.ts              ← NEW: Cron endpoint for daily charge accrual
├── ipd/deposit-alerts/route.ts             ← NEW: Cron endpoint for deposit checking
├── ipd/interim-billing/route.ts            ← NEW: Cron for 7-day interim bill generation
```

---

## 8. Advanced Improvements — Making It Industry Best

### 8.1 AI-Powered Features

| Feature | How It Works | Impact |
|---------|-------------|--------|
| **AI Discharge Summary** | Already exists (GPT). Enhance: pull structured SOAP notes, lab trends, medication timeline → narrative. Doctor reviews and edits. | Saves 20-30 min per discharge |
| **Predictive Discharge** | ML model trained on: diagnosis, LOS history, vitals trend, lab values → predicts discharge date. Updates EDD automatically. | Improves bed planning by 25-40% |
| **Sepsis Early Warning** | Beyond NEWS: AI model monitors vitals + lab trends (WBC, lactate, CRP) → alerts 24-48h before clinical sepsis. AUC > 0.85 vs qSOFA 0.64. | Life-saving; reduces sepsis mortality 18-25% |
| **Auto ICD-10 Coding** | NLP on SOAP notes → suggests ICD-10 codes for diagnosis. Doctor confirms. | Improves coding accuracy, speeds billing |
| **Smart Billing Validation** | AI checks: Is this charge consistent with diagnosis? Is the quantity reasonable? Flag outliers. | Reduces billing errors by 30-50% |
| **Readmission Risk** | ML model at discharge: predicts 30-day readmission risk based on diagnosis, comorbidities, social factors. High-risk → extra follow-up. | Reduces readmissions by 15-20% |
| **Drug Interaction Check** | At order time and at admin time: check all active medications for interactions, allergy, duplicate therapy. | Patient safety |

### 8.2 Automation

| What | How | Trigger |
|------|-----|---------|
| Daily charge accrual | Cron at midnight → `accrueIPDDailyCharges()` for all active admissions | Cron `/api/ipd/daily-accrual` |
| Deposit alert check | After every charge posting → `checkDepositConsumption()` | Event-driven |
| Interim bill generation | Cron daily → for admissions > 7 days since last interim bill → generate and notify | Cron |
| Bed cleaning notification | On discharge → WhatsApp/push to housekeeping supervisor | Event-driven |
| Pre-discharge trigger | On "Fit for Discharge" → auto-trigger checklist, notify finance, start summary | Event-driven |
| Follow-up booking | On discharge → auto-book 7-day follow-up with attending doctor | Event-driven |
| Medication reminders | 15 min before scheduled_time → push to assigned nurse | Timer-based |
| EDD reminders | Daily 6 PM → for patients with EDD = tomorrow → notify team | Cron |

### 8.3 Audit Trail

Every IPD action creates an immutable audit record:
```
{
  action: "WARD_ROUND_RECORDED",
  module: "ipd",
  entity_type: "ward_round",
  entity_id: "wr_uuid",
  details: { admission_id, doctor_id, news_score, orders_placed },
  user_id: "doctor_id",
  username: "Dr. Sharma",
  role: "doctor",
  ip_address: "192.168.1.45",
  organizationId: "org_uuid",
  timestamp: "2026-04-10T08:30:00Z"
}
```

**Audited events:** Admission, discharge, bed transfer, bed status change, ward round, medication administration (especially overrides and held meds), nursing task completion, charge posting, deposit collection, discount approval, refund, TPA submission, package break-open, doctor change, EDD change, consent recording.

---

## 9. Performance & Scalability

### 9.1 Multi-Branch

- All queries scoped by `organizationId` (exists today)
- Branch-level data isolation via row-level security
- Cross-branch patient lookup (patient is global, admission is branch-specific)
- Consolidated reporting across branches (group P&L, group occupancy)

### 9.2 Real-Time Updates

- Bed matrix: 30-second polling (exists) → upgrade to Supabase Realtime subscriptions on `beds` table
- Running bill: update after every charge posting via optimistic UI update
- Queue/alerts: Push notifications via WebSocket or Supabase Realtime
- Nursing tasks: Real-time task list with auto-refresh on completion events

### 9.3 Data Consistency

- **Atomic transactions:** Admission (bed + admission + invoice + deposit) already uses `$transaction` — extend to all multi-table operations
- **Optimistic locking:** Add `version` field to `admissions` — check version before update, reject if stale
- **Idempotent charge posting:** Each charge posting has a unique `source_module + source_ref_id` — reject duplicates
- **Invoice recalculation:** Always recalculate totals from line items — never increment/decrement

### 9.4 Concurrency Handling

**Problem:** Two nurses editing the same patient simultaneously (vitals + medication).

**Solution:**
- Field-level locking, not record-level — vitals and medication are separate tables, no conflict
- For shared resources (bed status, admission status): optimistic locking with `version` field
- UI shows "Last updated by [Name] at [Time]" on every editable section
- If conflict detected: show diff, let user choose which version to keep

---

## 10. Key Problems in Existing Systems & Our Solutions

### Research-Based Problem Analysis

| # | Problem (Industry-Wide) | Root Cause | HospitalOS Solution |
|---|------------------------|------------|---------------------|
| 1 | **49-80% of hospital bills contain errors** | Manual charge entry, no auto-posting, disconnected systems | Auto-posting pipeline: every lab/pharmacy/OT event auto-posts to IPD bill with audit trail. Zero manual charge entry. |
| 2 | **Nurses hate HMS systems** | EHR designed for billing, not nursing; too many clicks; forms that bypass clinical thinking | Task-oriented dashboard (not patient list), vitals in one row, medication admin with minimal taps, shift handover auto-generated |
| 3 | **Discharge summary takes 30-60 minutes** | Doctor writes from scratch, copies from multiple screens | AI auto-drafts from SOAP notes + labs + meds. Doctor reviews and signs in 5 minutes. |
| 4 | **Billing mismatches at discharge** | Charges lost between departments, manual reconciliation | Real-time running bill with IpdChargePosting audit trail. Every charge traceable to source event. |
| 5 | **Bed management fails during surge** | Manual tracking, no prediction, no cleaning SLA | Rules-based allocation, cleaning SLA with housekeeping notification, predictive bed availability from EDD |
| 6 | **Deposit surprise at discharge** | No real-time tracking, no alerts | Deposit consumption tracked per charge, alerts at 70/80/90/100%, auto-enhancement request |
| 7 | **TPA delays block discharge** | Manual pre-auth, no tracking, queries lost | End-to-end TPA workflow: pre-auth → enhancement → query → claim → settlement. All tracked with SLAs. |
| 8 | **Clinical notes are incomplete** | Free-text only, no structure, no auto-fill | Structured SOAP with auto-populated vitals, labs, medications. AI-suggested ICD-10 codes. |
| 9 | **No early warning for deterioration** | Vitals recorded but not scored, no automation | NEWS auto-calculated on every vitals entry, threshold-based alerts, sepsis AI prediction |
| 10 | **Medication errors** | No barcode verification, no allergy checking at admin time | eMAR with BCMA-like verification, drug-drug and drug-allergy alerts at both order and admin time |
| 11 | **Shift handover gaps** | Verbal handover, no documentation, items forgotten | Structured handover form auto-populated from patient data, sign-off by receiving nurse |
| 12 | **Package billing breaks on exclusions** | HMS can't track what's inside vs outside package | Real-time package utilization tracking, exclusions charged separately and clearly flagged |
| 13 | **Data silos between departments** | Lab, pharmacy, finance are separate systems | Single codebase, shared Prisma schema, event-driven auto-posting pipeline |
| 14 | **Month-end closing takes 3-6 weeks** | IPD charges not in GL, manual reconciliation | Every charge auto-posts journal entry to GL. Running bill = GL at all times. |

---

## 11. Implementation Strategy

### Phase 1 — Critical Foundation (Weeks 1-6)

**Goal:** Fix the P0 gaps that block production use.

| # | Task | Effort | Files |
|---|------|--------|-------|
| 1 | **Medication Administration UI** (eMAR) | 2 weeks | `ipd/medication-admin/page.tsx`, `ipd-nursing-actions.ts`, `MedicationAdminCard.tsx` |
| 2 | **IPD Vitals Charting + NEWS** | 1 week | `ipd/vitals/[admissionId]/page.tsx`, `ipd-nursing-actions.ts`, `VitalsChart.tsx`, `NEWSScoreBadge.tsx` |
| 3 | **Shift Handover UI** | 1 week | `ipd/handover/page.tsx`, `ShiftHandoverForm.tsx`, `ipd-nursing-actions.ts` |
| 4 | **Daily charge auto-accrual cron** | 2 days | `/api/ipd/daily-accrual/route.ts`, `ipd-automation-actions.ts` |
| 5 | **Auto-posting hooks** (lab → bill, pharmacy → bill) | 1 week | Modify `lab-actions.ts`, `pharmacy-actions.ts` to call `postChargeToIpdBill()` |
| 6 | **Running bill dashboard** (rebuild `/ipd/billing`) | 1 week | `ipd/billing/page.tsx`, `RunningBillDashboard.tsx`, `DepositTracker.tsx` |

### Phase 2 — Financial & Clinical Depth (Weeks 7-12)

| # | Task | Effort |
|---|------|--------|
| 7 | **Deposit alert system** | 3 days |
| 8 | **TPA/Insurance pre-auth workflow** | 2 weeks |
| 9 | **Structured SOAP for ward rounds** | 1 week |
| 10 | **Enhanced admission** (planned vs emergency, EDD, patient class) | 1 week |
| 11 | **Pre-discharge checklist + workflow** | 1 week |
| 12 | **Patient timeline view** | 1 week |
| 13 | **Package utilization tracking** (real-time) | 3 days |
| 14 | **Nursing assessment & care plans** | 1 week |

### Phase 3 — AI & Advanced (Weeks 13-18)

| # | Task | Effort |
|---|------|--------|
| 15 | **AI discharge summary enhancement** (from structured SOAP) | 1 week |
| 16 | **Sepsis / deterioration early warning AI** | 2 weeks |
| 17 | **Auto ICD-10 coding from notes** | 1 week |
| 18 | **Predictive bed management** (EDD-based) | 1 week |
| 19 | **Smart billing validation** (outlier detection) | 1 week |
| 20 | **Bed cleaning SLA + housekeeping integration** | 3 days |
| 21 | **GL journal integration** (double-entry for every IPD financial event) | 2 weeks |
| 22 | **Concurrent editing protection** (optimistic locking) | 3 days |

### Migration Strategy

Since HospitalOS is a greenfield build (not replacing a live system), migration is about **data model evolution**:

1. Run `prisma migrate` for new/enhanced models — all additions are backward-compatible (new fields are optional or have defaults)
2. Existing admissions data continues to work — new fields populate on next edit
3. Deploy Phase 1 features behind feature flags — enable per organization
4. Test with 1-2 pilot hospitals before full rollout
5. Phase 2 and 3 features ship iteratively — each deployable independently

### Risk Areas

| Risk | Mitigation |
|------|-----------|
| Nursing adoption | Involve a real nurse in UI testing from Week 1. The nurse must approve every nursing screen before it ships. |
| Billing accuracy | Write integration tests that verify: order → charge posting → invoice total → GL journal for every source module. Run on every deploy. |
| AI reliability | All AI outputs (discharge summary, ICD coding, sepsis alert) are SUGGESTIONS requiring human confirmation. Never auto-act on AI output. |
| TPA integration | TPA portals have no standard API. Start with CSV/PDF upload, build API integrations per TPA as demand grows. |
| Performance at scale | Load-test the running bill recalculation and bed matrix queries with 1000 admissions. Index `admission_id + organizationId` on all IPD tables. |

---

## Summary

This blueprint upgrades HospitalOS IPD from a functional but incomplete module to an industry-grade system that:

1. **Nurses will actually use** — task-oriented, vitals in one row, eMAR, handover, NEWS
2. **Doctors will love** — 3-minute ward round, structured SOAP, inline ordering, AI summary
3. **CFOs will trust** — real-time running bill, auto-posting pipeline, deposit alerts, GL integration
4. **CIOs will deploy** — multi-branch, concurrent editing, audit trail, Supabase Realtime
5. **Patients will appreciate** — running bill visibility, discharge summary on WhatsApp, no billing surprises

The constraint was honored: no unnecessary new pages (only 3 new pages added, all P0 nursing workflows), existing architecture preserved and extended, and every recommendation is implementable by the development team starting Monday.

---

*End of Blueprint*
