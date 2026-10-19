/**
 * HR engine shared by the HR admin actions and the employee self-service actions.
 * Server-only (uses tenant context + headers). Not a 'use server' file: these are
 * plain helpers, never callable from the browser directly.
 *
 * Tenant-safety note: getTenantPrisma scopes reads and creates by organizationId
 * but NOT update/delete/upsert-by-id. Every mutation here first loads the row with
 * a scoped findFirst/findUnique and only then writes by id.
 */

import { headers } from 'next/headers';
import { requireTenantContext, ForbiddenError } from '@/backend/tenant';
import { hasPermission } from '@/app/lib/session';
import { istDayKey } from '@/app/lib/ist';
import {
    addDaysKey, dayStartUtc, eachDayKey, istDayBounds, istTimeOnDay, istTodayKey,
    minutesBetween, monthBounds, round2, weekdayOfKey,
} from './hr-dates';
import { haversineM, resolveHrPolicy, type HrPolicy } from './hr-policy';

type Db = any; // tenant-scoped prisma client (see backend/db.ts)

export interface HrCtx {
    db: Db;
    session: { id: string; username: string; name: string; role: string; organization_id: string };
    organizationId: string;
}

export class HrError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HrError';
    }
}

// ─── Guards ────────────────────────────────────────────────────────────────

/** Any logged-in hospital staff member. Patient sessions are rejected. */
export async function requireStaff(): Promise<HrCtx> {
    const ctx = await requireTenantContext();
    if (!ctx.session?.id || ctx.session.role === 'patient') {
        throw new ForbiddenError('FORBIDDEN_ERROR: staff access only');
    }
    return ctx as HrCtx;
}

export type HrAction = 'view' | 'create' | 'edit' | 'approve' | 'export';

/** Staff member holding hr.<action> (admin always passes). */
export async function requireHr(action: HrAction): Promise<HrCtx> {
    const ctx = await requireStaff();
    if (!(await hasPermission(`hr.${action}`))) {
        throw new ForbiddenError(`FORBIDDEN_ERROR: hr.${action} required`);
    }
    return ctx;
}

/** Shape server-action errors into the { success:false, error } the UI expects. */
export function hrFail(error: unknown, fallback: string): { success: false; error: string } {
    if (error instanceof HrError) return { success: false, error: error.message };
    if (error instanceof ForbiddenError) return { success: false, error: 'You do not have permission to do that.' };
    if ((error as any)?.name === 'AuthError') return { success: false, error: 'Session expired. Please log in again.' };
    console.error(fallback, error);
    return { success: false, error: fallback };
}

// ─── Policy ────────────────────────────────────────────────────────────────

export async function loadHrPolicy(db: Db): Promise<HrPolicy> {
    const row = await db.moduleConfig.findFirst({ where: { module_key: 'hr' } });
    return resolveHrPolicy(row?.config_json);
}

// ─── Employees ─────────────────────────────────────────────────────────────

/** Next free EMP-nnnnn for the org; the unique index is the real guard, so retry on collision. */
export async function createEmployeeWithCode(db: Db, organizationId: string, data: Record<string, any>) {
    const count = await db.employee.count();
    for (let i = 1; i <= 25; i++) {
        const code = `EMP-${String(count + i).padStart(5, '0')}`;
        try {
            return await db.employee.create({ data: { ...data, employee_code: code, organizationId } });
        } catch (e: any) {
            if (e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('employee_code')) continue;
            throw e;
        }
    }
    throw new HrError('Could not allocate an employee code. Try again.');
}

/**
 * The Employee row for a login user, created on first use. Guarantees every
 * staff login has an HR profile even if it pre-dates the backfill migration.
 */
export async function ensureEmployeeForUser(db: Db, organizationId: string, userId: string) {
    const existing = await db.employee.findFirst({ where: { user_id: userId } });
    if (existing) return existing;

    const user = await db.user.findFirst({ where: { id: userId } });
    if (!user) throw new HrError('User not found');

    try {
        return await createEmployeeWithCode(db, organizationId, {
            user_id: user.id,
            name: user.name || user.username,
            designation: user.designation || user.role,
            date_of_joining: user.date_of_joining ?? user.createdAt ?? new Date(),
            phone: user.phone ?? null,
            email: user.email ?? null,
            branch_id: user.branch_id ?? null,
            gender: user.gender ?? null,
            is_active: user.is_active,
        });
    } catch (e: any) {
        // Two tabs raced to create it: user_id is unique, so just read the winner.
        if (e?.code === 'P2002') {
            const again = await db.employee.findFirst({ where: { user_id: userId } });
            if (again) return again;
        }
        throw e;
    }
}

