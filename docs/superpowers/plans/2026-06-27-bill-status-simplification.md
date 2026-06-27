# Bill Status Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `invoices.status` a pure lifecycle field with exactly three values — `Draft → Final → Cancelled` — and read payment state only from `paid_amount`/`balance_due`.

**Architecture:** Strip every auto-promotion of status to `Paid`/`Partial`/`Refunded`. Re-base bill editability on lifecycle status (Draft=all staff, Final=admin/finance, Cancelled=none) instead of payment. Reports/filters that used payment-status switch to balance math. One-time data migration relabels legacy rows to `Final`.

**Tech Stack:** Next.js (App Router) server actions, Prisma 6 + PostgreSQL (Supabase/AWS), TypeScript.

## Global Constraints

- `status` is a plain Prisma `String` (no enum) — **no schema migration**, only a data UPDATE.
- No test runner in this repo. Per-task verification = `npm run typecheck` + targeted `grep` assertions + (final) `npm run build`. Exact commands given per task.
- Allowed invoice statuses after this work: **exactly** `Draft`, `Final`, `Cancelled`. No `Paid`, `Partial`, `Partially Paid`, `Overdue`, `Refunded` written to `invoices.status` anywhere.
- Scope = the `invoices` table only (all `invoice_type`s incl. `Pharmacy` sales). Do **not** touch other models' statuses: `pharmacyPurchaseInvoice`, `expense`, `lab_orders`, appointments, claims, estimates, admissions.
- Privileged roles (verbatim from existing code): `['admin', 'finance', 'superadmin']`.
- Follow existing code style: server actions return `{ success, ... }`; `any` is used pervasively — match it; do not introduce new patterns.

---

### Task 1: Shared bill-status helper (single source of truth)

**Files:**
- Create: `app/lib/bill-status.ts`

**Interfaces:**
- Produces: `BILL_STATUS`, `type BillStatus`, `PRIVILEGED_BILLING_ROLES`, `isPrivilegedBillingRole(role?)`, `canEditBill(status, role?)`.

- [ ] **Step 1: Create the helper**

