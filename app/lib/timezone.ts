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
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const dateStr = formatter.format(now); // "2025-03-20"

    // Build midnight in that timezone by parsing the local date
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(`${dateStr}T23:59:59.999`);

    // Convert from timezone-local to UTC
    const offsetMs = getTimezoneOffsetMs(timezone, now);
    start.setTime(start.getTime() - offsetMs);
    end.setTime(end.getTime() - offsetMs);

    return { start, end };
}

/**
 * Get the offset in ms between a timezone and UTC at a given instant.
 */
function getTimezoneOffsetMs(timezone: string, date: Date): number {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
    return new Date(tzStr).getTime() - new Date(utcStr).getTime();
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
    return d.toLocaleDateString('en-IN', {
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
