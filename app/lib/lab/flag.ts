/**
 * app/lib/lab/flag.ts — result flagging against a test's reference range.
 * Pure, dependency-free helpers shared by the server (lab-actions) and the
 * client (sample result-entry UI, report route). No 'use server' — safe to
 * import anywhere.
 */

export type LabRange = {
    normal_range_min?: number | null;
    normal_range_max?: number | null;
    critical_value_low?: number | null;
    critical_value_high?: number | null;
    unit?: string | null;
};

export type LabFlag = {
    level: 'normal' | 'low' | 'high' | 'critical';
    label: string;
};

/**
 * Classify a numeric result against a test's reference/critical range.
 * Returns null when the catalog has no range configured (nothing to flag).
 */
export function computeLabFlag(numeric: number, range: LabRange): LabFlag | null {
    const { normal_range_min, normal_range_max, critical_value_low, critical_value_high } = range;

    if (critical_value_low != null && numeric <= critical_value_low) return { level: 'critical', label: 'Critical Low' };
    if (critical_value_high != null && numeric >= critical_value_high) return { level: 'critical', label: 'Critical High' };
    if (normal_range_max != null && numeric > normal_range_max) return { level: 'high', label: 'High' };
    if (normal_range_min != null && numeric < normal_range_min) return { level: 'low', label: 'Low' };
    if (normal_range_min != null || normal_range_max != null) return { level: 'normal', label: 'Normal' };
    return null;
}

/** Pull the first (possibly decimal / negative) number out of a free-text result. */
export function parseLeadingNumber(text: string | null | undefined): number | null {
    if (text == null) return null;
    const m = String(text).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
}

/** Human-readable reference range, e.g. "13–17 g/dL". Null when no range set. */
export function rangeText(range: LabRange): string | null {
    const { normal_range_min, normal_range_max, unit } = range;
    if (normal_range_min == null && normal_range_max == null) return null;
    const lo = normal_range_min != null ? String(normal_range_min) : '';
    const hi = normal_range_max != null ? String(normal_range_max) : '';
    const sep = lo !== '' && hi !== '' ? '–' : '';
    return `${lo}${sep}${hi}${unit ? ` ${unit}` : ''}`.trim();
}
