/**
 * Cash compliance rules (server-side, single source of truth).
 *
 * Rule 1 — cash >= PAN threshold  => PAN Number + PAN Holder Name mandatory,
 *          UNLESS the patient already has a valid PAN on file from registration
 *          (in which case that PAN is used and re-capture is skipped).
 * Rule 2 — cash >  cash limit      => block the payment.
 * Only the CASH portion is validated; the summed cash across splits is used so a
 * payment cannot be split to dodge the limit/threshold. Non-cash methods skip.
 *
 * Thresholds are configurable via Finance Settings (ModuleConfig 'finance'
 * config_json: pan_threshold / cash_limit). NEVER hardcode the numbers at call
 * sites — always read them through here.
 */

export const CASH_COMPLIANCE_DEFAULTS = { pan_threshold: 50000, cash_limit: 200000 };

export const CASH_METHOD = 'Cash'; // exact, case-sensitive (matches payment_method enum)

export interface CashThresholds {
    pan_threshold: number;
    cash_limit: number;
}

/** Coerce stored config (JSON, possibly strings) into safe positive numbers with defaults. */
export function readCashThresholds(financeConfig: any): CashThresholds {
    const pan = Number(financeConfig?.pan_threshold);
    const cash = Number(financeConfig?.cash_limit);
    return {
        pan_threshold: Number.isFinite(pan) && pan > 0 ? pan : CASH_COMPLIANCE_DEFAULTS.pan_threshold,
        cash_limit: Number.isFinite(cash) && cash > 0 ? cash : CASH_COMPLIANCE_DEFAULTS.cash_limit,
    };
}

/** Read thresholds from the tenant-scoped finance ModuleConfig. Falls back to defaults. */
export async function getCashThresholds(db: any): Promise<CashThresholds> {
    try {
        const cfg = await db.moduleConfig.findFirst({ where: { module_key: 'finance' } });
        return readCashThresholds(cfg?.config_json || {});
    } catch {
        return { ...CASH_COMPLIANCE_DEFAULTS };
    }
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function normalizePan(pan?: string | null): string {
    return (pan || '').trim().toUpperCase();
}

export function isValidPan(pan?: string | null): boolean {
    return PAN_REGEX.test(normalizePan(pan));
}

/**
 * Resolve the PAN already on file for a patient from registration, returning a
 * valid PAN string or null. Checks the dedicated pan_number field first, then a
 * PAN-type government proof (govt_id_type = 'PAN'), since reception registration
 * captures PAN under the government-proof fields. Keep client and server in sync
 * by always resolving the registered PAN through here.
 */
export function resolveRegisteredPan(patient?: {
    pan_number?: string | null;
    govt_id_type?: string | null;
    govt_id_number?: string | null;
} | null): string | null {
    if (!patient) return null;
    const direct = normalizePan(patient.pan_number);
    if (isValidPan(direct)) return direct;
    if ((patient.govt_id_type || '').trim().toUpperCase() === 'PAN') {
        const gid = normalizePan(patient.govt_id_number);
        if (isValidPan(gid)) return gid;
    }
    return null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export interface CashComplianceResult {
    ok: boolean;
    error?: string;
    /** which rule fired — useful for audit logs */
    rule?: 'cash_limit_exceeded' | 'pan_required' | 'pan_invalid';
    panRequired: boolean;
    /** PAN to persist on the receipt — the captured value, or the registered one when capture was skipped. */
    effectivePan?: string | null;
    effectivePanName?: string | null;
    /** True when the PAN requirement was satisfied by the PAN already on file from registration. */
    panFromRegistration?: boolean;
}

/**
 * Validate the cash portion of a payment.
 * @param cashTotal          summed amount paid in CASH (0 if no cash)
 * @param panNumber / panName  PAN captured at the counter (only checked when required)
 * @param registeredPan / registeredPanName  PAN already on file from patient registration;
 *        used as a fallback so the biller does not have to re-enter it.
 */
export function validateCashCompliance(args: {
    thresholds: CashThresholds;
    cashTotal: number;
    panNumber?: string | null;
    panName?: string | null;
    registeredPan?: string | null;
    registeredPanName?: string | null;
}): CashComplianceResult {
    const { pan_threshold, cash_limit } = args.thresholds;
    const cash = Number(args.cashTotal) || 0;

    // No cash → nothing to enforce.
    if (cash <= 0) return { ok: true, panRequired: false };

    // Rule 2 — hard block above the configured maximum.
    if (cash > cash_limit) {
        return {
            ok: false,
            rule: 'cash_limit_exceeded',
            panRequired: false,
            error: `Cash receipts above ${inr(cash_limit)} are not permitted. Please use UPI, Card, Bank Transfer, or another approved payment method.`,
        };
    }

    // Rule 1 — PAN mandatory at/above the threshold.
    if (cash >= pan_threshold) {
        const capturedPan = normalizePan(args.panNumber);
        const capturedName = (args.panName || '').trim();
        const registeredPan = normalizePan(args.registeredPan);
        const registeredName = (args.registeredPanName || '').trim();

        // Prefer the PAN captured at the counter; otherwise fall back to a valid
        // PAN already on file from registration (skip re-capture).
        const capturedComplete = !!capturedPan && !!capturedName;
        const registrationComplete = isValidPan(registeredPan) && registeredName.length > 0;

        let pan = capturedPan;
        let name = capturedName;
        let panFromRegistration = false;
        if (!capturedComplete && registrationComplete) {
            pan = registeredPan;
            name = registeredName;
            panFromRegistration = true;
        }

        if (!pan || !name) {
            return {
                ok: false,
                rule: 'pan_required',
                panRequired: true,
                error: `PAN details are mandatory for cash payments of ${inr(pan_threshold)} or more. Please capture PAN Number and PAN Holder Name.`,
            };
        }
        if (!isValidPan(pan)) {
            return {
                ok: false,
                rule: 'pan_invalid',
                panRequired: true,
                error: `Invalid PAN format. Expected format: ABCDE1234F.`,
            };
        }
        return { ok: true, panRequired: true, effectivePan: pan, effectivePanName: name, panFromRegistration };
    }

    return { ok: true, panRequired: false };
}
