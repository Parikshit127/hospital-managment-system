/**
 * Single source of truth for HIS GL ledger code selection:
 *  - receivable ledger by patient/payer type
 *  - income-head (revenue) ledger by invoice line service category / department
 *  - GST output ledgers (CGST/SGST/IGST)
 *
 * Reused by gl-actions.ts (posting) and report-actions.ts (voucher view) so the
 * posted vouchers and the on-screen voucher always agree. Plain module (no
 * 'use server') so it's unit-testable and importable anywhere.
 *
 * Codes match the seeded chart of accounts (prisma/seeds/chart-of-accounts-seed.ts).
 */

// ── Receivable ledger by payer type ─────────────────────────────────────────
export const RECEIVABLE_FALLBACK = '1130'; // Patient Receivables
export const RECEIVABLE_CODE_BY_PAYER: Record<string, string> = {
    cash: '1130', // Patient Receivables
    corporate: '1140', // Corporate Receivables
    tpa_insurance: '1150', // Insurance / TPA Receivables
};

export function receivableCode(billingPatientType?: string | null): string {
    return RECEIVABLE_CODE_BY_PAYER[(billingPatientType || 'cash').toLowerCase()] || RECEIVABLE_FALLBACK;
}

// ── GST output ledgers ──────────────────────────────────────────────────────
export const GST_FALLBACK = '3120'; // CGST Payable (also generic fallback)
export const GST_CODE = { cgst: '3120', sgst: '3121', igst: '3122' } as const;

// ── Income heads (revenue) ──────────────────────────────────────────────────
export const REVENUE_FALLBACK = '6000'; // generic Revenue parent

// First keyword match wins. (Consultation handled separately — depends on OPD/IPD.)
const HEAD_KEYWORDS: Array<{ code: string; re: RegExp }> = [
    { code: '6600', re: /pharma|medicine|drug|medicat/i }, // Pharmacy
    { code: '6400', re: /\blab\b|laborator|patholog|biochem|hematolog|microbio|serolog/i }, // Laboratory
    { code: '6500', re: /radiolog|imaging|x-?ray|\bct\b|\bmri\b|\busg\b|ultrasound|sonograph|\bscan\b/i }, // Radiology
    { code: '6700', re: /\bot\b|operation theat|theatre|surgery|surgical/i }, // OT
    { code: '6800', re: /procedure|dressing|injection|minor proc|day ?care/i }, // Procedures
    { code: '6100', re: /room|\bbed\b|ward|nursing|accommodat|\bicu\b|\bnicu\b|admission|boarding/i }, // IPD Room/Nursing
];

/**
 * Map an invoice line to an income-head ledger code.
 * Falls back by invoice_type, then to "Other Medical Income" (6900).
 * The HEAD_KEYWORDS table is exported-by-reference so an org-level override can
 * be layered on later without touching call sites.
 */
export function resolveIncomeHeadCode(
    item: { service_category?: string | null; department?: string | null },
    invoiceType?: string | null,
): string {
    const text = `${item?.service_category || ''} ${item?.department || ''}`.trim();
    for (const { code, re } of HEAD_KEYWORDS) {
        if (re.test(text)) return code;
    }
    const itype = (invoiceType || '').toUpperCase();
    if (/consult|visit|\bopd\b|\bipd\b/i.test(text)) {
        return itype === 'IPD' ? '6200' : '6300'; // IPD vs OPD consultation
    }
    switch (itype) {
        case 'IPD':
            return '6100';
        case 'LAB':
            return '6400';
        case 'PHARMACY':
            return '6600';
        case 'OPD':
            return '6300';
        default:
            return '6900'; // Other Medical Income
    }
}

// Friendly names for the income-head codes (for voucher display).
export const INCOME_HEAD_NAMES: Record<string, string> = {
    '6000': 'Revenue',
    '6100': 'IPD Room & Nursing Income',
    '6200': 'IPD Consultation Income',
    '6300': 'OPD Consultation Income',
    '6400': 'Laboratory Income',
    '6500': 'Radiology Income',
    '6600': 'Pharmacy Income',
    '6700': 'Operation Theatre Income',
    '6800': 'Procedure Income',
    '6900': 'Other Medical Income',
};

export function incomeHeadName(code: string): string {
    return INCOME_HEAD_NAMES[code] || 'Other Medical Income';
}

export function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
