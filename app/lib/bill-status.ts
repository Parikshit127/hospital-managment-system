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
