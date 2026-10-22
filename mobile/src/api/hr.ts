import { api, request } from './client';
import type {
    DailyRow, DeviceSession, EmployeeDetail, EmployeeRow, Holiday, HrDashboard, HrLeaveRequest, HrPolicy, HrRegularization,
    LeaveType, LoginResult, Me, MonthlySheet, MyAttendance, MyLeave, MyProfile, PunchResult, RosterDay, ShiftAssignment,
    ShiftPattern, TeamApprovals, Workspace,
} from './types';

export interface DeviceInfo { deviceId: string; deviceName?: string | null; platform?: 'android' | 'ios' | null; appVersion?: string | null }
export interface Fix { lat: number; lng: number; accuracy?: number | null }

// ── auth ──
export const authApi = {
    login: (body: { username: string; password: string; device: DeviceInfo; location?: Fix | null }) =>
        request<LoginResult>('POST', '/auth/login', { body, auth: false }),
    mfa: (body: { mfaToken: string; code: string }) =>
        request<LoginResult>('POST', '/auth/mfa', { body, auth: false }),
    me: () => api.get<Me>('/auth/me'),
    logout: () => api.post<{ signedOut: boolean }>('/auth/logout'),
};

// ── employee ──
export const meApi = {
    workspace: () => api.get<Workspace>('/hr/me/workspace'),
    punch: (b: { type: 'IN' | 'OUT'; lat: number; lng: number; accuracy?: number | null; mocked?: boolean }) =>
        api.post<PunchResult>('/hr/me/punch', b),
    attendance: (month: string) => api.get<MyAttendance>('/hr/me/attendance', { month }),
    requestFix: (b: { date: string; inTime?: string; outTime?: string; status?: 'Present' | 'Half-Day'; reason: string }) =>
        api.post<{ id: number }>('/hr/me/regularizations', b),
    cancelFix: (id: number) => api.del<null>(`/hr/me/regularizations/${id}`),
    leave: (year?: number) => api.get<MyLeave>('/hr/me/leave', { year }),
    applyLeave: (b: { leaveTypeId: number; fromDate: string; toDate: string; reason?: string; isHalfDay?: boolean }) =>
        api.post<{ id: number; days: number }>('/hr/me/leave', b),
    cancelLeave: (id: number) => api.del<null>(`/hr/me/leave/${id}`),
    roster: (from?: string, days = 14) => api.get<RosterDay[]>('/hr/me/roster', { from, days }),
    profile: () => api.get<MyProfile>('/hr/me/profile'),
    updateProfile: (b: Partial<{ phone: string; email: string; address: string; bloodGroup: string; gender: string; dateOfBirth: string; emergencyContactName: string; emergencyContactPhone: string }>) =>
        api.patch<null>('/hr/me/profile', b),
};

// ── manager ──
export const teamApi = {
    approvals: () => api.get<TeamApprovals>('/hr/team/approvals'),
    reviewLeave: (id: number, decision: 'Approved' | 'Rejected', note?: string) => api.post<null>(`/hr/leave/${id}/review`, { decision, note }),
    reviewFix: (id: number, decision: 'Approved' | 'Rejected', note?: string) => api.post<null>(`/hr/regularizations/${id}/review`, { decision, note }),
};

// ── HR ──
export const hrApi = {
    dashboard: () => api.get<HrDashboard>('/hr/dashboard'),
    employees: (q: { search?: string; page?: number; limit?: number; isActive?: boolean }) => api.get<EmployeeRow[]>('/hr/employees', q),
    employee: (id: number) => api.get<EmployeeDetail>(`/hr/employees/${id}`),
    updateEmployee: (id: number, b: Record<string, unknown>) => api.patch<null>(`/hr/employees/${id}`, b),
    createEmployee: (b: Record<string, unknown>) => api.post<unknown>('/hr/employees', b),
    daily: (date: string) => api.get<DailyRow[]>('/hr/attendance/daily', { date }),
    markDay: (b: { employeeId: number; date: string; checkIn?: string; checkOut?: string; status: string }) => api.post<null>('/hr/attendance/daily', b),
    monthly: (month: string, search?: string) => api.get<MonthlySheet>('/hr/attendance/monthly', { month, search }),
    regularizations: (filter: 'pending' | 'approved' | 'rejected' | 'all') => api.get<HrRegularization[]>('/hr/regularizations', { filter }),
    leaveRequests: (filter: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all') => api.get<HrLeaveRequest[]>('/hr/leave/requests', { filter }),
    cancelLeave: (id: number) => api.post<null>(`/hr/leave/${id}/cancel`),
    fileLeave: (b: { employeeId: number; leaveTypeId: number; fromDate: string; toDate: string; reason?: string; isHalfDay?: boolean }) => api.post<null>('/hr/leave', b),
    leaveTypes: () => api.get<LeaveType[]>('/hr/leave-types'),
    saveLeaveType: (b: { id?: number; name: string; daysPerYear: number; isPaid?: boolean; carryForward?: boolean; isActive?: boolean }) => api.post<null>('/hr/leave-types', b),
    holidays: (year: number) => api.get<Holiday[]>('/hr/holidays', { year }),
    addHoliday: (b: { date: string; name: string; type?: 'PUBLIC' | 'OPTIONAL' }) => api.post<null>('/hr/holidays', b),
    deleteHoliday: (id: number) => api.del<null>(`/hr/holidays/${id}`),
    policy: () => api.get<HrPolicy>('/hr/policy'),
    updatePolicy: (b: Partial<HrPolicy>) => api.patch<HrPolicy>('/hr/policy', b),
    shifts: () => api.get<ShiftPattern[]>('/hr/shifts'),
    createShift: (b: { name: string; startTime: string; endTime: string }) => api.post<null>('/hr/shifts', b),
    roster: (date: string) => api.get<ShiftAssignment[]>('/hr/roster', { date }),
    assignShift: (b: { employeeId: number; shiftPatternId: number; startDate: string; endDate: string }) => api.post<null>('/hr/roster', b),
    removeShift: (id: number) => api.del<null>(`/hr/roster/${id}`),
    devices: () => api.get<DeviceSession[]>('/hr/devices'),
    revokeDevice: (id: string) => api.post<{ revoked: boolean }>(`/hr/devices/${id}/revoke`),
};
