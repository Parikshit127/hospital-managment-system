/**
 * Hospital-local (IST) date/time display helpers.
 *
 * WHY THIS EXISTS: the production server runs on UTC while the hospital operates
 * in IST (UTC+5:30). Any toLocaleDateString/toLocaleString/toLocaleTimeString
 * WITHOUT an explicit `timeZone` renders in the server's zone (UTC), so times
 * read 5h30m early — a 10:00 AM IST discharge shows as 04:30 AM — and anything
 * before 05:30 IST shows the PREVIOUS day's date.
 *
 * Note that passing only a locale ('en-IN' / 'en-GB') does NOT fix this: locale
 * controls the format, not the zone. The zone must be passed explicitly.
 *
 * Deliberately free of server-only imports (unlike ./timezone.ts, which pulls in
 * requireTenantContext) so `'use client'` components can use these too. Prefer
 * these over raw toLocale* for any user-facing timestamp.
 */

export const IST = 'Asia/Kolkata';

/** DD/MM/YYYY in IST. Returns '—' for null/invalid. */
export function fmtIstDate(date: Date | string | null | undefined): string {
    const d = toDate(date);
    if (!d) return '—';
    return d.toLocaleDateString('en-GB', {
        timeZone: IST,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/** DD/MM/YYYY, hh:mm am/pm in IST. Use wherever a time-of-day is shown. */
export function fmtIstDateTime(date: Date | string | null | undefined): string {
    const d = toDate(date);
    if (!d) return '—';
    return d.toLocaleString('en-GB', {
        timeZone: IST,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

/** hh:mm am/pm in IST. */
export function fmtIstTime(date: Date | string | null | undefined): string {
    const d = toDate(date);
    if (!d) return '—';
    return d.toLocaleTimeString('en-GB', {
        timeZone: IST,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

/**
 * YYYY-MM-DD for the IST calendar day — the same shape `<input type="date">`
 * produces, so a timestamp can be compared against a picked date.
 *
 * Use this instead of `toISOString().slice(0, 10)`, which buckets by UTC: an
 * admission at 02:00 IST is 20:30 UTC the day before, so it files under the
 * previous day and disappears from a filter on its real date.
 */
export function istDayKey(date: Date | string | null | undefined): string | null {
    const d = toDate(date);
    if (!d) return null;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: IST,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

function toDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    return isNaN(d.getTime()) ? null : d;
}
