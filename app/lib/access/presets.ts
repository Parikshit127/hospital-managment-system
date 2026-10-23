/**
 * Access-profile presets and rules — ACCESS_PROFILES_PLAN.md. Pure and edge-safe (the editor runs this in the
 * browser, the resolver in the Edge-adjacent claims code).
 *
 * A *profile* is the per-employee answer to "which apps do they get, and what may they do inside them":
 *
 *   modules      app keys from the module registry (what opens in the sidebar and passes the proxy)
 *   permissions  catalogue keys (`module.resource.action`) → data scope, for modules that have a catalogue
 *
 * Presets are only a starting point for the editor. They are DERIVED from what a system role really uses today
 * (its sidebar + its proxy route gates + the permissions it holds) — nothing is invented here.
 */
import { MODULES } from '../modules/registry';
import type { DataScope, ModuleDef, PermissionDef } from '../modules/types';
import { LEGACY_NAV_BY_ROLE } from './legacy-nav';
import { moduleForPath } from './claims';
import { SYSTEM_ROLES } from './system-roles';
import { IMPLICIT_APPS, isDataScope } from './permissions';

// ───────────────────────── what can be put in a profile ─────────────────────────

/** Never part of a profile: the Admin console stays a role (administrators are managed in Admin → Access Control). */
export const NEVER_IN_PROFILE: readonly string[] = ['admin'];

export { IMPLICIT_APPS };

/** An HR user may NOT hand these out (or take them away): the money modules. Admin can. */
export const HR_RESTRICTED_MODULES: readonly string[] = ['admin', 'finance', 'insurance'];

/** System roles an HR user may not pick as someone's base role (the role string still drives some legacy screens). */
export const HR_RESTRICTED_PRESETS: readonly string[] = ['admin', 'finance'];

/** Permissions only an Admin may grant or remove — the right to give other people access must not spread. */
export const ADMIN_ONLY_PERMISSIONS: readonly string[] = ['hr.access.assign'];

/** Apps with at least one page of their own (a module that only owns API routes, like MIS, is not an "app"). */
const hasPages = (m: ModuleDef) => m.routePrefixes.some((p) => !p.startsWith('/api'));

export const assignableModules = (): ModuleDef[] =>
    MODULES.filter((m) => !m.alwaysOn && !NEVER_IN_PROFILE.includes(m.key) && !IMPLICIT_APPS.includes(m.key) && hasPages(m));

const ASSIGNABLE_KEYS = new Set(assignableModules().map((m) => m.key));

/** Catalogue permissions a profile may carry (not My Workspace's implicit ones, not the Admin console's). */
export function profilePermissionDefs(): { def: PermissionDef; module: ModuleDef }[] {
    const out: { def: PermissionDef; module: ModuleDef }[] = [];
    for (const m of MODULES) {
        if (m.alwaysOn || NEVER_IN_PROFILE.includes(m.key)) continue;
        for (const def of m.permissions ?? []) out.push({ def, module: m });
    }
    return out;
}

const PERM_BY_KEY = new Map(profilePermissionDefs().map((p) => [p.def.key, p]));
export const isProfilePermission = (key: string) => PERM_BY_KEY.has(key);
export const moduleOfProfilePermission = (key: string) => PERM_BY_KEY.get(key)?.module;

// ───────────────────────── levels ─────────────────────────

export type Level = 'none' | 'view' | 'standard' | 'full' | 'custom';

/** 1 = look, 2 = do the daily work, 3 = approve / export / delete / assign. */
export function actionTier(key: string): 1 | 2 | 3 {
    const action = key.split('.').pop() ?? '';
    if (action === 'view') return 1;
    if (['create', 'edit', 'execute', 'cancel'].includes(action)) return 2;
    return 3; // approve, export, delete, assign …
}

/** The catalogue keys of one module that belong to a level (custom/none are not sets). */
export function levelKeys(moduleKey: string, level: Exclude<Level, 'custom' | 'none'>): string[] {
    const m = MODULES.find((x) => x.key === moduleKey);
    const max = level === 'view' ? 1 : level === 'standard' ? 2 : 3;
    return (m?.permissions ?? []).filter((p) => actionTier(p.key) <= max && !ADMIN_ONLY_PERMISSIONS.includes(p.key)).map((p) => p.key);
}

/**
 * Which level a set of selected keys is exactly equal to (for the dropdown); anything else is "custom".
 * Admin-only permissions (the right to assign access) sit outside the levels and are ignored here.
 */
