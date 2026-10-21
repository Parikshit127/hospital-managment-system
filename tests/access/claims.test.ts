import { describe, expect, it } from 'vitest';
import { buildNav, claimsAllowPath, isAccessClaims, moduleForPath } from '@/app/lib/access/claims';
import { LEGACY_NAV_BY_ROLE } from '@/app/lib/access/legacy-nav';

describe('moduleForPath', () => {
    it('longest prefix wins — /opd-manager is NOT swallowed by /opd', () => {
        expect(moduleForPath('/opd-manager/dashboard')?.key).toBe('opd_manager');
        expect(moduleForPath('/opd/display')?.key).toBe('opd');
        expect(moduleForPath('/opd')?.key).toBe('opd');
    });
    it('matches on a path boundary, not a string prefix', () => {
        expect(moduleForPath('/hrx')).toBeUndefined();
        expect(moduleForPath('/hr/employees/3')?.key).toBe('hr');
    });
    it('maps every gated route in ROLE_ROUTES, and the ungated ones too', () => {
        for (const [p, k] of [['/finance/dashboard', 'finance'], ['/discharge', 'ipd'], ['/nurse/tasks', 'nurse'], ['/crm/leads', 'crm'],
            ['/call-center', 'call_center'], ['/me/leave', 'ess'], ['/billing/new', 'billing'], ['/ot/dashboard', 'ot'], ['/er/register', 'er']]) {
            expect(moduleForPath(p)?.key).toBe(k);
        }
    });
    it('realms and public pages belong to no staff module', () => {
        for (const p of ['/login', '/patient/dashboard', '/superadmin', '/investor', '/dev-portal', '/hospital', '/']) expect(moduleForPath(p)).toBeUndefined();
    });
    it('API prefixes are not page prefixes', () => {
        expect(moduleForPath('/api/ipd/x')).toBeUndefined();
    });
});

describe('claimsAllowPath', () => {
    const claims = { mods: ['hr', 'ess'] };
    it('allows held modules and My Workspace, blocks the rest', () => {
        expect(claimsAllowPath(claims, '/hr/dashboard')).toBe(true);
        expect(claimsAllowPath(claims, '/me')).toBe(true);
        expect(claimsAllowPath(claims, '/finance/dashboard')).toBe(false);
        expect(claimsAllowPath(claims, '/crm')).toBe(false); // a previously ungated page is now gated
    });
    it('My Workspace is allowed even if somehow absent from mods', () => {
        expect(claimsAllowPath({ mods: [] }, '/me/attendance')).toBe(true);
    });
    it('ungated paths pass through', () => {
        expect(claimsAllowPath({ mods: [] }, '/login')).toBe(true);
        expect(claimsAllowPath({ mods: [] }, '/patient/records')).toBe(true);
    });
});

describe('buildNav', () => {
    const hrefs = (secs: readonly { items: readonly { href: string }[] }[]) => secs.flatMap((s) => s.items.map((i) => i.href));

    it('a role holding every module it normally sees gets its normal menu back, unchanged', () => {
        const all = [...new Set(Object.values(LEGACY_NAV_BY_ROLE.receptionist).flatMap((s) => s.items.map((i) => moduleForPath(i.href)?.key)).filter(Boolean))] as string[];
        expect(buildNav('receptionist', { mods: all })).toEqual(LEGACY_NAV_BY_ROLE.receptionist);
    });
    it('removes entries for modules the user does not hold', () => {
        const nav = buildNav('receptionist', { mods: ['reception'] });
        expect(hrefs(nav).every((h) => !h.startsWith('/billing') && !h.startsWith('/ipd'))).toBe(true);
        expect(hrefs(nav).some((h) => h.startsWith('/reception'))).toBe(true);
    });
    it('drops a section that ends up empty', () => {
        expect(buildNav('hr', { mods: [] }).length).toBe(0);
    });
    it('adds a launcher entry for a held module the role menu never showed', () => {
        const nav = buildNav('hr', { mods: ['hr', 'finance'] });
        const more = nav.find((s) => s.title === 'More Apps');
        expect(more).toBeTruthy();
        expect(more!.items.some((i) => i.href.startsWith('/finance'))).toBe(true);
    });
    it('never invents an entry for a module nobody has a menu item for', () => {
        const nav = buildNav('hr', { mods: ['hr', 'help_center'] });
        expect(nav.find((s) => s.title === 'More Apps')).toBeUndefined();
    });
});

