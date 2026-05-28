# 🛣️ HIMS Next Steps — Tally + UAT + Larger Items

> Companion to `HIMS_PENDING_OBSERVATIONS.md`. Tracks remaining bigger-scope items that need either external coordination (Tally Prime test instance, finance team sign-off) or full-day effort blocks.
>
> **Last updated:** 2026-05-28

---

## 1. Tally XML Export Hardening

### Current state
- ✅ Schema: `TallyExport` model exists with `voucher_count`, `xml_data`, `status` fields
- ✅ Server: `generateTallyXML()` action in `app/actions/tally-export-actions.ts` creates the export row and produces XML
- ✅ UI: `/finance/tally-export` lets user pick date range + export type, click Generate, download XML
- ✅ Sample output file exists: `exports/tally/TALLY-2026-0004_full.xml` (3,146 lines — proves it generates)

### Gaps (from earlier audit)
1. **No `<MASTER>` ledger section** — Tally Prime import will fail if the receiving Tally instance doesn't already have ledgers (`Sales Account`, `Sundry Debtors`, `CGST Output`, `SGST Output`, `IGST Output`, `Cash`, `Bank`) pre-created. Production-grade exporters always emit a `<MASTER>` block first.
2. **GST split not in vouchers** — invoice tax exists in our DB (CGST 9%, SGST 9% for 18%, etc.) but isn't broken into separate ledger entries in the XML. Each tax rate should map to its specific ledger.
3. **HSN/SAC missing on line items** — every `<INVENTORYENTRIES>` should have `<HSNCODE>` for tax compliance.
4. **Only Sales vouchers in current sample** — Expense → Purchase vouchers, Payment → Bank vouchers, Receipt → Bank vouchers are needed for a complete book.

### Plan (4-6 hours actual coding)
1. Add `<TALLYMESSAGE><LEDGER>` blocks at top — one per required ledger with `<PARENT>` (Sales Accounts / Duties & Taxes / Bank Accounts / etc.)
2. In each `<VOUCHER>`, split the tax into multiple `<LEDGERENTRIES>` rows (one per tax ledger)
3. Add `<HSNCODE>` to `<INVENTORYENTRIES>` from `invoice_items.hsn_sac_code`
4. Generate Purchase / Payment / Receipt vouchers from `Expense`, `payments` tables
5. Add a tiny "Tally schema version" toggle on the UI (Tally Prime vs Tally ERP 9) — they differ slightly

### Prerequisite
- Real Tally Prime / ERP 9 instance for testing import
- Finance team sign-off on the ledger names (must match their chart of accounts)

### Tracking link
File header in `app/actions/tally-export-actions.ts` should get a `TODO: see HIMS_NEXT_STEPS.md §1` comment before pickup.

---

## 2. Ledger Mapping + GST Posting Validation

### Why this blocks Tally
The GL is the source of truth. If our journal entries are wrong (or missing), the Tally export will perpetuate the error. Validating GL first → then exporting to Tally → then UAT.

### Plan (2 days)
1. **Inventory revenue heads** — list every code path that creates revenue: OPD consult, IPD daily charges, IPD package, OT charges, Pharmacy, Lab, Diagnostics, Insurance share, Corporate share, TPA settlement, Refunds, Write-offs, Credit Notes. ~20 paths.
2. **Define ledger mapping** in `app/lib/gl-mapping.ts` (new file): `Map<revenue_head, ledger_code>`
3. **Audit every `createJournalEntry()` call** — confirm:
   - Sum(debits) = Sum(credits)
   - GST split correctly into CGST/SGST/IGST liability ledgers
   - Patient receivables increase on bill, decrease on payment
4. **Reconciliation script** — `scripts/validate-gl-against-invoices.ts`:
   - For each invoice in last 30 days, recompute expected debits/credits
   - Compare with actual journal entries — flag mismatches
5. **Finance sign-off** — share the mapping spreadsheet with the finance head, get formal approval

