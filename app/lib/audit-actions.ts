/**
 * Audit action vocabulary shared by the Edit/Cancel Audit Report screen, its
 * API route and its Excel export. Kept out of the route file so importing it
 * from a server action doesn't drag a route handler into the bundle.
 */

/** Actions that represent a record being changed or undone after the fact. */
export const EDIT_CANCEL_ACTIONS = [
    'UPDATE_PAYMENT',
    'REVERSE_PAYMENT',
    'VOID_PAYMENT',
    'PROCESS_REFUND',
    'CANCEL_DEPOSIT',
    'UPDATE_DEPOSIT',
    'CANCEL_INVOICE',
    'EDIT_INVOICE',
    'UPDATE_INVOICE',
    'UPDATE_INVOICE_ITEM',
    'UPDATE_INVOICE_HEADER',
    'UPDATE_INVOICE_DOCTOR',
    'DELETE_INVOICE',
    'CANCEL_ADMISSION',
    'CANCEL_BILL',
    'WRITE_OFF',
    'DISCOUNT_APPLIED',
    'CREDIT_NOTE_CREATED',
    'STOCK_ADJUSTED',
    'PHARMACY_STOCK_ADJUSTMENT',
] as const;

/**
 * Friendly labels for the audit "Record" column. The raw entity_type is a table
 * name, which means nothing to a biller reading the report.
 */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
    invoice: 'Bill',
    payment: 'Receipt',
    deposit: 'Deposit',
    admission: 'Admission',
    user: 'User',
    pharmacy_batch: 'Medicine batch',
    insurance_receipt: 'TPA receipt',
};