/** The caller's own employee profile. */
export async function getMyEmployee(ctx: HrCtx) {
    return ensureEmployeeForUser(ctx.db, ctx.organizationId, ctx.session.id);
}

/** Load an employee of this org by id or fail. */
export async function loadEmployee(db: Db, id: number) {
    if (!Number.isInteger(id)) throw new HrError('Invalid employee');
    const emp = await db.employee.findFirst({ where: { id } });
    if (!emp) throw new HrError('Employee not found');
    return emp;
}

/** Can this session act on `employee` as their reporting manager? */
export async function isManagerOf(db: Db, session: HrCtx['session'], employee: { reporting_manager_id: number | null }) {
    if (!employee.reporting_manager_id) return false;
    const mgr = await db.employee.findFirst({
        where: { id: employee.reporting_manager_id },
        select: { user_id: true },
    });
    return !!mgr?.user_id && mgr.user_id === session.id;
}

// ─── Notifications (best effort, never block the action) ───────────────────

export async function notifyUsers(
    db: Db, organizationId: string, userIds: (string | null | undefined)[],
    title: string, body: string, link?: string,
) {
    const ids = Array.from(new Set(userIds.filter((u): u is string => !!u)));
    if (!ids.length) return;
    try {
        await db.notification.createMany({
            data: ids.map(user_id => ({ user_id, title, body, type: 'info', link: link ?? null, organizationId })),
        });
    } catch (e) {
        console.warn('HR notification failed (non-fatal):', e);
    }
}

/** Users who should hear about an employee's request: HR staff + their manager. */
export async function approverUserIds(db: Db, employee: { reporting_manager_id: number | null }) {
    const hr = await db.user.findMany({ where: { role: 'hr', is_active: true }, select: { id: true } });
    let managerUserId: string | null = null;
    if (employee.reporting_manager_id) {
        const mgr = await db.employee.findFirst({
            where: { id: employee.reporting_manager_id }, select: { user_id: true },
        });
        managerUserId = mgr?.user_id ?? null;
    }
    return [...hr.map((u: any) => u.id), managerUserId];
}

// ─── Attendance: punch engine ──────────────────────────────────────────────

const STALE_PUNCH_MS = 20 * 60 * 60 * 1000; // an unclosed IN older than this is abandoned
const MIN_GAP_MS = 60 * 1000;               // double-click guard

export interface PunchInput {
    type: 'IN' | 'OUT';
    lat?: number;
    lng?: number;
    accuracy?: number;
    note?: string;
    source?: 'WEB' | 'MOBILE';
}

async function requestMeta() {
    try {
        const h = await headers();
        return {
            ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
            ua: h.get('user-agent')?.slice(0, 250) || null,
        };
    } catch {
        return { ip: null, ua: null };
    }
}

/** Current punch state for an employee: is there an open IN? */
export async function getPunchState(db: Db, employeeId: number, now = new Date()) {
    const last = await db.attendanceEvent.findFirst({
        where: { employee_id: employeeId },
        orderBy: { occurred_at: 'desc' },
    });
    const open = last && last.type === 'IN' && now.getTime() - last.occurred_at.getTime() < STALE_PUNCH_MS ? last : null;
    return { last, open };
}

