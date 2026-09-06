/**
 * Duty roster and audit attribution for the background activity engine.
 *
 * The point of this module is coherence, not volume. An audit trail where the
 * receptionist registers a patient at 03:00, or where a record is attributed to someone
 * who never logged in that day, is exactly the sort of thing that falls apart when
 * someone scrolls the log on camera. So:
 *
 *  - Every staff member has a shift window, offset per-person so logins do not all land
 *    on the same minute.
 *  - Session state is DERIVED from the audit log itself — the most recent LOGIN/LOGOUT
 *    row for a user is the source of truth. No extra table, same approach the clinical
 *    state machines use.
 *  - Actions are only ever attributed to somebody currently on duty. If nobody in the
 *    right role is on shift, the action is attributed to whoever is, rather than to a
 *    logged-out account.
 *
 * Plain library. NEVER add 'use server' — it exports constants and sync helpers.
 */
import { prisma } from '@/backend/db';
import { buildWorkstationIps } from '@/app/lib/sim-master-data';

export interface StaffMember {
    id: string;
    username: string;
    name: string | null;
    role: string;
    specialty: string | null;
    /** "09:00-17:00" on the User record. Falls back to the role table when unparseable. */
    working_hours?: string | null;
    /** Comma or space separated day names, e.g. "Mon,Tue,Wed". Empty means all days. */
    working_days?: string | null;
}

/**
 * Shift windows by role, as [startHour, endHour) in the organization's timezone.
 * A window that wraps past midnight (start > end) is treated as an overnight shift.
 */
const SHIFTS: Record<string, [number, number]> = {
    admin: [9, 18],
    receptionist: [8, 20],
    finance: [9, 18],
    lab_technician: [7, 21],
    pharmacist: [8, 21],
    nurse: [7, 19],
    doctor: [9, 18],
    ipd_manager: [8, 20],
};

const DEFAULT_SHIFT: [number, number] = [9, 18];

/** FNV-1a. Small, stable across processes, good spread for short strings. */
function hash32(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/**
 * The workstation a person logs in from — stable for the life of the account.
 *
 * Real staff connect from the same place each day. An audit trail where the same user
 * appears from a different address every session reads as generated, so the address is
 * derived purely from the username: same person, same address, forever, and identical
 * whichever code path writes the row.
 *
 * `overrides` carries the per-simulation map built at clone time, which matches the
 * source hospital's own network pattern. Without it we fall back to a private office
 * range — correct for a hospital whose staff work on a LAN, and the only sensible guess
 * for a simulation with no source to learn from.
 */
export function workstationIp(username: string, overrides?: Record<string, string> | null): string {
    const inherited = overrides?.[username];
    if (inherited) return inherited;

    const h = hash32(username);
    const vlan = 1 + (h % 4);
    const host = 11 + ((h >>> 8) % 230);
    return `10.20.${vlan}.${host}`;
}

/**
 * Per-person, per-day shift offset in minutes.
 *
 * Two components: a fixed part so colleagues never clock in on the same minute, and a
 * daily part so the same person does not clock in at the same minute every day.
 *
 * Derived from (username + date) rather than Math.random() — and that is load-bearing,
 * not tidiness. Session state is read back out of the audit log, so if the offset moved
 * between ticks within a day a user would flap between logged-in and logged-out on every
 * tick, writing a nonsense trail. Stable within the day, different across days.
 */
function shiftOffsetMinutes(username: string, dayKey: string): number {
    const fixed = (hash32(username) % 25) - 12;            // -12..+12, constant per person
    const daily = (hash32(`${username}|${dayKey}`) % 61) - 30; // -30..+30, changes each day
    return fixed + daily;
}

/** YYYY-MM-DD in the given timezone — the stable key for all per-day randomness. */
export function dayKeyFor(at: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at);
}

/**
 * Whole-day traffic multiplier, 0.72–1.28.
 *
 * Real hospitals have slammed days and quiet days; a curve that produces the same volume
 * every single day looks synthetic once anyone compares two days of reports. Keyed on the
 * date so every tick within a day agrees on how busy that day is.
 */
export function dailyVolumeMultiplier(at: Date, timezone: string): number {
    const h = hash32(`volume|${dayKeyFor(at, timezone)}`);
    return 0.72 + (h % 561) / 1000; // 0.720 .. 1.280
}

/** Minutes past midnight, in the given timezone. */
export function minutesIntoDay(at: Date, timezone: string): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
    return (get('hour') % 24) * 60 + get('minute');
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Parse a `User.working_hours` value ("09:00-17:00") into start/end minutes.
 *
 * Returns null on anything unparseable so the caller can fall back to the role table —
 * the column is free text and a partially-filled roster must not silently mean
 * "on duty from 00:00 to 00:00".
 */
