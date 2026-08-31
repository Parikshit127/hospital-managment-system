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

export interface StaffMember {
    id: string;
    username: string;
    name: string | null;
    role: string;
    specialty: string | null;
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
 * Real staff sit at the same desk. An audit trail where the same user appears from a
 * different address every session is the kind of detail that reads as generated, so the
 * address is derived purely from the username: same person, same machine, forever, and
 * identical whichever code path writes the row.
 *
 * Third octet 1–4 stands in for a floor/VLAN, fourth for the desk.
 */
export function workstationIp(username: string): string {
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

/** Whether this person should be on shift at this moment. */
export function isOnDuty(member: StaffMember, at: Date, timezone: string): boolean {
    const [startHour, endHour] = SHIFTS[member.role] ?? DEFAULT_SHIFT;
    const offset = shiftOffsetMinutes(member.username, dayKeyFor(at, timezone));
    const nowMin = minutesIntoDay(at, timezone);
    const start = startHour * 60 + offset;
    const end = endHour * 60 + offset;
    // Overnight shifts wrap around midnight.
    return start <= end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}

export async function loadStaff(organizationId: string): Promise<StaffMember[]> {
    return prisma.user.findMany({
        where: { organizationId, is_active: true },
        select: { id: true, username: true, name: true, role: true, specialty: true },
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
                ip_address: workstationIp(member.username),
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
            ip_address: actor ? workstationIp(actor.username) : null,
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
    const ips = new Set(users.map(workstationIp));
    assert(ips.size === users.length, `workstation collision among bootstrap staff: ${[...ips].join(', ')}`);

    const member = (username: string, role: string): StaffMember =>
        ({ id: `id-${username}`, username, name: username, role, specialty: null });

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
