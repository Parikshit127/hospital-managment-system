export const BACKDATE_MAX_DAYS = 365;

export type BackdateResult =
    | { ok: true; date: Date | undefined; isBackdated: boolean }
    | { ok: false; error: string };

export function validateBackdate(
    input: string | undefined | null,
    opts?: { minDate?: Date; label?: string }
): BackdateResult {
    if (!input) return { ok: true, date: undefined, isBackdated: false };

    const label = opts?.label || 'Service date';
    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) {
        return { ok: false, error: `Invalid ${label.toLowerCase()}` };
    }

    const now = new Date();
    if (parsed.getTime() > now.getTime()) {
        return { ok: false, error: `${label} cannot be in the future` };
    }

    const oneYearBack = new Date(now.getTime() - BACKDATE_MAX_DAYS * 24 * 60 * 60 * 1000);
    if (parsed.getTime() < oneYearBack.getTime()) {
        return { ok: false, error: `${label} cannot be more than 1 year in the past` };
    }

    if (opts?.minDate && parsed.getTime() < opts.minDate.getTime()) {
        return { ok: false, error: `${label} cannot be before patient admission date` };
    }

    const isBackdated = Math.abs(now.getTime() - parsed.getTime()) > 60 * 1000;
    return { ok: true, date: parsed, isBackdated };
}
