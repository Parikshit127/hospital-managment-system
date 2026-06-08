# HIMS Module & Feature Catalogue

A reference map of every module in the Hospital Information Management System, what it does, the main screens, and the server actions that power it.

Audience: ops staff onboarding, developers picking up a module, demo guides.

---

## Quick Index

| # | Module | Path | Purpose |
|---|---|---|---|
| 1 | **OPD** | `/opd`, `/reception` | Outpatient registration, queue, billing |
| 2 | **IPD** | `/ipd` | Inpatient admissions, daily charges, ward management |
| 3 | **OT** | `/ot` | Operation theatre scheduling + WHO checklist |
| 4 | **ER** | `/er` | Emergency triage, MLC, bulk registration |
| 5 | **Lab** | `/lab` | Sample collection, technician workflow, reports |
| 6 | **Pharmacy** | `/pharmacy` | Billing, dispensing, inventory, purchase orders |
| 7 | **Finance** | `/finance` | Invoices, deposits, GL, banking, Tally export |
| 8 | **HR** | `/hr` | Employees, attendance, leave, shifts |
| 9 | **Insurance** | `/insurance` | TPA / corporate panels, pre-auth |
| 10 | **Reception** | `/reception` | Front desk: register, check-in, queue, IPD admit |
| 11 | **Doctor** | `/doctor` | Doctor queue, prescriptions, EMR |
| 12 | **Nurse** | `/nurse` | Ward dashboard, vitals, medication admin |
| 13 | **Patient Portal** | `/patient` | Patient self-service: appointments, records, payments |
| 14 | **Billing (master)** | `/billing` | Cross-module billing, manual service entry |
| 15 | **Discharge** | `/discharge` | Discharge settlement workflow |
| 16 | **Admin** | `/admin` | Org config: masters, users, settings, integrations |
| 17 | **Superadmin** | `/superadmin` | Tenant (organization) management |
| 18 | **Others** | `/crm`, `/counselling`, `/call-center`, `/kiosk`, `/print-center` | Supporting modules |

---

## 1. OPD — Outpatient

**Purpose:** Walk-in patient registration → vitals → doctor consultation → billing.

**Key screens**
- `/reception/register` — new patient registration (issues UHID)
- `/reception/queue` — live OPD queue
- `/reception/check-in` — appointment check-in
- `/reception/triage` — manual triage
- `/opd/display` — TV display for waiting room (public route)
- `/opd/billing` — OPD bill generation
- `/doctor/dashboard`, `/doctor/queue` — doctor's view of OPD patients

**Key server actions:** `opd-actions.ts`, `opd-manager-actions.ts`, `triage-actions.ts`, `reception-actions.ts`, `register-patient.ts`, `doctor-actions.ts`

**Admin config:** `/admin/opd-settings` (slot duration, fee, token format)

---

## 2. IPD — Inpatient

**Purpose:** Admit → ward/bed → daily nursing + room charges → discharge.

**Key screens**
- `/reception/ipd/admit` — admission form (patient + package selector)
- `/ipd/admissions-hub`, `/ipd/page.tsx` — active admissions list
- `/ipd/admission/[id]` — single admission detail (vitals, charges, notes)
- `/ipd/bed-matrix` — ward × bed grid view
- `/ipd/case-sheet` — clinical record
- `/ipd/billing` — IPD invoice (with the editable Add Charge modal)
- `/ipd/ward-rounds`, `/ipd/nursing-station`, `/ipd/handover` — clinical workflow
- `/ipd/discharge-settlement` — final bill + clearance
- `/ipd/medication-admin`, `/ipd/diet`, `/ipd/vitals`, `/ipd/movement` — daily care
- `/ipd/emergency-admit` — fast-path admit from ER
- `/ipd/audit-trail` — admission audit log

**Key server actions:** `ipd-actions.ts`, `ipd-automation-actions.ts`, `ipd-billing-helpers.ts`, `ipd-emr-actions.ts`, `ipd-nursing-actions.ts`, `ipd-master-actions.ts`, `ipd-finance-actions.ts`, `ipd-enhancement-actions.ts`

