/**
 * Pure helpers for the pharmacy GST report (no DB, no 'use server' — so they can
 * be imported from both the server action and a script/test).
 */

/** GST slabs that can legitimately appear on a pharmacy invoice. */
export const VALID_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function isValidGstRate(rate: number): boolean {
    return VALID_GST_RATES.some((r) => Math.abs(r - rate) < 0.001);
}

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTN check-digit (mod 36) over the first 14 characters. */
function gstinCheckChar(first14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const v = GSTIN_CHARS.indexOf(first14[i]);
        if (v < 0) return '';
        const product = v * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export type GstinCheck = { ok: boolean; reason?: string; stateCode?: string };

export function checkGstin(raw: string | null | undefined): GstinCheck {
    const g = (raw || '').trim().toUpperCase();
    if (!g) return { ok: false, reason: 'missing' };
    if (g.length !== 15) return { ok: false, reason: 'not 15 characters' };
    if (!GSTIN_SHAPE.test(g)) return { ok: false, reason: 'wrong format' };
    const state = Number(g.slice(0, 2));
    if (state < 1 || (state > 38 && state !== 97 && state !== 99)) return { ok: false, reason: 'invalid state code' };
    if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { ok: false, reason: 'check digit mismatch (typo?)' };
    return { ok: true, stateCode: g.slice(0, 2) };
}

/** State code printed on the GSTIN (first two digits), or '' when unusable. */
export function stateCodeOf(gstin: string | null | undefined): string {
    const g = (gstin || '').trim();
    return /^[0-9]{2}/.test(g) ? g.slice(0, 2) : '';
}

export const STATE_NAMES: Record<string, string> = {
    '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
    '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
    '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
    '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
    '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
    '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
    '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

export const placeOfSupplyLabel = (code: string) => (code ? `${code}-${STATE_NAMES[code] || 'Unknown'}` : 'Unknown');

/**
 * Pull the medicine's brand name out of the free-text line descriptions the
 * billing code writes:
 *   "Pharmacy: PARACETAMOL 500 (Batch B1) × 10 — Dr. X"
 *   "Pharmacy: PARACETAMOL 500 x10"
 *   "Pharmacy (Manual Override): PARACETAMOL 500 x10"
 *   "Return: PARACETAMOL 500 x2"
 *   "PARACETAMOL 500 (Batch: B1)"            (counter invoices)
 */
export function parseMedicineName(desc: string | null | undefined): string {
    let s = String(desc || '').trim();
    s = s.replace(/^(Pharmacy\s*(\([^)]*\))?\s*:|Return\s*:)\s*/i, '');
    s = s.split(' — ')[0];
    s = s.replace(/\s*\(Batch:?[^)]*\)\s*/i, ' ');
    s = s.replace(/\s*[×x]\s*[\d.]+\s*$/i, '');
    return s.replace(/\s+/g, ' ').trim();
}

export type Heads = { cgst: number; sgst: number; igst: number };

/** Split a tax amount into heads: intra-state → CGST+SGST halves, inter-state → IGST. */
export function splitHeads(tax: number, interState: boolean): Heads {
    return interState ? { cgst: 0, sgst: 0, igst: tax } : { cgst: tax / 2, sgst: tax / 2, igst: 0 };
}

/**
 * ITC utilisation per Rule 88A of the CGST Rules:
 *   IGST credit  → IGST liability, then CGST, then SGST
 *   CGST credit  → CGST liability, then IGST
 *   SGST credit  → SGST liability, then IGST
 * CGST credit can never pay SGST and vice-versa.
 * Returns what is left to pay in cash and the credit carried forward.
 */
export function utilizeItc(liability: Heads, credit: Heads): { cash: Heads; carryForward: Heads } {
    const L = { ...liability };
    const C = { ...credit };
    const use = (lKey: keyof Heads, cKey: keyof Heads) => {
        const x = Math.max(0, Math.min(L[lKey], C[cKey]));
        L[lKey] -= x;
        C[cKey] -= x;
    };
    use('igst', 'igst');
    use('cgst', 'igst');
    use('sgst', 'igst');
    use('cgst', 'cgst');
    use('igst', 'cgst');
    use('sgst', 'sgst');
    use('igst', 'sgst');
    return {
        cash: { cgst: r2(L.cgst), sgst: r2(L.sgst), igst: r2(L.igst) },
        carryForward: { cgst: r2(C.cgst), sgst: r2(C.sgst), igst: r2(C.igst) },
    };
}
