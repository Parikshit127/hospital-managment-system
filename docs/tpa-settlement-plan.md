# TPA Settlement Workflow — Implementation Plan

## 1. Current state summary

- **TPA approved amount is correctly NOT counted as paid at discharge.** `settleAndDischarge()` writes `tpa_payable = approved` and `tpa_claim_status = 'approved'` without creating a payment row (`app/actions/ipd-finance-actions.ts:807-816`).
- **Invoice `balance_due` formula ignores TPA entirely** — it is `net_amount - paid_amount` (`app/actions/finance-actions.ts`, `ipd-finance-actions.ts:844-855`). This means the outstanding shown on bills/dashboards bundles TPA receivable + patient co-pay into one number.
- **Discharge UI correctly splits the math in display only.** `balanceDue = netBill - priorPayments - depositsToApply - tpaApprovedAmount` and renders "PATIENT PAYS NOW (CO-PAY)" with a separate "TPA outstanding" row (`app/ipd/discharge-settlement/[admissionId]/page.tsx:82, 252-299`). This split exists only in the discharge screen; nothing downstream knows about it.
- **`tpa_settled_amount` is overwrite-only, never accumulated** (`app/actions/insurance-corporate-actions.ts:187`, `app/actions/billing-engine.ts:216`). Partial TPA payments will clobber prior settlements.
- **Master billing dashboard has no TPA-specific columns or actions** — no Approved/Settled amounts, no "Mark TPA Received" button (`app/billing/page.tsx:185, 385-451`, `app/components/finance/BillingMasterDashboard.tsx:372-374`).
- **Receipts and PDFs never query TPA state.** `payment.status` and `invoice.balance_due` drive badges and amounts; a TPA-approved-pending bill renders identical to a fully cash-settled bill, with the full TPA amount shown in red as "Balance Due" (`app/api/payment/[id]/receipt/route.ts:207-247`, `app/api/invoice/[id]/pdf/route.ts:108-120`, `app/lib/bill-branding.ts`).
- **Two parallel state systems exist** — `invoices.tpa_claim_status` (string enum used by IPD discharge) and `insurance_claims.status` (used by the formal claims tracker, has full state machine + auto-payment via `updateClaimStatus()` at `app/actions/insurance-actions.ts:335-431`). The IPD flow does not create `insurance_claims` rows.
- **Dead enum values:** `under_review`, `rejected`, `partially_settled` are defined on `tpa_claim_status` but never written by any code path (`prisma/schema.prisma:1133-1214`).

## 2. Gaps vs requirement

1. **No "approved amount" persistence distinct from `tpa_payable`.** Today `tpa_payable` doubles as both "split allocation" and "approved amount". They can diverge (insurer approves less than payable). Lives in `app/actions/ipd-finance-actions.ts:807-816`.
2. **No action to record actual TPA money received.** `updateTpaClaimAction()` (`app/actions/insurance-corporate-actions.ts:186`) overwrites `tpa_settled_amount` and does NOT create a `payments` row. Bill never moves to Paid even after TPA pays.
3. **`balance_due` does not reflect TPA-approved receivable.** Invoice shows full outstanding regardless of TPA approval; master dashboard outstanding column (`app/actions/master-billing-actions.ts:286`) is misleading.
4. **No UI surface to mark TPA payment received.** Master billing dashboard (`app/components/finance/BillingMasterDashboard.tsx`) and `app/billing/page.tsx:437-451` only expose Edit/Cancel.
5. **Receipts/PDFs render TPA bills as if cash.** `app/api/payment/[id]/receipt/route.ts:243`, `app/api/invoice/[id]/pdf/route.ts`, `app/api/invoice/[id]/summary-bill/route.ts`, `app/api/discharge/[admissionId]/bill/route.ts:59-88` — none query `tpa_claim_status` or split patient-vs-TPA outstanding.
6. **No status badge for "TPA Approved – Awaiting Settlement".** `ClaimBadge` exists in master grid (`app/billing/page.tsx:399`) but no visual differentiation on bills/receipts.
7. **Partial TPA settlements not modeled.** Overwrite semantics on `tpa_settled_amount` mean a ₹40k partial then ₹60k second tranche loses the first.
8. **No audit trail for TPA payment receipt.** No entry in `audit_logs` when TPA status flips to settled.

