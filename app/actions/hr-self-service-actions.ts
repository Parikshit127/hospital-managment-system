'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import {
    HrError, hrFail, requireStaff, getMyEmployee, getPunchState, recordPunch, getEmployeeMonth,
    getLeaveBalances, createLeaveRequest, revertLeaveFromAttendance, loadHrPolicy, notifyUsers,
    approverUserIds, type PunchInput,
} from '@/app/lib/hr/hr-core';
import {
    addDaysKey, dayStartUtc, eachDayKey, isDayKey, isMonthKey, istDayBounds, istTimeOnDay,
    istTodayKey, currentMonthKey, monthBounds, TIME_RE, weekdayOfKey,
} from '@/app/lib/hr/hr-dates';

const clean = (v: unknown, max = 200): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
};

/** db results are untyped (tenant client is `any`); give .map() a typed result. */
const arr = (x: any): any[] => x;

const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);

/** Everything the "My Workspace" home page needs, in one round trip. */
export async function getMyWorkspace() {
    try {
        const ctx = await requireStaff();
        const { db } = ctx;
        const employee = await getMyEmployee(ctx);
        const now = new Date();
        const todayKey = istTodayKey(now);
        const { start, end } = istDayBounds(todayKey);

        const [policy, punch, todayEvents, month, balances, pendingLeave, pendingReg, shifts, holidays, department, manager, reports] =
            await Promise.all([
                loadHrPolicy(db),
                getPunchState(db, employee.id, now),
                db.attendanceEvent.findMany({
                    where: { employee_id: employee.id, occurred_at: { gte: start, lt: end } },
                    orderBy: { occurred_at: 'asc' },
                    select: { id: true, type: true, occurred_at: true, source: true },
                }),
                getEmployeeMonth(db, employee, currentMonthKey(now)),
                getLeaveBalances(db, employee.id),
                db.leaveRequest.count({ where: { employee_id: employee.id, status: 'Pending' } }),
                db.attendanceRegularization.count({ where: { employee_id: employee.id, status: 'Pending' } }),
                db.shiftAssignment.findMany({
                    where: { employee_id: employee.id, date: { gte: dayStartUtc(todayKey), lt: dayStartUtc(addDaysKey(todayKey, 8)) } },
                    include: { shift_pattern: true }, orderBy: { date: 'asc' },
                }),
                db.holiday.findMany({
                    where: { date: { gte: dayStartUtc(todayKey), lt: dayStartUtc(addDaysKey(todayKey, 90)) } },
                    orderBy: { date: 'asc' }, take: 4,
                }),
                employee.department_id ? db.department.findFirst({ where: { id: employee.department_id }, select: { name: true } }) : null,
                employee.reporting_manager_id
                    ? db.employee.findFirst({ where: { id: employee.reporting_manager_id }, select: { name: true, designation: true } })
                    : null,
                db.employee.findMany({ where: { reporting_manager_id: employee.id, is_active: true }, select: { id: true } }),
            ]);

        let team = null as null | { reports: number; pendingLeave: number; pendingRegularizations: number };
        if (reports.length) {
            const ids = reports.map((r: any) => r.id);
            const [l, r] = await Promise.all([
                db.leaveRequest.count({ where: { employee_id: { in: ids }, status: 'Pending' } }),
                db.attendanceRegularization.count({ where: { employee_id: { in: ids }, status: 'Pending' } }),
            ]);
            team = { reports: ids.length, pendingLeave: l, pendingRegularizations: r };
        }

        const todayAttendance = month.days.find(d => d.date === todayKey) ?? null;
        const todayShift = shifts.find((s: any) => s.date.toISOString().slice(0, 10) === todayKey) ?? null;

        return {
            success: true as const,
            data: {
                serverNow: now.toISOString(),
                todayKey,
                employee: {
                    id: employee.id, name: employee.name, code: employee.employee_code, designation: employee.designation,
                    department: department?.name ?? null, joined: employee.date_of_joining.toISOString(),
                    employmentType: employee.employment_type, manager: manager ? `${manager.name}` : null,
                },
                punch: { isIn: !!punch.open, since: punch.open ? punch.open.occurred_at.toISOString() : null },
                today: todayAttendance,
                todayEvents: arr(todayEvents).map((e: any) => ({ id: e.id, type: e.type, at: e.occurred_at.toISOString(), source: e.source })),
                todayShift: todayShift
                    ? { name: todayShift.shift_pattern.name, start: todayShift.shift_pattern.start_time, end: todayShift.shift_pattern.end_time }
                    : { name: 'General', start: policy.workStart, end: policy.workEnd },
                policy: { requireGeo: policy.requireGeo, workStart: policy.workStart, workEnd: policy.workEnd, graceMinutes: policy.graceMinutes },
                month: { key: currentMonthKey(now), summary: month.summary },
                leaveBalances: balances,
                pending: { leave: pendingLeave, regularizations: pendingReg },
                upcomingShifts: arr(shifts).map((s: any) => ({
                    date: s.date.toISOString().slice(0, 10), name: s.shift_pattern.name,
                    start: s.shift_pattern.start_time, end: s.shift_pattern.end_time,
                })),
                upcomingHolidays: arr(holidays).map((h: any) => ({ date: h.date.toISOString().slice(0, 10), name: h.name, type: h.type })),
                team,
            },
        };
    } catch (error) {
        return { ...hrFail(error, 'Could not load your workspace'), data: null };
    }
}

