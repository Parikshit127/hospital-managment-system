/**
 * Per-employee access profiles (ACCESS_PROFILES_PLAN.md): presets, levels, validation, who-may-hand-out-what,
 * the resolver's managed branch, and the sidebar/page gate a profile produces.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/session', () => ({ getSession: vi.fn() }));

import { MODULES } from '@/app/lib/modules/registry';
import {
    ADMIN_ONLY_PERMISSIONS, HR_RESTRICTED_MODULES, ProfileError, assignableModules, checkProfileChange, inferLevel, levelKeys,
    listModuleMeta, listPresets, normalizeProfile, presetModules, presetValue, restrictedSlice, type AccessProfileValue,
} from '@/app/lib/access/presets';
import { SYSTEM_ROLES } from '@/app/lib/access/system-roles';
import { can, resolveEntitlements, type ResolveInput } from '@/app/lib/access/resolve';
import { buildNav, claimModules, claimsAllowPath } from '@/app/lib/access/claims';

const ALL = new Set(MODULES.map((m) => m.key));
const hrKeys = MODULES.find((m) => m.key === 'hr')!.permissions!.map((p) => p.key);

function managed(profile: ResolveInput['profile'], over: Partial<ResolveInput> = {}) {
    return resolveEntitlements({
        userId: 'u1', userActive: true, companyId: 'c1', unitId: 'unitA', version: '1.1', entitledModules: ALL, disabledModules: new Set(),
        roles: [], overrides: [], employeeId: 7, departmentId: 'd1', profile, ...over,
    });
}

describe('presets are derived from what a role really uses', () => {
    it('HR sees only HR', () => {
        expect(presetModules('hr')).toEqual(['hr']);
    });
    it('a receptionist works in reception + billing + opd + ipd (settlement) - and nothing financial or HR', () => {
        const m = presetModules('receptionist');
        expect(m).toEqual(expect.arrayContaining(['reception', 'billing', 'opd', 'ipd']));
        for (const bad of ['finance', 'hr', 'admin', 'pharmacy', 'insurance', 'lab']) expect(m).not.toContain(bad);
    });
    it('no preset ever contains the Admin console, My Workspace or the implicit apps', () => {
        for (const r of SYSTEM_ROLES) {
            const m = presetModules(r.slug);
            for (const bad of ['admin', 'ess', 'notifications', 'help_center', 'mis']) expect(m).not.toContain(bad);
        }
    });
    it('every preset module is assignable', () => {
        const ok = new Set(assignableModules().map((m) => m.key));
        for (const r of SYSTEM_ROLES) for (const k of presetModules(r.slug)) expect(ok.has(k)).toBe(true);
    });
    it('the HR preset holds every HR permission including assigning access', () => {
        const v = presetValue('hr');
        for (const k of hrKeys) expect(v.permissions[k], k).toBe('UNIT');
    });
    it('a pharmacist holds exactly the tiers pharmacy-access.ts gives them (no PO approval)', () => {
        const p = presetValue('pharmacist').permissions;
        for (const k of ['pharmacy.catalog.view', 'pharmacy.dispense.execute', 'pharmacy.purchase.create', 'pharmacy.return.create', 'pharmacy.indent.cancel']) expect(p[k], k).toBeTruthy();
        expect(p['pharmacy.purchase.approve']).toBeUndefined();
    });
    it('cross-module lookups survive without the app: a doctor keeps the pharmacy catalogue, not the pharmacy app', () => {
        const v = presetValue('doctor');
        expect(v.modules).not.toContain('pharmacy');
        expect(v.permissions['pharmacy.catalog.view']).toBe('UNIT');
        expect(v.permissions['pharmacy.dispense.execute']).toBeUndefined();
    });
    it('a nurse keeps ward-indent returns/cancel without the pharmacy app', () => {
        const v = presetValue('nurse');
        expect(v.permissions['pharmacy.return.create']).toBe('UNIT');
        expect(v.permissions['pharmacy.indent.cancel']).toBe('UNIT');
    });
    it('a receptionist gets no finance-ledger permissions (the old *.view fallback quirk is not copied)', () => {
        const keys = Object.keys(presetValue('receptionist').permissions);
        expect(keys.filter((k) => k.startsWith('finance.'))).toEqual([]);
    });
    it('every system role has a preset and presets are listed', () => {
        expect(listPresets().map((p) => p.slug).sort()).toEqual(SYSTEM_ROLES.map((r) => r.slug).sort());
    });
});

describe('levels', () => {
    it('view ⊂ standard ⊂ full and admin-only permissions are never in a level', () => {
        for (const m of ['hr', 'pharmacy', 'finance']) {
            const v = levelKeys(m, 'view'), s = levelKeys(m, 'standard'), f = levelKeys(m, 'full');
            expect(v.every((k) => s.includes(k))).toBe(true);
            expect(s.every((k) => f.includes(k))).toBe(true);
            expect(v.length).toBeGreaterThan(0);
            for (const k of [...v, ...s, ...f]) expect(ADMIN_ONLY_PERMISSIONS).not.toContain(k);
        }
        expect(levelKeys('hr', 'full')).not.toContain('hr.access.assign');
        expect(levelKeys('hr', 'standard')).not.toContain('hr.leave.approve');
        expect(levelKeys('hr', 'standard')).toContain('hr.employee.create');
    });
    it('inferLevel round-trips and reports custom for anything else', () => {
        for (const l of ['view', 'standard', 'full'] as const) expect(inferLevel('hr', new Set(levelKeys('hr', l)))).toBe(l);
        expect(inferLevel('hr', new Set())).toBe('none');
        expect(inferLevel('hr', new Set(['hr.employee.view', 'hr.leave.approve']))).toBe('custom');
    });
    it('the admin-only right does not change the level shown', () => {
        expect(inferLevel('hr', new Set([...levelKeys('hr', 'full'), 'hr.access.assign']))).toBe('full');
    });
});

describe('normalizeProfile', () => {
    const ok = { preset: 'receptionist', modules: ['reception', 'billing'], permissions: {} };
    it('accepts a clean profile and sorts modules', () => {
        expect(normalizeProfile({ ...ok, modules: ['reception', 'billing'] }).modules).toEqual(['billing', 'reception']);
    });
    it.each([
        ['an unknown base role', { ...ok, preset: 'wizard' }],
        ['the admin base role', { ...ok, preset: 'admin' }],
        ['the Admin console as a module', { ...ok, modules: ['admin'] }],
        ['an unknown module', { ...ok, modules: ['nope'] }],
        ['My Workspace as a module', { ...ok, modules: ['ess'] }],
        ['an unknown permission', { ...ok, permissions: { 'hr.nothing.view': 'UNIT' } }],
        ['an Admin-console permission', { ...ok, permissions: { 'admin.access.assign': 'UNIT' } }],
        ['a bad scope', { ...ok, modules: ['hr'], permissions: { 'hr.employee.view': 'GALAXY' } }],
    ])('rejects %s', (_n, input) => {
        expect(() => normalizeProfile(input as never)).toThrow(ProfileError);
    });
    it('drops permissions of an app that is off, but keeps cross-module lookups', () => {
        const r = normalizeProfile({ preset: 'doctor', modules: ['doctor'], permissions: { 'hr.employee.view': 'UNIT', 'pharmacy.catalog.view': 'UNIT', 'pharmacy.dispense.execute': 'UNIT' } });
        expect(r.permissions).toEqual({ 'pharmacy.catalog.view': 'UNIT' });
    });
});

describe('checkProfileChange - who may hand out what', () => {
    const rec = presetValue('receptionist');
    const base = { actorId: 'hr1', targetUserId: 'emp1', actorIsAdmin: false, actorCanAssign: true, targetIsAdmin: false, next: rec, current: rec };

    it('nobody changes their own access', () => {
        expect(checkProfileChange({ ...base, targetUserId: 'hr1', actorIsAdmin: true }).ok).toBe(false);
    });
    it('administrators are never edited with a profile', () => {
        expect(checkProfileChange({ ...base, actorIsAdmin: true, targetIsAdmin: true }).ok).toBe(false);
    });
    it('a user without the assign right cannot', () => {
        expect(checkProfileChange({ ...base, actorCanAssign: false }).ok).toBe(false);
    });
    it('admin may give anything', () => {
        const next = { ...rec, modules: [...rec.modules, 'finance', 'insurance'] };
        expect(checkProfileChange({ ...base, actorIsAdmin: true, next }).ok).toBe(true);
    });
    it('HR may change non-restricted modules', () => {
        const next: AccessProfileValue = { ...rec, modules: [...rec.modules, 'lab', 'pharmacy'] };
        expect(checkProfileChange({ ...base, next }).ok).toBe(true);
    });
    it.each(HR_RESTRICTED_MODULES.filter((m) => m !== 'admin'))('HR may NOT add %s', (m) => {
        const next: AccessProfileValue = { ...rec, modules: [...rec.modules, m] };
        expect(checkProfileChange({ ...base, next }).ok).toBe(false);
    });
    it('HR may NOT grant finance permissions', () => {
        const next: AccessProfileValue = { ...rec, permissions: { ...rec.permissions, 'finance.ledger.view': 'UNIT' } };
        expect(checkProfileChange({ ...base, next }).ok).toBe(false);
    });
    it('HR may NOT remove an administrator-granted finance module either', () => {
        const withFin: AccessProfileValue = { ...rec, modules: [...rec.modules, 'finance'], permissions: { ...rec.permissions, 'finance.ledger.view': 'UNIT' } };
        expect(checkProfileChange({ ...base, current: withFin, next: rec }).ok).toBe(false);
    });
    it('HR may edit the rest of someone who has finance, leaving finance exactly as is', () => {
        const withFin: AccessProfileValue = { ...rec, modules: [...rec.modules, 'finance'], permissions: { ...rec.permissions, 'finance.ledger.view': 'UNIT' } };
        const next: AccessProfileValue = { ...withFin, modules: [...withFin.modules, 'lab'] };
        expect(checkProfileChange({ ...base, current: withFin, next }).ok).toBe(true);
    });
    it('only an administrator can hand out the right to assign access', () => {
        const next: AccessProfileValue = { ...rec, modules: [...rec.modules, 'hr'], permissions: { ...rec.permissions, 'hr.access.assign': 'UNIT' } };
        expect(checkProfileChange({ ...base, next }).ok).toBe(false);
        expect(checkProfileChange({ ...base, next, actorIsAdmin: true }).ok).toBe(true);
    });
    it('HR may add an HR assistant WITHOUT the assign right', () => {
        const next: AccessProfileValue = { preset: 'hr', modules: ['hr'], permissions: Object.fromEntries(hrKeys.filter((k) => k !== 'hr.access.assign').map((k) => [k, 'UNIT' as const])) };
        expect(checkProfileChange({ ...base, next, current: { preset: '', modules: [], permissions: {} } }).ok).toBe(true);
    });
    it('HR cannot pick the Admin or Finance base role, nor demote an existing finance user', () => {
        const fin = presetValue('finance');
        expect(checkProfileChange({ ...base, next: fin, current: { preset: '', modules: [], permissions: {} } }).ok).toBe(false);
        expect(checkProfileChange({ ...base, next: rec, current: fin }).ok).toBe(false);
    });
    it('restrictedSlice only contains the money / admin-only parts', () => {
        expect(restrictedSlice(presetValue('receptionist'))).toEqual([]);
        expect(restrictedSlice(presetValue('finance')).length).toBeGreaterThan(0);
        expect(restrictedSlice(presetValue('hr'))).toEqual(['perm:hr.access.assign:UNIT']);
    });
});

describe('resolver: a profile is the whole truth', () => {
    const prof = { preset: 'receptionist', modules: ['reception', 'billing'], permissions: { 'hr.employee.view': 'UNIT' as const } };

    it('is managed, provisioned, and not an admin', () => {
        const e = managed(prof);
        expect(e.managed).toBe(true);
        expect(e.provisioned).toBe(true);
        expect(e.isAdmin).toBe(false);
        expect(e.isCompanyOwner).toBe(false);
    });
    it('apps = the profile + the implicit ones, nothing else', () => {
        const e = managed(prof);
        expect([...e.appModules].sort()).toEqual(['billing', 'ess', 'help_center', 'notifications', 'reception']);
    });
    it('roles and one-off overrides are ignored entirely', () => {
        const e = managed(prof, {
            roles: [{ templateKey: 'admin', isActive: true, permissions: [{ key: 'hr.view', scope: 'UNIT' }, { key: 'hr.edit', scope: 'UNIT' }] }],
            overrides: [{ key: 'hr.employee.edit', effect: 'GRANT', scope: 'UNIT' }],
        });
        expect(e.isAdmin).toBe(false);
        expect(can(e, 'hr.employee.view')).toBe('UNIT');
        expect(can(e, 'hr.employee.edit')).toBeNull();
        expect(can(e, 'finance.ledger.view')).toBeNull();
    });
    it('a legacy key alone does not satisfy a profile (strict)', () => {
        const e = managed({ preset: 'hr', modules: ['hr'], permissions: {} });
        expect(can(e, 'hr.employee.view')).toBeNull();
        expect(can(e, 'hr.view')).toBeNull();
    });
    it('My Workspace permissions are always there at OWN scope', () => {
        const e = managed({ preset: 'hr', modules: [], permissions: {} });
        expect(can(e, 'ess.self.view')).toBe('OWN');
        expect(can(e, 'ess.self.edit')).toBe('OWN');
    });
    it('permissions of a module the company lacks or the unit switched off disappear', () => {
        const p = { preset: 'hr', modules: ['hr', 'pharmacy'], permissions: { 'hr.employee.view': 'UNIT' as const, 'pharmacy.catalog.view': 'UNIT' as const } };
        const e = managed(p, { disabledModules: new Set(['pharmacy']) });
        expect(can(e, 'hr.employee.view')).toBe('UNIT');
        expect(can(e, 'pharmacy.catalog.view')).toBeNull();
        expect(e.appModules.has('pharmacy')).toBe(false);
        const e2 = managed(p, { entitledModules: new Set(['pharmacy']) });
        expect(can(e2, 'hr.employee.view')).toBeNull();
    });
    it('an inactive user has nothing even with a profile', () => {
        const e = managed(prof, { userActive: false });
        expect(e.managed).toBe(false);
        expect(e.permissions.size).toBe(0);
    });
    it('without a profile nothing changes: roles decide', () => {
        const e = managed(null, { roles: [{ templateKey: 'hr', isActive: true, permissions: [{ key: 'hr.view', scope: 'UNIT' }] }] });
        expect(e.managed).toBe(false);
        expect(can(e, 'hr.employee.view')).toBe('UNIT');
    });
});

describe('page gate + sidebar a profile produces', () => {
    it('claimModules returns exactly the profile apps for a managed user', () => {
        const e = managed({ preset: 'receptionist', modules: ['reception'], permissions: {} });
        expect(claimModules(e, 'receptionist')).toEqual(['ess', 'help_center', 'notifications', 'reception']);
    });
    it('the proxy gate follows the apps', () => {
        const claims = { mods: ['reception', 'ess'] };
        expect(claimsAllowPath(claims, '/reception/queue')).toBe(true);
        expect(claimsAllowPath(claims, '/me/attendance')).toBe(true);
        expect(claimsAllowPath(claims, '/billing')).toBe(false);
        expect(claimsAllowPath(claims, '/hr/employees')).toBe(false);
        expect(claimsAllowPath(claims, '/finance/dashboard')).toBe(false);
    });
    it('a reception-only receptionist sees the Front Desk menu minus billing/IPD entries', () => {
        const items = buildNav('receptionist', { mods: ['reception', 'ess', 'notifications', 'help_center'] }).flatMap((s) => s.items.map((i) => i.href));
        expect(items).toContain('/reception/queue');
        expect(items).not.toContain('/billing');
        expect(items).not.toContain('/ipd/discharge-settlement');
    });
    it('an extra app a role never had shows up under More Apps', () => {
        const nav = buildNav('receptionist', { mods: ['reception', 'billing', 'ipd', 'lab', 'ess'] });
        const more = nav.find((s) => s.title === 'More Apps');
        expect(more?.items.some((i) => i.href.startsWith('/lab'))).toBe(true);
    });
    it('an HR login sees only the HR menu', () => {
        const nav = buildNav('hr', { mods: ['hr', 'ess', 'notifications', 'help_center'] });
        expect(nav.map((s) => s.title)).toEqual(['HR Management']);
    });
});

describe('editor metadata', () => {
    it('lists only real apps, flags detailed ones and the restricted ones', () => {
        const meta = listModuleMeta();
        const byKey = new Map(meta.map((m) => [m.key, m]));
        expect(byKey.has('admin')).toBe(false);
        expect(byKey.has('ess')).toBe(false);
        expect(byKey.has('mis')).toBe(false);
        expect(byKey.get('hr')!.detailed).toBe(true);
        expect(byKey.get('reception')!.detailed).toBe(false);
        expect(byKey.get('finance')!.restrictedForHr).toBe(true);
        expect(byKey.get('insurance')!.restrictedForHr).toBe(true);
        expect(byKey.get('hr')!.permissions.find((p) => p.key === 'hr.access.assign')!.adminOnly).toBe(true);
    });
});