## 3. Target state machine

```
                       ┌──────────────────────────────────────────────────────┐
                       │              TPA Invoice Lifecycle                    │
                       └──────────────────────────────────────────────────────┘

  [NotSubmitted]                  [Submitted]                  [Approved]
  ──────────────                  ───────────                  ──────────
  tpa_claim_status:               tpa_claim_status:            tpa_claim_status:
    'not_submitted'                 'submitted'                  'approved'
  invoices.status:                invoices.status:             invoices.status:
    'Unpaid'/'PartiallyPaid'        unchanged                    unchanged
  tpa_approved_amount: 0          tpa_approved_amount: 0       tpa_approved_amount: X
  tpa_settled_amount:  0          tpa_settled_amount:  0       tpa_settled_amount:  0
  balance_due = net - paid        balance_due = net - paid     balance_due = net - paid
                                                               (still shows TPA owed)

       │                                │                              │
       │  submitTpaClaimAction()        │  settleAndDischarge()        │  recordTpaPayment()
       │                                │  with tpa_approved_amount    │  (one-click from dashboard)
       ▼                                ▼                              ▼

                                                                 ┌─────────────────────┐
                                                                 │  Partial vs Full?   │
                                                                 └─────────────────────┘
                                                                       │           │
                                                       received < approved   received >= approved
                                                                       │           │
                                                                       ▼           ▼

                                                          [PartiallySettled]    [Settled]
                                                          ──────────────────    ────────
                                                          tpa_claim_status:     tpa_claim_status:
                                                            'partially_settled'   'settled'
                                                          invoices.status:      invoices.status:
                                                            recomputed            'Paid' if patient
                                                                                  share also clear
                                                          tpa_settled_amount    tpa_settled_amount
                                                            += amount             = approved
                                                          payments row CREATED  payments row CREATED
                                                                                receipt fires

  Off-ramp (any state → Rejected):
    [Rejected] tpa_claim_status: 'rejected', tpa_approved_amount: 0,
               tpa_payable cleared, patient becomes liable for full balance.
```

**Semantic rules:**
- `tpa_approved_amount` (new field): immutable record of what TPA promised.
- `tpa_settled_amount`: running total of money actually received (accumulator, not snapshot).
- `tpa_payable`: kept = `tpa_approved_amount - tpa_settled_amount` (outstanding TPA receivable).
- `balance_due`: ALWAYS `net_amount - paid_amount` (paid_amount now includes TPA payment rows once received).
- `invoices.status`: derived from `balance_due` AND `tpa_claim_status` — goes to `Paid` only when `balance_due <= 0.01` AND (`tpa_claim_status IN ('settled','not_submitted')` OR no TPA involved).

## 4. Schema changes

**One new field needed.** Justification: `tpa_payable` currently means "promised by TPA" at discharge time, but once partial payments arrive we need a stable "originally approved" anchor to compute outstanding. Without it the math collapses when TPA pays in tranches.

```sql
-- prisma/migrations/<timestamp>_tpa_approved_amount/migration.sql
ALTER TABLE "invoices"
  ADD COLUMN "tpa_approved_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tpa_approved_at" TIMESTAMP(3),
  ADD COLUMN "tpa_settled_at" TIMESTAMP(3);

-- Backfill existing approved rows so legacy bills don't show NaN
UPDATE "invoices"
SET "tpa_approved_amount" = "tpa_payable" + "tpa_settled_amount"
WHERE "tpa_claim_status" IN ('approved','settled','partially_settled')
  AND "tpa_approved_amount" = 0;

UPDATE "invoices"
SET "tpa_approved_at" = "updated_at"
WHERE "tpa_claim_status" IN ('approved','settled','partially_settled')
  AND "tpa_approved_at" IS NULL;
```

**Prisma schema** (`prisma/schema.prisma` invoices model):

