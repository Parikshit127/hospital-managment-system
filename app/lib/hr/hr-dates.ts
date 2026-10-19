/**
 * HR date helpers. Client-safe (no server imports).
 *
 * Convention used by every HR table that has a `date` column (attendances,
 * holidays, attendance_regularizations): the stored value is **UTC midnight of
 * the IST calendar day** ("2026-10-19" -> 2026-10-19T00:00:00.000Z). That makes
 * the value independent of the server's timezone and lets (employee_id, date)
 * be a real unique key. Punch timestamps (check_in / occurred_at) are real
 * instants; use istDayBounds() to find the instants a calendar day spans.
 */

import { IST, istDayKey } from '@/app/lib/ist';

const IST_OFFSET = '+05:30';
const DAY_MS = 24 * 60 * 60 * 1000;

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDayKey(v: unknown): v is string {
    return typeof v === 'string' && DAY_KEY_RE.test(v) && !isNaN(new Date(`${v}T00:00:00.000Z`).getTime());
}

export function isMonthKey(v: unknown): v is string {
    return typeof v === 'string' && MONTH_KEY_RE.test(v) && Number(v.slice(5, 7)) >= 1 && Number(v.slice(5, 7)) <= 12;
}

/** Today's IST calendar day as YYYY-MM-DD. */
export function istTodayKey(now: Date = new Date()): string {
    return istDayKey(now) as string;
}

/** The value stored in a `date` column for an IST calendar day. */
export function dayStartUtc(dayKey: string): Date {
    return new Date(`${dayKey}T00:00:00.000Z`);
}

/** The real instants an IST calendar day spans: [start, end). */
export function istDayBounds(dayKey: string): { start: Date; end: Date } {
    const start = new Date(`${dayKey}T00:00:00${IST_OFFSET}`);
    return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** "HH:mm" on an IST calendar day -> real instant. */
export function istTimeOnDay(dayKey: string, hhmm: string): Date {
    return new Date(`${dayKey}T${hhmm}:00${IST_OFFSET}`);
}

export function addDaysKey(dayKey: string, n: number): string {
    return new Date(dayStartUtc(dayKey).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday, for a calendar day (timezone independent). */
export function weekdayOfKey(dayKey: string): number {
    return dayStartUtc(dayKey).getUTCDay();
}

/** Inclusive list of day keys. Capped so a bad range can't spin forever. */
export function eachDayKey(fromKey: string, toKey: string, cap = 400): string[] {
    const out: string[] = [];
    let cur = fromKey;
    while (cur <= toKey && out.length < cap) {
        out.push(cur);
        cur = addDaysKey(cur, 1);
    }
    return out;
}

/** First day, last day (inclusive) and following-month first day of "YYYY-MM". */
export function monthBounds(monthKey: string): { first: string; last: string; nextFirst: string } {
    const first = `${monthKey}-01`;
    const d = dayStartUtc(first);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const nextFirst = next.toISOString().slice(0, 10);
    return { first, last: addDaysKey(nextFirst, -1), nextFirst };
}

export function currentMonthKey(now: Date = new Date()): string {
    return istTodayKey(now).slice(0, 7);
}

/** "HH:mm" (24h) in IST for an instant — the value an <input type="time"> expects. */
export function istHHmm(d: Date | string | null | undefined): string {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** Minutes between two instants, rounded down, never negative. */
export function minutesBetween(a: Date, b: Date): number {
    return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));
}

export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export { IST };
