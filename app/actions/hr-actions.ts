'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

// ========================================
// HR DASHBOARD
// ========================================

export async function getHRDashboard() {
    try {
        const { db, organizationId } = await requireTenantContext();

        // 1. Get dynamic role breakdown from User table (where actual portal users are defined)
        const userRoles = await db.user.groupBy({
            by: ['role'],
            where: { organizationId, is_active: true },
            _count: { _all: true }
        });

        // 2. Get dynamic designation breakdown from Employee table (for offline/generic staff)
        const employeeRoles = await db.employee.groupBy({
            by: ['designation'],
            where: { organizationId, is_active: true },
            _count: { _all: true }
        });

        // 3. Fetch comprehensive directory (Combined Users and Employees)
        const [systemUsers, hospitalEmployees] = await Promise.all([
            db.user.findMany({
                where: { organizationId, is_active: true },
                select: { id: true, name: true, role: true, username: true, phone: true, email: true },
            }),
            db.employee.findMany({
                where: { organizationId, is_active: true },
                select: { id: true, name: true, designation: true, employee_code: true, phone: true, email: true },
            })
        ]);

        // Format role counts into a unified mapping
        const analyticsMapping: Record<string, number> = {};
        userRoles.forEach((ur: any) => {
            const label = ur.role.charAt(0).toUpperCase() + ur.role.slice(1).replace('_', ' ');
            analyticsMapping[label] = (analyticsMapping[label] || 0) + ur._count._all;
        });
        employeeRoles.forEach((er: any) => {
            if (!er.designation) return;
            const label = er.designation.charAt(0).toUpperCase() + er.designation.slice(1);
            analyticsMapping[label] = (analyticsMapping[label] || 0) + er._count._all;
        });

        // Combine into a unified personnel list for the directory
        const personnelMap = new Map();
        
        systemUsers.forEach((u: any) => {
            personnelMap.set(u.id, {
                id: u.id,
                name: u.name || u.username,
                role: u.role.charAt(0).toUpperCase() + u.role.slice(1).replace('_', ' '),
                code: u.username,
                phone: u.phone,
                email: u.email
            });
        });

        hospitalEmployees.forEach((e: any) => {
            // If already exists (maybe linked), we'll keep the system user entry but perhaps enrich it
            if (!personnelMap.has(e.id)) {
                personnelMap.set(e.id, {
                    id: e.id,
                    name: e.name,
                    role: e.designation,
                    code: e.employee_code,
                    phone: e.phone,
                    email: e.email
                });
            }
        });

        return {
            success: true,
            data: {
                totalStrength: Object.values(analyticsMapping).reduce((a: number, b: number) => a + b, 0),
                roleBreakdown: Object.entries(analyticsMapping).map(([role, count]) => ({ role, count })),
                staffList: Array.from(personnelMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            },
        };
    } catch (error) {
        console.error('HR Dashboard Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// EMPLOYEE MANAGEMENT
// ========================================

export async function getEmployeeList(options?: {
    search?: string;
    designation?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();

        const page = options?.page || 1;
        const limit = options?.limit || 25;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (options?.search) {
            where.OR = [
                { name: { contains: options.search } },
                { employee_code: { contains: options.search } },
                { email: { contains: options.search } },
            ];
        }
        if (options?.designation) where.designation = options.designation;
        if (options?.isActive !== undefined) where.is_active = options.isActive;

        const [data, total] = await Promise.all([
            db.employee.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            db.employee.count({ where }),
        ]);

        return { success: true, data, total, totalPages: Math.ceil(total / limit), page };
    } catch (error) {
        console.error('Employee List Error:', error);
        return { success: false, data: [], total: 0, totalPages: 0, page: 1 };
    }
}

export async function getEmployeeDetail(id: number) {
    try {
        const { db } = await requireTenantContext();

        const employee = await db.employee.findUnique({
            where: { id },
            include: {
                attendances: { orderBy: { date: 'desc' }, take: 30 },
                leave_requests: { orderBy: { created_at: 'desc' }, take: 10, include: { leave_type: true } },
                shift_assignments: { orderBy: { date: 'desc' }, take: 14, include: { shift_pattern: true } },
            },
        });

        if (!employee) return { success: false, data: null };
        return { success: true, data: employee };
    } catch (error) {
        console.error('Employee Detail Error:', error);
        return { success: false, data: null };
    }
}

export async function createEmployee(data: {
    name: string;
    designation: string;
    departmentId?: string;
    dateOfJoining: string;
    salaryBasic?: number;
    phone?: string;
    email?: string;
    userId?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        // Generate employee code
        const count = await db.employee.count();
        const employeeCode = `EMP-${String(count + 1).padStart(5, '0')}`;

        const employee = await db.employee.create({
            data: {
                employee_code: employeeCode,
                name: data.name,
                designation: data.designation,
                department_id: data.departmentId,
                date_of_joining: new Date(data.dateOfJoining),
                salary_basic: data.salaryBasic || 0,
                phone: data.phone,
                email: data.email,
                user_id: data.userId,
            },
        });

        revalidatePath('/hr/employees');
        return { success: true, data: employee };
    } catch (error) {
        console.error('Create Employee Error:', error);
        return { success: false, error: 'Failed to create employee' };
    }
}

export async function updateEmployee(id: number, data: {
    name?: string;
    designation?: string;
    departmentId?: string;
    salaryBasic?: number;
    phone?: string;
    email?: string;
    isActive?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();

        await db.employee.update({
            where: { id },
            data: {
                name: data.name,
                designation: data.designation,
                department_id: data.departmentId,
                salary_basic: data.salaryBasic,
                phone: data.phone,
                email: data.email,
                is_active: data.isActive,
            },
        });

        revalidatePath('/hr/employees');
        return { success: true };
    } catch (error) {
        console.error('Update Employee Error:', error);
        return { success: false, error: 'Failed to update employee' };
    }
}

// ========================================
// ATTENDANCE
// ========================================

export async function recordAttendance(data: {
    employeeId: number;
    date: string;
    checkIn?: string;
    checkOut?: string;
    status: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const dateObj = new Date(data.date);
        dateObj.setHours(0, 0, 0, 0);

        // Check if attendance already exists for this date
        const existing = await db.attendance.findFirst({
            where: { employee_id: data.employeeId, date: dateObj },
        });

        let totalHours: number | null = null;
        if (data.checkIn && data.checkOut) {
            const inTime = new Date(`${data.date}T${data.checkIn}`);
            const outTime = new Date(`${data.date}T${data.checkOut}`);
            totalHours = Math.round(((outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;
        }

        if (existing) {
            await db.attendance.update({
                where: { id: existing.id },
                data: {
                    check_in: data.checkIn ? new Date(`${data.date}T${data.checkIn}`) : undefined,
                    check_out: data.checkOut ? new Date(`${data.date}T${data.checkOut}`) : undefined,
                    total_hours: totalHours,
                    status: data.status,
                },
            });
        } else {
            await db.attendance.create({
                data: {
                    employee_id: data.employeeId,
                    date: dateObj,
                    check_in: data.checkIn ? new Date(`${data.date}T${data.checkIn}`) : null,
                    check_out: data.checkOut ? new Date(`${data.date}T${data.checkOut}`) : null,
                    total_hours: totalHours,
                    status: data.status,
                },
            });
        }

        revalidatePath('/hr/attendance');
        return { success: true };
    } catch (error) {
        console.error('Record Attendance Error:', error);
        return { success: false, error: 'Failed to record attendance' };
    }
}

export async function getAttendanceForDate(date: string) {
    try {
        const { db } = await requireTenantContext();

        const dateObj = new Date(date);
        dateObj.setHours(0, 0, 0, 0);
        const dateEnd = new Date(date);
        dateEnd.setHours(23, 59, 59, 999);

        const employees = await db.employee.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });

        const attendances = await db.attendance.findMany({
            where: { date: { gte: dateObj, lte: dateEnd } },
        });

        const attendanceMap = Object.fromEntries(
            attendances.map((a: any) => [a.employee_id, a])
        );

        const result = employees.map((emp: any) => ({
            employee: emp,
            attendance: attendanceMap[emp.id] || null,
        }));

        return { success: true, data: result };
    } catch (error) {
        console.error('Get Attendance Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// LEAVE MANAGEMENT
// ========================================

export async function applyLeave(data: {
    employeeId: number;
    leaveTypeId: number;
    fromDate: string;
    toDate: string;
    reason?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        await db.leaveRequest.create({
            data: {
                employee_id: data.employeeId,
                leave_type_id: data.leaveTypeId,
                from_date: new Date(data.fromDate),
                to_date: new Date(data.toDate),
                reason: data.reason,
                status: 'Pending',
            },
        });

        revalidatePath('/hr/leave');
        return { success: true };
    } catch (error) {
        console.error('Apply Leave Error:', error);
        return { success: false, error: 'Failed to apply leave' };
    }
}

export async function approveLeave(id: number, approvedBy: string) {
    try {
        const { db } = await requireTenantContext();

        await db.leaveRequest.update({
            where: { id },
            data: { status: 'Approved', approved_by: approvedBy },
        });

        revalidatePath('/hr/leave');
        return { success: true };
    } catch (error) {
        console.error('Approve Leave Error:', error);
        return { success: false, error: 'Failed to approve' };
    }
}

export async function rejectLeave(id: number, approvedBy: string) {
    try {
        const { db } = await requireTenantContext();

        await db.leaveRequest.update({
            where: { id },
            data: { status: 'Rejected', approved_by: approvedBy },
        });

        revalidatePath('/hr/leave');
        return { success: true };
    } catch (error) {
        console.error('Reject Leave Error:', error);
        return { success: false, error: 'Failed to reject' };
    }
}

export async function getLeaveRequests(filter?: 'pending' | 'approved' | 'rejected' | 'all') {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (filter && filter !== 'all') {
            where.status = filter.charAt(0).toUpperCase() + filter.slice(1);
        }

        const requests = await db.leaveRequest.findMany({
            where,
            include: {
                employee: { select: { name: true, employee_code: true, designation: true } },
                leave_type: { select: { name: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: requests };
    } catch (error) {
        console.error('Get Leave Requests Error:', error);
        return { success: false, data: [] };
    }
}

export async function getLeaveTypes() {
    try {
        const { db } = await requireTenantContext();
        const types = await db.leaveType.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: types };
    } catch (error) {
        console.error('Get Leave Types Error:', error);
        return { success: false, data: [] };
    }
}

export async function getLeaveBalance(employeeId: number) {
    try {
        const { db } = await requireTenantContext();

        const leaveTypes = await db.leaveType.findMany();
        const yearStart = new Date();
        yearStart.setMonth(0, 1);
        yearStart.setHours(0, 0, 0, 0);

        const approvedLeaves = await db.leaveRequest.findMany({
            where: {
                employee_id: employeeId,
                status: 'Approved',
                from_date: { gte: yearStart },
            },
        });

        const balances = leaveTypes.map((lt: any) => {
            const used = approvedLeaves
                .filter((l: any) => l.leave_type_id === lt.id)
                .reduce((sum: number, l: any) => {
                    const days = Math.ceil(
                        (new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / (1000 * 60 * 60 * 24)
                    ) + 1;
                    return sum + days;
                }, 0);

            return {
                leaveType: lt.name,
                total: lt.days_per_year,
                used,
                remaining: lt.days_per_year - used,
            };
        });

        return { success: true, data: balances };
    } catch (error) {
        console.error('Leave Balance Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// SHIFT MANAGEMENT
// ========================================

export async function getShiftPatterns() {
    try {
        const { db } = await requireTenantContext();
        const patterns = await db.shiftPattern.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: patterns };
    } catch (error) {
        console.error('Get Shift Patterns Error:', error);
        return { success: false, data: [] };
    }
}

export async function createShiftPattern(data: { name: string; startTime: string; endTime: string }) {
    try {
        const { db } = await requireTenantContext();

        await db.shiftPattern.create({
            data: { name: data.name, start_time: data.startTime, end_time: data.endTime },
        });

        revalidatePath('/hr/shifts');
        return { success: true };
    } catch (error) {
        console.error('Create Shift Pattern Error:', error);
        return { success: false, error: 'Failed to create' };
    }
}

export async function createShiftRoster(data: {
    employeeId: number;
    shiftPatternId: number;
    startDate: string;
    endDate: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const assignments: any[] = [];
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            assignments.push({
                employee_id: data.employeeId,
                shift_pattern_id: data.shiftPatternId,
                date: new Date(d),
            });
        }

        if (assignments.length > 0) {
            await db.shiftAssignment.createMany({ data: assignments });
        }

        revalidatePath('/hr/shifts');
        return { success: true, count: assignments.length };
    } catch (error) {
        console.error('Create Roster Error:', error);
        return { success: false, error: 'Failed to create roster' };
    }
}

export async function getShiftAssignments(date: string) {
    try {
        const { db } = await requireTenantContext();

        const dateObj = new Date(date);
        dateObj.setHours(0, 0, 0, 0);
        const dateEnd = new Date(date);
        dateEnd.setHours(23, 59, 59, 999);

        const assignments = await db.shiftAssignment.findMany({
            where: { date: { gte: dateObj, lte: dateEnd } },
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
