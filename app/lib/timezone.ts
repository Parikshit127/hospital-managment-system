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
 * Get the start and end timestamps of a given YYYY-MM-DD day in a timezone.
 * E.g. for Asia/Kolkata, midnight IST → 18:30 prev day UTC.
 *
 * The `Z` on both literals is load-bearing: without it the string parses in the
 * *server's* zone before the offset is subtracted, so the range was correct on a
 * UTC deploy box and 5.5h wrong on an IST dev machine.
 */
export function getDayRange(dateStr: string, timezone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
    const startLocal = new Date(`${dateStr}T00:00:00.000Z`);
    const endLocal = new Date(`${dateStr}T23:59:59.999Z`);

    if (isNaN(startLocal.getTime())) {
        // Unparseable date — fall back to a range that matches nothing rather
        // than an Invalid Date, which Prisma rejects at query time.
        return { start: new Date(0), end: new Date(0) };
    }

    const offsetMs = getTimezoneOffsetMs(timezone, startLocal);
    return {
        start: new Date(startLocal.getTime() - offsetMs),
        end: new Date(endLocal.getTime() - offsetMs),
    };
}

/**
 * Get today's start and end timestamps in the given timezone.
 */
export function getTodayRange(timezone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
    // Today's date in the target timezone (YYYY-MM-DD)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());

    return getDayRange(dateStr, timezone);
}

/**
 * Get the offset in ms between a timezone and UTC at a given instant.
 */
function getTimezoneOffsetMs(timezone: string, date: Date): number {
    try {
        // Use Intl.DateTimeFormat parts for reliable parsing
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(date);

        const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
        const tzDate = new Date(Date.UTC(
            Number(get('year')),
            Number(get('month')) - 1,
            Number(get('day')),
            Number(get('hour')) % 24,
            Number(get('minute')),
            Number(get('second')),
        ));
        return tzDate.getTime() - date.getTime();
    } catch {
        return 0;
    }
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
