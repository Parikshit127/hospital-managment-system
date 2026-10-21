/**
 * Proves the Phase 3 permission catalogue reproduces TODAY's access rules for the modules already migrated
 * (docs/COMPANY_OS_PLAN.md §0 rule 6 — parity before anything is enforced).
 *
 * "Holders" of a permission = system roles that would hold it once the Phase 2 backfill has run: the role
 * template is the UNION of the three legacy maps, a legacy-tied key is held by whoever holds its legacy key, and a
 * seeded key is held by its registry `defaultRoles`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/session', () => ({ getSession: vi.fn() }));

import { SYSTEM_ROLES } from '@/app/lib/access/system-roles';
import { MODULES } from '@/app/lib/modules/registry';
import { getPermissionDef, legacyKeyOf } from '@/app/lib/access/permissions';
import { roleMayOpenWith } from '@/app/lib/access/legacy-pages';
import { generateProxyRolePermissions, generateSessionRolePermissions } from '@/app/lib/access/legacy-maps';
import {
    PHARMACY_CATALOG_ROLES, PHARMACY_OPERATE_ROLES, PHARMACY_PROCUREMENT_ROLES, PHARMACY_PO_APPROVE_ROLES, PHARMACY_RETURN_ROLES,
} from '@/app/lib/pharmacy-access';

const unionPerms = (slug: string) => {
    const r = SYSTEM_ROLES.find((x) => x.slug === slug)!;
    return new Set([...(r.legacyPermissions.session ?? []), ...(r.legacyPermissions.roleActions ?? []), ...(r.legacyPermissions.proxy ?? [])]);
};
const holders = (key: string): string[] => {
    const def = getPermissionDef(key)!;
    expect(def, `permission ${key} must be in the registry`).toBeTruthy();
    const roles = SYSTEM_ROLES.map((r) => r.slug).filter((slug) =>
        def.legacyKey ? unionPerms(slug).has(def.legacyKey) : (def.defaultRoles ?? []).includes(slug));
    return roles.sort();
};
const sorted = (a: readonly string[]) => [...a].sort();

describe('catalogue integrity', () => {
    it('every permission key is module.resource.action and belongs to its own module', () => {
        for (const m of MODULES) for (const p of m.permissions ?? []) {
            expect(p.key).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
            expect(p.key.startsWith(m.key + '.')).toBe(true);
        }
    });
    it('keys are unique across the registry', () => {
        const all = MODULES.flatMap((m) => (m.permissions ?? []).map((p) => p.key));
        expect(new Set(all).size).toBe(all.length);
    });
    it('a legacyKey must be a legacy permission that module (or another) really declares', () => {
        const legacy = new Set(MODULES.flatMap((m) => m.legacyPermissions));
        for (const m of MODULES) for (const p of m.permissions ?? []) if (p.legacyKey) expect(legacy.has(p.legacyKey)).toBe(true);
    });
    it('a permission has either a legacyKey or defaultRoles, never both, and defaultRoles are real roles', () => {
        const slugs = new Set(SYSTEM_ROLES.map((r) => r.slug));
        for (const m of MODULES) for (const p of m.permissions ?? []) {
            if (m.alwaysOn) continue; // My Workspace is implicit
            expect(!!p.legacyKey !== !!p.defaultRoles?.length).toBe(true);
            for (const r of p.defaultRoles ?? []) expect(slugs.has(r)).toBe(true);
        }
    });
});

describe('pharmacy: each tier of pharmacy-access.ts equals its permission', () => {
    // These are the hand-written role lists the permissions replace. If someone edits a list without the
    // registry (or vice versa) this fails.
    it.each([
        ['pharmacy.catalog.view', PHARMACY_CATALOG_ROLES],
        ['pharmacy.dispense.execute', PHARMACY_OPERATE_ROLES],
        ['pharmacy.purchase.create', PHARMACY_PROCUREMENT_ROLES],
        ['pharmacy.purchase.approve', PHARMACY_PO_APPROVE_ROLES],
        ['pharmacy.return.create', PHARMACY_RETURN_ROLES],
        ['pharmacy.indent.cancel', ['admin', 'pharmacist', 'nurse', 'ipd_manager'] as const],
    ])('%s', (key, legacyList) => {
        expect(holders(key)).toEqual(sorted(legacyList));
    });
});

describe('hr: requireHr(action) == hasPermission(`hr.${action}`) (admin always passes)', () => {
    const session = generateSessionRolePermissions();
    const legacyHolders = (action: string) =>
        sorted(SYSTEM_ROLES.map((r) => r.slug).filter((slug) => slug === 'admin' || (session[slug] ?? []).includes(`hr.${action}`)));
    it.each([['view'], ['create'], ['edit'], ['approve'], ['export']])('hr.%s', (action) => {
        const keys = MODULES.find((m) => m.key === 'hr')!.permissions!.filter((p) => p.legacyKey === `hr.${action}`);
        expect(keys.length).toBeGreaterThan(0);
        for (const p of keys) expect(holders(p.key)).toEqual(legacyHolders(action));
    });
});

describe('finance ledger layer', () => {
    const slugs = SYSTEM_ROLES.map((r) => r.slug);
    const door = sorted(slugs.filter((s) => roleMayOpenWith(s, generateProxyRolePermissions()[s] ?? [], '/finance')));

    it('finance.ledger.view == who can open /finance today (what the guarded layer enforces now)', () => {
        expect(holders('finance.ledger.view')).toEqual(door);
    });

    // DOCUMENTED differences: writes are stricter than the page door on purpose. Anyone listed here can use the
    // finance WRITE actions today (because the door lets them in) but would not under the new keys. Shadow mode
    // surfaces them in access_shadow_logs; changing this list is a deliberate decision, not an accident.
    it('lists exactly who loses write access under the stricter keys', () => {
        const losers = (key: string) => door.filter((r) => !holders(key).includes(r));
        expect(losers('finance.ledger.create')).toEqual(['doctor', 'ipd_manager', 'opd_manager']);
        expect(losers('finance.ledger.edit')).toEqual(['doctor', 'ipd_manager', 'opd_manager', 'receptionist']);
        expect(losers('finance.tally.export')).toEqual(['doctor', 'ipd_manager', 'opd_manager', 'receptionist']);
    });
    it('nobody gains access the door did not already give', () => {
        for (const key of ['finance.ledger.create', 'finance.ledger.edit', 'finance.tally.export']) {
            expect(holders(key).filter((r) => !door.includes(r))).toEqual([]);
        }
    });
});

describe('admin access permissions: only the admin role holds them today', () => {
    it.each(['admin.access.view', 'admin.access.assign', 'admin.user.create', 'admin.user.offboard', 'admin.role.view', 'admin.role.edit'])('%s', (key) => {
        expect(holders(key)).toEqual(['admin']);
    });
});

describe('legacyKeyOf', () => {
    it('resolves catalogue keys', () => {
        expect(legacyKeyOf('hr.leave.approve')).toBe('hr.approve');
        expect(legacyKeyOf('pharmacy.return.create')).toBeUndefined();
        expect(legacyKeyOf('hr.view')).toBeUndefined(); // a legacy key is not itself a catalogue key
    });
});
