# Bill Status Simplification — Design

- **Date:** 2026-06-27
- **Status:** Approved (design); implementation pending
- **Author:** Naresh + Claude
- **Scope owner:** Billing / Finance

## Problem

The patient bill (`invoices.status`) field is **overloaded**. It carries two
unrelated concepts at once:

1. A **workflow / lifecycle** state — `Draft`, `Final`, `Cancelled`.
2. A **payment** state — `Paid`, `Partial` (and legacy `Partially Paid`,
   `Overdue`) — auto-written whenever money is recorded.

The auto-promotion lives in `recalculateInvoice()` plus ~10 other write sites.
Because status doubles as a payment flag, reports filter invoices by
`status='Paid'` / `['Final','Partial']` to compute collections and outstanding —
which is fragile and already inconsistent (dashboard vs MIS use different status
filters for the same "outstanding" number).

## Goal

Make `status` a **pure lifecycle field** with exactly three values:

```
Draft  →  Final  →  Cancelled
```

- **Draft** — editable / manageable by all staff. This is every new bill.
- **Final** — finalised bill. No content changes for normal staff; admin/finance
  may still edit (override). Reached only by an explicit "finalise" action.
- **Cancelled** — voided bill. Not editable by anyone. The only way to "undo" a
  Final bill.

Payment state (how much is collected) is read **only** from the existing
`paid_amount` / `balance_due` decimal columns — never from `status`.

## Non-goals

- No change to other entities that happen to use a `status` string: pharmacy
  **purchase**-invoices (supplier bills), appointments, expenses, lab orders,
  insurance receipts/claims, estimates, admissions. These are different tables /
  concepts and keep their own statuses.
- No new payment-status chip/label in the UI. Collection state is shown by the
  existing Net / Paid / Balance amount columns only.
- No conversion of `status` to a Prisma enum or DB CHECK constraint (rejected —
  see Alternatives).

## Decisions (confirmed with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | How strict is the Final lock? | **Admin/finance override.** Final blocks normal staff from editing bill contents; admin/finance retain edit power. (Supersedes the prior "₹0 = all staff, paid = admin/finance" rule.) |
| 2 | How is payment state shown after removing Paid/Partial? | **Amounts only.** No payment label anywhere; rely on Net/Paid/Balance columns. |
| 3 | Existing bills already saved as Paid/Partial/Overdue? | **Convert to Final** (one-time data fix). Draft & Cancelled untouched; amounts preserved. |

## Alternatives considered

- **DB enum + CHECK constraint** — DB-enforced correctness, but a heavy migration
  on a live AWS/Supabase database, churns generated Prisma types, and fights the
  codebase convention (every status in this app is a plain string). Same runtime
  behavior for much more risk. Rejected.
- **Hide-only (map Paid→Final in the UI, leave DB values)** — least code, but
  does not actually limit the stored statuses, leaves reports inconsistent, and
  keeps the overload. Rejected.

## The model

### State machine

| From | To | Trigger | Who |
|------|----|---------|-----|
| (new) | Draft | create invoice | system |
| (new) | Final | walk-in pharmacy POS sale (already fully paid) | system |
| Draft | Final | `finalizeInvoice` / `finalizePatientLatestDraft` | staff |
| Draft | Cancelled | cancel (reason) | per role |
| Final | Cancelled | cancel (reason) | admin/finance |
| Final | Final | admin edit of contents (recompute amounts, stay Final) | admin/finance |

Rules:
- **Payment never changes status.** Recording / refunding payment updates
  `paid_amount` and `balance_due` only. A Draft stays Draft; a Final stays Final.
- **No auto-finalise.** Draft → Final is always an explicit user action.
- **No un-finalise / re-open.** Corrections to a Final bill are made by an
  admin/finance edit in place, or by Cancel (+ re-create if needed).

### Edit-access rule (new — supersedes saved rule)

| Status | Who can edit bill contents |
|--------|----------------------------|
| Draft | all staff |
| Final | admin / finance only |
| Cancelled | nobody |

Payment state is no longer an input to editability. The existing `is_locked`
hard-lock flag is orthogonal and left unchanged.

## Scope of `invoices` rows affected

The `invoices` table holds several `invoice_type`s (OPD, IPD, Pharmacy, etc.).
**All rows in this table** follow the 3-status rule, including
`invoice_type='Pharmacy'` patient sale invoices. Walk-in pharmacy POS sales are
created already-paid and therefore created directly as `Final` (not `Paid`).
Supplier **purchase**-invoices are a *different* table and are out of scope.

## Change inventory

> Line numbers are a 2026-06-27 snapshot for orientation; the implementation
> plan must re-verify each site (grep-driven), since edits shift lines.

### A. Backend writes — stop assigning Paid/Partial (keep amount math)

- `app/actions/finance-actions.ts`
  - `recalculateInvoice` (~L294–299): **delete the status branch**; recompute
    amounts only, leave `status` as-is.
  - Payment / refund / settlement sites that compute a Paid/Partial/Final
    `newStatus`/`invoiceStatus` from balance: ~L869, L1024, L1192, L1281, L1896,
    L2109, L2198 — remove the `status` write from the update payload (amounts
    only). Do **not** auto-set Final on payment.
