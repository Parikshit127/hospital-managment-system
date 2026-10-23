/**
 * The per-employee switch (ACCESS_PROFILES_PLAN.md): a user with an access profile is governed by the new engine
 * even though their unit is still on the default `legacy` flag - and nobody else is affected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getMode = vi.fn();
const getCompany = vi.fn();
const getEnt = vi.fn();
const isManaged = vi.fn();

vi.mock('@/app/lib/session', () => ({ getSession: () => getSession(), getPatientSession: vi.fn(), getDevPortalSession: vi.fn() }));
vi.mock('@/backend/db', () => ({
    prisma: { accessShadowLog: { create: vi.fn() }, employee: { findFirst: vi.fn() } },
    getTenantPrisma: (org: string) => ({ __tenant: org }),
}));
vi.mock('@/app/lib/feature-flags', () => ({ getAccessEngineMode: (...a: unknown[]) => getMode(...a), getCompanyIdForOrg: (...a: unknown[]) => getCompany(...a) }));
vi.mock('@/app/lib/access/entitlements', () => ({ getEntitlements: (...a: unknown[]) => getEnt(...a) }));
vi.mock('@/app/lib/access/scope-db', () => ({ reportIds: vi.fn().mockResolvedValue([]) }));
vi.mock('@/app/lib/access/profile-store', () => ({ isProfileManaged: (...a: unknown[]) => isManaged(...a) }));

import { requireAccess } from '@/app/lib/access/require-access';
import { ForbiddenError } from '@/backend/tenant';
import { resolveEntitlements } from '@/app/lib/access/resolve';
import { MODULES } from '@/app/lib/modules/registry';

const ALL = new Set(MODULES.map((m) => m.key));
const session = { id: 'u1', username: 'x', role: 'receptionist', name: 'X', specialty: null, organization_id: 'unitA', organization_slug: 'a', organization_name: 'A' };
const profileEnt = (perms: Record<string, 'UNIT'>) => resolveEntitlements({
    userId: 'u1', userActive: true, companyId: 'c1', unitId: 'unitA', version: '1.1', entitledModules: ALL, disabledModules: new Set(),
    roles: [], overrides: [], employeeId: 7, departmentId: null, profile: { preset: 'receptionist', modules: ['reception', 'hr'], permissions: perms },
});
const legacyAllow = vi.fn().mockResolvedValue(undefined);
const legacyDeny = vi.fn().mockRejectedValue(new ForbiddenError('legacy says no'));

beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(session);
    getCompany.mockResolvedValue('c1');
    getMode.mockResolvedValue('legacy');
    isManaged.mockResolvedValue(false);
    legacyAllow.mockResolvedValue(undefined);
    legacyDeny.mockRejectedValue(new ForbiddenError('legacy says no'));
});

describe('a user WITHOUT a profile', () => {
    it('is untouched: legacy decides and the engine is never consulted', async () => {
        const ctx = await requireAccess('hr.employee.view', { legacy: legacyAllow });
        expect(ctx.mode).toBe('legacy');
        expect(getEnt).not.toHaveBeenCalled();
        await expect(requireAccess('hr.employee.view', { legacy: legacyDeny })).rejects.toThrow('legacy says no');
    });
});

describe('a user WITH a profile (unit flag still legacy)', () => {
    beforeEach(() => { isManaged.mockResolvedValue(true); });

    it('is governed by the engine: held permission passes even though the old check would deny', async () => {
        getEnt.mockResolvedValue(profileEnt({ 'hr.employee.view': 'UNIT' }));
        const ctx = await requireAccess('hr.employee.view', { legacy: legacyDeny });
        expect(ctx.mode).toBe('enforce');
        expect(getEnt).toHaveBeenCalled();
    });
    it('a permission NOT on the profile is denied even though the old check would allow', async () => {
        getEnt.mockResolvedValue(profileEnt({ 'hr.employee.view': 'UNIT' }));
        await expect(requireAccess('hr.employee.edit', { legacy: legacyAllow })).rejects.toThrow(/hr\.employee\.edit required/);
    });
    it('an engine failure fails closed for a profile user', async () => {
        getEnt.mockRejectedValue(new Error('db down'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(requireAccess('hr.employee.view', { legacy: legacyAllow })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it('the unit flag being shadow does not downgrade a profile user', async () => {
        getMode.mockResolvedValue('shadow');
        getEnt.mockResolvedValue(profileEnt({}));
        await expect(requireAccess('hr.employee.view', { legacy: legacyAllow })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it('does not even look the user up when the unit is already enforcing', async () => {
        getMode.mockResolvedValue('enforce');
        getEnt.mockResolvedValue(profileEnt({ 'hr.employee.view': 'UNIT' }));
        await requireAccess('hr.employee.view', { legacy: legacyAllow });
        expect(isManaged).not.toHaveBeenCalled();
    });
});
