import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── mocks (declared before importing the module under test) ──
const getSession = vi.fn();
const shadowCreate = vi.fn().mockResolvedValue({});
const getMode = vi.fn();
const getCompany = vi.fn();
const getEnt = vi.fn();

vi.mock('@/app/lib/session', () => ({ getSession: () => getSession(), getPatientSession: vi.fn(), getDevPortalSession: vi.fn() }));
vi.mock('@/backend/db', () => ({
    prisma: { accessShadowLog: { create: (a: unknown) => shadowCreate(a) }, employee: { findFirst: vi.fn() } },
    getTenantPrisma: (org: string) => ({ __tenant: org }),
}));
vi.mock('@/app/lib/feature-flags', () => ({ getAccessEngineMode: (...a: unknown[]) => getMode(...a), getCompanyIdForOrg: (...a: unknown[]) => getCompany(...a) }));
vi.mock('@/app/lib/access/entitlements', () => ({ getEntitlements: (...a: unknown[]) => getEnt(...a) }));
vi.mock('@/app/lib/access/scope-db', () => ({ reportIds: vi.fn().mockResolvedValue([7, 8]) }));

import { requireAccess } from '@/app/lib/access/require-access';
import { AuthError, ForbiddenError } from '@/backend/tenant';
import { resolveEntitlements } from '@/app/lib/access/resolve';
import { MODULES } from '@/app/lib/modules/registry';

const ALL = new Set(MODULES.map((m) => m.key));
const session = { id: 'u1', username: 'x', role: 'hr', name: 'X', specialty: null, organization_id: 'unitA', organization_slug: 'a', organization_name: 'A' };

function ent(perms: [string, any][] = [['hr.view', 'UNIT']], over: Partial<Parameters<typeof resolveEntitlements>[0]> = {}) {
    return resolveEntitlements({
        userId: 'u1', userActive: true, companyId: 'c1', unitId: 'unitA', version: '1.1',
        entitledModules: ALL, disabledModules: new Set(), employeeId: 7, departmentId: 'd1', overrides: [],
        roles: [{ templateKey: 'hr', isActive: true, permissions: perms.map(([key, scope]) => ({ key, scope })) }],
        ...over,
    });
}
const legacyAllow = vi.fn().mockResolvedValue(undefined);
const legacyDeny = vi.fn().mockRejectedValue(new ForbiddenError('legacy says no'));

beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(session);
    getCompany.mockResolvedValue('c1');
    getMode.mockResolvedValue('legacy');
    getEnt.mockResolvedValue(ent());
    legacyAllow.mockResolvedValue(undefined);
    legacyDeny.mockRejectedValue(new ForbiddenError('legacy says no'));
});

describe('requireAccess — authentication (all modes)', () => {
    for (const mode of ['legacy', 'shadow', 'enforce']) {
        it(`${mode}: no staff session → AuthError`, async () => {
            getMode.mockResolvedValue(mode);
            getSession.mockResolvedValue(null);
            await expect(requireAccess('hr.employee.view', { legacy: legacyAllow })).rejects.toBeInstanceOf(AuthError);
            expect(legacyAllow).not.toHaveBeenCalled();
        });
    }
});

describe('requireAccess — legacy mode is exactly the old behaviour', () => {
    it('allows when the old check allows, WITHOUT touching the new engine', async () => {
        const ctx = await requireAccess('hr.employee.view', { legacy: legacyAllow });
        expect(ctx.organizationId).toBe('unitA');
        expect(ctx.mode).toBe('legacy');
        expect(ctx.ent).toBeNull();
        expect(ctx.where('LeaveRequest')).toEqual({}); // no extra filtering
        expect(getEnt).not.toHaveBeenCalled();
        expect(shadowCreate).not.toHaveBeenCalled();
    });
    it('denies with the OLD error when the old check denies', async () => {
        await expect(requireAccess('hr.employee.view', { legacy: legacyDeny })).rejects.toThrow('legacy says no');
        expect(getEnt).not.toHaveBeenCalled();
    });
    it('even if the new engine would disagree, legacy mode ignores it', async () => {
        getEnt.mockResolvedValue(ent([]));
        await expect(requireAccess('hr.employee.view', { legacy: legacyAllow })).resolves.toBeTruthy();
    });
    it('with no legacy check supplied, any staff session passes', async () => {
        await expect(requireAccess('hr.employee.view')).resolves.toBeTruthy();
    });
});