**Daily accrual job:** `app/api/ipd/daily-accrual` — posts room + nursing charges per admitted day

**Admin config:** `/admin/ipd-settings`, `/admin/ipd-setup`, `/admin/ipd-finance`

---

## 3. OT — Operation Theatre

**Purpose:** Surgery scheduling, pre-op checklist, intra-op note, post-op billing.

**Key screens**
- `/ot/requests` — incoming surgery requests
- `/ot/schedule`, `/ot/calendar` — OT booking
- `/ot/pac` — Pre-Anesthesia Checkup
- `/ot/checklist/[surgeryId]` — WHO Safe Surgery Checklist (Sign In / Time Out / Sign Out)
- `/ot/worklist` — today's surgeries
- `/ot/notes/[surgeryId]` — operative notes
- `/ot/billing` — post charges to IPD invoice
- `/ot/reports` — utilization, case load

**Key server actions:** `ot-actions.ts`

**Note:** Once all 3 checklist phases are signed, surgery status auto-advances to "Ready"; billing posts surgeon fee, anesthesia fee, OT room, and consumables back to the patient's IPD invoice.

**Admin config:** `/admin/ot`, `/admin/ot-setup`

---

## 4. ER — Emergency

**Purpose:** Emergency triage, MLC, bulk registration during disasters.

**Key screens**
- `/er/triage` — ESI triage
- `/er/register` — single patient register
- `/er/bulk-register` — mass casualty registration
- `/er/mlc` — Medico-Legal Case forms
- `/er/tracking-board` — live ER status board
- `/er/patient/[id]` — ER patient detail
- `/er/transfer` — transfer to IPD/OT
- `/er/billing`, `/er/reports` — billing & analytics

**Key server actions:** `er-actions.ts`

**Admin config:** `/admin/er`

---

## 5. Lab

**Purpose:** Order → sample collection → technician runs → result entry → report.

**Key screens**
- `/lab/worklist` — pending samples
- `/lab/sample` — sample registration / barcode
- `/lab/technician` — result entry
- `/lab/tests` — test master
- `/lab/inventory` — reagent stock
- `/lab/reports` — completed reports
- `/lab/dashboard` — TAT, pending, critical alerts

**Key server actions:** `lab-actions.ts`

**Admin config:** `/admin/lab`, `/admin/lab-settings`

---

## 6. Pharmacy

**Purpose:** OPD/IPD dispensing, retail billing, stock & procurement.

**Key screens**
- `/pharmacy/billing` — OTC + prescription billing
- `/pharmacy/dispense/[orderId]` — fulfill a prescription
- `/pharmacy/ip-orders` — inpatient orders queue
- `/pharmacy/orders` — all order history
- `/pharmacy/inventory` — current stock
- `/pharmacy/narcotics` — controlled substance register
- `/pharmacy/purchase-orders` — POs (with searchable medicine picker)
- `/pharmacy/purchase-invoices` — supplier invoices / GRN
- `/pharmacy/suppliers` — supplier master
- `/pharmacy/invoices` — sales invoices (new)
- `/pharmacy/returns` — returns & refunds
- `/pharmacy/reports` — sales, stock, expiry

**Key server actions:** `pharmacy-actions.ts`, `medicine-master-actions.ts`, `drug-interaction-actions.ts`, `pill-actions.ts`

**Admin config:** `/admin/pharmacy`, `/admin/pharmacy-settings`

---

## 7. Finance

**Purpose:** Invoices, deposits, ledger, banking, GST/Tally compliance.

