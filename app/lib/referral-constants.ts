// Shared referral/commission constants. Kept out of the 'use server' actions
// file because a 'use server' module may only export async functions.

// Service types a per-service referrer can be rated on. Match invoices.invoice_type.
export const REFERRAL_SERVICE_TYPES = ['OPD', 'IPD', 'Pharmacy', 'Lab', 'Procedure'] as const;
export const REFERRER_CATEGORIES = ['staff', 'affiliate', 'interpreter', 'rmp', 'others'] as const;
export const COMMISSION_TYPES = ['flat_percent', 'per_service', 'fixed_per_patient'] as const;
