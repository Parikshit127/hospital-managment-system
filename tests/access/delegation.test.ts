import { describe, expect, it } from 'vitest';
import { checkGrant, checkNotLastOwner, checkRevoke } from '@/app/lib/access/delegation';
import { resolveEntitlements } from '@/app/lib/access/resolve';
import { MODULES } from '@/app/lib/modules/registry';

const ALL = new Set(MODULES.map((m) => m.key));
const entFor = (templateKey: string | null, perms: string[], unitId: string | null = 'unitA') => resolveEntitlements({
    userId: 'actor', userActive: true, companyId: 'c', unitId: 'unitA', version: '1.1', entitledModules: ALL, disabledModules: new Set(),
    employeeId: 1, departmentId: null, overrides: [],
    roles: [{ templateKey, isActive: true, unitId, permissions: perms.map((key) => ({ key, scope: 'UNIT' as const })) }],
});
const owner = entFor('admin', [], null);
const unitAdmin = entFor('admin', [], 'unitA');
// an "HR admin": HR permissions + the right to assign access, nothing else
const hrAdmin = entFor('custom:hr-admin', ['hr.view', 'hr.edit', 'hr.approve', 'admin.edit']);

const base = { actorId: 'actor', targetUserId: 'target', unit: 'unitA' as string | null, keys: [] as string[] };

describe('checkGrant', () => {
    it('nobody changes their own access — not even an owner', () => {
        const r = checkGrant({ ...base, actorEnt: owner, targetUserId: 'actor', keys: ['hr.view'] });
        expect(r).toMatchObject({ ok: false });
        expect((r as any).reason).toMatch(/own access/);
    });

    it('needs admin.access.assign', () => {
        const nobody = entFor('doctor', ['opd.view']);
        expect(checkGrant({ ...base, actorEnt: nobody, keys: ['opd.view'] })).toMatchObject({ ok: false });
    });

    it('a unit admin may grant anything within their own unit', () => {
        expect(checkGrant({ ...base, actorEnt: unitAdmin, keys: ['finance.ledger.edit', 'pharmacy.return.create'] })).toEqual({ ok: true });
    });

    it('a unit admin may NOT grant company-wide access; an owner may', () => {
        expect(checkGrant({ ...base, actorEnt: unitAdmin, unit: null, keys: ['hr.view'] })).toMatchObject({ ok: false });
        expect(checkGrant({ ...base, actorEnt: owner, unit: null, keys: ['hr.view'] })).toEqual({ ok: true });
    });

    it('an HR admin can hand out HR permissions…', () => {
        expect(checkGrant({ ...base, actorEnt: hrAdmin, keys: ['hr.view', 'hr.approve'] })).toEqual({ ok: true });
    });

    it('…but can never escalate: finance, pharmacy or anything else they do not hold is refused, and named', () => {
        const r = checkGrant({ ...base, actorEnt: hrAdmin, keys: ['hr.view', 'finance.view', 'pharmacy.create'] }) as any;
        expect(r.ok).toBe(false);
        expect(r.missing).toEqual(['finance.view', 'pharmacy.create']);
    });

    it('new-style catalogue keys count as held when their legacy key is held', () => {
        expect(checkGrant({ ...base, actorEnt: hrAdmin, keys: ['hr.leave.approve'] })).toEqual({ ok: true });
        expect(checkGrant({ ...base, actorEnt: hrAdmin, keys: ['finance.ledger.view'] })).toMatchObject({ ok: false });
    });

    it('only an administrator can grant the administrator template', () => {
        expect(checkGrant({ ...base, actorEnt: hrAdmin, keys: [], grantsAdminTemplate: true })).toMatchObject({ ok: false });
        expect(checkGrant({ ...base, actorEnt: unitAdmin, keys: [], grantsAdminTemplate: true })).toEqual({ ok: true });
    });

    it('a permission the actor was explicitly denied cannot be handed out', () => {
        const denied = resolveEntitlements({
            userId: 'actor', userActive: true, companyId: 'c', unitId: 'unitA', version: '1', entitledModules: ALL, disabledModules: new Set(),
            employeeId: 1, departmentId: null,
            roles: [{ templateKey: 'x', isActive: true, unitId: 'unitA', permissions: [{ key: 'hr.view', scope: 'UNIT' }, { key: 'admin.edit', scope: 'UNIT' }] }],
            overrides: [{ key: 'hr.view', effect: 'DENY', scope: null }],
        });
        expect(checkGrant({ ...base, actorEnt: denied, keys: ['hr.view'] })).toMatchObject({ ok: false });
    });

    it('a permission in a module that is switched off for the unit cannot be handed out', () => {
        const off = resolveEntitlements({
            userId: 'actor', userActive: true, companyId: 'c', unitId: 'unitA', version: '1', entitledModules: ALL, disabledModules: new Set(['hr']),
            employeeId: 1, departmentId: null, overrides: [],
            roles: [{ templateKey: 'x', isActive: true, unitId: 'unitA', permissions: [{ key: 'hr.view', scope: 'UNIT' }, { key: 'admin.edit', scope: 'UNIT' }] }],
        });
        expect(checkGrant({ ...base, actorEnt: off, keys: ['hr.view'] })).toMatchObject({ ok: false });
    });
});

describe('checkRevoke', () => {
    it('same actor rules, but no subset rule — removing is never escalation', () => {
        expect(checkRevoke({ ...base, actorEnt: hrAdmin })).toEqual({ ok: true });
    });
    it('not your own, not company-wide unless owner, not the admin role unless admin', () => {
        expect(checkRevoke({ ...base, actorEnt: owner, targetUserId: 'actor' })).toMatchObject({ ok: false });
        expect(checkRevoke({ ...base, actorEnt: unitAdmin, unit: null })).toMatchObject({ ok: false });
        expect(checkRevoke({ ...base, actorEnt: hrAdmin, revokesAdminTemplate: true })).toMatchObject({ ok: false });
        expect(checkRevoke({ ...base, actorEnt: unitAdmin, revokesAdminTemplate: true })).toEqual({ ok: true });
    });
});

describe('checkNotLastOwner', () => {
    it('refuses to remove the only owner', () => {
        expect(checkNotLastOwner(['o1'], 'o1')).toMatchObject({ ok: false });
    });
    it('allows removing one of several, or a non-owner', () => {
        expect(checkNotLastOwner(['o1', 'o2'], 'o1')).toEqual({ ok: true });
        expect(checkNotLastOwner(['o1'], 'someone-else')).toEqual({ ok: true });
    });
});

describe('who is an owner / admin (resolver flags)', () => {
    it('admin template with unit_id null ⇒ company owner; with a unit ⇒ unit admin only', () => {
        expect(owner.isAdmin && owner.isCompanyOwner).toBe(true);
        expect(unitAdmin.isAdmin).toBe(true);
        expect(unitAdmin.isCompanyOwner).toBe(false);
        expect(hrAdmin.isAdmin).toBe(false);
    });
});
