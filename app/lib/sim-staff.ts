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

/** Stable per-user offset in minutes, so two people never clock in on the same minute. */
function shiftOffsetMinutes(username: string): number {
    let h = 0;
    for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
    return (h % 47) - 23; // roughly -23..+23 minutes
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
    const offset = shiftOffsetMinutes(member.username);
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
                ip_address: `10.20.${1 + (member.username.length % 4)}.${20 + (member.id.charCodeAt(0) % 200)}`,
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
 * Pick somebody on duty to attribute an action to.
 *
 * Falls back through: the requested role on duty → anyone on duty → the requested role
 * regardless. The last case only happens if the roster is empty for that hour, and is
 * still better than attributing to nobody.
 */
export function actorFor(staff: StaffMember[], role: string, at: Date, timezone: string): StaffMember | null {
    const onDuty = staff.filter(s => isOnDuty(s, at, timezone));
    const inRole = onDuty.filter(s => s.role === role);
    if (inRole.length) return inRole[Math.floor(Math.random() * inRole.length)];
    if (onDuty.length) return onDuty[Math.floor(Math.random() * onDuty.length)];
    const anyInRole = staff.filter(s => s.role === role);
    return anyInRole.length ? anyInRole[0] : (staff[0] ?? null);
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
            ip_address: actor ? `10.20.${1 + (actor.username.length % 4)}.${20 + (actor.id.charCodeAt(0) % 200)}` : null,
            organizationId,
            ...(at ? { created_at: at } : {}),
        },
    });
}
