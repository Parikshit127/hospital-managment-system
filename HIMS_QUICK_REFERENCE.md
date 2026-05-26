# ⚡ HIMS Quick Reference Card

> **A one-page cheat sheet for daily HIMS tasks.** Print, laminate, stick on the workstation. For the full manual, see `HIMS_USER_GUIDE.md`.

---

## 🔥 Top 20 Tasks — How to Do Them Fast

| # | Task | Click path (in 3 clicks) |
|---|---|---|
| 1 | **Register a new patient** | `/reception/register` → fill form → **Save** |
| 2 | **Find an existing patient** | Top search bar → type name/UHID/phone → click result |
| 3 | **Book OPD appointment** | `/opd` → **+ Book** → pick patient/doctor/slot → **Confirm** |
| 4 | **Start a doctor consultation** | `/doctor/dashboard` → click patient in queue → write notes → **Save** |
| 5 | **Add a prescription** | Inside consultation → **+ Add Drug** → pick drug + dose → **Save** |
| 6 | **Order a lab test** | Inside consultation → **+ Add Investigation** → pick test → **Save** |
| 7 | **Collect OPD payment** | `/reception` → patient invoice → **Collect** → method → **Receipt** |
| 8 | **Admit a patient to IPD** | `/ipd` → **+ Admit Patient** → patient + ward + bed + diagnosis + **(pick package)** → **Admit** |
| 9 | **Attach a package after admission** | `/ipd/admission/[id]` → Billing tab → ... *(via admit modal at admission time is the supported path)* |
| 10 | **Print Package Acceptance form** | `/ipd/admission/[id]` → Billing tab → **📄 Print Package Acceptance Form** |
| 11 | **Record patient vitals** | `/ipd/vitals/[admissionId]` → fill BP/Pulse/Temp/SpO₂ → **Save** |
| 12 | **Doctor ward round notes** | `/ipd/ward-rounds` → click patient → SOAP notes → **Save** |
| 13 | **Administer medication** | `/ipd/medication-admin` → click pending dose → **Mark Given** |
| 14 | **Transfer to another bed/ward** | `/ipd/transfer` → pick patient → new ward + bed → **Transfer** |
| 15 | **View IPD live bill** | `/ipd/admission/[id]` → **Billing** tab |
| 16 | **Print IPD detailed bill** | `/ipd/discharge-settlement/[id]` → **Print Detailed Bill** |
| 17 | **Print IPD summary bill** | Same screen → **Print Summary Bill** |
| 18 | **Discharge a patient** | `/ipd/discharge-settlement/[id]` → settle balance → **Finalize & Discharge** |
| 19 | **Register an ER walk-in** | `/er/dashboard` → **+ New ER Case** → fill → **Register & Triage** |
| 20 | **View patient financial profile** | `/billing/patient/[patientId]` |

---

## 🟢 Bill Types — What Shows on the Print

| Print | Header label | Best for |
|---|---|---|
| OPD invoice PDF | `TAX INVOICE` · `Type: OPD` | Outpatient consultation + lab + pharmacy |
| IPD Interim Bill | `INTERIM BILL` · `Type: IPD` | Ongoing stay — running tally |
| IPD Detailed Bill | `FINAL BILL` · `Type: IPD` | At discharge — every line item + GST |
| IPD Summary Bill | `SUMMARY BILL` · `Type: IPD` | At discharge — one row per category |
| Package Acceptance | `IPD PACKAGE ACCEPTANCE FORM` | At admission — patient signs |

---

## 📦 IPD Package Cheat Sheet

| Category | Code prefix | # packages | Range |
|---|---|---|---|
| E.N.T. | `ENT-` | 3 | ₹40k – ₹8L |
| General & Lap Surgery | `GSURG-` | 4 | ₹48k each |
| Obstetrics & Gynaecology | `OBG-` | 8 | ₹25k – ₹1.2L |
| Orthopaedics | `ORTHO-` | 3 | ₹1.3L – ₹2L |
| Urology & Nephrology | `URO-` | 6 | ₹2.8k – ₹95k |
| Vascular Surgery | `VASC-` | 2 | ₹35k – ₹70k |
| Cosmetic / Plastic | `COSM-` | 5 | ₹5.5k – ₹2.8L |
| Oncology | `ONCO-` | 3 | ₹18k – ₹4.1L |
| **Total** | | **34** | — |

**Day-care procedures** (no overnight stay): D&C, Cystoscopy, Circumcision, Dialysis, DJ Stent Removal, AV Fistula, Chemotherapy.

### What every package INCLUDES
✓ Room Rent (Day of Surgery) · Nursing Care · RMO · File Charges · Surgeon Fees · Medicines · OT

### What every package EXCLUDES
✗ Implants · Pre-tests / Consults · Lab Tests · Post-discharge meds / consults · Outsourced services (CT/MRI/USG) · Extended stay (extra ₹/day)

---

## 🔑 Roles & Common Routes