export async function recordPunch(ctx: HrCtx, employee: any, input: PunchInput) {
    const { db, organizationId } = ctx;
    if (input.type !== 'IN' && input.type !== 'OUT') throw new HrError('Invalid punch type');
    if (!employee.is_active) throw new HrError('Your employee profile is inactive. Contact HR.');

    const policy = await loadHrPolicy(db);
    const now = new Date(); // server clock only; the browser's time is never trusted
    const { last, open } = await getPunchState(db, employee.id, now);

    if (last && now.getTime() - last.occurred_at.getTime() < MIN_GAP_MS) {
        throw new HrError('You just punched. Please wait a minute before punching again.');
    }
    if (input.type === 'IN' && open) throw new HrError('You are already punched in.');
    if (input.type === 'OUT' && !open) throw new HrError('You are not punched in.');

    const hasCoords = typeof input.lat === 'number' && typeof input.lng === 'number'
        && isFinite(input.lat) && isFinite(input.lng)
        && Math.abs(input.lat) <= 90 && Math.abs(input.lng) <= 180;

    if (policy.requireGeo) {
        if (!policy.geofence) throw new HrError('Location check is on but no work location is configured. Contact HR.');
        if (!hasCoords) throw new HrError('Location is required to punch. Allow location access and try again.');
        const dist = haversineM({ lat: input.lat!, lng: input.lng! }, policy.geofence);
        if (dist > policy.geofence.radiusM) {
            throw new HrError(`You are ${Math.round(dist)} m from the work location (allowed ${policy.geofence.radiusM} m).`);
        }
    }

    const meta = await requestMeta();
    const event = await db.attendanceEvent.create({
        data: {
            employee_id: employee.id,
            type: input.type,
            occurred_at: now,
            source: input.source ?? 'WEB',
            latitude: hasCoords ? input.lat : null,
            longitude: hasCoords ? input.lng : null,
            accuracy_m: typeof input.accuracy === 'number' && isFinite(input.accuracy) ? input.accuracy : null,
            ip_address: meta.ip,
            user_agent: meta.ua,
            note: input.note?.slice(0, 200) || null,
        },
    });

    // OUT belongs to the day of the IN it closes (night shifts cross midnight).
    const dayKey = istDayKey(input.type === 'IN' ? now : open.occurred_at) as string;
    const attendance = await recomputeAttendanceDay(db, organizationId, employee, dayKey, policy, input.source ?? 'WEB');
    return { event, attendance };
}

interface Pair { in: Date; out: Date | null }

/** Pair raw IN/OUT events (ordered) into sessions. A second IN abandons the previous one. */
export function pairEvents(events: { type: string; occurred_at: Date }[]): Pair[] {
    const pairs: Pair[] = [];
    let current: Pair | null = null;
    for (const e of events) {
        if (e.type === 'IN') {
            if (current) pairs.push(current);
            current = { in: e.occurred_at, out: null };
        } else if (e.type === 'OUT' && current) {
            current.out = e.occurred_at;
            pairs.push(current);
            current = null;
        }
    }
    if (current) pairs.push(current);
    return pairs;
}

/** Derive the day's Attendance row from its punch events. */
export async function recomputeAttendanceDay(
    db: Db, organizationId: string, employee: any, dayKey: string, policy: HrPolicy, source: string,
) {
    const { start, end } = istDayBounds(dayKey);
    // Pull 36h so an OUT after midnight still pairs with an IN on this day.
    const events = await db.attendanceEvent.findMany({
        where: { employee_id: employee.id, occurred_at: { gte: start, lt: new Date(start.getTime() + 36 * 3600 * 1000) } },
        orderBy: { occurred_at: 'asc' },
    });
    const pairs = pairEvents(events).filter(p => p.in >= start && p.in < end);
    if (!pairs.length) return null;

    const firstIn = pairs[0].in;
    const closed = pairs.filter(p => p.out);
    const lastOut = closed.length ? closed[closed.length - 1].out : null;
    const stillOpen = pairs[pairs.length - 1].out === null;
    const hours = round2(closed.reduce((s, p) => s + (p.out!.getTime() - p.in.getTime()) / 3600000, 0));

    let status: string;
    if (stillOpen && Date.now() - pairs[pairs.length - 1].in.getTime() < STALE_PUNCH_MS) status = 'Present'; // in progress
    else if (hours >= policy.fullDayHours) status = 'Present';
    else if (hours >= policy.halfDayHours) status = 'Half-Day';
    else status = stillOpen ? 'Present' : 'Half-Day'; // abandoned IN: HR/employee regularizes

    // Late = first punch-in vs the rostered shift (or the org default) beyond the grace period.
    const shift = await db.shiftAssignment.findFirst({
        where: { employee_id: employee.id, date: { gte: dayStartUtc(dayKey), lt: dayStartUtc(addDaysKey(dayKey, 1)) } },
        include: { shift_pattern: true },
    });
    const startHHMM = shift?.shift_pattern?.start_time || policy.workStart;
    const late = minutesBetween(istTimeOnDay(dayKey, startHHMM), firstIn);
    const lateMinutes = late > policy.graceMinutes ? late : 0;

    return saveAttendance(db, organizationId, employee.id, dayKey, {
        check_in: firstIn,
        check_out: lastOut,
        total_hours: closed.length ? hours : null,
        status,
        source,
        late_minutes: lateMinutes,
    });
}