```prisma
tpa_approved_amount   Decimal   @default(0) @db.Decimal(12, 2)
tpa_approved_at       DateTime?
tpa_settled_at        DateTime?
```

## 5. Server actions to add or modify

### 5.1 MODIFY: `settleAndDischarge`
- **File:** `app/actions/ipd-finance-actions.ts:672-928`, behavior change at lines 807-816.
- Write `tpa_approved_amount`, `tpa_approved_at` alongside existing `tpa_payable + tpa_claim_status='approved'`.
- Add audit log entry `action: 'tpa_claim_approved'`.

### 5.2 NEW: `recordTpaPaymentReceived`
- **File:** `app/actions/insurance-corporate-actions.ts`
- Signature: `({invoice_id, amount_received, received_date, payment_method, reference_number, remarks?, received_by, is_partial?})`
- Behavior: row-lock invoice, validate status ∈ {approved, partially_settled}, accumulate `tpa_settled_amount`, create payments row, recompute `paid_amount + balance_due + status`, flip `tpa_claim_status` to settled or partially_settled, write audit log. All in one transaction.

### 5.3 NEW: `rejectTpaClaim`
- **File:** `app/actions/insurance-corporate-actions.ts`
- Signature: `({invoice_id, reason, rejected_by})`
- Flips to `rejected`, clears approved/payable, patient becomes liable, audit log.

### 5.4 MODIFY: `getMasterBillingRows`
- Expose `tpa_approved_amount`, `tpa_settled_amount`, `patient_outstanding` (= balance_due − tpa_payable clamped ≥ 0).

### 5.5 DEPRECATE: silent overwrite in `updateTpaClaimAction`
- Route settlement writes through the new action; keep status-only updates.

## 6. UI changes per file

### 6.1 `app/ipd/discharge-settlement/[admissionId]/page.tsx:252-299`
- Relabel "TPA Approved Amount (Receivable — not yet received)".
- Add `max={netBill}` validation.
- Show explicit "TPA Receivable: ₹X (will be collected when insurer pays)" in amber.

### 6.2 `app/components/finance/BillingMasterDashboard.tsx`
- New columns: TPA Approved · TPA Received · Patient Outstanding.
- New row action "Mark TPA Received" (visible when status ∈ {approved, partially_settled}).
- Split outstanding pill into Patient + TPA.

### 6.3 `app/billing/page.tsx:385-451`
- Richer `ClaimBadge` colors per status.
- Add "Mark TPA Received" action conditionally.

### 6.4 `app/api/payment/[id]/receipt/route.ts`
- TPA-aware header ("TPA Settlement Receipt" when `payment_source === 'tpa'`).
- Split Patient Outstanding vs TPA Outstanding lines.

### 6.5 `app/api/invoice/[id]/pdf/route.ts` + `summary-bill/route.ts` + `discharge/[admissionId]/bill/route.ts`
- New "TPA Summary" block with Provider, Status pill, Approved, Received, Outstanding.
- Top-of-bill: "TPA APPROVED — INTERIM BILL" override.

### 6.6 `app/components/billing/EditInvoiceModal.tsx`
- Disable editing `tpa_approved_amount` once settlement is in flight.

### 6.7 Central helper
- Extend `app/lib/bill-branding.ts` `deriveInvoiceTotals()` with `patientOutstanding` + `tpaOutstanding`.

## 7. Record TPA Payment Received modal — file: `app/components/billing/RecordTpaPaymentModal.tsx`

| Field | Type | Validation |
|---|---|---|
| Amount Received | number | required, > 0, ≤ outstanding TPA balance |
| Received Date | date | required, ≤ today, ≥ tpa_approved_at |
| Payment Method | select | NEFT / RTGS / Cheque / UPI / Other |
| Reference Number | text | required; unique on payments.reference_number for TPA source |
| Remarks | textarea | optional |
| "Partial settlement" | checkbox | required when amount < outstanding |

On submit: call `recordTpaPaymentReceived()`; on success open receipt PDF in new tab + refresh row.

## 8. Receipt + bill rendering rules

Render block for every TPA-flagged invoice (`billing_patient_type === 'tpa_insurance'` OR `tpa_approved_amount > 0`):

