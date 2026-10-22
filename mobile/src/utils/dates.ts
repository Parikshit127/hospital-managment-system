/**
 * All HR dates are IST calendar days ("YYYY-MM-DD") and IST wall-clock times, matching the server
 * (app/lib/hr/hr-dates.ts). We never use the phone's timezone: a person travelling or a wrong phone
 * clock must not change which day a record belongs to.
 */

const IST_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Shift an instant into IST so the UTC getters read IST wall-clock values. */
const ist = (ms: number) => new Date(ms + IST_MS);

export const todayKey = (nowMs = Date.now()): string => ist(nowMs).toISOString().slice(0, 10);
export const monthKeyOf = (key: string) => key.slice(0, 7);
export const currentMonthKey = () => todayKey().slice(0, 7);

export function addDays(key: string, n: number): string {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function addMonths(monthKey: string, n: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export const weekdayOf = (key: string): number => new Date(`${key}T00:00:00Z`).getUTCDay();
export const daysInMonth = (monthKey: string): number => {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** "07 Oct" */
export function fmtShort(key: string): string {
    const [, m, d] = key.split('-').map(Number);
    return `${pad(d)} ${MONTHS[m - 1]}`;
}

/** "Tue, 07 Oct 2026" */
export function fmtLong(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return `${WEEKDAYS[weekdayOf(key)]}, ${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

/** "October 2026" */
export function fmtMonth(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "09:05 AM" from an ISO instant, shown in IST. */
export function fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = ist(new Date(iso).getTime());
    const h = d.getUTCHours();
    return `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(d.getUTCMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "HH:mm" (24h, IST) from an ISO instant — for prefilling time inputs. */
export function hhmm(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = ist(new Date(iso).getTime());
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "09:00" -> "9:00 AM" */
export function fmtClock(hhmmStr: string | null | undefined): string {
    if (!hhmmStr) return '—';
    const [h, m] = hhmmStr.split(':').map(Number);
    return `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "2h 15m" */
export function fmtDuration(ms: number): string {
    const mins = Math.max(0, Math.floor(ms / 60000));
    return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
}

export const fmtHours = (h: number | null | undefined) => (typeof h === 'number' ? `${h.toFixed(1)} h` : '—');

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00Z`).getTime());
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