/** Write the one Attendance row for (employee, day). The unique index makes this race-safe. */
export async function saveAttendance(
    db: Db, organizationId: string, employeeId: number, dayKey: string, data: Record<string, any>,
) {
    const date = dayStartUtc(dayKey);
    const existing = await db.attendance.findFirst({
        where: { employee_id: employeeId, date: { gte: date, lt: dayStartUtc(addDaysKey(dayKey, 1)) } },
    });
    if (existing) return db.attendance.update({ where: { id: existing.id }, data });
    try {
        return await db.attendance.create({ data: { employee_id: employeeId, date, ...data } });
    } catch (e: any) {
        if (e?.code === 'P2002') {
            const winner = await db.attendance.findFirst({ where: { employee_id: employeeId, date } });
            if (winner) return db.attendance.update({ where: { id: winner.id }, data });
        }
        throw e;
    }
}

// ─── Month view (calendar) ─────────────────────────────────────────────────

export type DayStatus =
    | 'Present' | 'Half-Day' | 'Absent' | 'Leave' | 'Holiday' | 'Week-Off'
    | 'Not Marked' | 'Upcoming' | 'N/A';

export interface DayCell {
    date: string;
    status: DayStatus;
    /** true when no row exists and the status was inferred (e.g. a past working day with no punch). */
    computed: boolean;
    check_in: string | null;
    check_out: string | null;
    total_hours: number | null;
    late_minutes: number;
    holiday?: string;
    source?: string;
}

export interface MonthSummary {
    present: number; halfDay: number; absent: number; leave: number;
    holidays: number; weekOffs: number; lateCount: number; totalHours: number;
    workingDays: number; payableDays: number;
}

/** Approved leave covering each day key for one employee. */
function leaveDayMap(leaves: any[]) {
    const map = new Map<string, { half: boolean }>();
    for (const l of leaves) {
        const from = l.from_date.toISOString().slice(0, 10);
        const to = l.to_date.toISOString().slice(0, 10);
        for (const k of eachDayKey(from, to)) map.set(k, { half: !!l.is_half_day });
    }
    return map;
}

export async function loadMonthContext(db: Db, monthKey: string) {
    const { first, last, nextFirst } = monthBounds(monthKey);
    const [holidays, policy] = await Promise.all([
        db.holiday.findMany({ where: { date: { gte: dayStartUtc(first), lt: dayStartUtc(nextFirst) } } }),
        loadHrPolicy(db),
    ]);
    const holidayMap = new Map<string, string>();
    for (const h of holidays) if (h.type === 'PUBLIC') holidayMap.set(h.date.toISOString().slice(0, 10), h.name);
    return { first, last, nextFirst, holidayMap, policy };
}

export function buildMonthCells(opts: {
    monthKey: string; first: string; last: string;
    employee: { date_of_joining: Date; date_of_exit: Date | null };
    attendances: any[]; leaves: any[];
    holidayMap: Map<string, string>; policy: HrPolicy; todayKey: string;
}): { days: DayCell[]; summary: MonthSummary } {
    const { first, last, employee, attendances, leaves, holidayMap, policy, todayKey } = opts;
    const attByDay = new Map<string, any>();
    for (const a of attendances) attByDay.set(a.date.toISOString().slice(0, 10), a);
    const leaveMap = leaveDayMap(leaves);
    const joinKey = employee.date_of_joining.toISOString().slice(0, 10);
    const exitKey = employee.date_of_exit ? employee.date_of_exit.toISOString().slice(0, 10) : null;

    const summary: MonthSummary = {
        present: 0, halfDay: 0, absent: 0, leave: 0, holidays: 0, weekOffs: 0,
        lateCount: 0, totalHours: 0, workingDays: 0, payableDays: 0,
    };

    const days: DayCell[] = eachDayKey(first, last).map(k => {
        const att = attByDay.get(k);
        const base = {
            date: k,
            check_in: att?.check_in ? att.check_in.toISOString() : null,
            check_out: att?.check_out ? att.check_out.toISOString() : null,
            total_hours: att?.total_hours ?? null,
            late_minutes: att?.late_minutes ?? 0,
            source: att?.source,
            holiday: holidayMap.get(k),
        };
        const isOff = policy.weeklyOffDays.includes(weekdayOfKey(k));
        const holiday = holidayMap.has(k);

        let status: DayStatus;
        let computed = false;
        if (k < joinKey || (exitKey && k > exitKey)) status = 'N/A';
        else if (att) status = att.status as DayStatus;
        else if (holiday) { status = 'Holiday'; computed = true; }
        else if (isOff) { status = 'Week-Off'; computed = true; }
        else if (leaveMap.has(k)) { status = 'Leave'; computed = true; }
        else if (k > todayKey) status = 'Upcoming';
        else if (k === todayKey) status = 'Not Marked';
        else { status = 'Absent'; computed = true; }

        switch (status) {
            case 'Present': summary.present++; summary.payableDays += 1; break;
            case 'Half-Day': summary.halfDay++; summary.payableDays += 0.5; break;
            case 'Absent': summary.absent++; break;
            case 'Leave': summary.leave++; summary.payableDays += leaveMap.get(k)?.half ? 0.5 : 1; break;
            case 'Holiday': summary.holidays++; summary.payableDays += 1; break;
            case 'Week-Off': summary.weekOffs++; summary.payableDays += 1; break;
        }
        if (status !== 'N/A' && status !== 'Upcoming' && status !== 'Holiday' && status !== 'Week-Off') summary.workingDays++;
        if (base.late_minutes > 0) summary.lateCount++;
        if (typeof base.total_hours === 'number') summary.totalHours += base.total_hours;

        return { ...base, status, computed };
    });

    summary.totalHours = round2(summary.totalHours);
    return { days, summary };
}