```ts
// app/lib/bill-status.ts
// Single source of truth for the patient bill (invoices.status) lifecycle.
// Status is a PURE lifecycle field: Draft -> Final -> Cancelled.
// Payment state is NEVER stored here — read paid_amount / balance_due instead.

export const BILL_STATUS = {
  DRAFT: 'Draft',
  FINAL: 'Final',
  CANCELLED: 'Cancelled',
} as const;

export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];

// Roles allowed to edit a FINAL bill. Normal staff edit Draft bills only.
export const PRIVILEGED_BILLING_ROLES = ['admin', 'finance', 'superadmin'];

export function isPrivilegedBillingRole(role?: string | null): boolean {
  return PRIVILEGED_BILLING_ROLES.includes(String(role ?? '').toLowerCase());
}

// Lifecycle edit rule (supersedes the old payment-based rule):
//   Draft     -> all staff
//   Final     -> admin/finance only
//   Cancelled -> nobody
export function canEditBill(status: string, role?: string | null): boolean {
  if (status === BILL_STATUS.CANCELLED) return false;
  if (status === BILL_STATUS.FINAL) return isPrivilegedBillingRole(role);
  return true; // Draft (and any legacy value) is freely editable
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `app/lib/bill-status.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/bill-status.ts
git commit -m "feat(billing): add bill-status lifecycle helper (Draft/Final/Cancelled)"
```

---

### Task 2: Re-base invoice editability on lifecycle status

**Files:**
- Modify: `app/actions/finance-actions.ts` (`evaluateInvoiceEditable`, `isPrivilegedBilling`, all call sites passing `allowPaid`)

**Interfaces:**
- Consumes: `isPrivilegedBillingRole` from `app/lib/bill-status.ts`.
- Produces: `evaluateInvoiceEditable(invoice, expectedVersion?, opts?: { allowPrivileged?: boolean })`.

- [ ] **Step 1: Add import at top of finance-actions.ts**

Add near the other imports:

```ts
import { isPrivilegedBillingRole } from '@/app/lib/bill-status';
```

- [ ] **Step 2: Replace `PRIVILEGED_BILLING_ROLES` + `isPrivilegedBilling`**

Replace the local duplicate (currently ~L2527-2532):

```ts
const PRIVILEGED_BILLING_ROLES = ['admin', 'finance', 'superadmin'];
function isPrivilegedBilling(session: any): boolean {
    return PRIVILEGED_BILLING_ROLES.includes(String(session?.role ?? '').toLowerCase());
}
```

with:

```ts
function isPrivilegedBilling(session: any): boolean {
    return isPrivilegedBillingRole(session?.role);
}
```

- [ ] **Step 3: Rewrite `evaluateInvoiceEditable` to be status-based**

Replace the whole function (currently ~L2534-2563):

```ts
function evaluateInvoiceEditable(
    invoice: any,
    expectedVersion?: number,
    opts?: { allowPrivileged?: boolean },
): InvoiceEditableCheck {
    if (!invoice) return { editable: false, reason: 'Invoice not found.' };
    if (invoice.is_locked) {
        return { editable: false, reason: 'This bill is locked. Only Admin or Finance can unlock it.' };
    }
    if (invoice.status === 'Cancelled') {
        return { editable: false, reason: 'Cancelled invoices cannot be edited. Revert first if needed.' };
    }
    // Lifecycle gate: a finalised bill is immutable for normal staff. Admin/Finance
    // may still edit it (override). Draft bills are freely editable regardless of
    // how much has been collected (e.g. running IPD bills with advances).
    if (invoice.status === 'Final' && !opts?.allowPrivileged) {
        return {
            editable: false,
            reason: 'This bill is finalised. Only Admin or Finance can edit it.',
        };
    }
    if (expectedVersion !== undefined && Number(invoice.version) !== Number(expectedVersion)) {
        return {
            editable: false,
            reason: 'Invoice was modified by another user. Please reload and try again.',
        };
    }
    return { editable: true };
}
```

- [ ] **Step 4: Update every call site that passed `{ allowPaid: ... }`**

Find them:

```bash
grep -n "allowPaid" app/actions/finance-actions.ts
```

For each hit (e.g. in `checkInvoiceEditable`, `saveInvoiceEdits`, `updateInvoiceItem`, and the 3rd mutation action), replace the option key `allowPaid:` with `allowPrivileged:`. The value (`isPrivilegedBilling(session)`) stays the same. Example:

```ts
// before
const check = evaluateInvoiceEditable(invoice, undefined, { allowPaid: isPrivilegedBilling(session) });
// after
const check = evaluateInvoiceEditable(invoice, undefined, { allowPrivileged: isPrivilegedBilling(session) });
```

- [ ] **Step 5: Verify no `allowPaid` remains and it type-checks**

Run:
```bash
grep -n "allowPaid" app/actions/finance-actions.ts; echo "exit: $?"
npx tsc --noEmit
```
Expected: grep prints nothing (exit 1); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add app/actions/finance-actions.ts
git commit -m "feat(billing): gate invoice edits on lifecycle status, not payment"
```

---

### Task 3: Strip payment→status auto-promotion in finance-actions.ts

All edits in `app/actions/finance-actions.ts`. The rule: payment/refund actions update `paid_amount`/`balance_due` only; **never** write `status`. Finalise/markFinal write `'Final'`. Revert writes `'Final'`.

- [ ] **Step 1: `recalculateInvoice` — drop the status branch**

In the `db.invoices.update` inside `recalculateInvoice` (~L281-302), delete the entire `status: ... ,` ternary block (the lines from `status:` through the `: invoice?.status,`). Keep all amount fields and `version: { increment: 1 }`. Result data block has no `status` key.

- [ ] **Step 2: `revertInvoice` — restore to Final, not Paid/Partial**

Replace (~L868-874):

```ts
const balanceDue = Number(existing.net_amount) - Number(existing.paid_amount);
const newStatus = balanceDue <= 0 ? 'Paid' : Number(existing.paid_amount) > 0 ? 'Partial' : 'Final';

const invoice = await db.invoices.update({
    where: { id: invoiceId },
    data: {
        status: newStatus,
        balance_due: balanceDue > 0 ? balanceDue : 0,
```

with:

