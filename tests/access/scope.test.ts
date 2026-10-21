import { describe, expect, it } from 'vitest';
import { scopeWhere, type ScopeContext } from '@/app/lib/access/scope';

const ctx: ScopeContext = { unitId: 'unitA', companyId: 'c1', employeeId: 7, departmentId: 'dep9' };

describe('scopeWhere', () => {
    it('OWN filters to my employee id', () => {
        expect(scopeWhere(ctx, 'OWN', 'LeaveRequest')).toEqual({ employee_id: 7 });
    });
    it('TEAM filters to me + my reports', () => {
        expect(scopeWhere({ ...ctx, teamEmployeeIds: [7, 8, 9] }, 'TEAM', 'Attendance')).toEqual({ employee_id: { in: [7, 8, 9] } });
    });
    it('TEAM without a loaded team falls back to just me', () => {
        expect(scopeWhere(ctx, 'TEAM', 'Attendance')).toEqual({ employee_id: { in: [7] } });
    });
    it('UNIT filters to the active unit', () => {
        expect(scopeWhere(ctx, 'UNIT', 'LeaveRequest')).toEqual({ organizationId: 'unitA' });
    });
    it('COMPANY filters by company where the model declares it, else no extra filter', () => {
        expect(scopeWhere(ctx, 'COMPANY', 'Employee')).toEqual({ company_id: 'c1' });
        expect(scopeWhere(ctx, 'COMPANY', 'LeaveRequest')).toEqual({});
    });
    it('OWN/TEAM fail CLOSED (match nothing) when the caller has no employee', () => {
        const noEmp = { ...ctx, employeeId: null };
        expect(scopeWhere(noEmp, 'OWN', 'LeaveRequest')).toEqual({ employee_id: -1 });
        expect(scopeWhere(noEmp, 'TEAM', 'LeaveRequest')).toEqual({ employee_id: { in: [-1] } });
    });
    it('a model that declares no owner column cannot be OWN/TEAM/DEPARTMENT scoped', () => {
        expect(() => scopeWhere(ctx, 'OWN', 'pharmacy_orders')).toThrow(/employeeField/);
        expect(() => scopeWhere(ctx, 'TEAM', 'pharmacy_orders')).toThrow();
        expect(() => scopeWhere(ctx, 'DEPARTMENT', 'LeaveRequest')).toThrow(/departmentField/);
    });
    it('UNIT on an undeclared model defaults to organizationId', () => {
        expect(scopeWhere(ctx, 'UNIT', 'pharmacy_orders')).toEqual({ organizationId: 'unitA' });
    });
});