export async function getEmployeeMonth(db: Db, employee: any, monthKey: string) {
    const ctx = await loadMonthContext(db, monthKey);
    const [attendances, leaves] = await Promise.all([
        db.attendance.findMany({
            where: { employee_id: employee.id, date: { gte: dayStartUtc(ctx.first), lt: dayStartUtc(ctx.nextFirst) } },
            orderBy: { date: 'asc' },
        }),
        db.leaveRequest.findMany({
            where: {
                employee_id: employee.id, status: 'Approved',
                from_date: { lt: dayStartUtc(ctx.nextFirst) }, to_date: { gte: dayStartUtc(ctx.first) },
            },
        }),
    ]);
    return {
        policy: ctx.policy,
        ...buildMonthCells({
            monthKey, first: ctx.first, last: ctx.last, employee, attendances, leaves,
            holidayMap: ctx.holidayMap, policy: ctx.policy, todayKey: istTodayKey(),
        }),
    };
}

// ─── Leave ─────────────────────────────────────────────────────────────────

/** Working days a leave range deducts: weekly-offs and public holidays are free. */
export async function countLeaveDays(db: Db, fromKey: string, toKey: string, isHalfDay: boolean, policy: HrPolicy) {
    if (toKey < fromKey) throw new HrError('End date is before start date');
    if (isHalfDay && fromKey !== toKey) throw new HrError('A half-day leave must be a single day');
    const keys = eachDayKey(fromKey, toKey, 366);
    if (keys.length >= 366) throw new HrError('Leave range is too long');

    const holidays = await db.holiday.findMany({
        where: { type: 'PUBLIC', date: { gte: dayStartUtc(fromKey), lte: dayStartUtc(toKey) } },
        select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h: any) => h.date.toISOString().slice(0, 10)));
    const working = keys.filter(k => !policy.weeklyOffDays.includes(weekdayOfKey(k)) && !holidaySet.has(k));
    if (!working.length) throw new HrError('That range has no working days (weekly off / holidays only).');
    return { workingKeys: working, days: isHalfDay ? 0.5 : working.length };
}

export interface LeaveBalanceRow {
    leaveTypeId: number; leaveType: string; isPaid: boolean;
    total: number; used: number; pending: number; remaining: number;
}

/** Entitlement vs usage for the calendar year containing `yearKey` (default: this IST year). */
export async function getLeaveBalances(db: Db, employeeId: number, year = Number(istTodayKey().slice(0, 4))): Promise<LeaveBalanceRow[]> {
    const yStart = dayStartUtc(`${year}-01-01`);
    const yEnd = dayStartUtc(`${year + 1}-01-01`);
    const [types, requests] = await Promise.all([
        db.leaveType.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
        db.leaveRequest.findMany({
            where: { employee_id: employeeId, status: { in: ['Approved', 'Pending'] }, from_date: { gte: yStart, lt: yEnd } },
        }),
    ]);
    return types.map((t: any) => {
        const mine = requests.filter((r: any) => r.leave_type_id === t.id);
        const used = mine.filter((r: any) => r.status === 'Approved').reduce((s: number, r: any) => s + r.days, 0);
        const pending = mine.filter((r: any) => r.status === 'Pending').reduce((s: number, r: any) => s + r.days, 0);
        return {
            leaveTypeId: t.id, leaveType: t.name, isPaid: t.is_paid,
            total: t.days_per_year, used, pending, remaining: t.days_per_year - used - pending,
        };
    });
}

