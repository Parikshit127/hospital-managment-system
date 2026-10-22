/** Response shapes of /api/v1. Kept in step with docs/HR_MOBILE_API.md and app/actions/hr-*.ts on the server. */

export interface Capabilities {
    employee: true;
    manager: boolean;
    directReports: number;
    hr: boolean;
    hrEdit: boolean;
    hrApprove: boolean;
    hrCreate: boolean;
    hrExport: boolean;
}

export interface Me {
    user: { id: string; username: string; name: string; role: string };
    organization: { id: string; name: string; slug: string };
    employee: { id: number; code: string; name: string; designation: string; isActive: boolean };
    capabilities: Capabilities;
}

export interface Geofence {
    required: boolean;
    configured: boolean;
    inside: boolean | null;
    distanceM: number | null;
}

export interface LoginTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    sessionId: string;
}

export type LoginResult =
    | ({ mfaRequired?: false; geofence: Geofence } & LoginTokens & Me)
    | { mfaRequired: true; mfaToken: string };

export type DayStatus = 'Present' | 'Half-Day' | 'Absent' | 'Leave' | 'Holiday' | 'Week-Off' | 'Upcoming' | 'Not Marked' | 'N/A';

export interface DayCell {
    date: string;
    status: DayStatus;
    check_in: string | null;
    check_out: string | null;
    total_hours: number | null;
    late_minutes: number;
    source?: string;
    holiday?: string;
    computed: boolean;
}

export interface MonthSummary {
    present: number; halfDay: number; absent: number; leave: number; holidays: number; weekOffs: number;
    lateCount: number; totalHours: number; workingDays: number; payableDays: number;
}

export interface LeaveBalance {
    leaveTypeId: number; leaveType: string; isPaid: boolean; total: number; used: number; pending: number; remaining: number;
}

export interface ShiftBrief { name: string; start: string; end: string }

export interface Workspace {
    serverNow: string;
    todayKey: string;
    employee: { id: number; name: string; code: string; designation: string; department: string | null; joined: string; employmentType: string; manager: string | null };
    punch: { isIn: boolean; since: string | null };
    today: DayCell | null;
    todayEvents: { id: number; type: 'IN' | 'OUT'; at: string; source: string }[];
    todayShift: ShiftBrief;
    policy: { requireGeo: boolean; workStart: string; workEnd: string; graceMinutes: number };
    month: { key: string; summary: MonthSummary };
    leaveBalances: LeaveBalance[];
    pending: { leave: number; regularizations: number };
    upcomingShifts: (ShiftBrief & { date: string })[];
    upcomingHolidays: { date: string; name: string; type: string }[];
    team: { reports: number; pendingLeave: number; pendingRegularizations: number } | null;
}

export interface PunchResult { type: 'IN' | 'OUT'; at: string; status: string | null; lateMinutes: number }

export interface Regularization {
    id: number; date: string; status: 'Pending' | 'Approved' | 'Rejected'; reason: string;
    requestedIn: string | null; requestedOut: string | null; requestedStatus: string | null; reviewNote: string | null;
}

export interface MyAttendance {
    month: string;
    days: DayCell[];
    summary: MonthSummary;
    policy: { regularizationWindowDays: number; workStart: string };
    regularizations: Regularization[];
}

export interface LeaveRequestRow {
    id: number; type: string; from: string; to: string; days: number; isHalfDay: boolean;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'; reason: string | null; reviewNote: string | null; createdAt: string;
}

export interface MyLeave {
    year: number;
    balances: LeaveBalance[];
    types: { id: number; name: string; isPaid: boolean }[];
    requests: LeaveRequestRow[];
}

export interface RosterDay {
    date: string; weekday: number; shift: ShiftBrief | null; holiday: string | null; onLeave: boolean; weekOff: boolean;
}

export interface MyProfile {
    code: string; name: string; designation: string; department: string | null; employmentType: string; joined: string;
    manager: string | null; username: string; role: string; phone: string | null; email: string | null; gender: string | null;
    bloodGroup: string | null; address: string | null; dateOfBirth: string | null;
    emergencyContactName: string | null; emergencyContactPhone: string | null;
}

