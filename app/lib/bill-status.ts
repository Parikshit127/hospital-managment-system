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

// ── Billing-integrity guards (mandatory business rules) ──────────────────────

// User-facing validation messages (kept in one place so every surface matches).
export const BILL_FINALIZED_INTENT_MSG =
  "Cannot create new intents because the patient's bill has already been finalized.";
export const PRICE_LOCKED_MSG =
  "Item prices cannot be edited. To change the amount, apply a discount or cancel the service and add it again.";

type InvoiceLike = { status?: string | null; is_locked?: boolean | null };

/**
 * A bill stops accepting NEW chargeable entries (pharmacy/nursing/lab/OT/manual
 * intents) once it is Final, Cancelled, or hard-locked. This is the gate for
 * Rules 4 & 5 — no department may add billable entries against a finalized bill.
 */
export function isBillClosedForCharges(inv: InvoiceLike | null | undefined): boolean {
  if (!inv) return false;
  return inv.status === BILL_STATUS.FINAL || inv.status === BILL_STATUS.CANCELLED || !!inv.is_locked;
}

/**
 * Rule 3: an IPD bill may be finalized only after the patient is discharged.
 * OPD/pharmacy bills (no admission) have no discharge gate.
 */
export function canFinalizeInvoice(
  invoice: { admission_id?: string | null },
  admission: { status?: string | null } | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!invoice.admission_id) return { ok: true };
  if (admission?.status === 'Discharged') return { ok: true };
  return {
    ok: false,
    error: 'Cannot finalize the bill until the patient is discharged. Complete the discharge first.',
  };
}
