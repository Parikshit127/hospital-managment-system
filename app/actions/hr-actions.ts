'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/backend/db';
import { hasPermission } from '@/app/lib/session';
import { logAudit } from '@/app/lib/audit';
import {
    HrError, hrFail, requireHr, requireStaff, loadEmployee, loadHrPolicy, createEmployeeWithCode,
    ensureEmployeeForUser, createLeaveRequest, getLeaveBalances, applyLeaveToAttendance,
    revertLeaveFromAttendance, isManagerOf, notifyUsers, saveAttendance, loadMonthContext,
    buildMonthCells, type HrCtx,
} from '@/app/lib/hr/hr-core';
import {
    addDaysKey, dayStartUtc, eachDayKey, isDayKey, isMonthKey, istDayBounds, istTimeOnDay,
    istTodayKey, minutesBetween, monthBounds, round2, TIME_RE,
} from '@/app/lib/hr/hr-dates';
import { resolveHrPolicy } from '@/app/lib/hr/hr-policy';

interface MonthRow {
    employee: { id: number; name: string; employee_code: string; designation: string };
    days: { date: string; status: string; late: boolean; hours: number | null }[];
    summary: import('@/app/lib/hr/hr-core').MonthSummary;
}

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Half-Day', 'Leave', 'Holiday'] as const;
const EMPLOYMENT_TYPES = ['PERMANENT', 'CONTRACT', 'CONSULTANT_VISITING', 'CONSULTANT_RETAINER', 'INTERN'] as const;

const clean = (v: unknown, max = 200): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
};

function titleCase(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// ========================================
// HR DASHBOARD
// ========================================

export async function getHRDashboard() {
    try {
        const { db } = await requireHr('view', 'dashboard');
        const todayKey = istTodayKey();
        const today = dayStartUtc(todayKey);
        const tomorrow = dayStartUtc(addDaysKey(todayKey, 1));
        const policy = await loadHrPolicy(db);

        const [employees, todaysAttendance, todaysLeaves, pendingLeave, pendingRegularizations, usersWithoutProfile, departments, holiday] =
            await Promise.all([
                db.employee.findMany({
                    where: { is_active: true },
                    select: {
                        id: true, name: true, designation: true, employee_code: true, phone: true, email: true,
                        department_id: true, employment_type: true,
                        user: { select: { role: true, username: true } },
                    },
                }),
                db.attendance.findMany({ where: { date: { gte: today, lt: tomorrow } } }),
                db.leaveRequest.findMany({
                    where: { status: 'Approved', from_date: { lt: tomorrow }, to_date: { gte: today } },
                    select: { employee_id: true },
                }),
                db.leaveRequest.count({ where: { status: 'Pending' } }),
                db.attendanceRegularization.count({ where: { status: 'Pending' } }),
                db.user.count({
                    where: { is_active: true, is_dev_admin: false, is_developer: false, employee_profile: { is: null } },
                }),
                db.department.findMany({ select: { id: true, name: true } }),
                db.holiday.findFirst({ where: { date: today, type: 'PUBLIC' } }),
            ]);

        const attByEmp = new Map<number, any>(todaysAttendance.map((a: any) => [a.employee_id, a]));
        const onLeaveIds = new Set<number>(todaysLeaves.map((l: any) => l.employee_id));
        const isOffToday = policy.weeklyOffDays.includes(new Date(today).getUTCDay()) || !!holiday;

        let present = 0, halfDay = 0, onLeave = 0, late = 0, absentMarked = 0;
        for (const e of employees) {
            const a = attByEmp.get(e.id);
            if (a?.status === 'Present') present++;
            else if (a?.status === 'Half-Day') halfDay++;
            else if (a?.status === 'Absent') absentMarked++;
            else if (a?.status === 'Leave' || onLeaveIds.has(e.id)) onLeave++;
            if (a?.late_minutes > 0) late++;
        }
        const notPunched = isOffToday ? 0 : employees.length - present - halfDay - onLeave - absentMarked;

        const roleCounts: Record<string, number> = {};
        const deptCounts: Record<string, number> = {};
        const deptName = new Map<string, string>(departments.map((d: any) => [d.id, d.name]));
        for (const e of employees) {
            const label = titleCase(e.user?.role || e.designation || 'Staff');
            roleCounts[label] = (roleCounts[label] || 0) + 1;
            const dept = (e.department_id && deptName.get(e.department_id)) || 'Unassigned';
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        }

        return {
            success: true as const,
            data: {
                totalStrength: employees.length,
                roleBreakdown: Object.entries(roleCounts).map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count),
                departmentBreakdown: Object.entries(deptCounts).map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count),
                staffList: employees
                    .map((e: any) => ({
                        id: e.id, name: e.name, role: titleCase(e.user?.role || e.designation || 'Staff'),
                        code: e.employee_code, phone: e.phone, email: e.email,
                    }))
                    .sort((a: any, b: any) => a.name.localeCompare(b.name)),
                today: {
                    date: todayKey, present, halfDay, onLeave, late, notPunched,
                    isOffDay: isOffToday, holiday: holiday?.name ?? null,
                },
                pendingLeave,
                pendingRegularizations,
                usersWithoutProfile,
            },
        };
    } catch (error) {
        console.error('HR Dashboard Error:', error);
        return { success: false, data: null };
    }
}