- `app/actions/ipd-finance-actions.ts`:
  - ~L320 — IPD recalculate (mirror of `recalculateInvoice`): delete status branch.
  - ~L817, ~L892 — `invoices.update` on payment: remove the `status` write.
- `app/actions/pharmacy-actions.ts`:
  - ~L502 — walk-in POS sale invoice `create` → `status: 'Final'` (was `'Paid'`).
  - ~L779 — `invoices.update` on payment → remove the `status` write (amounts only).
  - **~L3536 is the `pharmacyPurchaseInvoice` table (supplier bill) — OUT OF
    SCOPE, no change.**

### B. Reads / reports — filter by amount, not payment-status

- `app/actions/report-actions.ts` `getARAgingReport` (~L224):
  `status: { in: ['Final','Partial'] }` → `status: 'Final'` (the existing
  `balance_due: { gt: 0 }` already scopes to outstanding).
- `app/actions/dunning-actions.ts` (~L68, L107): same `['Final','Partial']` →
  `'Final'`.
- Audit `getFinanceDashboardStats`, finance collections, and MIS so
  "collected" = Σ`paid_amount` and "outstanding" = Σ`balance_due` over
  non-Cancelled invoices — not status counts. (Bonus: removes the known
  dashboard-vs-MIS outstanding mismatch.)
- **Leave untouched:** `report-actions.ts` L276/331/583 — these query the
  `expense` model (`['Approved','Paid']`), not invoices.

### C. UI cleanup (~25 files; grep-driven audit required)

- Status **filter dropdowns** → `{ All, Draft, Final, Cancelled }`. Known:
  `app/finance/invoices/page.tsx` (~L89–93, L164–167),
  `app/billing/page.tsx` (~L189–190).
- Status **badge / color maps** → 3 cases + a neutral default. Remove
  `Paid` / `Partial` / `Partially Paid` / `Overdue` branches. Known badge sites:
  `app/billing/patient/[patientId]/page.tsx`,
  `app/admin/patients/[patientId]/tabs/BillingPaymentsTab.tsx`,
  `app/reception/patient/[id]/page.tsx`, `app/finance/invoices/page.tsx`.
- Money state stays visible via existing Net / Paid / Balance columns. No new
  chip.
- Run a final audit:
  `grep -rno "Partially Paid\|'Partial'\|'Paid'\|'Overdue'" app --include=*.tsx`
  and confirm every remaining hit belongs to a non-invoice entity.

### D. Centralization (quality)

- New `app/lib/bill-status.ts`:
  ```ts
  export const BILL_STATUS = { DRAFT: 'Draft', FINAL: 'Final', CANCELLED: 'Cancelled' } as const;
  export type BillStatus = typeof BILL_STATUS[keyof typeof BILL_STATUS];
  export function canEditBill(status: string, role: string): boolean; // Draft=all, Final=admin/finance, Cancelled=none
  ```
  Refactor finalize / cancel / edit-gating call sites to use it → single source
  of truth, prevents reintroducing a 4th status.

### E. Data migration (one-time, idempotent)

No schema migration (status is a plain `String`). One SQL statement, run against
the production DB (`DIRECT_URL`, port 5432), mirroring the `invoice_snapshots`
migration approach:

```sql
UPDATE invoices
SET status = 'Final'
WHERE status IN ('Paid', 'Partial', 'Partially Paid', 'Overdue');
```

Draft and Cancelled rows are untouched. `paid_amount` / `balance_due` are
untouched — only the label changes. Safe to re-run.

## Edge cases

- **IPD running bills** — remain Draft through admission while charges accumulate;
  interim deposits update amounts only (status stays Draft). Finalised at
  discharge → Final. Works without special-casing.
- **Addendum invoices** (`is_addendum`) — Draft → Final like any bill.
- **Admin edit of a Final bill** — amounts recompute, status stays Final (no
  re-open to Draft, no flip to Partial).
- **Cancel of a paid Final bill** — status → Cancelled; refunds continue through
  the existing `processRefund` flow (unchanged).
- **`is_locked`** — separate explicit hard-lock; behavior unchanged.

## Verification

- `npx tsc --noEmit` clean; `npm run build` clean.
- Manual walk-through:
  1. Create bill → Draft. Edit as normal staff → allowed.
  2. Finalise → Final. Edit as normal staff → blocked; as admin/finance →
     allowed, stays Final.
  3. Record payment on the Final bill → status stays Final, Paid/Balance update.
  4. Cancel → Cancelled; not editable.
  5. Walk-in pharmacy sale → created as Final, fully paid.
  6. AR-aging + dunning still list outstanding bills (balance-based).
  7. Run migration on a copy → legacy Paid/Partial/Overdue become Final; Draft &
     Cancelled unchanged.

## Rollback

- Code: revert the feature commit(s).
- Data: the migration is one-directional but non-destructive (only relabels to
  Final). If needed, prior per-row statuses can be reconstructed from
  `invoice_snapshots` / payment history, or simply left as Final (amounts are the
  source of truth for payment either way).