### Prerequisite
- Finance team must commit to a chart-of-accounts version (they're using SOMETHING in Tally currently; we have to match)

---

## 3. Lab/Pharmacy Order Cancellation (extending #15)

The latest cancellation-reason pattern (commit `b289de4`) covers:
- ✅ Invoices (`cancelInvoice`)
- ✅ OPD Appointments (`cancelAppointment` — now with 10-char + audit)
- ✅ IPD Admissions (`cancelAdmission` — already had audit, now 10-char min)

Still missing:
- ❌ Lab orders (`lab_orders` table has no `cancellation_reason` field, no `cancel*` action)
- ❌ Pharmacy orders (`pharmacy_orders` table has no `cancel*` action)

### Plan (2-3 hours)
1. Schema: add `cancellation_reason String?` + `cancelled_at DateTime?` + `cancelled_by String?` to both models (3 nullable columns each — safe migration)
2. Server actions:
   - `cancelLabOrder(orderId, reason)` in `lab-actions.ts`
   - `cancelPharmacyOrder(orderId, reason)` in `pharmacy-actions.ts`
   - Both: ≥10-char reason, audit log, status → 'Cancelled', no-op if already cancelled
3. UI:
   - Lab order page / list: add Cancel button + modal
   - Pharmacy order page / list: same pattern
4. Test cancellation regenerates / refunds where applicable (e.g., cancelling a pharmacy order should release reserved stock)

### Why deferred
Schema migrations need running `prisma migrate dev` against the live DB. Lower urgency than the audit-critical paths (invoices, admissions, appointments) which are already done.

---

## 4. SMS / Email — Wire Remaining Events

### Already wired (via `notify-patient.ts`)
- ✅ Registration welcome
- ✅ Appointment booked
- ✅ Prescription issued
- ✅ Lab report ready
- ✅ Discharge
- ✅ **Appointment cancelled** (just added — SMS only)

### Pending wires
- ⏳ Appointment reminder (24h / 2h before) — needs a cron job
- ⏳ Invoice / bill ready (after finalize)
- ⏳ Payment received receipt
- ⏳ Follow-up reminder (X days after discharge)
- ⏳ Pill reminder time-of-day (cron)
- ⏳ Birthday / annual health checkup nudge

### Effort
- Each wire: 30 min
- Plus cron infrastructure for time-based reminders: 2-3h (env: `CRON_SECRET` already configured)

### Plan
1. Add reminder events to `notify-patient.ts` event type union
2. Create `/api/cron/appointment-reminders` endpoint that sweeps tomorrow's appointments at 9am daily
3. Wire `notifyPatient({ type: 'invoice' })` into `finalizeInvoice()` action
4. Document the cron schedule in `vercel.json` / external scheduler

---

## 5. End-to-End UAT

### Pre-requisite check
| Need | Status |
|---|---|
| All P0 features done | ✅ Yes |
| Sample data seeded | ✅ Yes (Chinmay, Prince, 34 packages, 7 services) |
| Roles available | ✅ Admin, Receptionist, Doctor, Nurse, Finance, IPD Manager, ER Staff, OT Manager, HR exist |
| Test users for each role | ⚠️ Verify in `/admin/staff` — may need to create dummies |
| Tally instance | ❌ Need real Tally Prime/ERP for §1 test |
| Finance team sign-off | ❌ Need scheduled review |

### Scenarios to walk through (8-10 scenarios, 30-45 min each)
1. **OPD lifecycle** — Register → Appointment → Consult → Lab → Pharmacy → Bill → Receipt
2. **IPD lifecycle** — Admit → Daily care → Package attach → Pharmacy at counter → Final bill → Discharge
3. **OT lifecycle** — Request → Approve → Schedule → PAC → Checklist (all 3 phases) → Notes → Bill posts to IPD ⭐ (the gap we just closed)
4. **ER lifecycle** — Walk-in → Triage → Treatment → Disposition (admit / discharge / death) → MLC if RTA
5. **Finance lifecycle** — Collect payment → Refund → Write-off → Credit Note → Trial Balance → P&L
6. **Cancellation lifecycle** — Cancel each: Appointment, Admission, Invoice → verify mandatory reason + audit
7. **Edge cases** — Death · LAMA · Package break-open · Partial discharge · Insurance denial · Refund chain
8. **GST scenarios** — General ward ≤₹5K (0%), General ward >₹5K (5%), ICU at any rate (0%), Cosmetic package (18%), OPD consult (0%)
9. **Multi-role audit** — Receptionist edits patient (✅), tries to delete (❌ admin only), Admin deletes (✅)
10. **Tally export & import** — Generate XML, attempt import to test Tally, reconcile

### Effort
- UAT prep: 2 days (test data sheet, scenario walk-throughs, sign-off checklist)
- UAT execution: 3-5 days (with finance + clinical team)
- Post-UAT fixes: depends on findings — budget 1-2 days

---

## Recommended sequence

| Priority | Item | Effort | Blocks |
|---|---|---|---|
| **P0** | #2 Ledger Mapping + GST validation | 2 days | #1, #5 |
| **P1** | #1 Tally XML hardening | 4-6h | #5 (Tally portion) |
| **P1** | #3 Lab/Pharmacy cancellation | 2-3h | nothing |
| **P2** | #4 Notification wiring (3 most-needed events) | 2-3h | nothing |
| **P2** | #5 Pre-UAT data prep | 2 days | #5 execution |
| **P3** | #5 UAT execution | 3-5 days | go-live |

---

## What's already shipped this session

- Patient demographics editable + admin-only delete/archive
- Cancel invoice with mandatory reason + audit
- Cancel appointment / admission tightened (≥10 char reason, audit)
- Appointment cancel SMS notification
- PO button working
- "Dr Dr" duplicate prefix fix
- OT checklist auto-advances to "Ready" when all 3 phases signed
- OT charges actually post to IPD invoice (was fake before — silent revenue loss)
- P&L inline drill into invoice line items
- Searchable Master Service picker in /billing/new
- Custom item entry in /billing/new
- Duplicate Room/Nursing prevention + audit
- ICU/CCU/NICU GST exemption + ₹5K threshold + cosmetic 18%
- Pharmacy → IPD bill auto-flow
- Duplicate-admission alert
- IPD package catalog (34 packages + admin UI)

---

*Maintained by the engineering team. Update this doc when a §item is started, completed, or moved.*