**Key screens**
- `/finance/dashboard` — KPIs (collections, AR, write-offs)
- `/finance/invoices`, `/finance/invoices/[id]` — invoice list + detail (with cancel-with-reason)
- `/finance/deposits` — IPD advance deposits
- `/finance/payments` — payment receipts
- `/finance/refunds` — refund processing
- `/finance/credit-notes` — credit note issuance
- `/finance/collections` — outstanding collections
- `/finance/expenses`, `/finance/vendors`, `/finance/vendor-ledger` — AP side
- `/finance/journal-entries`, `/finance/chart-of-accounts` — GL primitives
- `/finance/gl-reports` — trial balance, ledger
- `/finance/bank-recon` — bank reconciliation
- `/finance/cash-closure` — daily cash closing
- `/finance/periods` — period locks
- `/finance/income-expense`, `/finance/reports`, `/finance/revenue`, `/finance/analytics` — reporting
- `/finance/integrations/tally`, `/finance/tally-export` — Tally XML export

**Key server actions:** `finance-actions.ts`, `finance-config-actions.ts`, `finance-master-actions.ts`, `gl-actions.ts`, `bank-actions.ts`, `budget-actions.ts`, `expense-actions.ts`, `deposit-actions.ts`, `writeoff-actions.ts`, `tax-actions.ts`, `tally-actions.ts`, `tally-export-actions.ts`, `dunning-actions.ts`

**Admin config:** `/admin/finance`, `/admin/finance-master`, `/admin/finance-settings`, `/admin/integrations/tally`

---

## 8. HR

**Purpose:** Employee master, attendance, leave, shifts.

**Key screens**
- `/hr/dashboard`
- `/hr/employees`
- `/hr/attendance`
- `/hr/leave`
- `/hr/shifts`
- `/hr/reports`

**Key server actions:** `hr-actions.ts`, `asset-management-actions.ts`

**Admin config:** `/admin/hr`, `/admin/doctor-leave`, `/admin/staff`

---

## 9. Insurance

**Purpose:** TPA panels, corporate clients, pre-auth, claim submission.

**Key screens**
- `/insurance` (single page, lists TPA + corporate)
- `/reception/finance/tpa-insurance`, `/reception/finance/corporates` — front desk view

**Key server actions:** `insurance-actions.ts`, `insurance-corporate-actions.ts`, `insurance-lookup.ts`

---

## 10. Reception

**Purpose:** Front desk — registration, queue, check-in, IPD admit, OPD list.

**Key screens**
- `/reception/page.tsx` — front desk dashboard
- `/reception/register` — new patient (UHID issue)
- `/reception/queue`, `/reception/token-display` — OPD queue + display
- `/reception/check-in` — appointment check-in
- `/reception/triage` — manual triage
- `/reception/appointments` — booking
- `/reception/opd`, `/reception/ipd`, `/reception/ipd/admit` — module entry points
- `/reception/patient/[id]` — patient detail
- `/reception/merge-patients` — UHID merge
- `/reception/history` — visit history
- `/reception/finance` — corporate / TPA registration

**Key server actions:** `reception-actions.ts`, `register-patient.ts`, `registration-config-actions.ts`, `uhid-merge-actions.ts`

---

## 11. Doctor

**Purpose:** Doctor's clinical workspace.

**Key screens**
- `/doctor/dashboard` — queue snapshot
- `/doctor/queue` — current OPD queue
- prescriptions, EMR notes, lab/imaging orders (sub-routes)

**Key server actions:** `doctor-actions.ts`, `doctor-group-actions.ts`, `doctor-leave-actions.ts`, `doctor-list-actions.ts`, `doctor-master-actions.ts`, `emr-actions.ts`, `prescription-gate-actions.ts`, `order-set-actions.ts`

**Admin config:** `/admin/doctors`, `/admin/doctor-leave`

---

## 12. Nurse

**Purpose:** Ward-level nursing workflow.

**Key screens**
- `/nurse/dashboard` — assigned beds, due tasks
- Vitals entry, medication administration → reads from `/ipd/medication-admin`, `/ipd/vitals`

**Key server actions:** `nurse-actions.ts`, `ipd-nursing-actions.ts`, `vitals-sync-actions.ts`

---

## 13. Patient Portal

**Purpose:** Patient self-service web app (separate auth via `patient_session` cookie).

