import { requireTenantContext } from '@/backend/tenant';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Get the org's configured timezone (server-side).
 * Falls back to Asia/Kolkata if not set.
 */
export async function getOrgTimezone(): Promise<string> {
    try {
        const { db, organizationId } = await requireTenantContext();
        const config = await db.OrganizationConfig.findUnique({
            where: { organizationId },
            select: { timezone: true },
        });
        return config?.timezone || DEFAULT_TIMEZONE;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

/**
 * Get today's start and end timestamps in the given timezone.
 * E.g. for Asia/Kolkata, midnight IST → 18:30 prev day UTC.
 */
export function getTodayRange(timezone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
    const now = new Date();

    // Guard against an invalid/garbage tz string in config — fall back to default.
    let tz = timezone;
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    } catch {
        tz = DEFAULT_TIMEZONE;
    }

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit', // MUST be numeric — produces "2025-03-20"; "short" yields "Jun 12, 2026" → Invalid Date
        day: '2-digit',
    });
    const dateStr = formatter.format(now); // "2025-03-20"

    // Build midnight as a UTC instant (explicit "Z"), then shift by the tz offset
    // so the range represents local midnight..end-of-day in `tz`.
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(`${dateStr}T23:59:59.999Z`);

    const offsetMs = getTimezoneOffsetMs(tz, now);
    start.setTime(start.getTime() - offsetMs);
    end.setTime(end.getTime() - offsetMs);

    return { start, end };
}

/**
 * Offset in ms between a timezone and UTC at a given instant (positive when the
 * timezone is ahead of UTC). Uses formatToParts so it never depends on locale
 * date-string parsing (e.g. "13/06/2026" → Invalid Date in V8).
 */
function getTimezoneOffsetMs(timezone: string, date: Date): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
    const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asIfUtc - date.getTime();
}

/**
 * Format a date for display in the given timezone.
 */
export function formatDateTime(date: Date | string, timezone: string = DEFAULT_TIMEZONE): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-IN', {
        timeZone: timezone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

/**
 * Format date only (no time) in the given timezone.
 */
export function formatDateShort(date: Date | string, timezone: string = DEFAULT_TIMEZONE): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', {
        timeZone: timezone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Format time only in the given timezone.
 */
export function formatTime(date: Date | string, timezone: string = DEFAULT_TIMEZONE): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('en-IN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}