export async function punch(input: { type: 'IN' | 'OUT'; lat?: number; lng?: number; accuracy?: number; note?: string }) {
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        const payload: PunchInput = {
            type: input.type, lat: num(input.lat), lng: num(input.lng), accuracy: num(input.accuracy),
            note: clean(input.note, 200) ?? undefined, source: 'WEB',
        };
        const { event, attendance } = await recordPunch(ctx, employee, payload);
        revalidatePath('/me');
        return {
            success: true as const,
            data: {
                type: event.type as 'IN' | 'OUT', at: event.occurred_at.toISOString(),
                status: attendance?.status ?? null, lateMinutes: attendance?.late_minutes ?? 0,
            },
        };
    } catch (error) {
        return hrFail(error, 'Could not record your punch');
    }
}

export async function getMyAttendance(monthKey?: string) {
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        const key = monthKey ?? currentMonthKey();
        if (!isMonthKey(key)) throw new HrError('Invalid month');

        const view = await getEmployeeMonth(ctx.db, employee, key);
        const bounds = monthBounds(key);
        const regularizations = await ctx.db.attendanceRegularization.findMany({
            where: {
                employee_id: employee.id,
                date: { gte: dayStartUtc(bounds.first), lt: dayStartUtc(bounds.nextFirst) },
            },
            orderBy: { created_at: 'desc' },
        });
        return {
            success: true as const,
            data: {
                month: key, days: view.days, summary: view.summary,
                policy: { regularizationWindowDays: view.policy.regularizationWindowDays, workStart: view.policy.workStart },
                regularizations: arr(regularizations).map((r: any) => ({
                    id: r.id, date: r.date.toISOString().slice(0, 10), status: r.status, reason: r.reason,
                    requestedIn: r.requested_in?.toISOString() ?? null, requestedOut: r.requested_out?.toISOString() ?? null,
                    requestedStatus: r.requested_status, reviewNote: r.review_note,
                })),
            },
        };
    } catch (error) {
        return { ...hrFail(error, 'Could not load attendance'), data: null };
    }
}

