/**
 * The editor's state transitions. The important property: a non-admin (HR) can never move the Finance / Insurance /
 * admin-only slice - not by ticking, not by changing the base role, not by "reset to defaults".
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/session', () => ({ getSession: vi.fn() }));

import { changePreset, pin, setLevel, toggleApp, togglePerm, type EditorCtx } from '@/app/lib/access/editor-ops';
import { checkProfileChange, inferLevel, listModuleMeta, presetValue, type AccessProfileValue } from '@/app/lib/access/presets';

const modules = listModuleMeta();
const ctxFor = (isAdmin: boolean, baseline: AccessProfileValue): EditorCtx => ({ modules, isAdmin, baseline });
const empty: AccessProfileValue = { preset: '', modules: [], permissions: {} };
const keys = (v: AccessProfileValue) => new Set(Object.keys(v.permissions));

describe('turning apps on and off', () => {
    const ctx = ctxFor(true, empty);
    it('a page-only app is just a module entry', () => {
        const v = toggleApp(ctx, presetValue('receptionist'), 'lab', true);
        expect(v.modules).toContain('lab');
        expect(Object.keys(v.permissions).filter((k) => k.startsWith('lab.'))).toEqual([]);
    });
    it('a detailed app starts at Standard (not Full, never the admin-only right)', () => {
        const v = toggleApp(ctx, presetValue('receptionist'), 'hr', true);
        expect(inferLevel('hr', keys(v))).toBe('standard');
        expect(v.permissions['hr.access.assign']).toBeUndefined();
        expect(v.permissions['hr.leave.approve']).toBeUndefined();
    });
    it('turning an app off removes its permissions but keeps shared lookups other apps rely on', () => {
        const start = presetValue('pharmacist');
        expect(start.permissions['pharmacy.dispense.execute']).toBeDefined();
        const v = toggleApp(ctx, start, 'pharmacy', false);
        expect(v.modules).not.toContain('pharmacy');
        expect(v.permissions['pharmacy.dispense.execute']).toBeUndefined();
        expect(v.permissions['pharmacy.catalog.view']).toBe('UNIT');
        expect(v.permissions['pharmacy.return.create']).toBe('UNIT');
    });
    it('turning it back on does not wipe what is already there', () => {
        const v1 = setLevel(ctx, toggleApp(ctx, presetValue('receptionist'), 'hr', true), 'hr', 'full');
        const v2 = toggleApp(ctx, v1, 'hr', true);
        expect(inferLevel('hr', keys(v2))).toBe('full');
    });
});

describe('levels and single permissions', () => {
    const ctx = ctxFor(true, empty);
    const base = toggleApp(ctx, presetValue('receptionist'), 'hr', true);
    it.each(['none', 'view', 'standard', 'full'] as const)('setLevel %s round-trips through inferLevel', (lvl) => {
        expect(inferLevel('hr', keys(setLevel(ctx, base, 'hr', lvl)))).toBe(lvl);
    });
    it('"custom" is not a settable level', () => {
        expect(setLevel(ctx, base, 'hr', 'custom')).toBe(base);
    });
    it('ticking one box makes the level custom', () => {
        const v = togglePerm(ctx, setLevel(ctx, base, 'hr', 'view'), 'hr.leave.approve', true);
        expect(inferLevel('hr', keys(v))).toBe('custom');
    });
    it('a permission needs its app on, except shared lookups', () => {
        const rec = presetValue('receptionist');
        expect(togglePerm(ctx, rec, 'hr.employee.view', true)).toBe(rec);
        expect(togglePerm(ctx, rec, 'pharmacy.catalog.view', true).permissions['pharmacy.catalog.view']).toBe('UNIT');
    });
    it('only an admin can tick the assign-access right', () => {
        const hr = presetValue('hr');
        const without = { ...hr, permissions: Object.fromEntries(Object.entries(hr.permissions).filter(([k]) => k !== 'hr.access.assign')) };
        expect(togglePerm(ctxFor(true, without), without, 'hr.access.assign', true).permissions['hr.access.assign']).toBe('UNIT');
        expect(togglePerm(ctxFor(false, without), without, 'hr.access.assign', true).permissions['hr.access.assign']).toBeUndefined();
    });
});

describe('a non-admin (HR) cannot move the restricted slice', () => {
    const finance = presetValue('finance');
    const withFinance: AccessProfileValue = { preset: 'receptionist', modules: ['reception', 'finance', 'insurance'], permissions: { 'finance.ledger.view': 'UNIT' } };
    const hrCtx = ctxFor(false, withFinance);

    it('cannot switch Finance on or off', () => {
        const off = toggleApp(hrCtx, withFinance, 'finance', false);
        expect(off).toBe(withFinance);
        const noFin = ctxFor(false, presetValue('receptionist'));
        expect(toggleApp(noFin, presetValue('receptionist'), 'finance', true)).toEqual(presetValue('receptionist'));
        expect(setLevel(hrCtx, withFinance, 'finance', 'full')).toBe(withFinance);
        expect(togglePerm(hrCtx, withFinance, 'finance.ledger.edit', true)).toBe(withFinance);
    });
    it('changing the base role keeps the person’s existing Finance/Insurance exactly', () => {
        const v = changePreset(hrCtx, 'lab_technician');
        expect(v.modules).toEqual(expect.arrayContaining(['finance', 'insurance', 'lab']));
        expect(v.permissions['finance.ledger.view']).toBe('UNIT');
    });
    it('changing the base role never GIVES Finance to someone who had none', () => {
        const noFin = ctxFor(false, presetValue('receptionist'));
        const v = changePreset(noFin, 'ipd_manager'); // this preset includes insurance/billing
        expect(v.modules).not.toContain('insurance');
        expect(Object.keys(v.permissions).some((k) => k.startsWith('finance.'))).toBe(false);
    });
    it('an admin is not restricted', () => {
        const adminCtx = ctxFor(true, presetValue('receptionist'));
        expect(toggleApp(adminCtx, presetValue('receptionist'), 'finance', true).modules).toContain('finance');
        expect(changePreset(adminCtx, 'finance').modules).toContain('finance');
        void finance;
    });
    it('whatever HR does in the editor passes the server rule (checkProfileChange)', () => {
        const start = withFinance;
        const actions: AccessProfileValue[] = [
            toggleApp(hrCtx, start, 'lab', true),
            toggleApp(hrCtx, start, 'reception', false),
            setLevel(hrCtx, toggleApp(hrCtx, start, 'hr', true), 'hr', 'full'),
            changePreset(hrCtx, 'nurse'),
            changePreset(hrCtx, 'hr'),
            pin(hrCtx, { ...start, modules: [], permissions: {} }),
        ];
        for (const next of actions) {
            const verdict = checkProfileChange({ actorId: 'hr1', targetUserId: 'e1', actorIsAdmin: false, actorCanAssign: true, targetIsAdmin: false, next, current: start });
            expect(verdict, JSON.stringify(next)).toEqual({ ok: true });
        }
    });
});
