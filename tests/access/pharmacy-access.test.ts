import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getMode = vi.fn();
const getEnt = vi.fn();
vi.mock('@/app/lib/session', () => ({ getSession: () => getSession(), getPatientSession: vi.fn(), getDevPortalSession: vi.fn() }));
vi.mock('@/backend/db', () => ({
    prisma: { accessShadowLog: { create: vi.fn().mockResolvedValue({}) }, employee: { findFirst: vi.fn() } },
    getTenantPrisma: () => ({}),
}));
vi.mock('@/app/lib/feature-flags', () => ({ getAccessEngineMode: () => getMode(), getCompanyIdForOrg: async () => 'c1' }));
vi.mock('@/app/lib/access/entitlements', () => ({ getEntitlements: () => getEnt() }));
vi.mock('@/app/lib/access/scope-db', () => ({ reportIds: vi.fn() }));

import {
    denyUnlessPharmacyRole, PHARMACY_CATALOG_ROLES, PHARMACY_OPERATE_ROLES, PHARMACY_PO_APPROVE_ROLES, PHARMACY_RETURN_ROLES,
} from '@/app/lib/pharmacy-access';
import { resolveEntitlements } from '@/app/lib/access/resolve';
import { MODULES } from '@/app/lib/modules/registry';

const sess = (role: string) => ({ id: 'u1', username: 'x', role, name: 'X', specialty: null, organization_id: 'unitA', organization_slug: 'a', organization_name: 'A' });
const entWith = (...keys: string[]) => resolveEntitlements({
    userId: 'u1', userActive: true, companyId: 'c1', unitId: 'unitA', version: '1.1',
    entitledModules: new Set(MODULES.map((m) => m.key)), disabledModules: new Set(), employeeId: null, departmentId: null, overrides: [],
    roles: [{ templateKey: 'x', isActive: true, permissions: keys.map((key) => ({ key, scope: 'UNIT' as const })) }],
});

const NOT_SIGNED_IN = 'Not signed in as staff. Please log in.';
const denied = (role: string) => `Access denied — your role (${role}) cannot perform this pharmacy action.`;

beforeEach(() => { vi.clearAllMocks(); getMode.mockResolvedValue('legacy'); getEnt.mockResolvedValue(entWith()); });

describe('denyUnlessPharmacyRole — legacy mode behaves exactly as before', () => {
    it('no session → the original "not signed in" message', async () => {
        getSession.mockResolvedValue(null);
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toEqual({ success: false, error: NOT_SIGNED_IN });
    });
    it('a session without a unit → "not signed in"', async () => {
        getSession.mockResolvedValue({ ...sess('pharmacist'), organization_id: '' });
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toEqual({ success: false, error: NOT_SIGNED_IN });
    });
    it('disallowed role → the original message naming the role', async () => {
        getSession.mockResolvedValue(sess('nurse'));
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toEqual({ success: false, error: denied('nurse') });
    });
    it('allowed role → null', async () => {
        getSession.mockResolvedValue(sess('pharmacist'));
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toBeNull();
    });
    it('nurse may file returns and read the catalogue, not approve a PO', async () => {
        getSession.mockResolvedValue(sess('nurse'));
        expect(await denyUnlessPharmacyRole(PHARMACY_RETURN_ROLES)).toBeNull();
        expect(await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES)).toBeNull();
        expect(await denyUnlessPharmacyRole(PHARMACY_PO_APPROVE_ROLES)).toEqual({ success: false, error: denied('nurse') });
    });
    it('an inline role list with an explicit permission behaves identically', async () => {
        getSession.mockResolvedValue(sess('ipd_manager'));
        expect(await denyUnlessPharmacyRole(['admin', 'pharmacist', 'nurse', 'ipd_manager'], 'pharmacy.indent.cancel')).toBeNull();
        getSession.mockResolvedValue(sess('doctor'));
        expect(await denyUnlessPharmacyRole(['admin', 'pharmacist', 'nurse', 'ipd_manager'], 'pharmacy.indent.cancel')).toEqual({ success: false, error: denied('doctor') });
    });
    it('an unmapped inline list still works through the legacy check alone', async () => {
        getSession.mockResolvedValue(sess('doctor'));
        expect(await denyUnlessPharmacyRole(['admin'])).toEqual({ success: false, error: denied('doctor') });
    });
    it('never consults the new engine', async () => {
        getSession.mockResolvedValue(sess('pharmacist'));
        await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
        expect(getEnt).not.toHaveBeenCalled();
    });
});

describe('denyUnlessPharmacyRole — shadow mode still answers with the role list', () => {
    beforeEach(() => getMode.mockResolvedValue('shadow'));
    it('allows a pharmacist even though the (empty) new engine would deny', async () => {
        getSession.mockResolvedValue(sess('pharmacist'));
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toBeNull();
        expect(getEnt).toHaveBeenCalled();
    });
    it('still denies a nurse even though the new engine would allow', async () => {
        getSession.mockResolvedValue(sess('nurse'));
        getEnt.mockResolvedValue(entWith('pharmacy.create'));
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toEqual({ success: false, error: denied('nurse') });
    });
});

describe('denyUnlessPharmacyRole — enforce mode', () => {
    beforeEach(() => getMode.mockResolvedValue('enforce'));
    it('the new engine allows → null', async () => {
        getSession.mockResolvedValue(sess('nurse'));
        getEnt.mockResolvedValue(entWith('pharmacy.create'));
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toBeNull();
    });
    it('the new engine denies → the standard denial message', async () => {
        getSession.mockResolvedValue(sess('pharmacist'));
        getEnt.mockResolvedValue(entWith('pharmacy.view'));
        expect(await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES)).toEqual({ success: false, error: denied('pharmacist') });
    });
});