/** Create the missing HR profile for every active login user. */
export async function syncEmployeesFromUsers() {
    try {
        const { db, organizationId } = await requireHr('create', 'employee');
        const users = await db.user.findMany({
            where: { is_active: true, is_dev_admin: false, is_developer: false, employee_profile: { is: null } },
            select: { id: true },
        });
        let created = 0;
        for (const u of users) {
            await ensureEmployeeForUser(db, organizationId, u.id);
            created++;
        }
        await logAudit({ action: 'HR_SYNC_EMPLOYEES', module: 'hr', details: `Created ${created} employee profile(s) from users` });
        revalidatePath('/hr/dashboard');
        revalidatePath('/hr/employees');
        return { success: true, created };
    } catch (error) {
        return hrFail(error, 'Failed to sync employees');
    }
}

// ========================================
// EMPLOYEE MANAGEMENT
// ========================================

export async function getEmployeeList(options?: {
    search?: string;
    designation?: string;
    departmentId?: string;
    employmentType?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
}) {
    try {
        const { db } = await requireHr('view', 'employee');
        const canSeePay = await hasPermission('hr.edit');

        const page = Math.max(1, options?.page || 1);
        const limit = Math.min(200, Math.max(1, options?.limit || 25));
        const where: any = {};
        const search = clean(options?.search, 100);
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { employee_code: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
            ];
        }
        if (options?.designation) where.designation = options.designation;
        if (options?.departmentId) where.department_id = options.departmentId;
        if (options?.employmentType) where.employment_type = options.employmentType;
        if (options?.isActive !== undefined) where.is_active = options.isActive;

        const [rows, total] = await Promise.all([
            db.employee.findMany({
                where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit,
                include: { user: { select: { role: true, username: true } } },
            }),
            db.employee.count({ where }),
        ]);
        const data = canSeePay ? rows : rows.map((r: any) => ({ ...r, salary_basic: 0 }));

        return { success: true, data, total, totalPages: Math.ceil(total / limit), page };
    } catch (error) {
        console.error('Employee List Error:', error);
        return { success: false, data: [], total: 0, totalPages: 0, page: 1 };
    }
}

/**
 * Company-wide designation + department masters for the caller's company (Company-OS Phase 2).
 * Empty lists until scripts/backfill-company-os.ts has run, which is how the UI knows to hide the pickers.
 */
