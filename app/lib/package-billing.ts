// ─────────────────────────────────────────────────────────────────────────────
// Two-ledger IPD package billing — shared constants & pure helpers.
// See IPD_PACKAGE_BILLING_DESIGN.md.
//
// Claim ledger      = invoices / invoice_items  (patient / TPA / GST / revenue)
// Consumption ledger = ipd_charge_postings with disposition 'package_consumed'
//
// This file is intentionally free of 'use server' so it can export constants
// and synchronous helpers to both server actions and API routes.
// ─────────────────────────────────────────────────────────────────────────────

export const CHARGE_DISPOSITION = {
    /** Normal invoice line — billed to the patient/payer (default, legacy behavior). */
    BILLED: 'billed',
    /** Consumed under an active package — absorbed by the hospital, never claimed. */
    PACKAGE_CONSUMED: 'package_consumed',
    /** Package exclusion — billed to the patient/payer over and above the package. */
    BILLABLE_EXTRA: 'billable_extra',
} as const;

export type ChargeDisposition =
    (typeof CHARGE_DISPOSITION)[keyof typeof CHARGE_DISPOSITION];

export const ADMISSION_PACKAGE_STATUS = {
    ACTIVE: 'active',
    BROKEN_OPEN: 'broken_open',
    CLOSED: 'closed',
} as const;

/** invoice_items.service_category used for the package line itself. */
export const PACKAGE_SERVICE_CATEGORY = 'Package';
/** Legacy negative-adjustment line category written by the old settlePackageBilling. */
export const LEGACY_PACKAGE_ADJUSTMENT_CATEGORY = 'Package Adjustment';
/** Bill-level discount lines (settleAndDischarge) — never treated as service charges. */
export const DISCOUNT_DEPARTMENT = 'Discount';

export function roundMoney(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ─── Exclusion matching ──────────────────────────────────────────────────────
// IpdPackage.exclusions supports two shapes (both may appear in one array):
//   Legacy   : "Implants"                          → keyword/category match
//   Structured: { match: 'category'|'service'|'keyword', value: '…', note?: '…' }

export type ExclusionRule =
    | string
    | { match: 'category' | 'service' | 'keyword'; value: string; note?: string };

export function parseExclusions(raw: unknown): ExclusionRule[] {
    if (!raw) return [];
    let value: unknown = raw;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            // Plain comma-separated string from the legacy admin form.
            return String(raw)
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        }
    }
    if (!Array.isArray(value)) return [];
    return value.filter(
        (e): e is ExclusionRule =>
            typeof e === 'string' ||
            (!!e && typeof e === 'object' && 'value' in (e as any)),
    );
}

export interface ExclusionMatchInput {
    service_id?: string | null;
    service_category?: string | null;
    description?: string | null;
}

export interface ExclusionMatchResult {
    matched: boolean;
    note?: string;
    rule?: string;
}

export function matchExclusion(
    exclusions: ExclusionRule[],
    charge: ExclusionMatchInput,
): ExclusionMatchResult {
    const category = String(charge.service_category || '').trim().toLowerCase();
    const description = String(charge.description || '').trim().toLowerCase();
    const serviceId = String(charge.service_id || '').trim();

    for (const rule of exclusions) {
        if (typeof rule === 'string') {
            const needle = rule.trim().toLowerCase();
            if (!needle) continue;
            if (category === needle || description.includes(needle)) {
                return { matched: true, rule };
            }
            continue;
        }
        const value = String(rule.value || '').trim();
        if (!value) continue;
        const needle = value.toLowerCase();
        if (rule.match === 'service' && serviceId && serviceId === value) {
            return { matched: true, note: rule.note, rule: value };
        }
        if (rule.match === 'category' && category && category === needle) {
            return { matched: true, note: rule.note, rule: value };
        }
        if (rule.match === 'keyword' && needle && description.includes(needle)) {
            return { matched: true, note: rule.note, rule: value };
        }
    }
    return { matched: false };
}

/**
 * Invoice items that are plain service charges — i.e. NOT the package line, NOT
 * the legacy adjustment line and NOT a bill-level discount. Used to detect
 * "stray" billed services on a package admission.
 */
export function isPlainServiceItem(item: {
    service_category?: string | null;
    department?: string | null;
}): boolean {
    const cat = String(item.service_category || '');
    const dept = String(item.department || '');
    return (
        cat !== PACKAGE_SERVICE_CATEGORY &&
        cat !== LEGACY_PACKAGE_ADJUSTMENT_CATEGORY &&
        dept !== PACKAGE_SERVICE_CATEGORY &&
        dept !== LEGACY_PACKAGE_ADJUSTMENT_CATEGORY &&
        dept !== DISCOUNT_DEPARTMENT
    );
}
