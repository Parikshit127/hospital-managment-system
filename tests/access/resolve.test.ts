import { describe, expect, it } from 'vitest';
import { can, effectiveModules, resolveEntitlements, type ResolveInput } from '@/app/lib/access/resolve';
import { MODULES } from '@/app/lib/modules/registry';

const ALL = new Set(MODULES.map((m) => m.key));

function input(over: Partial<ResolveInput> = {}): ResolveInput {
    return {
        userId: 'u1', userActive: true, companyId: 'c1', unitId: 'unitA', version: '1.1',
        entitledModules: ALL, disabledModules: new Set(), roles: [], overrides: [],
        employeeId: 10, departmentId: 'dep1', ...over,
    };
}
const role = (templateKey: string | null, perms: [string, 'OWN' | 'TEAM' | 'DEPARTMENT' | 'UNIT' | 'COMPANY'][], isActive = true) => ({
    templateKey, isActive, permissions: perms.map(([key, scope]) => ({ key, scope })),
});

describe('effectiveModules', () => {
    it('keeps entitled modules and always keeps My Workspace', () => {
        const m = effectiveModules(new Set(['hr']), new Set());
        expect(m.has('hr')).toBe(true);
        expect(m.has('ess')).toBe(true);
        expect(m.has('pharmacy')).toBe(false);
    });
    it('a unit toggle switches a module off', () => {
        const m = effectiveModules(ALL, new Set(['pharmacy']));
        expect(m.has('pharmacy')).toBe(false);
        expect(m.has('hr')).toBe(true);
    });
    it('removes modules whose dependency is unavailable (transitively)', () => {
        // nurse -> ipd -> reception/billing ; ot -> ipd
        const m = effectiveModules(ALL, new Set(['billing']));
        expect(m.has('billing')).toBe(false);
        expect(m.has('ipd')).toBe(false);
        expect(m.has('nurse')).toBe(false);
        expect(m.has('ot')).toBe(false);
        expect(m.has('hr')).toBe(true);
    });
    it('My Workspace survives everything', () => {
        expect(effectiveModules(new Set(), new Set(['ess'])).has('ess')).toBe(true);
    });
});

describe('resolveEntitlements', () => {
    it('an inactive user has nothing', () => {
        const e = resolveEntitlements(input({ userActive: false, roles: [role('hr', [['hr.view', 'UNIT']])] }));
        expect(e.permissions.size).toBe(0);
        expect(e.modules.size).toBe(0);
        expect(can(e, 'hr.employee.view')).toBeNull();
    });

    it('a new-style key is satisfied through its legacy key', () => {
        const e = resolveEntitlements(input({ roles: [role('hr', [['hr.view', 'UNIT'], ['hr.edit', 'UNIT']])] }));
        expect(can(e, 'hr.employee.view')).toBe('UNIT');
        expect(can(e, 'hr.employee.edit')).toBe('UNIT');
        expect(can(e, 'hr.leave.approve')).toBeNull(); // hr.approve not held
    });

    it('widest scope wins when the same permission comes from two roles', () => {
        const e = resolveEntitlements(input({
            roles: [role('a', [['hr.view', 'OWN']]), role('b', [['hr.view', 'TEAM']]), role('c', [['hr.view', 'DEPARTMENT']])],
        }));
        expect(can(e, 'hr.employee.view')).toBe('DEPARTMENT');
    });

    it('an inactive role contributes nothing', () => {
        const e = resolveEntitlements(input({ roles: [role('hr', [['hr.view', 'UNIT']], false)] }));
        expect(can(e, 'hr.employee.view')).toBeNull();
        expect(e.provisioned).toBe(false);
    });

    it('a GRANT override adds a permission (default scope UNIT)', () => {
        const e = resolveEntitlements(input({
            roles: [role('nurse', [['ipd.view', 'UNIT']])],
            overrides: [{ key: 'pharmacy.return.create', effect: 'GRANT', scope: null }],
        }));
        expect(can(e, 'pharmacy.return.create')).toBe('UNIT');
    });

    it('DENY beats GRANT and beats a role, including for new keys that arrive via a legacy key', () => {
        const e = resolveEntitlements(input({
            roles: [role('hr', [['hr.view', 'COMPANY']])],
            overrides: [{ key: 'hr.employee.view', effect: 'DENY', scope: null }, { key: 'hr.employee.view', effect: 'GRANT', scope: 'COMPANY' }],
        }));
        expect(can(e, 'hr.employee.view')).toBeNull();
        expect(can(e, 'hr.leave.view')).toBe('COMPANY'); // a different new key on the same legacy key is untouched
    });

    it('denying a legacy key also stops the new keys that rely on it', () => {
        const e = resolveEntitlements(input({
            roles: [role('hr', [['hr.view', 'UNIT']])],
            overrides: [{ key: 'hr.view', effect: 'DENY', scope: null }],
        }));
        expect(can(e, 'hr.employee.view')).toBeNull();
        expect(can(e, 'hr.view')).toBeNull();
    });

    it('permissions of a module that is switched off in the unit disappear', () => {
        const e = resolveEntitlements(input({
            disabledModules: new Set(['hr']), roles: [role('hr', [['hr.view', 'UNIT']])],
        }));
        expect(can(e, 'hr.employee.view')).toBeNull();
    });

    it('permissions of a module the company has not bought disappear', () => {
        const e = resolveEntitlements(input({
            entitledModules: new Set(['finance']), roles: [role('hr', [['hr.view', 'UNIT']])],
        }));
        expect(can(e, 'hr.employee.view')).toBeNull();
    });

    it('the admin template holds every catalogue permission without a row per key', () => {
        const e = resolveEntitlements(input({ roles: [role('admin', [])] }));
        expect(can(e, 'pharmacy.return.create')).toBe('UNIT'); // a seeded-only key
        expect(can(e, 'hr.leave.approve')).toBe('UNIT');
        expect(can(e, 'finance.ledger.edit')).toBe('UNIT');
    });

    it('…but admin still loses a module that is not available', () => {
        const e = resolveEntitlements(input({ disabledModules: new Set(['pharmacy']), roles: [role('admin', [])] }));
        expect(can(e, 'pharmacy.dispense.execute')).toBeNull();
        expect(can(e, 'hr.employee.view')).toBe('UNIT');
    });

    it('My Workspace permissions are implicit at OWN scope for any active user', () => {
        const e = resolveEntitlements(input({ entitledModules: new Set(), roles: [] }));
        expect(can(e, 'ess.self.view')).toBe('OWN');
        expect(can(e, 'ess.self.edit')).toBe('OWN');
    });

    it('provisioned only when the company has modules AND the user has an active role', () => {
        expect(resolveEntitlements(input({ roles: [role('hr', [])] })).provisioned).toBe(true);
        expect(resolveEntitlements(input({ roles: [] })).provisioned).toBe(false);
        expect(resolveEntitlements(input({ entitledModules: new Set(), roles: [role('hr', [])] })).provisioned).toBe(false);
        expect(resolveEntitlements(input({ entitledModules: null, roles: [role('hr', [])] })).provisioned).toBe(false);
    });

    it('an unknown permission is simply not held', () => {
        const e = resolveEntitlements(input({ roles: [role('admin', [])] }));
        expect(can(e, 'nonsense.thing.do')).toBeNull();
    });
});