describe('isAccessClaims', () => {
    it('only a well-formed enforce claim counts', () => {
        expect(isAccessClaims({ cid: 'c', eid: 1, mods: ['hr'], mv: '1.1', ae: 'enforce' })).toBe(true);
        expect(isAccessClaims({ mods: ['hr'], mv: '1.1', ae: 'shadow' })).toBe(false);
        expect(isAccessClaims({ ae: 'enforce', mods: 'hr', mv: '1' })).toBe(false);
        expect(isAccessClaims(null)).toBe(false);
        expect(isAccessClaims(undefined)).toBe(false);
    });
});

import { claimModules } from '@/app/lib/access/claims';
import { resolveEntitlements } from '@/app/lib/access/resolve';
import { MODULES } from '@/app/lib/modules/registry';

describe('claimModules', () => {
    const ALL = new Set(MODULES.map((m) => m.key));
    const ent = (perms: string[], over: Partial<Parameters<typeof resolveEntitlements>[0]> = {}) => resolveEntitlements({
        userId: 'u', userActive: true, companyId: 'c', unitId: 'a', version: '1.1', entitledModules: ALL, disabledModules: new Set(),
        employeeId: 1, departmentId: null, overrides: [],
        roles: [{ templateKey: 'x', isActive: true, permissions: perms.map((key) => ({ key, scope: 'UNIT' as const })) }], ...over,
    });

    it('a migrated module is held only with at least one of its permissions', () => {
        expect(claimModules(ent(['hr.view']), 'hr')).toContain('hr');
        expect(claimModules(ent(['pharmacy.view']), 'hr')).not.toContain('hr');
    });
    it('My Workspace is always held', () => {
        expect(claimModules(ent([]), 'hr')).toContain('ess');
    });
    it('an UNMIGRATED gated module follows the legacy page gate for the role', () => {
        const mods = claimModules(ent([]), 'nurse');
        expect(mods).toContain('nurse'); // /nurse: [admin, nurse]
        expect(mods).toContain('ot'); // /ot: nurse allowed
        expect(mods).toContain('lab'); // /lab: [admin, lab_technician] — but nurse holds lab.view, so the proxy fallback lets her in today
        expect(mods).not.toContain('finance'); // nurse has no finance.view
        expect(claimModules(ent([]), 'hr')).not.toContain('lab'); // hr has neither the role nor lab.view
    });
    it('an unmigrated module never had a gate → open, exactly as before', () => {
        expect(claimModules(ent([]), 'lab_technician')).toContain('crm');
    });
    it('a module switched off in the unit is not held even if the legacy gate would allow it', () => {
        expect(claimModules(ent([], { disabledModules: new Set(['nurse']) }), 'nurse')).not.toContain('nurse');
    });
});

import { sameClaims } from '@/app/lib/access/claims';
describe('sameClaims', () => {
    it('compares version and module set, ignoring order', () => {
        expect(sameClaims(null, null)).toBe(true);
        expect(sameClaims({ mv: '1.1', mods: ['a', 'b'] }, { mv: '1.1', mods: ['b', 'a'] })).toBe(true);
        expect(sameClaims({ mv: '1.1', mods: ['a'] }, { mv: '1.2', mods: ['a'] })).toBe(false);
        expect(sameClaims({ mv: '1.1', mods: ['a'] }, { mv: '1.1', mods: ['a', 'b'] })).toBe(false);
        expect(sameClaims({ mv: '1.1', mods: ['a'] }, null)).toBe(false);
    });
});