function parseWorkingHours(value: string | null | undefined): [number, number] | null {
    const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(value ?? '');
    if (!m) return null;
    const [sh, sm, eh, em] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start === end) return null;
    return [start, end];
}

/** Whether `working_days` (if set) includes this weekday. Empty means every day. */
function worksToday(member: StaffMember, at: Date, timezone: string): boolean {
    const raw = member.working_days?.trim();
    if (!raw) return true;
    const wanted = DAY_NAMES[weekdayIndex(at, timezone)];
    return raw.toLowerCase().split(/[,\s]+/).filter(Boolean).some(d => d.startsWith(wanted));
}

function weekdayIndex(at: Date, timezone: string): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(at);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/**
 * Whether this person should be on shift at this moment.
 *
 * Prefers the person's own `working_hours`, which is what makes cloned staff inherit the
 * source hospital's real roster instead of a generic per-role guess. The role table is
 * the fallback for accounts whose column is blank or malformed.
 */
export function isOnDuty(member: StaffMember, at: Date, timezone: string): boolean {
    if (!worksToday(member, at, timezone)) return false;

    const parsed = parseWorkingHours(member.working_hours);
    const [startMin, endMin] = parsed ?? (() => {
        const [sh, eh] = SHIFTS[member.role] ?? DEFAULT_SHIFT;
        return [sh * 60, eh * 60] as [number, number];
    })();

    const offset = shiftOffsetMinutes(member.username, dayKeyFor(at, timezone));
    const nowMin = minutesIntoDay(at, timezone);
    const start = startMin + offset;
    const end = endMin + offset;
    // Overnight shifts wrap around midnight.
    return start <= end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}

export async function loadStaff(organizationId: string): Promise<StaffMember[]> {
    return prisma.user.findMany({
        where: { organizationId, is_active: true },
        select: {
            id: true, username: true, name: true, role: true, specialty: true,
            working_hours: true, working_days: true,
        },
    });
}

/**
 * Reconcile who *should* be logged in against who the audit log says *is*, and write
 * the difference as LOGIN / LOGOUT rows.
 *
 * Shape matches logAuthEvent() in app/lib/audit.ts exactly (action, module 'Auth',
 * entity_type 'session') so these rows are indistinguishable from real ones. The IP is
 * a plausible clinical-LAN address rather than a public one.
 */
export async function syncStaffSessions(
    organizationId: string,
    staff: StaffMember[],
    at: Date,
    timezone: string,
    workstations?: Record<string, string> | null,
): Promise<{ loggedIn: number; loggedOut: number }> {
    let loggedIn = 0;
    let loggedOut = 0;

    for (const member of staff) {
        const last = await prisma.system_audit_logs.findFirst({
            where: { organizationId, module: 'Auth', user_id: member.id, action: { in: ['LOGIN', 'LOGOUT'] } },
            orderBy: { created_at: 'desc' },
            select: { action: true },
        });

        const currentlyIn = last?.action === 'LOGIN';
        const shouldBeIn = isOnDuty(member, at, timezone);
        if (currentlyIn === shouldBeIn) continue;

        await prisma.system_audit_logs.create({
            data: {
                user_id: member.id,
                username: member.username,
                role: member.role,
                action: shouldBeIn ? 'LOGIN' : 'LOGOUT',
                module: 'Auth',
                entity_type: 'session',
                details: shouldBeIn ? 'Login successful' : 'User logged out',
                ip_address: workstationIp(member.username, workstations),
                organizationId,
                // Spread across the tick so a shift change is not one identical timestamp.
                created_at: new Date(at.getTime() - Math.floor(Math.random() * 8 * 60_000)),
            },
        });

        if (shouldBeIn) loggedIn++; else loggedOut++;
    }

    return { loggedIn, loggedOut };
}

/**
 * Roles that may plausibly stand in for one another when the first choice is off shift.
 *
 * Without this the fallback was "anybody on duty", which produced a pharmacist recorded
 * as the cashier on an inpatient final bill — structurally valid, and obviously wrong to
 * anyone who knows how a hospital runs. Falling back within a competence group keeps the
 * substitution believable.
 */
const ROLE_FALLBACKS: Record<string, string[]> = {
    finance: ['finance', 'ipd_manager', 'receptionist', 'admin'],
    receptionist: ['receptionist', 'opd_manager', 'admin', 'finance'],
    nurse: ['nurse', 'ipd_manager'],
    ipd_manager: ['ipd_manager', 'nurse', 'admin'],
    lab_technician: ['lab_technician'],
    pharmacist: ['pharmacist'],
    doctor: ['doctor'],
    admin: ['admin'],
};