```
─────────────────────────────────────
  TPA SETTLEMENT
─────────────────────────────────────
  Provider:           Star Health
  Claim Status:       [APPROVED]    ← amber pill
  TPA Approved:       ₹ 80,000.00
  Received from TPA:  ₹      0.00
  TPA Outstanding:    ₹ 80,000.00   ← amber
─────────────────────────────────────
  Patient Outstanding: ₹ 20,000.00  ← red if > 0
─────────────────────────────────────
```

Status pill table:

| `tpa_claim_status` | Label | Color |
|---|---|---|
| `not_submitted` | TPA: Not Submitted | gray |
| `submitted` | TPA: Submitted | blue |
| `approved` | TPA: Approved — Awaiting Payment | amber |
| `partially_settled` | TPA: Partial Settlement | amber |
| `settled` | TPA: Settled | green |
| `rejected` | TPA: Rejected | red |

## 9. Test scenarios

1. Discharge bill ₹100k, TPA approved ₹80k, patient pays ₹20k → invoice Partially Paid, TPA approved. Mark TPA Received ₹80k → invoice Paid + settled + receipt.
2. Partial TPA tranche ₹50k → partially_settled, balance ₹30k from TPA.
3. Second tranche ₹30k → settled, full Paid.
4. Patient pays full bill before TPA settles → flag "Patient Refund Pending" when TPA later pays.
5. TPA rejects → patient liable for full balance.
6. Approved amount exceeds bill → discharge UI blocks.
7. Concurrent settlement attempts → second one fails ("already settled").
8. Print PDF after discharge, pre-TPA-payment → amber INTERIM BILL header, NO green PAID badge.

## 10. File-by-file execution order

1. `prisma/schema.prisma` — add new fields to invoices.
2. `prisma/migrations/<ts>_tpa_approved_amount/migration.sql` — DDL + backfill.
3. `app/actions/ipd-finance-actions.ts` — settleAndDischarge writes new fields + audit log.
4. `app/actions/insurance-corporate-actions.ts` — add `recordTpaPaymentReceived` + `rejectTpaClaim`; harden existing.
5. `app/actions/master-billing-actions.ts` — expose new fields + patient_outstanding.
6. `app/lib/bill-branding.ts` — extend `deriveInvoiceTotals`.
7. `app/api/payment/[id]/receipt/route.ts` — TPA-aware rendering.
8. `app/api/invoice/[id]/pdf/route.ts` — TPA Summary + status override.
9. `app/api/invoice/[id]/summary-bill/route.ts` — same.
10. `app/api/discharge/[admissionId]/bill/route.ts` — same.
11. `app/components/billing/RecordTpaPaymentModal.tsx` — new modal.
12. `app/components/finance/BillingMasterDashboard.tsx` — columns + button.
13. `app/billing/page.tsx` — claim badge palette + action.
14. `app/ipd/discharge-settlement/[admissionId]/page.tsx` — relabel + validation + receivable row.
15. `app/components/billing/EditInvoiceModal.tsx` — guard TPA fields.

## 11. Risk callouts

- **Concurrency on settlement.** Row-lock OR optimistic `version` check inside `recordTpaPaymentReceived` transaction. Without it double-credit possible.
- **Partial-settlement regression.** Legacy callers using `updateTpaClaimAction` overwrite — route everything through new action.
- **Backfill correctness.** `tpa_approved_amount = tpa_payable + tpa_settled_amount` for legacy rows so partials aren't under-stated.
- **Money-in mismatch.** When patient pays full bill before TPA settles → must flag "Patient Refund Pending" on dashboard.
- **PDF caching.** Cache-bust receipt URLs after status change (`?v={updated_at}`).
- **Audit trail.** Every state transition writes before/after snapshots of TPA fields.
- **Central status derivation.** New `deriveInvoiceStatus()` helper consumed by every renderer + server — divergent derivations are the #1 source of "looks paid here, unpaid there" bugs.
- **Reference number uniqueness.** Validation-level uniqueness per `payment_source='tpa'`, not DB constraint (won't break existing data).
