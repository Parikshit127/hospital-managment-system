# HospitalOS — Hospital Information Management System

*A unified, compliance-ready platform for end-to-end hospital operations.*

---

## At a Glance

HospitalOS is a single system that runs every part of a modern hospital — from the moment a patient walks in through the front desk to the day the books are closed in Tally. It replaces the patchwork of separate billing, EMR, lab, pharmacy, HR, and accounting tools that most hospitals operate today.

**Built for:** Multi-specialty hospitals, day-care centres, and hospital groups operating one or more units.

**Designed around:** Indian regulatory compliance (CBIC GST rules, PAN/cash thresholds, Tally integration, MLC documentation) and the workflow realities of Indian hospital staff.

### Why hospitals choose us

| | |
|---|---|
| **One system, one source of truth** | Patient data, charges, stock, and ledgers stay consistent across every department. No reconciliation between three vendors at month-end. |
| **GST-compliant out of the box** | ICU/NICU room charges automatically exempted, ₹5,000/day threshold for ward rooms, 18% for cosmetic procedures — per CBIC Notification 03/2022. |
| **Tally-ready** | Direct XML export to Tally with HSN/SAC codes, voucher type mapping, and GL ledger posting. No more manual journal entry. |
| **Multi-tenant from day one** | Run multiple hospital units under one platform with isolated data, branded portals, and per-unit reporting. |
| **Auditable** | Every cancellation, deletion, and configuration change is logged with user, role, timestamp, and reason. Ready for NABH and statutory audits. |
| **Patient-facing portal** | Patients can register, book appointments, view labs, pay bills, and access prescriptions — no separate app needed. |

---

## 1. Clinical Operations

*From the front desk to discharge, every clinical workflow in one system.*

### Front Desk & OPD
- **Walk-in registration** with automatic UHID generation and Aadhar/ABHA integration
- **Live OPD queue** with TV display for waiting rooms
- **Triage** (manual or ESI-based) with priority routing
- **Appointment booking & check-in** — self-service via patient portal or front desk
- **Token management** with configurable formats and waiting-time tracking

### Doctor's Workspace
- **Personalised queue** of waiting and consulted patients
- **EMR notes** with templates, order sets, and ICD-10 lookup
- **Prescription writing** with drug interaction checking
- **Lab and imaging orders** routed directly to the relevant department

### Inpatient (IPD)
- **Admission workflow** with package selection at entry (covers 34 pre-built IPD packages)
- **Bed matrix** — visual ward × bed grid showing live occupancy
- **Daily charge accrual** — room and nursing charges posted automatically each day; packages override line items where applicable
- **Ward rounds, vitals, medication administration, diet** — full nursing workflow
- **Discharge settlement** with mandatory clearance checklist (doctor, billing, pharmacy, summary)

### Operation Theatre (OT)
- **Surgery request → schedule → execute → bill** end-to-end
- **WHO Safe Surgery Checklist** (Sign In / Time Out / Sign Out) — surgery cannot be marked complete until all three are signed
- **Pre-Anesthesia Checkup (PAC)** captured before scheduling
- **Post-op billing** automatically posts surgeon fee, anesthesia fee, OT room charges, and consumables (including implants) to the IPD invoice

### Emergency (ER)
- **Fast-track registration** including bulk register for mass casualty events
- **MLC (Medico-Legal Case)** documentation with required fields enforced
- **Live tracking board** for ER status
- **Direct transfer** to IPD or OT with full clinical handover

### Lab
- **Sample collection** with barcode generation
- **TAT (Turnaround Time) tracking** with breach alerts (STAT / Urgent / Routine)
- **Critical value auto-alert** to ordering physician
- **Pathologist signature** on reports, with template control

### Pharmacy
- **OPD + IPD + retail dispensing** from a single inventory
- **FIFO enforcement** on batch dispensing
- **Drug interaction checking** at prescription stage
- **Narcotics register** for controlled substances
- **Purchase orders** with auto-approval thresholds, supplier ledger, and GRN
- **Expiry alerts** at 90/60/30 days