/** Validate and create a Pending leave request for `employee`. */
export async function createLeaveRequest(
    ctx: HrCtx, employee: any,
    input: { leaveTypeId: number; fromDate: string; toDate: string; reason?: string; isHalfDay?: boolean },
) {
    const { db, organizationId } = ctx;
    const policy = await loadHrPolicy(db);

    const type = await db.leaveType.findFirst({ where: { id: input.leaveTypeId, is_active: true } });
    if (!type) throw new HrError('Leave type not found');

    const { days } = await countLeaveDays(db, input.fromDate, input.toDate, !!input.isHalfDay, policy);

    const today = istTodayKey();
    if (input.fromDate < addDaysKey(today, -policy.leaveBackdateDays)) {
        throw new HrError(`Leave cannot start more than ${policy.leaveBackdateDays} days in the past.`);
    }
    if (input.fromDate < employee.date_of_joining.toISOString().slice(0, 10)) {
        throw new HrError('Leave cannot start before the joining date.');
    }

    const from = dayStartUtc(input.fromDate);
    const to = dayStartUtc(input.toDate);
    const overlap = await db.leaveRequest.findFirst({
        where: { employee_id: employee.id, status: { in: ['Pending', 'Approved'] }, from_date: { lte: to }, to_date: { gte: from } },
    });
    if (overlap) throw new HrError('You already have a leave request overlapping these dates.');

    if (type.is_paid) {
        const bal = (await getLeaveBalances(db, employee.id, Number(input.fromDate.slice(0, 4))))
            .find(b => b.leaveTypeId === type.id);
        if (bal && days > bal.remaining) {
            throw new HrError(`Insufficient ${type.name} balance: ${bal.remaining} day(s) left, ${days} requested.`);
        }
    }

    const request = await db.leaveRequest.create({
        data: {
            employee_id: employee.id, leave_type_id: type.id, from_date: from, to_date: to,
            reason: input.reason?.trim().slice(0, 500) || null, status: 'Pending',
            is_half_day: !!input.isHalfDay, days,
        },
    });

    await notifyUsers(
        db, organizationId, await approverUserIds(db, employee),
        'Leave request', `${employee.name} requested ${days} day(s) of ${type.name} (${input.fromDate} → ${input.toDate}).`,
        '/hr/leave',
    );
    return request;
}

/** Mark approved leave on the attendance sheet (never overwrites a real punch). */
export async function applyLeaveToAttendance(db: Db, organizationId: string, leave: any, policy: HrPolicy) {
    // A half-day leave is a single day the person still works part of; the month view
    // derives it from the leave request itself, so no attendance row is written.
    if (leave.is_half_day) return;
    const fromKey = leave.from_date.toISOString().slice(0, 10);
    const toKey = leave.to_date.toISOString().slice(0, 10);
    const { workingKeys } = await countLeaveDays(db, fromKey, toKey, leave.is_half_day, policy).catch(() => ({ workingKeys: [] as string[] }));
    for (const k of workingKeys) {
        const existing = await db.attendance.findFirst({
            where: { employee_id: leave.employee_id, date: { gte: dayStartUtc(k), lt: dayStartUtc(addDaysKey(k, 1)) } },
        });
        if (existing && existing.source !== 'LEAVE' && existing.check_in) continue; // worked that day
        await saveAttendance(db, organizationId, leave.employee_id, k, {
            status: leave.is_half_day ? 'Half-Day' : 'Leave', source: 'LEAVE',
            check_in: null, check_out: null, total_hours: null, late_minutes: 0,
        });
    }
}

/** Undo applyLeaveToAttendance for a cancelled approved leave. */
export async function revertLeaveFromAttendance(db: Db, leave: any) {
    await db.attendance.deleteMany({
        where: {
            employee_id: leave.employee_id, source: 'LEAVE',
            date: { gte: leave.from_date, lte: leave.to_date },
        },
    });
}
