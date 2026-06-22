// Shared doctor-commission constants. Kept out of the 'use server' actions file
// because a 'use server' module may only export async functions.

// Service types a per-service doctor rate can target. Match invoices.invoice_type.
export const DOCTOR_SERVICE_TYPES = ['OPD', 'IPD', 'Pharmacy', 'Lab', 'Procedure'] as const;
export const DOCTOR_COMMISSION_TYPES = ['flat_percent', 'per_service', 'fixed_per_bill'] as const;