/**
 * Pick somebody on duty to attribute an action to.
 *
 * Order: the requested role on duty → a plausible substitute role on duty → anyone in
 * the requested role regardless of shift. It never falls back to "anyone at all", so a
 * record is never attributed to somebody who could not credibly have done it.
 */
export function actorFor(staff: StaffMember[], role: string, at: Date, timezone: string): StaffMember | null {
    const onDuty = staff.filter(s => isOnDuty(s, at, timezone));
    const pickFrom = (pool: StaffMember[]) =>
        pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;

    for (const candidateRole of ROLE_FALLBACKS[role] ?? [role]) {
        const found = pickFrom(onDuty.filter(s => s.role === candidateRole));
        if (found) return found;
    }
    // Nobody in a credible role is on shift — attribute to the role's own staff anyway
    // rather than to an implausible substitute.
    const anyInRole = staff.filter(s => s.role === role);
    return anyInRole.length ? anyInRole[0] : null;
}

/**
 * Write one audit row attributed to a staff member.
 *
 * `module` is REQUIRED by the schema — omitting it makes the insert throw, and callers
 * that swallow the error then silently record nothing.
 */
export async function logSimAudit(params: {
    organizationId: string;
    actor: StaffMember | null;
    action: string;
    module: string;
    entityType?: string;
    entityId?: string;
    details?: string;
    at?: Date;
    /** Per-simulation workstation map, so audit rows match the login rows. */
    workstations?: Record<string, string> | null;
}): Promise<void> {
    const { organizationId, actor, action, module, entityType, entityId, details, at } = params;
    await prisma.system_audit_logs.create({
        data: {
            user_id: actor?.id ?? null,
            username: actor?.username ?? null,
            role: actor?.role ?? null,
            action,
            module,
            entity_type: entityType ?? null,
            entity_id: entityId ?? null,
            details: details ?? null,
            ip_address: actor ? workstationIp(actor.username, params.workstations) : null,
            organizationId,
            ...(at ? { created_at: at } : {}),
        },
    });
}

// ---------------------------------------------------------------------------
// Self-check (no DB):  npx tsx app/lib/sim-staff.ts
// ---------------------------------------------------------------------------