---

## 2. Financial Management & Compliance

*Hospital finance is where most HIS products break down. Ours doesn't.*

### Billing & Receivables
- **Cross-module billing** — OPD, IPD, OT, lab, pharmacy charges all flow to one invoice per patient
- **Editable line items** — billing staff can override default rates per bill when needed (with audit trail)
- **Custom services** — add ad-hoc charges without polluting the master
- **Deposit management** — IPD advance deposits with auto-adjustment at discharge
- **Cancellation with reason** — invoices, appointments, and admissions cannot be cancelled silently; mandatory reason ≥10 characters, audit logged
- **Write-off lifecycle** — separate from bill, full approval workflow

### GST Compliance (CBIC-compliant)
- **ICU / NICU / CCU rooms:** 0% GST regardless of rate
- **General ward rooms:** 0% if ≤ ₹5,000/day, 5% if > ₹5,000/day
- **Cosmetic / aesthetic procedures:** 18%
- **Healthcare services:** Exempt
- **HSN/SAC codes** mapped per service category for invoice and Tally export

### Cash Compliance (Income Tax Act)
- **PAN threshold (₹50,000)** — PAN required for cash transactions above this
- **Cash limit (₹2,00,000)** — Rule 269ST enforced
- Configurable per hospital; never hardcoded

### General Ledger & Reporting
- **Chart of Accounts** with multi-level mapping
- **Automatic GL posting** for every invoice, deposit, refund, and write-off
- **Journal entries**, **bank reconciliation**, **vendor ledger**, **expense management**
- **Daily cash closure** with denomination breakdown
- **Period locks** to prevent retro-edits after closing
- **P&L drill-down** — click any income line to see the underlying invoices

### Tally Integration *(new)*
- **Direct XML export** to Tally Prime
- **Voucher type mapping** per income head
- **GL income head mapping** — cosmetic, pharmacy, lab, IPD, OPD, OT each map to distinct ledger heads
- **Billwise tracking** with party name, GSTIN, HSN/SAC, and tax split per line
- **Eliminates** the monthly "Excel → Tally" data entry that currently takes hospital accountants 3–5 days

### Insurance / TPA
- **TPA panel management** with pre-auth tracking
- **Corporate clients** with discount schemes
- **Claim auto-submission** (configurable)
- **Package rates** per TPA — automatic application at admission

---

## 3. Patient Experience

*Patients increasingly expect the hospital to behave like a consumer app. We deliver that.*

- **Self-registration** via patient portal — fills UHID details, no front-desk wait
- **Appointment booking** — choose doctor, slot, get instant confirmation
- **Lab reports** visible to patient as soon as released
- **Prescription history** with refill option
- **Bill payment online** via Razorpay (cards, UPI, netbanking)
- **Teleconsultation** with integrated video calling
- **Ambulance request**
- **Feedback collection** at discharge
- **Health assessment forms** — pre-OPD screening, configurable per organisation
- **Multi-language ready** (English baseline; framework supports localisation)
- **Patient self-service from kiosk** — registration and payment without staff

---

## 4. Workforce & Administration

### HR & Payroll Foundation
- **Employee master** with role, department, shift assignment
- **Attendance** (manual + integration-ready for biometric)
- **Leave management** with approval workflows
- **Shift planning** (Morning / Afternoon / Night, configurable)
- **Doctor-leave specifically** — automatic appointment blocking when a doctor is on leave

### Role-Based Access Control
- **12 system roles** out of the box: admin, doctor, receptionist, lab_technician, pharmacist, finance, ipd_manager, nurse, opd_manager, hr, ot_manager, er_staff
- **Custom roles** with granular permission overrides per organisation
- **MFA (Multi-Factor Authentication)** available per user
- **15-minute inactivity timeout** for staff sessions; 30-minute for patient sessions
- **Every action audit-logged** with user, role, timestamp, organisation