export function inferLevel(moduleKey: string, selected: ReadonlySet<string>): Level {
    const defs = MODULES.find((x) => x.key === moduleKey)?.permissions ?? [];
    const own = defs.map((p) => p.key).filter((k) => selected.has(k) && !ADMIN_ONLY_PERMISSIONS.includes(k));
    if (own.length === 0) return 'none';
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
    if (same(own, levelKeys(moduleKey, 'view'))) return 'view';
    if (same(own, levelKeys(moduleKey, 'standard'))) return 'standard';
    if (same(own, levelKeys(moduleKey, 'full'))) return 'full';
    return 'custom';
}

// ───────────────────────── the profile value ─────────────────────────

export interface AccessProfileValue {
    /** system role slug the profile started from — also written to users.role (landing page, legacy screens) */
    preset: string;
    modules: string[];
    permissions: Record<string, DataScope>;
}

/**
 * Permissions that stay useful outside their own app: another module's screens call them (a doctor searches the
 * pharmacy catalogue while prescribing; a nurse files a pharmacy return from the ward). They are kept in a preset
 * even when the app itself is not, so turning an app off never breaks the screens of the apps that remain.
 */
export const CROSS_MODULE_PERMISSIONS: readonly string[] = ['pharmacy.catalog.view', 'pharmacy.return.create', 'pharmacy.indent.cancel'];

function unionPerms(slug: string): Set<string> {
    const r = SYSTEM_ROLES.find((x) => x.slug === slug);
    return new Set([...(r?.legacyPermissions.session ?? []), ...(r?.legacyPermissions.roleActions ?? []), ...(r?.legacyPermissions.proxy ?? [])]);
}

/** Apps a system role really works in: its sidebar entries ∪ the proxy route gates that list it. */
export function presetModules(slug: string): string[] {
    const out = new Set<string>();
    for (const sec of LEGACY_NAV_BY_ROLE[slug] ?? []) for (const i of sec.items) {
        const m = moduleForPath(i.href);
        if (m) out.add(m.key);
    }
    for (const m of MODULES) for (const g of m.legacyGates ?? []) if (g.roles.includes(slug)) out.add(m.key);
    return [...out].filter((k) => ASSIGNABLE_KEYS.has(k)).sort();
}

export function presetValue(slug: string): AccessProfileValue {
    const modules = presetModules(slug);
    const held = unionPerms(slug);
    const permissions: Record<string, DataScope> = {};
    for (const { def, module } of profilePermissionDefs()) {
        const holds = def.legacyKey ? held.has(def.legacyKey) : (def.defaultRoles ?? []).includes(slug);
        if (!holds) continue;
        if (modules.includes(module.key) || CROSS_MODULE_PERMISSIONS.includes(def.key)) permissions[def.key] = 'UNIT';
    }
    return { preset: slug, modules, permissions };
}

export interface PresetMeta { slug: string; label: string; modules: string[]; restrictedForHr: boolean }

export function listPresets(): PresetMeta[] {
    return SYSTEM_ROLES.map((r) => ({
        slug: r.slug, label: r.label, modules: presetModules(r.slug), restrictedForHr: HR_RESTRICTED_PRESETS.includes(r.slug),
    }));
}

// ───────────────────────── validation / normalisation ─────────────────────────

export class ProfileError extends Error {
    constructor(message: string) { super(message); this.name = 'ProfileError'; }
}

/**
 * Clean a client-supplied profile: unknown / forbidden keys are an error (never silently dropped, so a typo cannot
 * quietly deny or grant), permissions of an un-ticked app are removed unless they are cross-module lookups.
 */
export function normalizeProfile(input: { preset: string; modules: readonly string[]; permissions: Record<string, unknown> }): AccessProfileValue {
    if (!SYSTEM_ROLES.some((r) => r.slug === input.preset)) throw new ProfileError('Choose a valid base role.');
    if (input.preset === 'admin') throw new ProfileError('Administrators are managed in Admin → Access Control, not with a module profile.');

    const modules = [...new Set(input.modules)];
    for (const k of modules) if (!ASSIGNABLE_KEYS.has(k)) throw new ProfileError(`"${k}" cannot be given to an employee.`);

    const permissions: Record<string, DataScope> = {};
    for (const [key, scope] of Object.entries(input.permissions ?? {})) {
        const p = PERM_BY_KEY.get(key);
        if (!p) throw new ProfileError(`"${key}" is not a grantable permission.`);
        if (!isDataScope(scope)) throw new ProfileError(`"${String(scope)}" is not a valid scope.`);
        if (!modules.includes(p.module.key) && !CROSS_MODULE_PERMISSIONS.includes(key)) continue; // app is off → drop
        permissions[key] = scope;
    }
    return { preset: input.preset, modules: modules.sort(), permissions };
}

// ───────────────────────── the "who may hand out what" slice ─────────────────────────

/**
 * The part of a profile only an Admin may change: restricted modules, their permissions, and the admin-only
 * permissions. An HR user saving a profile must leave this slice exactly as it was.
 */