export async function requestRegularization(input: {
    date: string; inTime?: string; outTime?: string; status?: 'Present' | 'Half-Day'; reason: string;
}) {
    try {
        const ctx = await requireStaff();
        const { db, organizationId } = ctx;
        const employee = await getMyEmployee(ctx);
        const policy = await loadHrPolicy(db);

        if (!isDayKey(input.date)) throw new HrError('Invalid date');
        const today = istTodayKey();
        if (input.date > today) throw new HrError('You cannot regularize a future date.');
        if (input.date < addDaysKey(today, -policy.regularizationWindowDays)) {
            throw new HrError(`Requests are allowed only for the last ${policy.regularizationWindowDays} days. Please contact HR.`);
        }
        if (input.date < employee.date_of_joining.toISOString().slice(0, 10)) throw new HrError('That date is before your joining date.');

        const reason = clean(input.reason, 300);
        if (!reason || reason.length < 5) throw new HrError('Please give a reason (at least 5 characters).');
        if (input.inTime && !TIME_RE.test(input.inTime)) throw new HrError('Invalid in-time');
        if (input.outTime && !TIME_RE.test(input.outTime)) throw new HrError('Invalid out-time');
        if (input.status && input.status !== 'Present' && input.status !== 'Half-Day') throw new HrError('Invalid status');
        if (!input.inTime && !input.outTime && !input.status) throw new HrError('Enter the correct in/out time or a status.');

        const reqIn = input.inTime ? istTimeOnDay(input.date, input.inTime) : null;
        const reqOut = input.outTime ? istTimeOnDay(input.date, input.outTime) : null;
        if (reqIn && reqOut && reqOut <= reqIn) throw new HrError('Out-time must be after in-time.');

        const dupe = await db.attendanceRegularization.findFirst({
            where: { employee_id: employee.id, date: dayStartUtc(input.date), status: 'Pending' },
        });
        if (dupe) throw new HrError('You already have a pending request for that day.');

        const reg = await db.attendanceRegularization.create({
            data: {
                employee_id: employee.id, date: dayStartUtc(input.date), requested_in: reqIn, requested_out: reqOut,
                requested_status: input.status ?? null, reason,
            },
        });
        await notifyUsers(
            db, organizationId, await approverUserIds(db, employee), 'Attendance correction request',
            `${employee.name} asked to correct ${input.date}: ${reason}`, '/hr/regularizations',
        );
        revalidatePath('/me/attendance');
        return { success: true as const, data: { id: reg.id } };
    } catch (error) {
        return hrFail(error, 'Could not submit your request');
    }
}

export async function cancelMyRegularization(id: number) {
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        const reg = await ctx.db.attendanceRegularization.findFirst({ where: { id, employee_id: employee.id } });
        if (!reg) throw new HrError('Request not found');
        if (reg.status !== 'Pending') throw new HrError('Only pending requests can be cancelled.');
        await ctx.db.attendanceRegularization.update({ where: { id: reg.id }, data: { status: 'Cancelled' } });
        revalidatePath('/me/attendance');
        return { success: true as const };
    } catch (error) {
        return hrFail(error, 'Could not cancel the request');
    }
}

// ─── Leave ─────────────────────────────────────────────────────────────────

export async function getMyLeave(year?: number) {
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        const y = Number.isInteger(year) ? (year as number) : Number(istTodayKey().slice(0, 4));
        const [balances, types, requests] = await Promise.all([
            getLeaveBalances(ctx.db, employee.id, y),
            ctx.db.leaveType.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
            ctx.db.leaveRequest.findMany({
                where: { employee_id: employee.id }, orderBy: { created_at: 'desc' }, take: 60,
                include: { leave_type: { select: { name: true } } },
            }),
        ]);
        return {
            success: true as const,
            data: {
                year: y, balances,
                types: arr(types).map((t: any) => ({ id: t.id, name: t.name, isPaid: t.is_paid })),
                requests: arr(requests).map((r: any) => ({
                    id: r.id, type: r.leave_type.name, from: r.from_date.toISOString().slice(0, 10),
                    to: r.to_date.toISOString().slice(0, 10), days: r.days, isHalfDay: r.is_half_day, status: r.status,
                    reason: r.reason, reviewNote: r.review_note, createdAt: r.created_at.toISOString(),
                })),
            },
        };
    } catch (error) {
        return { ...hrFail(error, 'Could not load leave'), data: null };
    }
}

export async function applyMyLeave(input: {
    leaveTypeId: number; fromDate: string; toDate: string; reason?: string; isHalfDay?: boolean;
}) {
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        if (!isDayKey(input.fromDate) || !isDayKey(input.toDate)) throw new HrError('Choose valid dates');
        const req = await createLeaveRequest(ctx, employee, input);
        revalidatePath('/me/leave');
        return { success: true as const, data: { id: req.id, days: req.days } };
    } catch (error) {
        return hrFail(error, 'Could not submit your leave');
    }
}