**Key screens**
- `/patient/login`, `/patient/register`, `/patient/forgot-password`, `/patient/setup-password` — auth
- `/patient/dashboard` — overview
- `/patient/appointments`, `/patient/appointments/book` — booking
- `/patient/prescriptions`, `/patient/medicines` — meds
- `/patient/labs`, `/patient/records`, `/patient/vitals` — clinical history
- `/patient/payments`, `/patient/orders` — billing & orders
- `/patient/teleconsultation` — video consult
- `/patient/ambulance` — ambulance request
- `/patient/feedback`, `/patient/services`, `/patient/notifications`, `/patient/profile`, `/patient/settings/privacy`
- `/patient/assessment/[orgSlug]` — public health assessment form
- `/patient/organisations` — multi-org chooser

**Key server actions:** `patient-actions.ts`, `patient-history-actions.ts`, `patient-type-actions.ts`, `assessment-alert-actions.ts`, `video-call-actions.ts`, `zealthix-actions.ts`

**Admin config:** `/admin/notifications`, `/admin/registration-config`

---

## 14. Billing (Master)

**Purpose:** Cross-module billing, manual service entry, master view.

**Key screens**
- `/billing` — main billing landing
- `/billing/new` — create bill (with editable Amount column — pick service, override rate)
- `/billing/patient/[patientId]` — all bills for one patient

**Key server actions:** `master-billing-actions.ts`, `billing-engine.ts`, `service-master-actions.ts`

**Admin config:** `/admin/billing`, `/admin/billing-ordersets`

---

## 15. Discharge

**Purpose:** Final bill + clearance for IPD discharge.

**Key screens**
- `/discharge/...` — discharge workflow (routes under `app/discharge/`)
- `/ipd/discharge-settlement` — main settlement screen
- `/ipd/clearance` — clearance checklist
- `/api/discharge/[admissionId]/bill` — discharge bill PDF
- `/api/discharge/[admissionId]/summary-bill` — summary bill PDF

**Key server actions:** `discharge-actions.ts`

---

## 16. Admin

**Purpose:** Org-level configuration: masters, users, settings, integrations.

**Sub-sections**
- **Masters:** `/admin/master`, `/admin/master/services`, `/admin/doctors`, `/admin/departments`, `/admin/branches`, `/admin/staff`
- **Module config:** `/admin/opd-settings`, `/admin/ipd-settings`, `/admin/ipd-setup`, `/admin/lab`, `/admin/pharmacy`, `/admin/ot`, `/admin/er`, `/admin/hr`, `/admin/finance`, `/admin/finance-master`, `/admin/finance-settings`
- **Patients:** `/admin/patients`, `/admin/patients/[patientId]` (edit demographics, archive, delete — admin-only)
- **Settings:** `/admin/settings`, `/admin/templates`, `/admin/notifications`, `/admin/discount-schemes`, `/admin/registration-config`
- **People:** `/admin/roles`, `/admin/mfa-setup`, `/admin/doctor-leave`
- **Ops:** `/admin/dashboard`, `/admin/audit`, `/admin/analytics`, `/admin/reports`, `/admin/workflows`
- **Data:** `/admin/data-import`, `/admin/api-docs`
- **Integrations:** `/admin/integrations`, `/admin/integrations/tally`

**Key server actions:** `admin-actions.ts`, `module-config-actions.ts`, `role-actions.ts`, `audit-actions.ts`, `analytics-actions.ts`, `branding-actions.ts`, `branch-actions.ts`, `template-actions.ts`, `import-actions.ts`, `integration-actions.ts`, `notification-actions.ts`, `mfa-actions.ts`, `master-data-actions.ts`, `master-import-actions.ts`, `period-actions.ts`

---

## 17. Superadmin

**Purpose:** Cross-tenant management (separate auth via `superadmin_session` cookie).

**Key screens**
- `/superadmin/login` — separate auth
- `/superadmin/page.tsx` — tenant overview
- `/superadmin/organizations`, `/superadmin/organizations/[id]`, `/superadmin/organizations/new` — manage tenants
- `/superadmin/users` — superadmin users
- `/superadmin/plans` — subscription plans
- `/superadmin/analytics` — cross-tenant metrics
- `/superadmin/audit-log`