```ts
const balanceDue = Number(existing.net_amount) - Number(existing.paid_amount);

const invoice = await db.invoices.update({
    where: { id: invoiceId },
    data: {
        status: 'Final',
        balance_due: balanceDue > 0 ? balanceDue : 0,
```

- [ ] **Step 3: Payment-recompute site #1 (~L1023-1032)**

Delete the three lines:

```ts
let newStatus = invoice?.status || 'Draft';
if (balance <= 0) newStatus = 'Paid';
else if (totalPaid > 0) newStatus = 'Partial';
```

and remove `status: newStatus,` from the following `db.invoices.update` data block.

- [ ] **Step 4: Payment-recompute site #2 (~L1191-1199)**

Delete:

```ts
let newStatus = invoice?.status || 'Draft';
if (balance <= 0) newStatus = 'Paid';
else if (totalPaid > 0) newStatus = 'Partial';
```

and remove the `status: newStatus,` line from its `db.invoices.update` data block.

- [ ] **Step 5: Payment-recompute site #3 (~L1276-1284)**

In the `db.invoices.update` data block, delete the line:

```ts
status: totalPaid >= netAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Final',
```

(keep `paid_amount`, `balance_due`, `version`).

- [ ] **Step 6: Refund tx site #1 (~L1894-1906)**

Delete the status computation:

```ts
let invoiceStatus: string = payment.invoice.status;
if (netPaid <= 0 && totalRefunded > 0) invoiceStatus = 'Refunded';
else if (netPaid >= netAmount - 0.01) invoiceStatus = 'Paid';
else if (netPaid > 0) invoiceStatus = 'Partial';
else invoiceStatus = 'Final';
```

and remove `status: invoiceStatus,` from the `tx.invoices.update` data block.

- [ ] **Step 7: Refund tx site #2 (~L2107-2118)**

Delete the identical `invoiceStatus` block and remove `status: invoiceStatus,` from its `tx.invoices.update` data block.

- [ ] **Step 8: markFinal for OPD/IPD source (~L2193-2202)**

Replace:

```ts
data: {
    status: balanceDue <= 0 ? 'Paid' : 'Final',
    balance_due: balanceDue > 0 ? balanceDue : 0,
    finalized_at: new Date(),
}
```

with:

```ts
data: {
    status: 'Final',
    balance_due: balanceDue > 0 ? balanceDue : 0,
    finalized_at: new Date(),
}
```

- [ ] **Step 9: Verify no banned invoice statuses remain in this file**

Run:
```bash
grep -nE "status:\s*'(Paid|Partial|Refunded)'|= '(Paid|Partial|Refunded)'|\? '(Paid|Partial|Refunded)'" app/actions/finance-actions.ts; echo "exit: $?"
npx tsc --noEmit
```
Expected: grep prints nothing (exit 1) — except confirm any remaining hit is NOT an `invoices.status` write (e.g. a `payments.status` or `refund.status`). tsc clean.

- [ ] **Step 10: Commit**

```bash
git add app/actions/finance-actions.ts
git commit -m "feat(billing): stop auto-promoting invoice status to Paid/Partial/Refunded"
```

---

### Task 4: Strip auto-promotion in ipd-finance-actions.ts

All edits in `app/actions/ipd-finance-actions.ts`.

- [ ] **Step 1: IPD recalculate (~L320)**

In the `db.invoices.update` data block, delete the line:

```ts
status: balance_due <= 0 && net_amount > 0 ? 'Paid' : invoice?.status,
```

- [ ] **Step 2: IPD payment site (~L817)**

Delete the line:

```ts
status: balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : invoice.status,
```

- [ ] **Step 3: IPD payment site (~L892)**

Delete the line:

```ts
status: balance <= 0 ? 'Paid' : 'Partial',
```

- [ ] **Step 4: Verify + commit**

```bash
grep -nE "status:\s*.*(Paid|Partial)" app/actions/ipd-finance-actions.ts; echo "exit: $?"
npx tsc --noEmit
git add app/actions/ipd-finance-actions.ts
git commit -m "feat(billing): stop IPD payment flows from setting Paid/Partial status"
```
Expected: grep prints nothing that is an `invoices.status` write; tsc clean.

---