export async function cancelMyLeave(id: number) {
    try {
        const ctx = await requireStaff();
        const { db, organizationId } = ctx;
        const employee = await getMyEmployee(ctx);
        const leave = await db.leaveRequest.findFirst({ where: { id, employee_id: employee.id }, include: { leave_type: true } });
        if (!leave) throw new HrError('Leave request not found');

        const today = dayStartUtc(istTodayKey());
        if (leave.status === 'Pending') {
            // fine
        } else if (leave.status === 'Approved') {
            if (leave.from_date < today) throw new HrError('Leave that has already started cannot be cancelled here. Contact HR.');
            await revertLeaveFromAttendance(db, leave);
        } else {
            throw new HrError(`A ${leave.status.toLowerCase()} request cannot be cancelled.`);
        }

        await db.leaveRequest.update({ where: { id: leave.id }, data: { status: 'Cancelled', reviewed_at: new Date() } });
        if (leave.status === 'Approved') {
            await notifyUsers(
                db, organizationId, await approverUserIds(db, employee), 'Approved leave cancelled',
                `${employee.name} cancelled ${leave.leave_type.name} (${leave.from_date.toISOString().slice(0, 10)}).`, '/hr/leave',
            );
        }
        await logAudit({ action: 'EMPLOYEE_LEAVE_CANCEL', module: 'hr', entity_type: 'leave_request', entity_id: String(id) });
        revalidatePath('/me/leave');
        return { success: true as const };
    } catch (error) {
        return hrFail(error, 'Could not cancel the leave');
    }
}

// ─── Roster ────────────────────────────────────────────────────────────────

export async function getMyRoster(fromKey?: string, days = 14) {
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        const from = fromKey && isDayKey(fromKey) ? fromKey : istTodayKey();
        const span = Math.min(Math.max(1, Math.floor(days)), 62);
        const to = addDaysKey(from, span - 1);

        const [policy, shifts, holidays, leaves] = await Promise.all([
            loadHrPolicy(ctx.db),
            ctx.db.shiftAssignment.findMany({
                where: { employee_id: employee.id, date: { gte: dayStartUtc(from), lt: dayStartUtc(addDaysKey(to, 1)) } },
                include: { shift_pattern: true },
            }),
            ctx.db.holiday.findMany({ where: { date: { gte: dayStartUtc(from), lte: dayStartUtc(to) } } }),
            ctx.db.leaveRequest.findMany({
                where: { employee_id: employee.id, status: 'Approved', from_date: { lte: dayStartUtc(to) }, to_date: { gte: dayStartUtc(from) } },
            }),
        ]);
        const shiftBy = new Map<string, any>(arr(shifts).map((s: any) => [s.date.toISOString().slice(0, 10), s]));
        const holidayBy = new Map<string, string>(arr(holidays).map((h: any) => [h.date.toISOString().slice(0, 10), h.name]));
        const leaveSet = new Set<string>();
        for (const l of leaves) {
            for (const k of eachDayKey(l.from_date.toISOString().slice(0, 10), l.to_date.toISOString().slice(0, 10))) leaveSet.add(k);
        }

        return {
            success: true as const,
            data: eachDayKey(from, to).map(k => {
                const s = shiftBy.get(k);
                return {
                    date: k,
                    weekday: weekdayOfKey(k),
                    shift: s ? { name: s.shift_pattern.name, start: s.shift_pattern.start_time, end: s.shift_pattern.end_time } : null,
                    holiday: holidayBy.get(k) ?? null,
                    onLeave: leaveSet.has(k),
                    weekOff: policy.weeklyOffDays.includes(weekdayOfKey(k)),
                };
            }),
        };
    } catch (error) {
        return { ...hrFail(error, 'Could not load your roster'), data: null };
    }
}

// ─── Profile ───────────────────────────────────────────────────────────────

export async function getMyProfile() {
    try {
        const ctx = await requireStaff();
        const e = await getMyEmployee(ctx);
        const [department, manager, user] = await Promise.all([
            e.department_id ? ctx.db.department.findFirst({ where: { id: e.department_id }, select: { name: true } }) : null,
            e.reporting_manager_id ? ctx.db.employee.findFirst({ where: { id: e.reporting_manager_id }, select: { name: true, designation: true } }) : null,
            ctx.db.user.findFirst({ where: { id: ctx.session.id }, select: { username: true, role: true } }),
        ]);
        return {
            success: true as const,
            data: {
                code: e.employee_code, name: e.name, designation: e.designation, department: department?.name ?? null,
                employmentType: e.employment_type, joined: e.date_of_joining.toISOString().slice(0, 10),
                manager: manager ? `${manager.name} (${manager.designation})` : null,
                username: user?.username ?? ctx.session.username, role: user?.role ?? ctx.session.role,
                phone: e.phone, email: e.email, gender: e.gender, bloodGroup: e.blood_group, address: e.address,
                dateOfBirth: e.date_of_birth ? e.date_of_birth.toISOString().slice(0, 10) : null,
                emergencyContactName: e.emergency_contact_name, emergencyContactPhone: e.emergency_contact_phone,
            },
        };
    } catch (error) {
        return { ...hrFail(error, 'Could not load your profile'), data: null };
    }
}