**Key server actions:** `superadmin-actions.ts`

---

## 18. Supporting Modules

| Module | Path | Purpose |
|---|---|---|
| **CRM** | `/crm` | Lead / referral tracking — `crm-actions.ts` |
| **Counselling** | `/counselling` | Patient counselling workflow — `counselling-actions.ts` |
| **Call Center** | `/call-center` | Outbound call log / follow-ups |
| **Kiosk** | `/kiosk` | Self-service kiosk (registration, payment) |
| **Print Center** | `/print-center` | Centralized print queue |
| **Hospital** (public) | `/hospital` | Public-facing hospital info pages |

---

## Cross-cutting Server Actions

These don't belong to one module — they're utilities used by many:

| File | Purpose |
|---|---|
| `dashboard-actions.ts` | KPI rollups for all dashboards |
| `report-actions.ts` | P&L, invoice drill-down, generic reports |
| `global-search-actions.ts` | Top-bar global search |
| `notification-actions.ts` | In-app notifications, SMS/WhatsApp dispatch |
| `alert-actions.ts` | Clinical / critical alerts |
| `approval-center-actions.ts` | Pending approvals (PO, leave, discount) |
| `cash-compliance-actions.ts` | PAN > ₹50K, cash > ₹2L rules |
| `gst-compliance-actions.ts` | CBIC GST rate logic |
| `balance-actions.ts` | Patient balance / advance lookups |
| `coordinator-actions.ts` | Care coordinator workflow |
| `dunning-actions.ts` | Auto-reminders for unpaid bills |
| `fee-receipt-actions.ts` | Receipt printing |
| `icd10-lookup-actions.ts` | ICD-10 diagnosis lookup |
| `investigation-mylist-actions.ts` | Personal "my tests" list for doctors |

---

## Key API Routes

| Route | Purpose |
|---|---|
| `/api/health` | Health check (used by deploy scripts) |
| `/api/admission/[id]/admission-form` | Admission form PDF |
| `/api/discharge/[admissionId]/bill` | Discharge bill PDF |
| `/api/discharge/[admissionId]/summary-bill` | Summary bill PDF |
| `/api/invoice/[id]/pdf` | Invoice PDF |
| `/api/invoice/[id]/summary-bill` | Invoice summary PDF |
| `/api/deposit/[id]/receipt` | Deposit receipt PDF |
| `/api/payment/[id]/receipt` | Payment receipt PDF |
| `/api/patient/[patientId]/stickers` | Patient sticker labels |
| `/api/ipd/daily-accrual` | Cron: post daily IPD room + nursing charges |
| `/api/razorpay/...` | Razorpay payment integration |
| `/api/zealthix/...` | Zealthix patient assessment |

---

## Role → Allowed Modules (from `proxy.ts`)

| Role | Modules they can access |
|---|---|
| **admin** | All |
| **doctor** | OPD, IPD, Lab, Pharmacy, Finance, Insurance, Reports, OT, ER |
| **receptionist** | OPD, IPD, Finance, Insurance, Billing |
| **lab_technician** | Lab, Reports |
| **pharmacist** | Pharmacy, Reports |
| **finance** | Finance, Insurance, Billing |
| **ipd_manager** | IPD, OPD, Lab, Pharmacy, Finance, OT, Billing, Insurance |
| **nurse** | IPD, OPD, Lab, Pharmacy, OT, ER |
| **opd_manager** | OPD, Lab, Pharmacy, Finance, Billing |
| **hr** | HR, Reports |
| **ot_manager** | OT, IPD, Pharmacy |
| **er_staff** | ER, IPD, Lab, Pharmacy |

---

## Stats (as of last commit on main)

- **Page routes:** ~190
- **Server action files:** 92
- **Top-level modules:** 18
- **Roles:** 12 system roles + custom permission overrides
- **Migrations:** Tally integration, GL billwise fields, voucher type map (latest batch)

---

*Catalogue generated by surveying `app/` directory structure, `app/actions/*.ts`, and `proxy.ts` route guards. Regenerate when modules are added.*