function selfCheck(): void {
    const assert = (cond: boolean, msg: string) => {
        if (!cond) throw new Error(`sim-staff self-check failed: ${msg}`);
    };
    const TZ = 'Asia/Kolkata';
    const users = ['mgh.reception', 'mgh.dr.pillai', 'mgh.finance', 'mgh.lab', 'mgh.nurse', 'mgh.admin'];

    // Workstations: stable per person, well spread across people.
    for (const u of users) {
        assert(workstationIp(u) === workstationIp(u), `workstation not stable for ${u}`);
        assert(/^10\.20\.[1-4]\.(1[1-9]|[2-9]\d|1\d\d|2[0-3]\d|240)$/.test(workstationIp(u)), `bad ip shape for ${u}: ${workstationIp(u)}`);
    }
    const ips = new Set(users.map(u => workstationIp(u)));
    assert(ips.size === users.length, `workstation collision among bootstrap staff: ${[...ips].join(', ')}`);

    // An inherited map wins over the generated fallback.
    assert(workstationIp('mgh.lab', { 'mgh.lab': '49.200.60.31' }) === '49.200.60.31', 'override must win');
    assert(workstationIp('mgh.lab', { 'other.user': '1.2.3.4' }) === workstationIp('mgh.lab'), 'unmapped user must fall back');

    // Pattern is inherited, addresses are not: no generated address may equal one the
    // source hospital actually used.
    const real = ['223.190.82.125', '49.200.60.26', '49.156.87.173', '122.162.144.155', '::1', '10.0.0.5'];
    const built = buildWorkstationIps(users, real);
    assert(Object.keys(built).length === users.length, 'every user should get an address from a usable pool');
    assert(Object.values(built).every(ip => !real.includes(ip)), `a real source address was reproduced: ${JSON.stringify(built)}`);
    assert(
        Object.values(built).every(ip => ['223.190.82', '49.200.60', '49.156.87', '122.162.144'].includes(ip.split('.').slice(0, 3).join('.'))),
        'generated addresses must sit inside the source hospital\'s own blocks',
    );
    assert(new Set(Object.values(built)).size === users.length, 'two people must not share one address');
    // Private and loopback source rows contribute nothing.
    assert(Object.keys(buildWorkstationIps(users, ['::1', '10.0.0.5', '192.168.1.9'])).length === 0,
        'a source with no public addresses must yield no map, so the default applies');

    const member = (username: string, role: string, hours?: string, days?: string): StaffMember =>
        ({ id: `id-${username}`, username, name: username, role, specialty: null, working_hours: hours, working_days: days });

    // working_hours must win over the role table — this is what makes cloned staff
    // inherit the source hospital's roster rather than a generic per-role guess.
    const TZ_ = 'Asia/Kolkata';
    const night = new Date('2026-09-01T18:30:00Z'); // 00:00 IST
    const noon = new Date('2026-09-01T06:30:00Z');  // 12:00 IST
    const nightOwl = member('night.owl', 'receptionist', '22:00-06:00');
    const dayShift = member('day.shift', 'receptionist', '09:00-17:00');
    assert(isOnDuty(nightOwl, night, TZ_), 'overnight working_hours must span midnight');
    assert(!isOnDuty(nightOwl, noon, TZ_), 'overnight worker must be off at midday');
    assert(isOnDuty(dayShift, noon, TZ_), 'day working_hours must be on at midday');
    assert(!isOnDuty(dayShift, night, TZ_), 'day worker must be off at midnight');

    // Malformed or blank values fall back to the role table rather than reading as
    // "never on duty" — the column is free text on a real roster.
    for (const bad of ['', 'whenever', '9 to 5', '99:00-17:00', '09:00-09:00']) {
        const fallback = member(`bad.${bad.length}`, 'receptionist', bad);
        const roleOnly = member(`bad.${bad.length}`, 'receptionist');
        assert(
            isOnDuty(fallback, noon, TZ_) === isOnDuty(roleOnly, noon, TZ_),
            `unparseable working_hours "${bad}" must fall back to the role shift`,
        );
    }

    // working_days gates the whole day.
    const sunday = new Date('2026-09-06T06:30:00Z'); // Sunday noon IST
    assert(!isOnDuty(member('weekday.only', 'receptionist', '09:00-17:00', 'Mon,Tue,Wed,Thu,Fri'), sunday, TZ_),
        'working_days must exclude a day not listed');
    assert(isOnDuty(member('weekday.only', 'receptionist', '09:00-17:00', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun'), sunday, TZ_),
        'working_days must include a listed day');

    // Shift offsets: identical for every instant within a day, different across days.
    // If this ever regresses, session state derived from the audit log starts flapping.
    const dayA = new Date('2026-09-01T04:00:00Z');
    const dayAlater = new Date('2026-09-01T09:00:00Z');
    const dayB = new Date('2026-09-02T04:00:00Z');
    assert(dayKeyFor(dayA, TZ) === dayKeyFor(dayAlater, TZ), 'day key not stable within a day');
    assert(dayKeyFor(dayA, TZ) !== dayKeyFor(dayB, TZ), 'day key not changing across days');

    let anyShiftMoved = false;
    for (const u of users) {
        const r = member(u, 'receptionist');
        // Walk the whole day; on-duty must be a single contiguous window, not flapping.
        const sample = (d: Date, mins: number) => isOnDuty(r, new Date(d.getTime() + mins * 60_000), TZ);
        const a1 = [...Array(48)].map((_, i) => sample(dayA, i * 30));
        const a2 = [...Array(48)].map((_, i) => sample(dayA, i * 30));
        assert(JSON.stringify(a1) === JSON.stringify(a2), `on-duty not deterministic within a day for ${u}`);
        const b1 = [...Array(48)].map((_, i) => sample(dayB, i * 30));
        if (JSON.stringify(a1) !== JSON.stringify(b1)) anyShiftMoved = true;
    }
    assert(anyShiftMoved, 'shift boundaries identical on every day — daily jitter is not applied');

    // Daily volume: in range, stable within a day, varies across days.
    const days = [...Array(30)].map((_, i) => new Date(Date.UTC(2026, 8, i + 1, 6, 0, 0)));
    const mults = days.map(d => dailyVolumeMultiplier(d, TZ));
    for (const m of mults) assert(m >= 0.72 && m <= 1.28, `daily multiplier out of range: ${m}`);
    assert(
        dailyVolumeMultiplier(dayA, TZ) === dailyVolumeMultiplier(dayAlater, TZ),
        'daily multiplier not stable within a day',
    );
    assert(new Set(mults).size >= 20, `daily multiplier not varying enough across days (${new Set(mults).size}/30)`);
    const spread = Math.max(...mults) - Math.min(...mults);
    assert(spread > 0.25, `daily multiplier spread too narrow (${spread.toFixed(3)})`);

    console.log('sim-staff.ts self-check passed');
    console.log('  workstations:', users.map(u => `${u}=${workstationIp(u)}`).join('  '));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('app/lib/sim-staff.ts')) selfCheck();