| Role | Lands on | Top 3 frequent screens |
|---|---|---|
| **Receptionist** | `/reception` | Register · Book Appointment · OPD Billing |
| **Doctor** | `/doctor/dashboard` | Patient Queue · EHR · Prescriptions |
| **Nurse** | `/nurse/dashboard` | Vitals · Med Admin · Nursing Assessment |
| **Lab Tech** | `/lab/technician` | Pending Samples · Result Entry · Verify |
| **Pharmacist** | `/pharmacy/billing` | Dispense Queue · Inventory · Returns |
| **IPD Manager** | `/ipd` | Admissions Hub · Bed Matrix · Discharge |
| **ER Staff** | `/er/dashboard` | ER Cases · Triage · MLC |
| **Finance** | `/finance/dashboard` | Reports · Patient Profile · Approvals |
| **Admin** | `/admin/dashboard` | Master Data · Roles · Settings |

---

## 🧭 Sidebar Quick Map

```
📁 OPD
   • OPD Dashboard      /opd
   • Display Board      /opd/display
   • Patient Register   /reception/register

📁 IPD
   • IPD Dashboard         /ipd
   • Admissions Hub        /ipd/admissions-hub
   • Bed Matrix            /ipd/bed-matrix
   • Pre-Admissions        /ipd/pre-admissions
   • Emergency Admit       /ipd/emergency-admit
   • Day-Care              /ipd/daycare
   • Nursing Station       /ipd/nursing-station
   • Ward Rounds           /ipd/ward-rounds
   • Vitals                /ipd/vitals/[admissionId]
   • Medication Admin      /ipd/medication-admin
   • Diet                  /ipd/diet
   • Transfer              /ipd/transfer
   • IPD Billing           /ipd/billing
   • Clearance             /ipd/clearance/[admissionId]
   • Discharge Settlement  /ipd/discharge-settlement/[admissionId]
   • Census                /ipd/census
   • Audit Trail           /ipd/audit-trail

📁 Emergency
   • ER Dashboard       /er/dashboard
   • Admin ER View      /admin/er/dashboard

📁 Lab
   • Lab Dashboard      /lab
   • Lab Technician     /lab/technician

📁 Pharmacy
   • Billing            /pharmacy/billing
   • Inventory          /admin/pharmacy/inventory
   • Orders             /admin/pharmacy/orders
   • Suppliers          /admin/pharmacy/suppliers
   • Returns            /admin/pharmacy/returns

📁 Finance
   • Dashboard          /finance/dashboard
   • Reports            /finance/reports
   • Patient Profile    /billing/patient/[patientId]
   • Master Billing     /admin/finance
   • Approvals          /admin/billing/approvals
   • Write-offs         /admin/billing/writeoffs
   • Expenses           /admin/finance (Expenses tab)
   • Tally Export       /admin/finance (Tally tab)

📁 Admin (admin role only)
   • Dashboard          /admin/dashboard
   • Patients           /admin/patients
   • Doctors            /admin/doctors
   • Staff              /admin/staff
   • Departments        /admin/departments
   • IPD Setup          /admin/ipd-setup
   • IPD Finance        /admin/ipd-finance
   • OT Setup           /admin/ot-setup
   • Master Data        /admin/master
   • Roles              /admin/roles
   • Settings           /admin/settings
   • Branding           /admin/settings/branding
```

---

## ⏱️ Status Badges — What They Mean

| Color | Meaning | Examples |
|---|---|---|
| 🟢 Green | Active / Good / Paid | Active patient, Bed Available, Invoice Paid, Lab Verified |
| 🟡 Amber | Pending / Day-Care / Warning | Awaiting approval, Day-Care procedure, NEWS score moderate |
| 🔴 Red | Critical / Failed / Overdue | Emergency triage, Bed Occupied, Invoice 60+ days overdue, Allergy alert |
| 🔵 Blue | Information / TPA / Insurance | Submitted insurance claim, TPA pending |
| ⚪ Gray | Inactive / Archived | Old appointment, Inactive doctor, Archived patient |

---

## 💰 Indian Number Formatting (always used)

| Amount | Display |
|---|---|
| 1,500 | ₹1,500 |
| 80,000 | ₹80,000 |
| 1,20,000 | ₹1,20,000 |
| 2,80,000 | ₹2,80,000 |
| 8,00,000 | ₹8,00,000 |
| 1,00,00,000 | ₹1,00,00,000 |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+K` / `⌘K` | Global search (focus the top search bar) |
| `Ctrl+P` | Print current page / open print preview |
| `Esc` | Close modal |
| `Ctrl+R` | Refresh page (browser default) |

---

## 🚨 If Something Breaks — Try This First

1. **Click "Refresh" button** in the page header — pulls fresh data.
2. **Hard-reload the browser** — `Ctrl+Shift+R`.
3. **Log out and back in** — refreshes the session cookie.
4. **Check the URL** — typos like `/admin/patients/...` vs `/billing/patient/...` are common.
5. **Pop-up blocker?** — Print PDFs open in new tabs; allow pop-ups for this site.

If none of that works → screenshot + report to your system admin.

---

## 📞 Hospital Info Shown on All Bills

- **Hospital:** Axten Hospitals
- **Tagline:** ONE MISSION. ONE NUMBER.
- **Contact:** 81 56 92 92 92
- **GSTIN:** auto-pulled from organization config

---

*One-page quick reference — Axten HIMS · v1.0 · Updated 2026-05-26*
