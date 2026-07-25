# Insurance Receipt: patient-paid & deposit visibility + auto-netting

## Context

The "Record Insurance Receipt" bill-mapping table (`NewReceiptModal` in
`app/components/insurance/finance-receivables.tsx`) already lets a biller map
a payer remittance to patient bills, entering Received per bill and deriving
TDS / In Bank / Disallowed. Two related gaps:

1. **Patient search & editable TDS** — already implemented in the working
   tree (`searchInvoicesForInsuranceReceipt`, `tdsOverride` state) but not yet
   deployed to production (`13.234.242.13`). No further work needed beyond
   deploying.
2. **Visibility of money the patient already covered** — the "Disallowed"
   figure (Bill − Received) ignores any amount the patient already paid
   directly on the bill, or holds as an unapplied deposit/advance. This
   overstates the real remaining gap and risks asking the patient to pay
   twice or leaves a usable deposit sitting idle.

## Goal

Show, per bill row, what the patient already paid and what deposit they have
available, and let the biller apply some or all of that deposit to close the
gap as part of saving the receipt — so the bill's real outstanding balance
(not just a claim-side bookkeeping number) drops immediately.

## Design

### Data

- `Patient Paid` = `invoice.paid_amount − invoice.tpa_settled_amount` (info
  only, already booked on this invoice; no action needed to "use" it).
- `Deposit Held` = patient's available deposit balance:
  `sum(amount − applied_amount − refunded_amount)` across the patient's
  non-Refunded/non-Cancelled `PatientDeposit` rows. New server helper in
  `deposit-actions.ts`: `getPatientDepositBalance(patientId)` returning the
  total available and the list of contributing deposits (id, deposit_number,
  available, created_at), oldest first, for FIFO consumption.
- Both `getPendingAdvices` and `searchInvoicesForInsuranceReceipt` in
  `insurance-receipts-actions.ts` gain `paid_amount` and `tpa_settled_amount`
  in their `select`, and the caller batches one `getPatientDepositBalance`-style
  query across all involved `patient_id`s (not one query per row).

### What is recorded vs. what is displayed

- The amount submitted to `allocateReceipt` as `disallowed_amount` **stays
  the raw gap** (`Bill − Received`), unchanged. This preserves the existing
  invariant `allocated + disallowed + tds = Bill` that the TPA settlement
  completeness check and claim-status transition rely on — changing it would
  leave claims permanently stuck at `partially_settled` even when fully
  resolved.
- Deposit netting is achieved by **actually applying the deposit** as a
  separate step, not by shrinking the recorded disallowed amount. After
  `recordAndAllocateReceipt` succeeds for a bill, if the biller left a
  nonzero "deposit to use" for that bill, the save flow calls the existing
  `applyDepositToInvoice(depositId, invoiceId, amount)` once per contributing
  deposit (FIFO) until the chosen amount is covered. This creates the
  payment row, marks that slice of the deposit consumed, and recomputes the
  invoice's real `paid_amount` / `balance_due` — so the bill's true
  outstanding balance reflects it right away.
- Net figure shown to the biller **before saving**:
  `max(0, (Bill − Received) − Patient Paid − Deposit To Use)`.

### UI

New editable column "Deposit Held" per bill row:
- Pre-filled to `min(availableDeposit, max(0, rawDisallowed − patientPaid))`
  — never defaults to more than what's needed to close the gap.
- Editable down to 0 or any lower amount (e.g. deposit earmarked elsewhere).
- "Disallowed" column becomes the net figure above, with a tooltip breakdown
  (raw gap, patient paid, deposit used).

### Known limitation (not fixed here)

`invoice.patient_payable` (incremented when a disallowed amount is marked
"ToRecover") is not decremented by the deposit application — it remains a
cumulative "TPA assigned this much to the patient over time" figure, while
`balance_due` (recomputed by `applyDepositToInvoice`) is the authoritative
"what's left to collect" figure used elsewhere in billing. This mismatch
already exists today for any other form of patient payment collected after a
ToRecover disposition; this feature doesn't introduce it and doesn't resolve
it.

## Out of scope

- Deploying points 1 & 3 (already coded) — separate deploy step.
- Reconciling `patient_payable` vs `balance_due` drift.
- Multi-receipt partial-settlement history (existing `rowCalc` always uses
  gross `net_amount` as "Bill", ignoring prior receipts on the same bill —
  pre-existing behavior, unrelated to this change).