export interface TeamApprovals {
    leave: { id: number; employee: string; code: string; type: string; from: string; to: string; days: number; reason: string | null }[];
    regularizations: {
        id: number; employee: string; code: string; date: string; reason: string;
        requestedIn: string | null; requestedOut: string | null; requestedStatus: string | null;
    }[];
}

// ── HR ──
export interface HrDashboard {
    totalStrength: number;
    roleBreakdown: { role: string; count: number }[];
    departmentBreakdown: { department: string; count: number }[];
    staffList: { id: number; name: string; role: string; code: string; phone: string | null; email: string | null }[];
    today: { date: string; present: number; halfDay: number; onLeave: number; late: number; notPunched: number; isOffDay: boolean; holiday: string | null };
    pendingLeave: number;
    pendingRegularizations: number;
    usersWithoutProfile: number;
}

export interface EmployeeRow {
    id: number; employee_code: string; name: string; designation: string; phone: string | null; email: string | null;
    employment_type: string; is_active: boolean; salary_basic?: number; department_id: string | null;
    user: { role: string; username: string } | null;
}

export interface EmployeeDetail extends EmployeeRow {
    date_of_joining: string; date_of_exit: string | null; exit_reason: string | null; gender: string | null;
    date_of_birth: string | null; blood_group: string | null; address: string | null;
    emergency_contact_name: string | null; emergency_contact_phone: string | null; reporting_manager_id: number | null;
    reporting_manager: { id: number; name: string; employee_code: string } | null;
    attendances: { id: number; date: string; status: string; check_in: string | null; check_out: string | null; total_hours: number | null }[];
    leave_requests: { id: number; from_date: string; to_date: string; days: number; status: string; leave_type: { name: string } }[];
}

export interface DailyRow {
    employee: { id: number; name: string; employee_code: string; designation: string };
    attendance: { status: string; check_in: string | null; check_out: string | null; total_hours: number | null; late_minutes: number; source: string } | null;
    onApprovedLeave: boolean;
}

export interface MonthlySheet {
    month: string;
    dates: string[];
    holidays: Record<string, string>;
    rows: {
        employee: { id: number; name: string; employee_code: string; designation: string };
        days: { date: string; status: DayStatus; late: boolean; hours: number | null }[];
        summary: MonthSummary;
    }[];
}

export interface HrRegularization {
    id: number; date: string; status: 'Pending' | 'Approved' | 'Rejected'; reason: string;
    requested_in: string | null; requested_out: string | null; requested_status: string | null; review_note: string | null;
    employee: { name: string; employee_code: string; designation: string };
}

export interface HrLeaveRequest {
    id: number; from_date: string; to_date: string; days: number; is_half_day: boolean; reason: string | null;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'; review_note: string | null;
    employee: { name: string; employee_code: string; designation: string };
    leave_type: { name: string };
}

export interface LeaveType { id: number; name: string; days_per_year: number; is_paid: boolean; carry_forward: boolean; is_active: boolean }
export interface Holiday { id: number; date: string; name: string; type: 'PUBLIC' | 'OPTIONAL' }

export interface HrPolicy {
    workStart: string; workEnd: string; graceMinutes: number; fullDayHours: number; halfDayHours: number;
    weeklyOffDays: number[]; requireGeo: boolean; geofence: { lat: number; lng: number; radiusM: number } | null;
    regularizationWindowDays: number; leaveBackdateDays: number;
}

export interface ShiftPattern { id: number; name: string; start_time: string; end_time: string }
export interface ShiftAssignment {
    id: number; date: string; employee_id: number;
    employee: { name: string; employee_code: string; designation: string };
    shift_pattern: ShiftPattern;
}

export interface DeviceSession {
    id: string; user: string; username: string; role: string; deviceName: string | null; platform: string | null;
    appVersion: string | null; loginAt: string; lastUsedAt: string;
    loginLocation: { lat: number; lng: number; accuracyM: number | null } | null;
}