### Task 5: Pharmacy patient-sale invoices

All edits in `app/actions/pharmacy-actions.ts`. **Do not touch L~3536** (`pharmacyPurchaseInvoice` — different table, out of scope).

- [ ] **Step 1: POS sale create (~L502)**

In the `db.invoices.create` data block, change:

```ts
status: 'Paid',
```
to:
```ts
status: 'Final',
```

- [ ] **Step 2: POS payment update (~L779)**

In the `db.invoices.update` data block, **delete** the line:

```ts
status: 'Paid',
```
(keep `paid_amount`, `balance_due`).

- [ ] **Step 3: Verify the purchase-invoice line is untouched + commit**

```bash
grep -nE "status: '(Paid|PartiallyPaid|Partial)'" app/actions/pharmacy-actions.ts
npx tsc --noEmit
```
Expected: the only remaining hit is the `pharmacyPurchaseInvoice` line (~L3536). tsc clean.

```bash
git add app/actions/pharmacy-actions.ts
git commit -m "feat(billing): pharmacy sale invoices use Final, not Paid"
```

---

### Task 6: Reports/reads — filter by balance, not payment-status

- [ ] **Step 1: AR aging report**

`app/actions/report-actions.ts` `getARAgingReport` (~L224). Change:

```ts
const where: any = { status: { in: ['Final', 'Partial'] }, balance_due: { gt: 0 } };
```
to:
```ts
const where: any = { status: 'Final', balance_due: { gt: 0 } };
```

- [ ] **Step 2: Dunning queries**

`app/actions/dunning-actions.ts` (~L68 and ~L107). Change each:

```ts
status: { in: ['Final', 'Partial'] },
```
to:
```ts
status: 'Final',
```

- [ ] **Step 3: Audit dashboard / MIS / collections for status-based money math**

Run:
```bash
grep -rnE "status:.*'(Paid|Partial)'|status: \{ in: \[[^]]*(Paid|Partial)" \
  app/actions/report-actions.ts app/actions/master-billing-actions.ts \
  app/finance app/actions/ipd-finance-actions.ts
```
For each hit **that queries `db.invoices`** (ignore `expense`, `lab`, `claim`, `pharmacyPurchaseInvoice`): the "collected" figure must become `Σ paid_amount` and "outstanding" must become `Σ balance_due` over non-`Cancelled` invoices. Apply the minimal edit to each such site (replace the status filter with `balance_due`/`paid_amount` logic). Leave non-invoice models unchanged.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
git add -A app/actions/report-actions.ts app/actions/dunning-actions.ts app/actions/master-billing-actions.ts app/finance app/actions/ipd-finance-actions.ts
git commit -m "fix(billing): reports compute outstanding/collected from amounts, not status"
```

---

### Task 7: UI — reduce status filters & badges to 3 values

Goal: every invoice **status filter dropdown** offers only `All / Draft / Final / Cancelled`; every invoice **status badge/color map** handles only those 3 (+ neutral default). Money state stays visible via existing Net/Paid/Balance columns — do **not** add a payment chip.

- [ ] **Step 1: finance/invoices list**

`app/finance/invoices/page.tsx`:
- Filter options (~L89-93): remove the `Paid` and `Partial` options; keep `Draft`, `Final`, `Cancelled`.
- Badge/color map (~L164-167): remove `Paid`/`Partial` cases; keep `Draft`, `Final`, `Cancelled`, default.

- [ ] **Step 2: billing list**

`app/billing/page.tsx` (~L189-190): remove `Partial`, `Paid`, `Overdue` from the status filter list; keep `Draft`, `Final`, `Cancelled`.

- [ ] **Step 3: Per-bill badge sites**

In each of these, replace any `Paid`/`Partial`/`Overdue` badge branch with the neutral default (money shown by amount columns):
- `app/billing/patient/[patientId]/page.tsx` (~L675 `"Paid"`)
- `app/admin/patients/[patientId]/tabs/BillingPaymentsTab.tsx` (~L162 `'Paid'`)
- `app/reception/patient/[id]/page.tsx` (~L912 `'Paid'`)

- [ ] **Step 4: Sweep for any leftover invoice status labels**

Run:
```bash
grep -rnE "'(Partially Paid|Overdue)'|\"(Partially Paid|Overdue)\"" app --include=*.tsx
grep -rnE ">\s*(Paid|Partial|Overdue)\s*<" app --include=*.tsx
```
For each hit, confirm it belongs to a **non-invoice** entity (pharmacy purchase, appointment, follow-up, expense). If it's an invoice badge, reduce it to the 3-value scheme. Document any intentionally-skipped non-invoice hits in the commit message.

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit
git add -A app/finance/invoices/page.tsx app/billing app/admin app/reception
git commit -m "feat(billing): show only Draft/Final/Cancelled in invoice status UI"
```