export function restrictedSlice(p: Pick<AccessProfileValue, 'modules' | 'permissions'>): string[] {
    const out: string[] = [];
    for (const m of p.modules) if (HR_RESTRICTED_MODULES.includes(m)) out.push(`module:${m}`);
    for (const k of Object.keys(p.permissions)) {
        const mod = moduleOfProfilePermission(k);
        if (ADMIN_ONLY_PERMISSIONS.includes(k) || (mod && HR_RESTRICTED_MODULES.includes(mod.key))) out.push(`perm:${k}:${p.permissions[k]}`);
    }
    return out.sort();
}

export interface ProfileChangeRequest {
    actorId: string;
    targetUserId: string;
    actorIsAdmin: boolean;
    /** holds hr.access.assign */
    actorCanAssign: boolean;
    /** the target currently holds the Admin role */
    targetIsAdmin: boolean;
    next: AccessProfileValue;
    /** what the target effectively has now: their profile, or the preset of their current role when they have none */
    current: AccessProfileValue;
}

export type ProfileVerdict = { ok: true } | { ok: false; reason: string };

export function checkProfileChange(r: ProfileChangeRequest): ProfileVerdict {
    const no = (reason: string): ProfileVerdict => ({ ok: false, reason });
    if (r.actorId === r.targetUserId) return no('You cannot change your own access.');
    if (r.targetIsAdmin) return no('Administrators are managed in Admin → Access Control.');
    if (!r.actorIsAdmin && !r.actorCanAssign) return no('You do not have permission to assign access.');
    if (r.actorIsAdmin) return { ok: true };

    if (HR_RESTRICTED_PRESETS.includes(r.next.preset) && r.next.preset !== r.current.preset) {
        return no('Only an administrator can give someone the Admin or Finance base role.');
    }
    if (HR_RESTRICTED_PRESETS.includes(r.current.preset) && r.next.preset !== r.current.preset) {
        return no('Only an administrator can change the base role of an Admin or Finance user.');
    }
    const before = restrictedSlice(r.current);
    const after = restrictedSlice(r.next);
    if (before.join('|') !== after.join('|')) {
        return no('Only an administrator can change Finance, Insurance and “assign access” rights. Leave those as they are.');
    }
    return { ok: true };
}

// ───────────────────────── editor metadata (serialisable) ─────────────────────────

const BLURB: Record<string, string> = {
    doctor: 'Doctor workspace: consultations, prescriptions, patient history',
    reception: 'Front desk: registration, appointments, queue, patient records',
    lab: 'Laboratory: orders, samples, results',
    pharmacy: 'Pharmacy: dispensing, stock, purchase, returns',
    finance: 'Finance & accounts: ledger, expenses, reports, Tally export',
    ipd: 'In-patient: admissions, beds, discharge',
    opd: 'Out-patient: OPD visits, billing queue, display board',
    insurance: 'Insurance & TPA: claims, pre-auth, receipts',
    nurse: 'Nursing: ward tasks, vitals, medication',
    opd_manager: 'OPD manager: OPD operations oversight',
    hr: 'HR: employees, attendance, leave, shifts, settings',
    ot: 'Operation theatre: scheduling, surgery records',
    er: 'Emergency: triage, ER billing',
    billing: 'Master billing: invoices, payments, refunds, approvals',
    crm: 'CRM: leads and follow-ups',
    call_center: 'Call centre: calls and follow-ups',
    coordinator: 'Coordinator: patient coordination',
    counselling: 'Counselling: sessions and follow-ups',
    mis: 'MIS & reports',
    print_center: 'Print centre: reprint documents',
};

export interface ModuleMeta {
    key: string;
    name: string;
    blurb: string;
    /** true when the module has a permission catalogue, i.e. what they may DO inside it can be tuned */
    detailed: boolean;
    restrictedForHr: boolean;
    permissions: { key: string; resource: string; action: string; description: string; tier: 1 | 2 | 3; crossModule: boolean; adminOnly: boolean }[];
}

export function listModuleMeta(): ModuleMeta[] {
    return assignableModules().map((m) => ({
        key: m.key,
        name: m.name,
        blurb: BLURB[m.key] ?? m.name,
        detailed: !!m.permissions?.length,
        restrictedForHr: HR_RESTRICTED_MODULES.includes(m.key),
        permissions: (m.permissions ?? []).map((p) => {
            const [, resource, action] = p.key.split('.');
            return {
                key: p.key, resource, action, description: p.description, tier: actionTier(p.key),
                crossModule: CROSS_MODULE_PERMISSIONS.includes(p.key), adminOnly: ADMIN_ONLY_PERMISSIONS.includes(p.key),
            };
        }),
    }));
}