/** Employees can edit contact + emergency details only; job fields stay HR-controlled. */
export async function updateMyProfile(input: {
    phone?: string; email?: string; address?: string; bloodGroup?: string; gender?: string; dateOfBirth?: string;
    emergencyContactName?: string; emergencyContactPhone?: string;
}) {
    try {
        const ctx = await requireStaff();
        const e = await getMyEmployee(ctx);
        const data: Record<string, any> = {};

        if (input.phone !== undefined) data.phone = clean(input.phone, 20);
        if (input.email !== undefined) {
            const em = clean(input.email, 150);
            if (em && !/^\S+@\S+\.\S+$/.test(em)) throw new HrError('Email looks invalid');
            data.email = em;
        }
        if (input.address !== undefined) data.address = clean(input.address, 300);
        if (input.bloodGroup !== undefined) data.blood_group = clean(input.bloodGroup, 5);
        if (input.gender !== undefined) data.gender = clean(input.gender, 20);
        if (input.emergencyContactName !== undefined) data.emergency_contact_name = clean(input.emergencyContactName, 120);
        if (input.emergencyContactPhone !== undefined) data.emergency_contact_phone = clean(input.emergencyContactPhone, 20);
        if (input.dateOfBirth !== undefined) {
            if (input.dateOfBirth && !isDayKey(input.dateOfBirth)) throw new HrError('Invalid date of birth');
            data.date_of_birth = input.dateOfBirth ? dayStartUtc(input.dateOfBirth) : null;
        }

        await ctx.db.employee.update({ where: { id: e.id }, data });
        if ('phone' in data || 'email' in data) {
            await ctx.db.user.updateMany({
                where: { id: ctx.session.id },
                data: { ...('phone' in data && { phone: data.phone }), ...('email' in data && { email: data.email }) },
            });
        }
        revalidatePath('/me/profile');
        return { success: true as const };
    } catch (error) {
        return hrFail(error, 'Could not save your profile');
    }
}

// ─── Manager approvals (direct reports) ────────────────────────────────────

export async function getMyTeamApprovals() {
    try {
        const ctx = await requireStaff();
        const me = await getMyEmployee(ctx);
        const reports = await ctx.db.employee.findMany({
            where: { reporting_manager_id: me.id, is_active: true }, select: { id: true },
        });
        if (!reports.length) return { success: true as const, data: { leave: [], regularizations: [] } };
        const ids = reports.map((r: any) => r.id);

        const [leave, regs] = await Promise.all([
            ctx.db.leaveRequest.findMany({
                where: { employee_id: { in: ids }, status: 'Pending' }, orderBy: { created_at: 'asc' },
                include: { employee: { select: { name: true, employee_code: true } }, leave_type: { select: { name: true } } },
            }),
            ctx.db.attendanceRegularization.findMany({
                where: { employee_id: { in: ids }, status: 'Pending' }, orderBy: { created_at: 'asc' },
                include: { employee: { select: { name: true, employee_code: true } } },
            }),
        ]);
        return {
            success: true as const,
            data: {
                leave: arr(leave).map((l: any) => ({
                    id: l.id, employee: l.employee.name, code: l.employee.employee_code, type: l.leave_type.name,
                    from: l.from_date.toISOString().slice(0, 10), to: l.to_date.toISOString().slice(0, 10),
                    days: l.days, reason: l.reason,
                })),
                regularizations: arr(regs).map((r: any) => ({
                    id: r.id, employee: r.employee.name, code: r.employee.employee_code,
                    date: r.date.toISOString().slice(0, 10), reason: r.reason,
                    requestedIn: r.requested_in?.toISOString() ?? null, requestedOut: r.requested_out?.toISOString() ?? null,
                    requestedStatus: r.requested_status,
                })),
            },
        };
    } catch (error) {
        return { ...hrFail(error, 'Could not load approvals'), data: null };
    }
}