---

### Task 8: Data migration — relabel legacy rows to Final

**Files:**
- Create: `prisma/migrations/<timestamp>_normalize_bill_status/migration.sql`
  (use a real timestamp, e.g. `20260627120000`)

- [ ] **Step 1: Write the migration SQL**

```sql
-- Normalize invoices.status to the 3-value lifecycle.
-- Legacy payment statuses are relabelled to Final. Draft & Cancelled untouched.
-- paid_amount / balance_due are the source of truth for payment and are NOT changed.
UPDATE "invoices"
SET "status" = 'Final'
WHERE "status" IN ('Paid', 'Partial', 'Partially Paid', 'Overdue', 'Refunded');
```

- [ ] **Step 2: Verify the SQL is idempotent (re-runnable)**

It only relabels the listed legacy values, so a second run matches zero rows. No down-migration needed (non-destructive; payment truth is in the amount columns).

- [ ] **Step 3: Commit (do NOT auto-apply to the live DB)**

```bash
git add prisma/migrations
git commit -m "chore(db): migration to normalize invoice status to Draft/Final/Cancelled"
```

> Application to the production DB (`DIRECT_URL`, port 5432) is a manual step for the user, consistent with prior migrations in this project (referral/discharge). Provide the SQL; let the user run it.

---

### Task 9: Final verification & memory update

- [ ] **Step 1: Whole-repo banned-status sweep (invoices only)**

```bash
grep -rnE "status:\s*'(Paid|Partial|Partially Paid|Overdue|Refunded)'" app --include=*.ts --include=*.tsx \
  | grep -viE "pharmacyPurchaseInvoice|expense|lab_orders|claim|appointment|follow|pharmacy_orders|payments\.|refund"
```
Expected: no remaining line that writes `invoices.status`. Investigate any hit.

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck
npm run build
```
Expected: both clean.

- [ ] **Step 3: Manual smoke test (record outcomes)**

1. Create OPD bill → status `Draft`; edit as reception → allowed.
2. Finalise → `Final`; edit as reception → blocked; edit as admin → allowed, stays `Final`.
3. Record payment on the Final bill → status stays `Final`; Paid/Balance update.
4. Cancel an unpaid bill → `Cancelled`; not editable. Revert → back to `Final`.
5. Walk-in pharmacy sale → created `Final`, fully paid.
6. AR-aging + dunning still list bills with `balance_due > 0`.
7. Run the migration on a DB copy → legacy `Paid/Partial/Overdue` become `Final`.

- [ ] **Step 4: Update saved memory (edit-access rule changed)**

Update `invoice-edit-access-rule` memory: the rule is now lifecycle-based (Draft=all staff, Final=admin/finance, Cancelled=none), replacing the prior ₹0/paid-based rule. Add a `bill-status-lifecycle` memory pointing at this plan + spec.

## Self-Review (completed by author)

- **Spec coverage:** state machine → Tasks 3-5,8; edit rule → Tasks 1-2; reports → Task 6; UI → Task 7; migration → Task 8; pharmacy POS=Final → Task 5; helper/centralization → Task 1; verification → Task 9. ✓
- **Placeholder scan:** every code step shows the exact lines to change/delete; grep-driven steps name exact patterns. No TBD/TODO. ✓
- **Type consistency:** `evaluateInvoiceEditable` opts renamed `allowPaid → allowPrivileged` in both the definition (Task 2.3) and all call sites (Task 2.4); `isPrivilegedBillingRole`/`canEditBill`/`BILL_STATUS` defined in Task 1 and consumed in Task 2. ✓
