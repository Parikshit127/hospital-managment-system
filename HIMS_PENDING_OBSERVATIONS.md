# 📋 HIMS Pending Observations — Status & Plan

> **Generated:** 2026-05-26 · **Branch:** `main` · **Last code update:** commit `cc2e3e3`
>
> Tracks the 17-item observation list shared during UAT. Each item shows what's done, what's pending, files involved, and the next step.

---

## 🎯 Quick status

| Status | Count |
|---|---|
| ✅ Done | **4** |
| 🟡 Partial / needs validation | **3** |
| ⏳ Pending | **10** |

| # | Observation | Status |
|---|---|---|
| 1 | GST Logic Implementation | ✅ Done |
| 2 | Automatic GST Trigger Configuration | ✅ Done |
| 3 | Duplicate Admission Alert | ✅ Done |
| 4 | Pharmacy Integration | ✅ Done |
| 5 | Auto Reflection of Pharmacy Billing in IPD Bill | ✅ Done (folded into #4) |
| 6 | Official SMS & Email Notification Setup | ⏳ Pending |
| 7 | Vendor Ledger Module | 🟡 Partial — Vendor model exists |
| 8 | Expense Reflection Workflow | 🟡 Partial — Expense module exists |
| 9 | Balance Sheet Module | ⏳ Pending |
| 10 | Write-off & Credit Note Accounting Workflow | 🟡 Partial — models exist, posting incomplete |
| 11 | Tally XML Integration Testing | ⏳ Pending (export exists, untested) |
| 12 | Ledger Mapping & GST Posting Validation | ⏳ Pending |
| 13 | IPD Package Upload | ✅ Done — seed script + UI |
| 14 | Lab Rate & Master Upload | ⏳ Pending |
| 15 | Cancellation Reason Control | ⏳ Pending |
| 16 | Finance MIS Drill-Down Reports | 🟢 Done in part — P&L drill-down live |
| 17 | End-to-End UAT | ⏳ Pending — depends on others |

---

# ✅ Done items (detail)

## #1 + #2 — GST Logic & Auto-Trigger

**Source rule:** CBIC Notification No. 03/2022-CT(R) dated 13-Jul-2022 + GST Council 47th meeting healthcare clarifications.

### What was done
Created [app/lib/gst.ts](app/lib/gst.ts) — single source of truth for healthcare GST rates:

| Function | Returns | Used for |
|---|---|---|
| `getRoomGSTRate(wardType, roomRate)` | 0% for ICU/CCU/NICU/PICU/HDU; 5% if rent > ₹5,000/day; else 0% | Daily room/nursing accrual |
| `getPackageGSTRate(category)` | 18% for Cosmetic/Plastic/Aesthetic; 0% for clinical packages | `applyPackageToAdmission` |
| `getOpdGSTRate(serviceCategory)` | 18% for cosmetic OPD procedures; 0% for clinical | OPD invoice items |
| `splitGst(taxAmount, isInterState)` | CGST + SGST split for intra-state, IGST for inter-state | Final invoice totals |

### Files touched
- ✏️ [app/actions/ipd-billing-helpers.ts](app/actions/ipd-billing-helpers.ts) — `ensureIPDRoomChargesAccrued` now uses `getRoomGSTRate`
- ✏️ [app/actions/ipd-actions.ts](app/actions/ipd-actions.ts) — `accrueIPDDailyCharges` now uses `getRoomGSTRate`
- ✏️ [app/actions/ipd-finance-actions.ts](app/actions/ipd-finance-actions.ts) — `applyPackageToAdmission` now reads category from package and applies `getPackageGSTRate`
- ➕ [app/lib/gst.ts](app/lib/gst.ts) — NEW

### How to verify
- **ICU exemption:** Admit a patient to a ward of type `ICU` / `NICU` → discharge bill shows Room rows with **GST 0%** (was 5% before for rent > ₹5K)
- **Cosmetic 18%:** Attach package `COSM-027` (Bariatric ₹2,80,000) to an admission → bill shows GST = ₹50,400 (= ₹2,80,000 × 18%)
- **OPD exempt:** Any consultation invoice (`/api/invoice/<id>/pdf`) shows `Type: OPD` and 0% GST on consultation lines

---

## #3 — Duplicate Admission Alert

### What was done
Before this change, the backend rejected a second admission with an error AFTER submit. Now staff sees a prominent **red banner** the moment they pick a patient who's already admitted, and the submit button is disabled — no way to double-admit accidentally.

### Files touched
- ✏️ [app/actions/ipd-actions.ts](app/actions/ipd-actions.ts) — new server action `checkActiveAdmission(patientId)` returns the active admission with ward, bed, doctor
- ✏️ [app/ipd/page.tsx](app/ipd/page.tsx) — Admit modal:
  - Fires `checkActiveAdmission` whenever `selectedPatient` changes
  - Shows red banner with admission ID, ward, bed, doctor + "View admission →" link
  - Disables the green "Admit Patient" submit button while existing admission is detected

### How to verify
1. `/ipd` → click **+ Admit Patient**
2. Search for any already-admitted patient (e.g. Chinmay `UHID-CHINMAY-...`)
3. Banner appears with admission details + link
4. The "Admit Patient" button is grayed out

---

## #4 + #5 — Pharmacy → IPD bill auto-flow

### What was done
When a pharmacist sells medicines at the counter (`/pharmacy/billing`) to a patient who is **currently admitted**, the charges are now auto-posted as line items on that patient's active IPD bill instead of creating a separate `Pharmacy` invoice.

| Scenario | Before | After |
|---|---|---|
| Patient not admitted (OPD walk-in) | Standalone Pharmacy invoice + GL + GST register | Unchanged — same flow |
| Patient admitted, buys meds at counter | **2 separate invoices** (IPD + Pharmacy) → manual reconciliation at discharge | **1 invoice** (IPD only, with Pharmacy line items) |
| Doctor's order → pharmacy dispenses | Already routed to IPD via `dispenseMedicine` (was correct) | Unchanged |

### Files touched
- ✏️ [app/actions/pharmacy-actions.ts](app/actions/pharmacy-actions.ts) — `generateInvoice` now checks for `admissions.status = 'Admitted'` on the patient; if found, calls `postChargeToIpdBill` per item and skips standalone invoice creation. Stock deduction is unchanged. Audit log entry `PHARMACY_POSTED_TO_IPD` records the redirect.

### How to verify
1. Admit a patient (e.g. Chinmay) — gives an active admission + IPD invoice
2. Go to `/pharmacy/billing` → search same patient → add 2 medicines to cart → checkout
3. Open `/billing/patient/<UHID>` → see ONE invoice (the IPD one) with new Pharmacy line items, not two
4. `IpdChargePosting` table will have entries with `source_module = 'pharmacy'`

---

## #13 — IPD Package Upload (done earlier)

### What was done
- 34 IPD packages from the Axten price list seeded into `IpdPackage` (commit `ba670b3`)
- 7 daily/consult charges seeded into `IpdServiceMaster`
- Idempotent seed script + SQL fallback file for any DB
- Admin UI at `/admin/ipd-finance` → Packages tab with category grouping, day-care badges, inclusions/exclusions panel

### Files
- [scripts/seed-ipd-pricelist.ts](scripts/seed-ipd-pricelist.ts)
- [scripts/ipd-pricelist-seed.sql](scripts/ipd-pricelist-seed.sql)
- [scripts/lookup-org.ts](scripts/lookup-org.ts)
- [app/admin/ipd-finance/page.tsx](app/admin/ipd-finance/page.tsx)

### How to verify
```bash
npx tsx scripts/verify-ipd-pricelist.ts
# Expect: ✅ ALL CHECKS PASSED (11/11)
```

---

## #16 — Finance MIS Drill-Down (done in part)

### What was done
P&L statement on `/finance/reports` (Profit & Loss tab) has clickable rows. Click any income row → expands inline showing the underlying invoice items (patient, invoice #, type, qty, amount). Click any expense row → expands to vouchers.

### Files
- [app/actions/report-actions.ts](app/actions/report-actions.ts) — `getPnLIncomeBreakdown`, `getPnLExpenseBreakdown`
- [app/finance/reports/page.tsx](app/finance/reports/page.tsx)

### What's still needed for full #16
- **Monthly comparison view** (this-month vs last-month side-by-side)
- **Department-wise drill-down on the dashboard cards**
- **Saved/scheduled report exports** (email weekly P&L to finance head)

---

# 🟡 Partial items

## #7 — Vendor Ledger Module

### Current state
- `Vendor` Prisma model exists with full bank details, GSTIN, PAN, contact
- `Expense` model links to vendor via `vendor_id`
- `PurchaseOrder` model links to vendor
- Vendor management UI: `/admin/pharmacy/suppliers` (pharmacy-only)

### What's missing
- A unified **Vendor Ledger** screen showing per-vendor:
  - Opening balance
  - Purchases (POs + GRNs)
  - Payments made
  - Returns
  - Closing balance with date range filter
- Ageing report on vendor balances (similar to A/R Aging for patients)
- Vendor statement print

### Effort: medium (1–2 days)

---

## #8 — Expense Reflection Workflow

### Current state
- `Expense`, `ExpenseCategory` models exist
- `/admin/finance` → Expenses tab lists expenses
- Approval workflow: Pending → Approved → Paid
- Expenses appear in Cash Flow report + P&L (when status in Approved/Paid)

### What's missing
- Clearer **approval audit trail** on each expense (who approved, when, why)
- **Reimbursement workflow** (advance vs final settlement)
- Expense **attachment storage** (receipts) — schema has `attachment_url` but no upload UI
- Per-department / per-cost-center grouping

### Effort: medium (1–2 days)

---

## #10 — Write-off & Credit Note Accounting

### Current state
- `Writeoff` and `CreditNote` Prisma models exist
- UI exists at `/admin/billing/writeoffs` and Credit Notes tab on patient profile
- Write-offs reduce `balance_due` on the invoice

### What's missing
- **GL posting for write-offs** — currently doesn't hit the bad-debt expense account
- **GST reversal on credit notes** — needs to reduce the original invoice's GST liability in the GST register
- **Approval workflow** — admin OTP required past a threshold (partially present, needs auditing)
- **Tally export tagging** for write-offs / credit notes (currently bucketed as adjustments)

### Effort: medium (2–3 days)

---

# ⏳ Pending items (detail + estimate)

## #6 — Official SMS & Email Notification Setup

### What's needed
Hospital wants every patient touchpoint to trigger a notification from the **official hospital mobile/email**:
- Appointment booked / reminded / cancelled
- Admission confirmation
- Discharge summary ready
- Lab report ready
- Bill / receipt
- Follow-up reminder
- Birthday / health-checkup nudge

### Current state
- `MessageDeliveryLog` model exists
- `WhatsAppIncomingMessage` / `whatsapp_log` models exist
- AiSensy integration partially wired (`COMBIRDS_BASE_URL`, `AISENSY_API_KEY` in env)
- SMTP env vars present but unused in most flows

### Effort
- SMS: 1 day if AiSensy templates are ready
- Email: 1 day to wire `nodemailer` into the 7 touchpoints
- Officials sign-off + DLT-approved SMS templates: external dependency

---

## #9 — Balance Sheet Module

### What's needed
A proper **Balance Sheet** report at `/finance/balance-sheet`:
- Assets (Cash + Bank + Receivables + Fixed Assets + Inventory)
- Liabilities (Payables + Loans + Deposits Held + GST Payable)
- Equity (Capital + Retained Earnings)
- As-of-date filter
- Drill-down to GL accounts

### Current state
- GL_Account / GL_JournalEntry / GL_JournalLine models exist and posting is wired
- No B/S report page yet
- Trial Balance partially derivable from GL

### Effort: medium (2–3 days) — depends on GL completeness

---

## #11 — Tally XML Integration Testing

### Current state
- `TallyExport` model exists
- Export route at `/api/tally-export/...`
- XML generation present in `app/actions/tally-export-actions.ts`

### What's missing
- End-to-end test with a real Tally instance — confirm voucher types, ledger names, GST splits, and HSN/SAC line items reconcile
- Tally template alignment (Tally Prime vs Tally ERP 9 — slightly different XML schemas)
- Error handling for partial imports

### Effort
- Testing: 1 day with a Tally setup
- Schema fixes: 0–1 day based on test findings

---

## #12 — Ledger Mapping & GST Posting Validation

### What's needed
- Map every revenue head (IPD, OPD, Pharmacy, Lab, Procedure, Cosmetic, etc.) to its GL ledger
- Map every GST rate to the corresponding GST liability ledger (CGST 2.5/6/9, SGST 2.5/6/9, IGST 5/12/18)
- Validate posting: every invoice with GST must create a 3-leg journal entry:
  1. Cash/Receivable (Dr) for full amount
  2. Revenue (Cr) for net
  3. GST Payable (Cr) for tax
- Reconcile GST_Invoice_Register monthly against GL

### Current state
- `GL_Account`, `GL_JournalEntry`, `GL_JournalLine` models exist
- Auto-posting in `postInvoiceToGL` but reads ledger codes from env vars — needs verification

### Effort: medium (2 days) + finance team sign-off

---

## #14 — Lab Rate & Master Upload

### What's needed
- Lab test master with rates per test (currently sparse)
- Bulk Excel/CSV upload
- Reference ranges, sample type, turnaround time per test
- Lab panels (e.g. CBC + LFT + KFT combo at discount)

### Current state
- `lab_test_inventory` model exists with `default_rate`
- `LabPanel` + `LabPanelTest` models for panels
- UI: `/admin/lab-settings` (basic)

### Effort
- CSV importer: 1 day
- Sample data sheet collation by lab team: external dependency

---

## #15 — Cancellation Reason Control

### What's needed
- **Mandatory** cancellation reason on:
  - OPD appointment cancellation
  - Admission cancellation
  - Invoice cancellation
  - Lab order cancellation
  - Pharmacy order cancellation
- Predefined reason picklist + free-text fallback
- Reason visible on the cancelled record and in audit
- Cancellation rate report (already partially in OT — needs extending)

### Current state
- Most schemas have a `cancelled_reason` field (nullable)
- UI usually doesn't enforce it

### Effort: small (1 day to enforce across all 5 cancellation paths)

---

## #17 — End-to-End UAT

### Scope
A full UAT pass against this checklist, organized as scenarios:

1. **Patient lifecycle:** Register → OPD → Lab → Pharmacy → Discharge → Follow-up
2. **IPD lifecycle:** Pre-admit → Admit → Daily care → Discharge → Final bill → Insurance claim
3. **OT lifecycle:** Surgery request → Approve → Schedule → PAC → Checklist → Notes → Bill
4. **ER lifecycle:** Triage → Treatment → Admit/Discharge → MLC if applicable
5. **Finance lifecycle:** Collect → Refund → Write-off → Credit Note → GL → Tally export → P&L → B/S
6. **GST lifecycle:** Generate invoice → GST register → Monthly return → Reconcile with GL
7. **Edge cases:** Death, LAMA, package break-open, partial discharge, insurance denial, refund chain

### Pre-requisites
- All 16 above closed
- Sample data set seeded for each scenario
- Test users for each role
- UAT signoff document with pass/fail checkboxes per scenario

### Effort
- UAT prep: 2 days
- UAT execution: 3–5 days with finance + clinical team
- Post-UAT fixes: depends on findings

---

# 🚦 Recommended priority order

Suggested sequence to maximize value per day of work:

| Priority | Item | Why first |
|---|---|---|
| **P0** | #15 Cancellation Reason | Smallest, biggest audit win |
| **P0** | #12 Ledger Mapping + GST Posting Validation | Blocks #11 and #9 |
| **P1** | #11 Tally Integration Testing | Required for finance team go-live |
| **P1** | #14 Lab Rate Upload | Often a blocker for OPD billing accuracy |
| **P1** | #6 SMS/Email Notifications | High user-visible impact, modest effort |
| **P2** | #9 Balance Sheet | Big visible deliverable — depends on #12 |
| **P2** | #7 Vendor Ledger | Important for purchase + payable side |
| **P2** | #8 Expense Workflow polish | Polish on existing module |
| **P2** | #10 Write-off / Credit Note posting | Finance-critical for clean books |
| **P3** | #16 MIS extensions | Already partially there; nice-to-have |
| **P3** | #17 Full UAT | Last — depends on everything else closing |

---

# ✅ Items signed off / shippable now

After this commit (`cc2e3e3`) lands on production, the following are **production-ready**:

- ✅ Indian GST compliance for room rent (ICU exemption + ₹5K rule)
- ✅ Indian GST compliance for cosmetic procedures (18%)
- ✅ Indian GST exemption for clinical OPD / IPD services
- ✅ Duplicate admission prevention (UI + backend)
- ✅ Pharmacy → IPD bill auto-routing
- ✅ IPD package catalog (34 packages seeded, admin-manageable)
- ✅ P&L statement with line-by-line drill-down

---

*Document version 1.0 — Axten HIMS Pending Observations Tracker · Last updated 2026-05-26*
*Maintained alongside `HIMS_USER_GUIDE.md` and `HIMS_QUICK_REFERENCE.md`*