export async function listOrgMasters() {
    try {
        const { organizationId } = await requireHr('view', 'employee');
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { company_id: true } });
        if (!org?.company_id) return { success: true, data: { designations: [], departments: [] } };
        const [designations, departments] = await Promise.all([
            prisma.designation.findMany({ where: { company_id: org.company_id, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
            prisma.orgDepartment.findMany({ where: { company_id: org.company_id, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        ]);
        return { success: true, data: { designations, departments } };
    } catch (error) {
        console.error('listOrgMasters error:', error);
        return { success: false, data: { designations: [], departments: [] } };
    }
}

export async function getEmployeeDetail(id: number) {
    try {
        const { db } = await requireHr('view', 'employee');
        const canSeePay = await hasPermission('hr.edit');

        const employee = await db.employee.findFirst({
            where: { id },
            include: {
                attendances: { orderBy: { date: 'desc' }, take: 30 },
                leave_requests: { orderBy: { created_at: 'desc' }, take: 10, include: { leave_type: true } },
                shift_assignments: { orderBy: { date: 'desc' }, take: 14, include: { shift_pattern: true } },
                user: { select: { id: true, username: true, role: true, is_active: true } },
                reporting_manager: { select: { id: true, name: true, employee_code: true } },
            },
        });
        if (!employee) return { success: false, data: null };
        if (!canSeePay) employee.salary_basic = 0;
        return { success: true, data: employee };
    } catch (error) {
        console.error('Employee Detail Error:', error);
        return { success: false, data: null };
    }
}

interface EmployeeInput {
    name?: string;
    designation?: string;
    departmentId?: string | null;
    dateOfJoining?: string;
    salaryBasic?: number;
    phone?: string | null;
    email?: string | null;
    userId?: string;
    branchId?: string | null;
    employmentType?: string;
    reportingManagerId?: number | null;
    /** Company-OS Phase 2: company-wide masters (see listOrgMasters). */
    designationId?: string | null;
    orgDepartmentId?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    bloodGroup?: string | null;
    address?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    dateOfExit?: string | null;
    exitReason?: string | null;
    isActive?: boolean;
}

/** A reporting line must not loop back to the employee. */
async function assertNoManagerCycle(db: any, employeeId: number | null, managerId: number) {
    if (employeeId !== null && managerId === employeeId) throw new HrError('An employee cannot report to themselves.');
    let cursor: number | null = managerId;
    for (let i = 0; i < 25 && cursor; i++) {
        if (employeeId !== null && cursor === employeeId) throw new HrError('That reporting line would create a loop.');
        const m: { reporting_manager_id: number | null } | null =
            await db.employee.findFirst({ where: { id: cursor }, select: { reporting_manager_id: true } });
        if (!m) throw new HrError('Reporting manager not found.');
        cursor = m.reporting_manager_id;
    }
}

function profileFields(data: EmployeeInput) {
    const out: Record<string, any> = {};
    if (data.name !== undefined) {
        const n = clean(data.name, 120);
        if (!n) throw new HrError('Name is required');
        out.name = n;
    }
    if (data.designation !== undefined) {
        const d = clean(data.designation, 120);
        if (!d) throw new HrError('Designation is required');
        out.designation = d;
    }
    if (data.departmentId !== undefined) out.department_id = data.departmentId || null;
    if (data.branchId !== undefined) out.branch_id = data.branchId || null;
    if (data.phone !== undefined) out.phone = clean(data.phone, 20);
    if (data.email !== undefined) {
        const e = clean(data.email, 150);
        if (e && !/^\S+@\S+\.\S+$/.test(e)) throw new HrError('Email looks invalid');
        out.email = e;
    }
    if (data.employmentType !== undefined) {
        if (!EMPLOYMENT_TYPES.includes(data.employmentType as any)) throw new HrError('Invalid employment type');
        out.employment_type = data.employmentType;
    }
    if (data.gender !== undefined) out.gender = clean(data.gender, 20);
    if (data.bloodGroup !== undefined) out.blood_group = clean(data.bloodGroup, 5);
    if (data.address !== undefined) out.address = clean(data.address, 300);
    if (data.emergencyContactName !== undefined) out.emergency_contact_name = clean(data.emergencyContactName, 120);
    if (data.emergencyContactPhone !== undefined) out.emergency_contact_phone = clean(data.emergencyContactPhone, 20);
    if (data.dateOfBirth !== undefined) {
        if (data.dateOfBirth && !isDayKey(data.dateOfBirth)) throw new HrError('Invalid date of birth');
        out.date_of_birth = data.dateOfBirth ? dayStartUtc(data.dateOfBirth) : null;
    }
    if (data.dateOfJoining !== undefined) {
        if (!isDayKey(data.dateOfJoining)) throw new HrError('Invalid joining date');
        out.date_of_joining = dayStartUtc(data.dateOfJoining);
    }
    if (data.dateOfExit !== undefined) {
        if (data.dateOfExit && !isDayKey(data.dateOfExit)) throw new HrError('Invalid exit date');
        out.date_of_exit = data.dateOfExit ? dayStartUtc(data.dateOfExit) : null;
    }
    if (data.exitReason !== undefined) out.exit_reason = clean(data.exitReason, 300);
    return out;
}

export async function createEmployee(data: EmployeeInput & { name: string; designation: string; dateOfJoining: string }) {
    try {
        const { db, organizationId } = await requireHr('create', 'employee');
        const fields = profileFields(data);
        if (!fields.name || !fields.designation || !fields.date_of_joining) throw new HrError('Name, designation and joining date are required');

        if (data.salaryBasic !== undefined) {
            if (!isFinite(data.salaryBasic) || data.salaryBasic < 0) throw new HrError('Invalid salary');
            fields.salary_basic = data.salaryBasic;
        }

        if (data.userId) {
            const user = await db.user.findFirst({ where: { id: data.userId } });
            if (!user) throw new HrError('Linked login user not found');
            const taken = await db.employee.findFirst({ where: { user_id: user.id } });
            if (taken) throw new HrError('That login user already has an employee profile');
            fields.user_id = user.id;
        }
        if (data.reportingManagerId) {
            await assertNoManagerCycle(db, null, data.reportingManagerId);
            fields.reporting_manager_id = data.reportingManagerId;
        }

        const employee = await createEmployeeWithCode(db, organizationId, fields);
        await logAudit({
            action: 'HR_EMPLOYEE_CREATE', module: 'hr', entity_type: 'employee', entity_id: String(employee.id),
            details: `Created employee ${employee.employee_code} (${employee.name})`,
        });
        revalidatePath('/hr/employees');
        return { success: true, data: employee };
    } catch (error) {
        return hrFail(error, 'Failed to create employee');
    }
}

export async function updateEmployee(id: number, data: EmployeeInput) {
    try {
        const { db } = await requireHr('edit', 'employee');
        const before = await loadEmployee(db, id);
        const fields = profileFields(data);

        if (data.salaryBasic !== undefined) {
            if (!isFinite(data.salaryBasic) || data.salaryBasic < 0) throw new HrError('Invalid salary');
            fields.salary_basic = data.salaryBasic;
        }
        if (data.reportingManagerId !== undefined) {
            if (data.reportingManagerId) await assertNoManagerCycle(db, id, data.reportingManagerId);
            fields.reporting_manager_id = data.reportingManagerId || null;
        }
        // Company masters must belong to the employee's own company (never trust a client-supplied id).
        if (data.designationId !== undefined || data.orgDepartmentId !== undefined) {
            if (!before.company_id) throw new HrError('Company setup is not complete for this unit yet.');
            if (data.designationId !== undefined) {
                if (data.designationId) {
                    const d = await prisma.designation.findFirst({ where: { id: data.designationId, company_id: before.company_id, is_active: true } });
                    if (!d) throw new HrError('Unknown designation');
                    fields.designation_id = d.id;
                    // keep the legacy text column in step so every existing screen shows the same thing
                    if (data.designation === undefined) fields.designation = d.name;
                } else {
                    fields.designation_id = null;
                }
            }
            if (data.orgDepartmentId !== undefined) {
                if (data.orgDepartmentId) {
                    const d = await prisma.orgDepartment.findFirst({ where: { id: data.orgDepartmentId, company_id: before.company_id, is_active: true } });
                    if (!d) throw new HrError('Unknown department');
                    fields.org_department_id = d.id;
                } else {
                    fields.org_department_id = null;
                }
            }
        }
        if (data.isActive !== undefined) {
            fields.is_active = data.isActive;
            if (data.isActive === false && data.dateOfExit === undefined && !before.date_of_exit) {
                fields.date_of_exit = dayStartUtc(istTodayKey());
            }
            if (data.isActive === true) { fields.date_of_exit = null; fields.exit_reason = null; }
        }

        const after = await db.employee.update({ where: { id: before.id }, data: fields });

        // Keep the login profile in step with the HR profile so the two never drift.
        if (before.user_id && (fields.name || 'phone' in fields || 'email' in fields)) {
            await db.user.updateMany({
                where: { id: before.user_id },
                data: {
                    ...(fields.name && { name: fields.name }),
                    ...('phone' in fields && { phone: fields.phone }),
                    ...('email' in fields && { email: fields.email }),
                },
            });
        }

        const pick = (e: any) => ({
            name: e.name, designation: e.designation, department_id: e.department_id, branch_id: e.branch_id,
            employment_type: e.employment_type, reporting_manager_id: e.reporting_manager_id,
            designation_id: e.designation_id, org_department_id: e.org_department_id,
            is_active: e.is_active, salary_basic: e.salary_basic,
        });
        await logAudit({
            action: 'HR_EMPLOYEE_UPDATE', module: 'hr', entity_type: 'employee', entity_id: String(id),
            before: pick(before), after: pick(after), summary: `Updated employee ${after.employee_code}`,
        });
        revalidatePath('/hr/employees');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to update employee');
    }
}

// ========================================
// ATTENDANCE
// ========================================

/** HR edits one employee-day directly. Times are IST "HH:mm". */
export async function recordAttendance(data: {
    employeeId: number;
    date: string;
    checkIn?: string;
    checkOut?: string;
    status: string;
}) {
    try {
        const { db, organizationId } = await requireHr('edit', 'attendance');
        if (!isDayKey(data.date)) throw new HrError('Invalid date');
        if (data.date > istTodayKey()) throw new HrError('Cannot mark attendance for a future date');
        if (!ATTENDANCE_STATUSES.includes(data.status as any)) throw new HrError('Invalid status');
        if (data.checkIn && !TIME_RE.test(data.checkIn)) throw new HrError('Invalid check-in time');
        if (data.checkOut && !TIME_RE.test(data.checkOut)) throw new HrError('Invalid check-out time');

        const employee = await loadEmployee(db, data.employeeId);
        const policy = await loadHrPolicy(db);
        const existing = await db.attendance.findFirst({
            where: { employee_id: employee.id, date: { gte: dayStartUtc(data.date), lt: dayStartUtc(addDaysKey(data.date, 1)) } },
        });

        const worked = data.status === 'Present' || data.status === 'Half-Day';
        const checkIn: Date | null = !worked ? null
            : data.checkIn ? istTimeOnDay(data.date, data.checkIn) : existing?.check_in ?? null;
        const checkOut: Date | null = !worked ? null
            : data.checkOut ? istTimeOnDay(data.date, data.checkOut) : existing?.check_out ?? null;
        if (checkIn && checkOut && checkOut <= checkIn) throw new HrError('Check-out must be after check-in');

        const totalHours = checkIn && checkOut ? round2((checkOut.getTime() - checkIn.getTime()) / 3600000) : null;
        const lateRaw = checkIn ? minutesBetween(istTimeOnDay(data.date, policy.workStart), checkIn) : 0;

        await saveAttendance(db, organizationId, employee.id, data.date, {
            check_in: checkIn, check_out: checkOut, total_hours: totalHours, status: data.status,
            source: 'MANUAL', late_minutes: data.status === 'Present' && lateRaw > policy.graceMinutes ? lateRaw : 0,
        });
        await logAudit({
            action: 'HR_ATTENDANCE_EDIT', module: 'hr', entity_type: 'attendance', entity_id: String(employee.id),
            before: existing ? { status: existing.status, check_in: existing.check_in, check_out: existing.check_out } : undefined,
            after: { status: data.status, check_in: checkIn, check_out: checkOut },
            summary: `${employee.employee_code} ${data.date} → ${data.status}`,
        });
        revalidatePath('/hr/attendance');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to record attendance');
    }
}

export async function getAttendanceForDate(date: string) {
    try {
        const { db } = await requireHr('view', 'attendance');
        if (!isDayKey(date)) throw new HrError('Invalid date');

        const [employees, attendances, leaves] = await Promise.all([
            db.employee.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
            db.attendance.findMany({ where: { date: { gte: dayStartUtc(date), lt: dayStartUtc(addDaysKey(date, 1)) } } }),
            db.leaveRequest.findMany({
                where: { status: 'Approved', from_date: { lte: dayStartUtc(date) }, to_date: { gte: dayStartUtc(date) } },
                select: { employee_id: true },
            }),
        ]);
        const attMap = new Map<number, any>(attendances.map((a: any) => [a.employee_id, a]));
        const onLeave = new Set<number>(leaves.map((l: any) => l.employee_id));

        return {
            success: true,
            data: employees.map((employee: any) => ({
                employee, attendance: attMap.get(employee.id) || null, onApprovedLeave: onLeave.has(employee.id),
            })),
        };
    } catch (error) {
        console.error('Get Attendance Error:', error);
        return { success: false, data: [] };
    }
}

/** Month sheet for everyone: per-employee day statuses + payable-day summary. */
export async function getMonthlyAttendance(monthKey: string, filters?: { search?: string; designation?: string }) {
    try {
        const { db } = await requireHr('view', 'attendance');
        if (!isMonthKey(monthKey)) throw new HrError('Invalid month');

        const ctx = await loadMonthContext(db, monthKey);
        const where: any = { is_active: true };
        const search = clean(filters?.search, 100);
        if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { employee_code: { contains: search, mode: 'insensitive' } }];
        if (filters?.designation) where.designation = filters.designation;

        const employees = await db.employee.findMany({ where, orderBy: { name: 'asc' } });
        const ids = employees.map((e: any) => e.id);
        const [attendances, leaves] = await Promise.all([
            db.attendance.findMany({
                where: { employee_id: { in: ids }, date: { gte: dayStartUtc(ctx.first), lt: dayStartUtc(ctx.nextFirst) } },
            }),
            db.leaveRequest.findMany({
                where: {
                    employee_id: { in: ids }, status: 'Approved',
                    from_date: { lt: dayStartUtc(ctx.nextFirst) }, to_date: { gte: dayStartUtc(ctx.first) },
                },
            }),
        ]);
        const attBy = new Map<number, any[]>();
        for (const a of attendances) (attBy.get(a.employee_id) ?? attBy.set(a.employee_id, []).get(a.employee_id)!).push(a);
        const leaveBy = new Map<number, any[]>();
        for (const l of leaves) (leaveBy.get(l.employee_id) ?? leaveBy.set(l.employee_id, []).get(l.employee_id)!).push(l);

        const todayKey = istTodayKey();
        const rows = employees.map((e: any) => {
            const { days, summary } = buildMonthCells({
                monthKey, first: ctx.first, last: ctx.last, employee: e,
                attendances: attBy.get(e.id) ?? [], leaves: leaveBy.get(e.id) ?? [],
                holidayMap: ctx.holidayMap, policy: ctx.policy, todayKey,
            });
            return {
                employee: { id: e.id, name: e.name, employee_code: e.employee_code, designation: e.designation },
                days: days.map(d => ({ date: d.date, status: d.status, late: d.late_minutes > 0, hours: d.total_hours })),
                summary,
            };
        });
        return {
            success: true as const,
            data: { month: monthKey, dates: eachDayKey(ctx.first, ctx.last), holidays: Object.fromEntries(ctx.holidayMap), rows: rows as MonthRow[] },
        };
    } catch (error) {
        console.error('Monthly Attendance Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// ATTENDANCE REGULARIZATION (HR side)
// ========================================

export async function getRegularizations(filter: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
    try {
        const { db } = await requireHr('view', 'attendance');
        const where: any = {};
        if (filter !== 'all') where.status = filter.charAt(0).toUpperCase() + filter.slice(1);
        const data = await db.attendanceRegularization.findMany({
            where, orderBy: { created_at: 'desc' }, take: 200,
            include: { employee: { select: { name: true, employee_code: true, designation: true } } },
        });
        return { success: true, data };
    } catch (error) {
        console.error('Get Regularizations Error:', error);
        return { success: false, data: [] };
    }
}

/** HR/admin (hr.approve) or the employee's reporting manager may decide; never the employee. */
async function assertCanReview(ctx: HrCtx, employee: any) {
    if (employee.user_id && employee.user_id === ctx.session.id) {
        throw new HrError('You cannot review your own request.');
    }
    if (await hasPermission('hr.approve')) return;
    if (await isManagerOf(ctx.db, ctx.session, employee)) return;
    throw new HrError('You do not have permission to review this request.');
}

export async function reviewRegularization(id: number, decision: 'Approved' | 'Rejected', note?: string) {
    try {
        const ctx = await requireStaff();
        const { db, organizationId, session } = ctx;
        if (decision !== 'Approved' && decision !== 'Rejected') throw new HrError('Invalid decision');

        const reg = await db.attendanceRegularization.findFirst({ where: { id } });
        if (!reg) throw new HrError('Request not found');
        if (reg.status !== 'Pending') throw new HrError(`This request is already ${reg.status.toLowerCase()}.`);
        const employee = await loadEmployee(db, reg.employee_id);
        await assertCanReview(ctx, employee);

        if (decision === 'Approved') {
            const policy = await loadHrPolicy(db);
            const dayKey = reg.date.toISOString().slice(0, 10);
            const existing = await db.attendance.findFirst({
                where: { employee_id: employee.id, date: { gte: reg.date, lt: dayStartUtc(addDaysKey(dayKey, 1)) } },
            });
            const checkIn: Date | null = reg.requested_in ?? existing?.check_in ?? null;
            const checkOut: Date | null = reg.requested_out ?? existing?.check_out ?? null;
            const hours = checkIn && checkOut && checkOut > checkIn ? round2((checkOut.getTime() - checkIn.getTime()) / 3600000) : null;
            const status = reg.requested_status
                ?? (hours === null ? 'Present' : hours >= policy.fullDayHours ? 'Present' : 'Half-Day');
            const lateRaw = checkIn ? minutesBetween(istTimeOnDay(dayKey, policy.workStart), checkIn) : 0;

            await saveAttendance(db, organizationId, employee.id, dayKey, {
                check_in: checkIn, check_out: checkOut, total_hours: hours, status,
                source: 'REGULARIZED', late_minutes: status === 'Present' && lateRaw > policy.graceMinutes ? lateRaw : 0,
            });
        }

        await db.attendanceRegularization.update({
            where: { id: reg.id },
            data: { status: decision, reviewed_by: session.id, reviewed_at: new Date(), review_note: clean(note, 300) },
        });
        await notifyUsers(
            db, organizationId, [employee.user_id], `Attendance request ${decision.toLowerCase()}`,
            `Your regularization for ${reg.date.toISOString().slice(0, 10)} was ${decision.toLowerCase()}.`, '/me/attendance',
        );
        await logAudit({
            action: `HR_REGULARIZATION_${decision.toUpperCase()}`, module: 'hr', entity_type: 'attendance_regularization',
            entity_id: String(id), summary: `${employee.employee_code} ${reg.date.toISOString().slice(0, 10)}`,
        });
        revalidatePath('/hr/regularizations');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to review request');
    }
}

// ========================================
// LEAVE MANAGEMENT
// ========================================

/** HR files leave on an employee's behalf. */
export async function applyLeave(data: {
    employeeId: number;
    leaveTypeId: number;
    fromDate: string;
    toDate: string;
    reason?: string;
    isHalfDay?: boolean;
}) {
    try {
        const ctx = await requireHr('edit', 'leave');
        if (!isDayKey(data.fromDate) || !isDayKey(data.toDate)) throw new HrError('Invalid dates');
        const employee = await loadEmployee(ctx.db, data.employeeId);
        await createLeaveRequest(ctx, employee, data);
        revalidatePath('/hr/leave');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to apply leave');
    }
}

async function reviewLeave(id: number, decision: 'Approved' | 'Rejected', note?: string) {
    const ctx = await requireStaff();
    const { db, organizationId, session } = ctx;

    const leave = await db.leaveRequest.findFirst({ where: { id }, include: { leave_type: true } });
    if (!leave) throw new HrError('Leave request not found');
    if (leave.status !== 'Pending') throw new HrError(`This request is already ${leave.status.toLowerCase()}.`);
    const employee = await loadEmployee(db, leave.employee_id);
    await assertCanReview(ctx, employee);

    if (decision === 'Approved' && leave.leave_type.is_paid) {
        // Re-check at approval time: balance may have been used by another request since applying.
        const bal = (await getLeaveBalances(db, employee.id, leave.from_date.getUTCFullYear()))
            .find(b => b.leaveTypeId === leave.leave_type_id);
        if (bal && bal.remaining + leave.days < leave.days) {
            throw new HrError(`Insufficient ${leave.leave_type.name} balance to approve.`);
        }
    }

    await db.leaveRequest.update({
        where: { id: leave.id },
        data: { status: decision, approved_by: session.id, reviewed_at: new Date(), review_note: clean(note, 300) },
    });
    if (decision === 'Approved') {
        await applyLeaveToAttendance(db, organizationId, leave, await loadHrPolicy(db));
    }
    await notifyUsers(
        db, organizationId, [employee.user_id], `Leave ${decision.toLowerCase()}`,
        `Your ${leave.leave_type.name} (${leave.from_date.toISOString().slice(0, 10)} → ${leave.to_date.toISOString().slice(0, 10)}) was ${decision.toLowerCase()}.`,
        '/me/leave',
    );
    await logAudit({
        action: `HR_LEAVE_${decision.toUpperCase()}`, module: 'hr', entity_type: 'leave_request', entity_id: String(id),
        summary: `${employee.employee_code} ${leave.leave_type.name} ${leave.days}d`,
    });
    revalidatePath('/hr/leave');
}

/** The reviewer is always the logged-in user; the old client-supplied `approvedBy` is ignored. */
export async function approveLeave(id: number, note?: string) {
    try {
        await reviewLeave(id, 'Approved', typeof note === 'string' ? note : undefined);
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to approve');
    }
}

export async function rejectLeave(id: number, note?: string) {
    try {
        await reviewLeave(id, 'Rejected', typeof note === 'string' ? note : undefined);
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to reject');
    }
}

/** HR cancels any leave (pending or approved), restoring the attendance sheet. */
export async function cancelLeaveByHr(id: number) {
    try {
        const { db, session } = await requireHr('approve', 'leave');
        const leave = await db.leaveRequest.findFirst({ where: { id } });
        if (!leave) throw new HrError('Leave request not found');
        if (leave.status === 'Cancelled' || leave.status === 'Rejected') throw new HrError('Already closed');
        if (leave.status === 'Approved') await revertLeaveFromAttendance(db, leave);
        await db.leaveRequest.update({
            where: { id: leave.id },
            data: { status: 'Cancelled', reviewed_at: new Date(), approved_by: session.id },
        });
        await logAudit({ action: 'HR_LEAVE_CANCEL', module: 'hr', entity_type: 'leave_request', entity_id: String(id) });
        revalidatePath('/hr/leave');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to cancel');
    }
}

export async function getLeaveRequests(filter?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all') {
    try {
        const ctx = await requireStaff();
        const { db, session } = ctx;
        const where: any = {};
        if (filter && filter !== 'all') where.status = filter.charAt(0).toUpperCase() + filter.slice(1);

        // HR sees everyone; a plain manager sees only their direct reports.
        if (!(await hasPermission('hr.view'))) {
            const me = await db.employee.findFirst({ where: { user_id: session.id }, select: { id: true } });
            if (!me) return { success: true, data: [] };
            where.employee = { reporting_manager_id: me.id };
        }

        const requests = await db.leaveRequest.findMany({
            where,
            include: {
                employee: { select: { name: true, employee_code: true, designation: true } },
                leave_type: { select: { name: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 300,
        });
        return { success: true, data: requests };
    } catch (error) {
        console.error('Get Leave Requests Error:', error);
        return { success: false, data: [] };
    }
}

export async function getLeaveTypes() {
    try {
        const { db } = await requireStaff();
        const types = await db.leaveType.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: types };
    } catch (error) {
        console.error('Get Leave Types Error:', error);
        return { success: false, data: [] };
    }
}

export async function saveLeaveType(data: {
    id?: number; name: string; daysPerYear: number; isPaid?: boolean; carryForward?: boolean; isActive?: boolean;
}) {
    try {
        const { db } = await requireHr('edit', 'policy');
        const name = clean(data.name, 60);
        if (!name) throw new HrError('Name is required');
        if (!Number.isInteger(data.daysPerYear) || data.daysPerYear < 0 || data.daysPerYear > 366) throw new HrError('Days per year must be 0–366');

        const fields = {
            name, days_per_year: data.daysPerYear,
            is_paid: data.isPaid ?? true, carry_forward: data.carryForward ?? false, is_active: data.isActive ?? true,
        };
        if (data.id) {
            const existing = await db.leaveType.findFirst({ where: { id: data.id } });
            if (!existing) throw new HrError('Leave type not found');
            await db.leaveType.update({ where: { id: existing.id }, data: fields });
        } else {
            const dupe = await db.leaveType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
            if (dupe) throw new HrError('A leave type with that name already exists');
            await db.leaveType.create({ data: fields });
        }
        await logAudit({ action: 'HR_LEAVE_TYPE_SAVE', module: 'hr', entity_type: 'leave_type', details: `${name}: ${data.daysPerYear}d` });
        revalidatePath('/hr/settings');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to save leave type');
    }
}

export async function getLeaveBalance(employeeId: number) {
    try {
        const { db } = await requireHr('view', 'leave');
        const employee = await loadEmployee(db, employeeId);
        return { success: true, data: await getLeaveBalances(db, employee.id) };
    } catch (error) {
        console.error('Leave Balance Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// HOLIDAYS
// ========================================

export async function getHolidays(year: number) {
    try {
        const { db } = await requireStaff();
        if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HrError('Invalid year');
        const data = await db.holiday.findMany({
            where: { date: { gte: dayStartUtc(`${year}-01-01`), lt: dayStartUtc(`${year + 1}-01-01`) } },
            orderBy: { date: 'asc' },
        });
        return { success: true, data };
    } catch (error) {
        console.error('Get Holidays Error:', error);
        return { success: false, data: [] };
    }
}

export async function addHoliday(data: { date: string; name: string; type?: 'PUBLIC' | 'OPTIONAL' }) {
    try {
        const { db } = await requireHr('edit', 'holiday');
        if (!isDayKey(data.date)) throw new HrError('Invalid date');
        const name = clean(data.name, 100);
        if (!name) throw new HrError('Holiday name is required');
        const type = data.type === 'OPTIONAL' ? 'OPTIONAL' : 'PUBLIC';
        const dupe = await db.holiday.findFirst({ where: { date: dayStartUtc(data.date), name } });
        if (dupe) throw new HrError('That holiday is already added');
        await db.holiday.create({ data: { date: dayStartUtc(data.date), name, type } });
        await logAudit({ action: 'HR_HOLIDAY_ADD', module: 'hr', entity_type: 'holiday', details: `${data.date} ${name}` });
        revalidatePath('/hr/settings');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to add holiday');
    }
}

export async function deleteHoliday(id: number) {
    try {
        const { db } = await requireHr('edit', 'holiday');
        const h = await db.holiday.findFirst({ where: { id } });
        if (!h) throw new HrError('Holiday not found');
        await db.holiday.delete({ where: { id: h.id } });
        await logAudit({ action: 'HR_HOLIDAY_DELETE', module: 'hr', entity_type: 'holiday', details: h.name });
        revalidatePath('/hr/settings');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to delete holiday');
    }
}

// ========================================
// POLICY (stored in ModuleConfig 'hr')
// ========================================

export async function getHrPolicySettings() {
    try {
        const { db } = await requireHr('view', 'policy');
        return { success: true, data: await loadHrPolicy(db) };
    } catch (error) {
        return { ...hrFail(error, 'Failed to load policy'), data: null };
    }
}

export async function updateHrPolicy(patch: Record<string, unknown>) {
    try {
        const { db, organizationId } = await requireHr('edit', 'policy');
        const row = await db.moduleConfig.findFirst({ where: { module_key: 'hr' } });
        const current = (row?.config_json && typeof row.config_json === 'object' ? row.config_json : {}) as Record<string, any>;
        const merged = { ...current, ...patch };
        const policy = resolveHrPolicy(merged);
        if (policy.halfDayHours > policy.fullDayHours) throw new HrError('Half-day hours cannot exceed full-day hours');
        if (policy.requireGeo && !policy.geofence) throw new HrError('Set the work location (lat, lng, radius) before requiring location for punches.');

        // Persist only validated policy keys; leave unrelated hr config (shift types etc.) untouched.
        const next = { ...current, ...policy };
        if (row) await db.moduleConfig.update({ where: { id: row.id }, data: { config_json: next } });
        else await db.moduleConfig.create({ data: { organizationId, module_key: 'hr', enabled: true, config_json: next } });

        await logAudit({ action: 'HR_POLICY_UPDATE', module: 'hr', before: current, after: next, summary: 'Updated HR attendance policy' });
        revalidatePath('/hr/settings');
        return { success: true, data: policy };
    } catch (error) {
        return hrFail(error, 'Failed to update policy');
    }
}

// ========================================
// SHIFT MANAGEMENT
// ========================================

export async function getShiftPatterns() {
    try {
        const { db } = await requireStaff();
        const patterns = await db.shiftPattern.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: patterns };
    } catch (error) {
        console.error('Get Shift Patterns Error:', error);
        return { success: false, data: [] };
    }
}

export async function createShiftPattern(data: { name: string; startTime: string; endTime: string }) {
    try {
        const { db } = await requireHr('edit', 'roster');
        const name = clean(data.name, 60);
        if (!name) throw new HrError('Shift name is required');
        if (!TIME_RE.test(data.startTime) || !TIME_RE.test(data.endTime)) throw new HrError('Times must be HH:mm');
        await db.shiftPattern.create({ data: { name, start_time: data.startTime, end_time: data.endTime } });
        revalidatePath('/hr/shifts');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to create shift');
    }
}

/** Assign one shift to an employee for a date range; replaces any shift already set on those days. */
export async function createShiftRoster(data: {
    employeeId: number;
    shiftPatternId: number;
    startDate: string;
    endDate: string;
}) {
    try {
        const { db } = await requireHr('edit', 'roster');
        if (!isDayKey(data.startDate) || !isDayKey(data.endDate)) throw new HrError('Invalid dates');
        if (data.endDate < data.startDate) throw new HrError('End date is before start date');
        const keys = eachDayKey(data.startDate, data.endDate, 63);
        if (keys.length > 62) throw new HrError('Roster range is limited to 62 days at a time');

        const employee = await loadEmployee(db, data.employeeId);
        const pattern = await db.shiftPattern.findFirst({ where: { id: data.shiftPatternId } });
        if (!pattern) throw new HrError('Shift not found');

        const existing = await db.shiftAssignment.findMany({
            where: { employee_id: employee.id, date: { gte: dayStartUtc(data.startDate), lt: dayStartUtc(addDaysKey(data.endDate, 1)) } },
        });
        const byDay = new Map<string, any>(existing.map((a: any) => [a.date.toISOString().slice(0, 10), a]));

        const toCreate: any[] = [];
        for (const k of keys) {
            const have = byDay.get(k);
            if (!have) toCreate.push({ employee_id: employee.id, shift_pattern_id: pattern.id, date: dayStartUtc(k) });
            else if (have.shift_pattern_id !== pattern.id) {
                await db.shiftAssignment.update({ where: { id: have.id }, data: { shift_pattern_id: pattern.id } });
            }
        }
        if (toCreate.length) await db.shiftAssignment.createMany({ data: toCreate });

        revalidatePath('/hr/shifts');
        return { success: true, count: keys.length };
    } catch (error) {
        return hrFail(error, 'Failed to create roster');
    }
}

export async function removeShiftAssignment(id: number) {
    try {
        const { db } = await requireHr('edit', 'roster');
        const a = await db.shiftAssignment.findFirst({ where: { id } });
        if (!a) throw new HrError('Assignment not found');
        await db.shiftAssignment.delete({ where: { id: a.id } });
        revalidatePath('/hr/shifts');
        return { success: true };
    } catch (error) {
        return hrFail(error, 'Failed to remove shift');
    }
}

export async function getShiftAssignments(date: string) {
    try {
        const { db } = await requireStaff();
        if (!isDayKey(date)) throw new HrError('Invalid date');
        const assignments = await db.shiftAssignment.findMany({
            where: { date: { gte: dayStartUtc(date), lt: dayStartUtc(addDaysKey(date, 1)) } },
            include: {
                employee: { select: { name: true, employee_code: true, designation: true } },
                shift_pattern: true,
            },
            orderBy: { employee: { name: 'asc' } },
        });
        return { success: true, data: assignments };
    } catch (error) {
        console.error('Get Shift Assignments Error:', error);
        return { success: false, data: [] };
    }
}
