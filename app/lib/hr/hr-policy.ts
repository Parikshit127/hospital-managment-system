/**
 * Org-level attendance / leave policy, stored in ModuleConfig('hr').config_json
 * so it needs no extra table and is editable from the existing admin module
 * config. Every field is optional there; missing ones fall back to defaults.
 */

export interface HrPolicy {
    /** Default shift start/end (IST "HH:mm") when an employee has no roster entry. */
    workStart: string;
    workEnd: string;
    /** Minutes after shift start before a punch-in counts as late. */
    graceMinutes: number;
    /** Worked hours for a full day / a half day. */
    fullDayHours: number;
    halfDayHours: number;
    /** 0 = Sunday ... 6 = Saturday. Days that are not working days. */
    weeklyOffDays: number[];
    /** When true, web/mobile punches must be inside the geofence. */
    requireGeo: boolean;
    geofence: { lat: number; lng: number; radiusM: number } | null;
    /** How far back an employee may regularize a missed day. */
    regularizationWindowDays: number;
    /** Max days in advance/behind an employee can apply leave (sanity bound). */
    leaveBackdateDays: number;
}

export const DEFAULT_HR_POLICY: HrPolicy = {
    workStart: '09:00',
    workEnd: '18:00',
    graceMinutes: 15,
    fullDayHours: 8,
    halfDayHours: 4,
    weeklyOffDays: [0],
    requireGeo: false,
    geofence: null,
    regularizationWindowDays: 7,
    leaveBackdateDays: 30,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Merge raw config_json over defaults, discarding anything malformed. */
export function resolveHrPolicy(raw: unknown): HrPolicy {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
    const num = (v: unknown, d: number, min = 0, max = 1e6) =>
        typeof v === 'number' && isFinite(v) && v >= min && v <= max ? v : d;

    const g = c.geofence;
    const geofence =
        g && typeof g.lat === 'number' && typeof g.lng === 'number' && typeof g.radiusM === 'number' && g.radiusM > 0
            ? { lat: g.lat, lng: g.lng, radiusM: g.radiusM }
            : null;

    const off = Array.isArray(c.weeklyOffDays)
        ? c.weeklyOffDays.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
        : DEFAULT_HR_POLICY.weeklyOffDays;

    return {
        workStart: typeof c.workStart === 'string' && HHMM.test(c.workStart) ? c.workStart : DEFAULT_HR_POLICY.workStart,
        workEnd: typeof c.workEnd === 'string' && HHMM.test(c.workEnd) ? c.workEnd : DEFAULT_HR_POLICY.workEnd,
        graceMinutes: num(c.graceMinutes, DEFAULT_HR_POLICY.graceMinutes, 0, 240),
        fullDayHours: num(c.fullDayHours, DEFAULT_HR_POLICY.fullDayHours, 1, 24),
        halfDayHours: num(c.halfDayHours, DEFAULT_HR_POLICY.halfDayHours, 0.5, 24),
        weeklyOffDays: off,
        requireGeo: c.requireGeo === true,
        geofence,
        regularizationWindowDays: num(c.regularizationWindowDays, DEFAULT_HR_POLICY.regularizationWindowDays, 1, 90),
        leaveBackdateDays: num(c.leaveBackdateDays, DEFAULT_HR_POLICY.leaveBackdateDays, 0, 365),
    };
}

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
