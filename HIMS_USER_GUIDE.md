# 🏥 HIMS User Guide — OPD · IPD · Emergency

> **For:** Reception, Doctors, Nurses, Finance, Pharmacy, Admin
> **About:** Step-by-step usage of the Axten Hospital Management System (HIMS)

This guide covers the three patient-facing modules — **OPD** (outpatient), **IPD** (inpatient), and **Emergency** — from a staff perspective. Each section walks through the typical workflow, the screens you'll see, and the buttons that matter.

---

## 0. Getting Started

### 0.1 Logging in
1. Open the HIMS URL in any modern browser (Chrome / Edge / Firefox / Safari).
2. Enter your **username** and **password** → click **Sign In**.
3. You land on the dashboard for your role:

| Role | Default landing page |
|---|---|
| Receptionist | `/reception` |
| Doctor | `/doctor/dashboard` |
| Lab technician | `/lab/technician` |
| Pharmacist | `/pharmacy/billing` |
| Admin | `/admin/dashboard` |
| Finance | `/finance/dashboard` |
| IPD Manager | `/ipd` |
| Nurse | `/nurse/dashboard` |
| OT Manager | `/ot/dashboard` |
| ER Staff | `/er/dashboard` |
| HR | `/hr/dashboard` |

### 0.2 What you can see depends on your role
Each role has **module permissions** (e.g., a pharmacist can't see HR records). If you click a menu item and get a "Not authorized" message, your role doesn't have access — ask an admin.

### 0.3 Session timeout
You are auto-logged-out after **15 minutes of inactivity** (30 min for patient portal). Save your work often.

### 0.4 Common UI patterns
- **Search bar** at the top of every list page — searches by name / UHID / phone / invoice #
- **Tabs** along the top of detail screens (Overview, Clinical, Nursing, Billing, etc.)
- **Status badges** — color-coded: green = active/good, amber = pending, red = problem
- **Indian number formatting** everywhere — ₹2,80,000 (lakhs style)
- **"+ Add" buttons** are always top-right of their section
- **"Refresh" / "↻"** button — pulls latest data from the server

---

## 1. OPD Module (Outpatient Department)

OPD = patients who walk in for a consultation but **don't get admitted**. Most patient volume happens here.

### 1.1 Patient Registration
> **Route:** `/reception/register` | **Used by:** Receptionist

This is where every new patient gets a UHID (Unique Hospital ID).

**Steps:**
1. From reception dashboard, click **"+ Register Patient"**.
2. Fill in the registration form:
   - **Required:** Full Name, Phone, Age, Gender
   - Optional but recommended: Address, Blood Group, Aadhar, Emergency Contact, Allergies
3. Tick **Registration Consent** (legal requirement).
4. Click **Save & Generate UHID**.
5. System auto-generates a UHID like `AXT-2026-00123` and prints a registration slip.

**Repeat visits:** Search the patient by name / phone / UHID — don't re-register them.

### 1.2 Booking an Appointment
> **Route:** `/opd` or `/reception` | **Used by:** Receptionist

**Steps:**
1. On the OPD dashboard, click **"Book Appointment"**.
2. Search the patient (or register if new).
3. Pick a **department** (e.g., Cardiology, Pediatrics).
4. Pick a **doctor** + an available **slot**.
5. Collect the consultation fee (Cash / UPI / Card) → click **Confirm**.
6. Patient gets a token number. Display board (`/opd/display`) auto-updates.

### 1.3 Doctor Consultation
> **Route:** `/doctor/dashboard` | **Used by:** Doctor

The doctor sees a queue of today's patients.

**Steps:**
1. Click a patient name to open their **EHR** (Electronic Health Record).
2. Review:
   - **Vitals** (entered by nurse) — BP, pulse, temp, SpO₂
   - **Past visits** (auto-loaded)
   - **Allergies / chronic conditions** (red alerts at top)
3. Record:
   - **Chief complaint**
   - **Examination notes**
   - **Diagnosis** (ICD-10 picker available)
   - **Prescription** — drug + dose + duration + instructions
   - **Investigations** — lab tests / imaging to order
   - **Follow-up date** (optional)
4. Click **Save & Close Visit**.
5. Prescriptions auto-route to the pharmacy queue; lab orders go to the lab.

### 1.4 OPD Billing
> **Route:** `/reception` or `/billing/new` | **Used by:** Receptionist / Finance

After the consultation, the patient pays for anything beyond the basic consult (lab tests, pharmacy items, extra services).

**Steps:**
1. Pull the patient's **invoice** (auto-created when investigations / pharmacy items were ordered).
2. Review line items — add manual items if needed.
3. Apply discounts (admin approval may be needed past a threshold).
4. Collect payment → **Generate Receipt**.
5. Hand the printed receipt to the patient.

### 1.5 Lab Test Flow
> **Route:** `/lab` | **Used by:** Lab Technician

1. Lab tab shows pending sample collection list.
2. Collect sample → mark **"Sample Received"**.
3. Run tests → enter results.
4. Click **Verify & Release** — patient & doctor get the report.
5. Patient can also download the PDF from the patient portal.

### 1.6 Pharmacy Dispensing
> **Route:** `/pharmacy/billing` | **Used by:** Pharmacist

1. Pharmacy queue shows prescriptions waiting to be dispensed.
2. Click a prescription → check inventory → mark items as dispensed.
3. Collect payment if not pre-paid.
4. Hand over the medicines with instructions.

---

## 2. IPD Module (Inpatient Department)

IPD = patients who get **admitted** — overnight stays, surgeries, treatments needing observation. This module has the most depth.

### 2.1 Admission (Three Entry Points)

#### A) Planned Admission — Pre-booking
> **Route:** `/ipd/pre-admissions` | **Used by:** IPD Desk

For scheduled surgeries / planned IPD stays days in advance.

1. Click **"+ New Pre-Admission"**.
2. Search the patient (must already be registered in OPD).
3. Fill:
   - Expected admission date
   - Ward category (General / Semi-Private / Private / Deluxe / ICU)
   - Department + Doctor
   - Estimated cost
4. Save — patient gets a booking confirmation.
5. On the actual admission day, this booking converts to a real admission.

#### B) Direct Admission (most common)
> **Route:** `/ipd` → click **"+ Admit Patient"** | **Used by:** IPD Manager / Admin

1. On the IPD dashboard, click **+ Admit Patient** (top right).
2. **Search & select** the patient by name / UHID / phone.
3. Fill the form:
   - **Ward** (dropdown of wards with free beds)
   - **Bed** (dropdown of free beds in that ward)
   - **Diagnosis** (required)
   - **Doctor** (attending physician)
   - **🟢 IPD Package (Optional)** ← *the green box*
     - Pick a package from the dropdown (grouped by category: ENT, OBG, ORTHO, etc.)
     - Click **"▶ View inclusions / exclusions"** to see what's covered
     - Day-care procedures show an amber **DAY CARE** chip
   - **🟣 Initial Deposit (Optional)** — record any upfront payment
4. Click **Admit Patient**.
5. System:
   - Marks bed as **Occupied**
   - Creates an IPD invoice (`INV-...`)
   - Attaches the package (if picked) and posts ₹{package price} as a line item
   - Records the deposit (if entered)

#### C) Emergency Admission
> **Route:** `/ipd/emergency-admit` | **Used by:** ER Staff

For walk-ins who need immediate admission. Shorter form than (B).

1. Click **+ Emergency Admit**.
2. Patient lookup OR toggle **"Unknown Patient"** for unconscious / unidentified arrivals (a temp UHID is generated).
3. Capture:
   - Chief complaint
   - Doctor on call
   - Bed (any available)
   - Initial deposit (optional)
4. Click **Admit** — admission starts immediately. Full registration can be completed later by reception.

### 2.2 Package Acceptance Form
> **Route:** `/ipd/admission/[id]` → Billing tab → **"📄 Print Package Acceptance Form"**

Printable one-pager the patient/relative signs at admission. Shows:
- Patient header (name, UHID, doctor)
- Package code, category, day-care badge, price
- Full inclusions list (Room Rent, Nursing, Surgeon Fees, OT, Medicines, etc.)
- Full exclusions list (Implants, Lab Tests, Post-Discharge Meds, etc.)
- Declaration + two signature blocks (Patient and Hospital Witness)

**Tip:** Get this signed BEFORE treatment starts. Keep one copy in the patient file.

### 2.3 Bed Allocation & Transfer
> **Route:** `/ipd/bed-matrix` (visual grid) or `/ipd/transfer`

- **Bed Matrix** shows all beds as colored tiles — green=available, red=occupied, amber=under maintenance.
- Click a green tile → assign to a patient (only if their admission has no bed yet).
- For shifts (e.g., General → ICU), use **"Transfer"** → pick new ward + bed → confirms in seconds.

### 2.4 Daily Inpatient Care Workflow

Every day during the patient's stay:

| Step | Who | Where | What |
|---|---|---|---|
| **Vitals** | Nurse | `/ipd/vitals/[admissionId]` | Record BP, pulse, temp, SpO₂, pain score. Auto-calculated NEWS score badge. |
| **Nursing Assessment** | Nurse | `/ipd/nursing-assessment` | Fall risk, pressure ulcer risk, intake/output |
| **Doctor's Round** | Doctor | `/ipd/ward-rounds` | SOAP notes + plan of care update |
| **Medication Admin** | Nurse | `/ipd/medication-admin` | Confirm each dose given — logged with timestamp |
| **Diet Plan** | Nutritionist | `/ipd/diet` | Set/update meals — kitchen sees the list |
| **Handover** | Nurse | `/ipd/handover` | Shift-end note to incoming nurse |
| **Charges** | (Auto) | (Background) | Every charge a doctor/lab/pharmacy creates auto-posts to the IPD bill |

### 2.5 Auto-Billing & Package Awareness
The system auto-accrues **Room + Nursing charges** every day the patient is admitted **unless an active package covers them**.

- **No package** → Room ₹X + Nursing ₹Y added every day automatically.
- **Active package** → Room & Nursing are part of the package → **NOT** added separately for `validity_days` (default 7).
- **Stay > validity_days** → Extra days auto-billed per the spec ("Extended stay charged extra").
- **Package broken open** → Treats it like no-package; daily accrual resumes (use `/ipd/admission/[id]` → Billing → Break Open Package).

### 2.6 Viewing & Editing the Live Bill
> **Route:** `/ipd/admission/[id]` → **Billing** tab

Live IPD bill shows:
- **Stat cards:** Total / Paid / Discount / Balance Due
- **Line items grouped by category** (Package, Room, Nursing, Pharmacy, Lab, etc.)
- **Payments received**
- **Manually add charges** via the "Service Catalog" picker (search by code/name, set qty + discount → posted)

Two print buttons (also on `/ipd/discharge-settlement/[admissionId]`):
- **Print Detailed Bill** — line-by-line with GST
- **Print Summary Bill** — one row per category, clean one-pager

### 2.7 Discharge

#### Step A — Mark Fit for Discharge
> **Route:** `/ipd/admission/[id]` → **Discharge** tab

Doctor sets:
- `fit_for_discharge_at` (timestamp)
- Discharge summary (saved to `discharge_summaries`)
- Follow-up instructions
- Discharge medications

#### Step B — Clearance Checklist
> **Route:** `/ipd/clearance/[admissionId]`

IPD desk confirms:
- ☐ All pharmacy items dispensed / returned
- ☐ All lab samples collected / billed
- ☐ Dietician sign-off
- ☐ Equipment returned (oxygen, monitor, etc.)
- ☐ Patient education completed

#### Step C — Final Settlement
> **Route:** `/ipd/discharge-settlement/[admissionId]`

1. Review the final bill (Total / Paid / Balance).
2. Apply any discount (admin OTP required past a threshold).
3. Adjust deposits.
4. Submit insurance/TPA claim if applicable.
5. Collect balance (Cash / UPI / Card / Bank Transfer).
6. Click **Finalize & Discharge** → bill status flips Draft → Finalized; bed becomes Available; patient is officially out.
7. Print the **Final Bill** (or Summary) — hand to patient with prescription.

### 2.8 Post-Discharge
- **Discharge Summary PDF**: `/api/discharge/<admissionId>/pdf` — the clinical document
- **Final Tax Invoice PDF**: `/api/invoice/<invoiceId>/pdf` — for insurance / records
- **Follow-up**: Reception books the patient's OPD revisit via `/opd` (typically ~7 days later)

---

## 3. Emergency Module (ER)

ER = walk-in emergencies / accidents. Triage decides next step (OPD / IPD / Death).

### 3.1 ER Registration
> **Route:** `/er/dashboard` | **Used by:** ER Staff

1. From the ER dashboard, click **"+ New ER Case"**.
2. Capture (rapid form):
   - Patient name OR toggle "Unknown" for unconscious arrivals (temp UHID)
   - Mode of arrival (Self / Ambulance / Brought-by-Family)
   - Chief complaint
   - Time of arrival (auto-filled)
3. Click **Register & Triage**.

### 3.2 Triage
The same screen prompts you to set:
- **Triage level** (Red = Resuscitation / Orange = Emergent / Yellow = Urgent / Green = Non-urgent / Blue = Routine)
- **Vitals on arrival** (BP, HR, SpO₂, GCS)
- **Initial doctor on call**

Triage level determines bed assignment and care priority.

### 3.3 ER Orders & Notes
> **Route:** `/er/dashboard` → click a case
- Add **labs / imaging / medications** — same picker as IPD
- Record **ER notes** (doctor SOAP)
- Add **MLC (Medico-Legal Case)** if applicable — auto-prompts for FIR number, police report status

### 3.4 ER Disposition (3 outcomes)

| Outcome | Action | Route |
|---|---|---|
| **Discharge** (stable / treated) | Close case + bill | `/er/dashboard` → case → "Discharge" |
| **Admit to IPD** | Promote to inpatient | `/er/transfer/[erId]` → triggers `admitPatientIPD` |
| **Death** | Record death certificate, MLC if needed | Death tab on the case |

### 3.5 ER Billing
ER charges accrue per service exactly like IPD/OPD:
- ER registration fee (auto-posted)
- Procedures (suture, IV, oxygen)
- Lab + pharmacy
- Bed charges if stay > 4 hours

Collect at discharge via the **same `/billing/patient/[patientId]`** interface used for OPD/IPD.

---

## 4. Cross-Module Features

### 4.1 Patient Search
**Global search bar** (top of every page, keyboard shortcut: `⌘K` / `Ctrl+K`):
- Searches across patients, doctors, invoices, admissions
- Click any result to jump to the relevant page

### 4.2 Patient Financial Profile
> **Route:** `/billing/patient/[patientId]`

A single screen showing **everything financial** about one patient:
- All invoices (click row to expand → line items)
- All payments
- All deposits
- All insurance/TPA claims
- All refunds + credit notes + write-offs
- Ledger (chronological)
- Timeline (life-of-patient events)
- Audit log (who-did-what-when)

### 4.3 Financial Reports
> **Route:** `/finance/reports`

Six report types:
- **Collections** — money received by payment method
- **A/R Aging** — outstanding invoices bucketed (0-30/30-60/60+)
- **Cash Flow** — daily inflow vs outflow
- **Profit & Loss** — income by department + expenses by category (rows are **clickable** for line-by-line drill-down)
- **Insurance** — claim status summary
- **Department** — revenue by department + invoice type (OPD/IPD)

Each report has an **Export Excel** button.

### 4.4 IPD Price List Management
> **Route:** `/admin/ipd-finance` → **Packages** tab

- View all 34+ packages grouped by category (ENT, OBG, ORTHO, etc.)
- Day-care procedures show an amber **DAY CARE** chip
- Inclusions/Exclusions panel at top (collapsible)
- **+ Add Package** to create new ones (admin only)
- Edit existing packages by clicking the row (admin only)

### 4.5 Master Data (Admin Only)

| What | Where |
|---|---|
| Wards & Beds | `/admin/ipd-setup` |
| Departments | `/admin/departments` |
| Doctors | `/admin/doctors` or `/admin/master/doctors` |
| Services / Charges | `/admin/master/services` or `/admin/ipd-finance` → Service Master |
| Medicines | `/admin/master/medicines` |
| Roles & Permissions | `/admin/roles` |
| Discount Schemes | `/admin/discount-schemes` |
| Organization Branding | `/admin/settings/branding` |

---

## 5. Print & Document Outputs

| Document | Where to print | Includes |
|---|---|---|
| Patient registration slip | At `/reception/register` save | UHID, name, basic info |
| OPD prescription | Doctor consultation → Save & Print | Drugs, dose, follow-up |
| Lab report PDF | `/lab` → after verify | Test results, doctor's reference |
| OPD invoice / receipt | After billing | Tax Invoice (`Type: OPD`) |
| IPD interim bill | `/ipd/admission/[id]` → Billing tab → Print Interim Bill | Running charges |
| IPD detailed final bill | `/ipd/discharge-settlement/[id]` → Print Detailed Bill | All line items + GST |
| IPD summary bill | Same screen → Print Summary Bill | One row per category |
| Package acceptance form | `/ipd/admission/[id]` → Billing tab → Print Package Acceptance Form | Inclusions / exclusions / signature |
| Discharge summary | `/ipd/admission/[id]` → Discharge tab → Generate | Clinical doc — diagnosis, treatment, follow-up |
| Tax invoice PDF (any type) | `/api/invoice/[id]/pdf` | Full GST breakdown — for accounting |

All prints render to a browser print preview — use **Save as PDF** for digital copies.

---

## 6. Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| "Patient already admitted" | Active admission exists | Discharge or cancel the old one first |
| "Bed not available" | Race condition — someone else just assigned it | Refresh the bed matrix |
| Login redirects to "Not authorized" | Your role doesn't have access to that page | Check with admin |
| Package selector empty in admit modal | No packages seeded for your org | Run `npx tsx scripts/seed-ipd-pricelist.ts` (admin) |
| Bill shows wrong total | Auto-accrual still catching up | Click **Refresh** on the Billing tab |
| Print preview is empty/blank | Pop-up blocker | Allow pop-ups for this site |
| 404 on a patient URL | Wrong path (e.g., `/admin/patients/...` is buggy) | Use `/billing/patient/[id]` instead |

---

## 7. Roles at a Glance

| Role | Can do |
|---|---|
| **Receptionist** | Register patients, book appointments, OPD billing, collect payments |
| **Doctor** | View patient EHR, write notes / prescriptions / orders, ward rounds |
| **Nurse** | Record vitals, administer meds, nursing assessment, handover |
| **Lab Technician** | Receive samples, enter results, verify reports |
| **Pharmacist** | Dispense prescriptions, manage inventory, returns |
| **Finance** | Approve discounts / write-offs, generate reports, ledger, GL/Tally export |
| **IPD Manager** | Admit/discharge patients, allocate beds, attach packages |
| **OPD Manager** | Manage OPD queue, doctor slots, OPD-side billing |
| **OT Manager** | Schedule surgeries, OT consumables, surgery billing |
| **ER Staff** | ER registration, triage, ER orders, MLC handling |
| **HR** | Employees, attendance, leaves, payroll inputs |
| **Admin** | Everything — master data, roles, system config |

---

## 8. Need Help?

- **Tech issue / bug?** Report via `/admin/audit` or notify your system admin.
- **Workflow question?** Check this guide first → then ask your supervisor.
- **Patient complaint about billing?** Use `/billing/patient/[id]` → Audit Log tab to trace every transaction.

---

*Document version 1.0 — Axten HIMS · Generated for staff training & day-to-day reference.*