describe('requireAccess — shadow mode never changes a decision', () => {
    beforeEach(() => getMode.mockResolvedValue('shadow'));

    it('old allows + new allows → allowed, nothing logged', async () => {
        await requireAccess('hr.employee.view', { legacy: legacyAllow });
        expect(shadowCreate).not.toHaveBeenCalled();
    });
    it('old allows + new denies → STILL allowed, disagreement logged', async () => {
        getEnt.mockResolvedValue(ent([]));
        const ctx = await requireAccess('hr.employee.view', { legacy: legacyAllow, target: 'getEmployees' });
        expect(ctx.organizationId).toBe('unitA');
        expect(ctx.where('LeaveRequest')).toEqual({}); // never narrows in shadow
        expect(shadowCreate).toHaveBeenCalledTimes(1);
        expect(shadowCreate.mock.calls[0][0].data).toMatchObject({ company_id: 'c1', user_id: 'u1', permission: 'hr.employee.view', target: 'getEmployees', legacy: true, next: false });
    });
    it('old denies + new allows → STILL denied (with the old error), disagreement logged', async () => {
        await expect(requireAccess('hr.employee.view', { legacy: legacyDeny })).rejects.toThrow('legacy says no');
        expect(shadowCreate.mock.calls[0][0].data).toMatchObject({ legacy: false, next: true });
    });
    it('old denies + new denies → denied, nothing logged', async () => {
        getEnt.mockResolvedValue(ent([]));
        await expect(requireAccess('hr.employee.view', { legacy: legacyDeny })).rejects.toThrow('legacy says no');
        expect(shadowCreate).not.toHaveBeenCalled();
    });
    it('an engine failure is invisible to the user', async () => {
        getEnt.mockRejectedValue(new Error('db down'));
        await expect(requireAccess('hr.employee.view', { legacy: legacyAllow })).resolves.toBeTruthy();
        await expect(requireAccess('hr.employee.view', { legacy: legacyDeny })).rejects.toThrow('legacy says no');
    });
    it('a failing shadow-log write is invisible too', async () => {
        getEnt.mockResolvedValue(ent([]));
        shadowCreate.mockRejectedValueOnce(new Error('table missing'));
        await expect(requireAccess('hr.leave.approve', { legacy: legacyAllow })).resolves.toBeTruthy();
    });
    it('does not log when the unit has no company yet (nothing to attribute it to)', async () => {
        getCompany.mockResolvedValue(null);
        getEnt.mockResolvedValue({ ...ent([]), companyId: null });
        await requireAccess('hr.attendance.view', { legacy: legacyAllow });
        expect(shadowCreate).not.toHaveBeenCalled();
    });
});

describe('requireAccess — enforce mode: the new engine decides', () => {
    beforeEach(() => getMode.mockResolvedValue('enforce'));

    it('allowed when held, returns the held scope and a scope-aware where()', async () => {
        getEnt.mockResolvedValue(ent([['hr.view', 'OWN']]));
        const ctx = await requireAccess('hr.leave.view', { legacy: legacyDeny });
        expect(ctx.scope).toBe('OWN');
        expect(ctx.where('LeaveRequest')).toEqual({ employee_id: 7 });
        expect(legacyDeny).toHaveBeenCalled(); // evaluated, but it does not decide
    });
    it('TEAM scope loads the reporting line', async () => {
        getEnt.mockResolvedValue(ent([['hr.view', 'TEAM']]));
        const ctx = await requireAccess('hr.leave.view');
        expect(ctx.where('LeaveRequest')).toEqual({ employee_id: { in: [7, 8] } });
    });
    it('denied when not held — even though the old check would allow', async () => {
        getEnt.mockResolvedValue(ent([['hr.view', 'UNIT']]));
        await expect(requireAccess('hr.leave.approve', { legacy: legacyAllow })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it('UNPROVISIONED user falls back to the old check (never locked out)', async () => {
        getEnt.mockResolvedValue(ent([], { roles: [] }));
        await expect(requireAccess('hr.leave.view', { legacy: legacyAllow })).resolves.toBeTruthy();
        await expect(requireAccess('hr.leave.view', { legacy: legacyDeny })).rejects.toThrow('legacy says no');
    });
    it('unprovisioned with no legacy check → denied', async () => {
        getEnt.mockResolvedValue(ent([], { roles: [] }));
        await expect(requireAccess('hr.leave.view')).rejects.toBeInstanceOf(ForbiddenError);
    });
    it('engine failure FAILS CLOSED — even when the old check would have allowed', async () => {
        getEnt.mockRejectedValue(new Error('db down'));
        await expect(requireAccess('hr.leave.view', { legacy: legacyAllow })).rejects.toBeInstanceOf(ForbiddenError);
        await expect(requireAccess('hr.leave.view')).rejects.toBeInstanceOf(ForbiddenError);
    });
});
