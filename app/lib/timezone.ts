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

    // Get today's date string in the target timezone (YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const dateStr = formatter.format(now); // "2025-03-20"

    // Use Intl to get exact midnight and end-of-day in UTC for that timezone
    const startLocal = new Date(`${dateStr}T00:00:00`);
    const endLocal = new Date(`${dateStr}T23:59:59.999`);

    // Get timezone offset using a reliable method
    const offsetMs = getTimezoneOffsetMs(timezone, now);
    const start = new Date(startLocal.getTime() - offsetMs);
    const end = new Date(endLocal.getTime() - offsetMs);

    // Safety check
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        // Fallback: plain UTC today
        const utcStr = now.toISOString().slice(0, 10);
        return {
            start: new Date(`${utcStr}T00:00:00.000Z`),
            end: new Date(`${utcStr}T23:59:59.999Z`),
        };
    }

    return { start, end };
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