### Admin Console
- **Module health dashboard** — enable / disable modules per hospital
- **Master data management** — services, doctors, departments, branches, packages
- **Branding** — per-hospital logo, colours, contact details on all printable documents
- **Templates** — prescription, discharge summary, invoice format
- **Workflow configuration** — fee structures, discount limits, deposit defaults
- **Audit log viewer** — full history with filters by user, action, module, date
- **Data import** — bulk-load patients, services, medicines from Excel

---

## 5. Security, Scale & Integrations

### Security
- **Encrypted JWT sessions** with rotation
- **Strict CSP, HSTS, X-Frame-Options** headers
- **No source maps in production**
- **Password hashing** (bcrypt)
- **Login rate-limiting** to prevent brute force
- **Secrets management** — no credentials in code
- **Tenant isolation** — every database query scoped to organisation; cross-tenant access architecturally impossible

### Scale
- **Multi-tenant** — one platform, many hospitals; each with isolated data and branded experience
- **Cloud-deployed** on Vercel (current production), with Docker images for AWS ECS and EC2 as deployment options
- **Database:** PostgreSQL via Supabase, with point-in-time recovery
- **CDN-backed** static assets
- **Designed for** 100K+ patients, 10K+ active admissions per organisation

### Integrations
- **Razorpay** — online payments
- **Tally Prime** — XML export with full GST + billwise data
- **WhatsApp Business API** — patient notifications (admit, discharge, lab ready, appointment reminder)
- **SMTP / Email** — transactional and bulk email
- **Aadhar / ABHA** — patient identity linking
- **ICD-10** — diagnosis coding
- **Zealthix** — patient assessment forms
- **SMS gateways** — OTP and notifications
- **API access** for partner integrations (custom)

---

## 6. What's Live, What's Coming

### Live in Production Today
- All clinical workflows (OPD, IPD, OT, ER, Lab, Pharmacy, Nurse, Doctor)
- Full finance suite (invoicing, deposits, GL, Tally export, cash compliance)
- Patient portal with online payments and teleconsultation
- 12 roles + custom RBAC
- Audit trail across the system
- Multi-tenant with per-hospital branding
- ~190 application screens, 90+ business workflows

### Recently Shipped (Last 30 Days)
- Tally XML export (full GST + billwise)
- GL income-head mapping with per-category posting
- Editable line items in billing
- Invoice / appointment / admission cancellation with mandatory reason
- Admin-only patient deletion with audit
- WHO surgery checklist auto-progression
- IPD package integration (34 surgical packages)

### Roadmap (Next 90 Days)
- Mobile apps (iOS + Android) for doctors and nurses
- Advanced analytics dashboard (cohort analysis, doctor performance, payer mix)
- Wider WhatsApp automation (lab-ready, follow-up, payment reminder)
- Lab and pharmacy order cancellation workflow
- NABH-aligned reporting pack

---

## 7. Why HospitalOS — Summary

| Concern | How we address it |
|---|---|
| "We have 5 different systems and they don't talk." | One platform end-to-end; no integration tax. |
| "GST and Tally take days every month." | Auto-compliant invoicing + one-click Tally XML. |
| "Doctors won't use it." | Built around their actual workflow; clean queue + EMR + prescription, not a generic form. |
| "Audits are painful." | Every change logged with user, reason, timestamp. Ready for NABH / statutory audit. |
| "We want our brand, not the vendor's." | Per-hospital branding, logo, colours on every screen and document. |
| "We may add a second unit." | Multi-tenant native — second unit is configuration, not a new deployment. |
| "Patients expect online services." | Full patient portal with payments, teleconsult, lab reports, appointments. |

---

## Next Steps

1. **Live demo** — walk through OPD admission, IPD daily charge, OT checklist, discharge bill, Tally export — in 45 minutes.
2. **Pilot on one ward** — non-disruptive parallel run.
3. **Data migration** — we ingest your existing patient master and service rate card.
4. **Training & go-live** — typically 4–6 weeks per unit.

---

*Document prepared from the live production codebase. Every capability listed is either shipped or in the immediate roadmap; nothing is speculative.*

**Contact:** [Hospital sales contact / email]
**Demo:** [Booking link or environment URL]
