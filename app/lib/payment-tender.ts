/**
 * Payment-method (tender) normalization.
 *
 * Tender labels were entered inconsistently across many forms over time —
 * "BankTransfer" vs "Bank Transfer" vs "Bank", "NEFT_RTGS" vs "NEFT/RTGS", etc.
 * That splits one real tender into several buckets in finance reports/exports.
 *
 * `canonicalTender` collapses every known spelling to a single display label so
 * cards, charts, totals and exports always agree. `tenderVariants` does the
 * reverse — given a (possibly canonical) method, return every raw spelling that
 * belongs to the same tender, so a DB filter on one label still matches rows
 * stored under any of its variants.
 *
 * Pure functions, no server-only imports — safe to use from both server actions
 * and client components.
 */

const CANON_MAP: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    banktransfer: 'Bank Transfer',
    bank: 'Bank Transfer',
    neftrtgs: 'NEFT/RTGS',
    neft: 'NEFT/RTGS',
    rtgs: 'NEFT/RTGS',
    cheque: 'Cheque',
    razorpay: 'Razorpay',
    online: 'Online',
    deposit: 'Deposit',
    tpa: 'TPA',
    insurance: 'Insurance',
};

// Known raw spellings that appear across the payment entry forms.
const KNOWN_SPELLINGS = [
    'Cash', 'UPI', 'Card',
    'BankTransfer', 'Bank Transfer', 'Bank',
    'NEFT_RTGS', 'NEFT/RTGS', 'NEFT', 'RTGS',
    'Cheque', 'Razorpay', 'Online', 'Deposit', 'TPA', 'Insurance',
];

export function canonicalTender(method: string | null | undefined): string {
    const k = String(method || '').replace(/[\s_/-]+/g, '').toLowerCase();
    return CANON_MAP[k] || (method || 'Unknown');
}

/** Every raw spelling that shares the same canonical tender as `method`. */
export function tenderVariants(method: string | null | undefined): string[] {
    const canon = canonicalTender(method);
    const set = new Set<string>([String(method ?? '')]);
    for (const s of KNOWN_SPELLINGS) {
        if (canonicalTender(s) === canon) set.add(s);
    }
    return [...set].filter(Boolean);
}

/**
 * True for payments created by applying an advance/deposit to a bill — an
 * internal ledger transfer (the cash was already counted when the deposit
 * was collected), not new money. Collection reports must exclude these or
 * the same amount is counted twice.
 *
 * Checks `receipt_number` (always `RCP-DEP-*`, never reassigned) rather than
 * relying solely on `payment_method === 'Deposit'` — the payment-edit screen
 * lets finance/admin users change a receipt's method after the fact, which
 * would otherwise let an edited settlement row silently re-appear as a fresh
 * receipt.
 */
export function isDepositSettlement(payment: { payment_method?: string | null; receipt_number?: string | null }): boolean {
    return payment.payment_method === 'Deposit' || (payment.receipt_number || '').startsWith('RCP-DEP-');
}
