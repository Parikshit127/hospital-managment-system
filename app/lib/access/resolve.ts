/**
 * Pure entitlement resolution — docs/COMPANY_OS_PLAN.md §5 / §7.2.
 *
 *   allowed(user, p) = module(p) entitled          (company: CompanyModule)
 *                    ∧ module enabled in the unit   (ModuleConfig.enabled)
 *                    ∧ its dependencies available   (registry dependsOn)
 *                    ∧ p ∈ (⋃ role perms ∪ grants) ∖ denies
 *
 * No I/O here — the loader in entitlements.ts feeds this — so every rule is unit-tested
 * without a database. Edge-safe.
 */
import { MODULES } from '../modules/registry';
import type { DataScope } from '../modules/types';
import { ALL_PERMISSION_KEYS, SCOPE_ORDER, legacyKeyOf, moduleOfPermission, storageKeysFor, widerScope } from './permissions';

export interface ResolveInput {
    userId: string;
    userActive: boolean;
    companyId: string | null;
    unitId: string;
    /** `${company.module_version}.${user.access_version}` */
    version: string;
    /** Module keys the company is entitled to. null / empty ⇒ company not provisioned yet. */
    entitledModules: ReadonlySet<string> | null;
    /** ModuleConfig.enabled = false rows for this unit. */
    disabledModules: ReadonlySet<string>;
    /** Role rows that apply to this unit and are currently valid (time/unit filtering done by the loader). */
    roles: readonly { templateKey: string | null; isActive: boolean; permissions: readonly { key: string; scope: DataScope }[]; /** UserRole.unit_id — null = every unit of the company */ unitId?: string | null }[];
    /** Non-expired overrides that apply to this unit. */
    overrides: readonly { key: string; effect: 'GRANT' | 'DENY'; scope: DataScope | null }[];
    employeeId: number | null;
    departmentId: string | null;
}

export interface Entitlements {
    companyId: string | null;
    userId: string;
    unitId: string;
    employeeId: number | null;
    departmentId: string | null;
    /** False until the Phase 2 backfill has given this user a company, entitlements and a role. */
    provisioned: boolean;
    modules: ReadonlySet<string>;
    /** Stored key (new-style or legacy) → widest granted scope. Denies already removed. */
    permissions: ReadonlyMap<string, DataScope>;
    /** Keys denied by an override; checked for new-style keys whose grant arrives through a legacy key. */
    denied: ReadonlySet<string>;
    /** Holds the 'admin' access template in this unit (everything enabled in the unit). */
    isAdmin: boolean;
    /** Holds the 'admin' template company-wide (UserRole.unit_id = null): may administer every unit. */
    isCompanyOwner: boolean;
    version: string;
}

/** Company entitlement ∩ unit toggle ∩ dependency closure. `alwaysOn` modules (My Workspace) are exempt. */
export function effectiveModules(entitled: ReadonlySet<string> | null, disabled: ReadonlySet<string>): Set<string> {
    const live = new Set<string>();
    for (const m of MODULES) {
        if (m.alwaysOn) { live.add(m.key); continue; }
        if (entitled && entitled.has(m.key) && !disabled.has(m.key)) live.add(m.key);
    }
    // A module is only available if everything it depends on is. Iterate to a fixed point.
    let changed = true;
    while (changed) {
        changed = false;
        for (const m of MODULES) {
            if (live.has(m.key) && !m.alwaysOn && m.dependsOn.some((d) => !live.has(d))) {
                live.delete(m.key);
                changed = true;
            }
        }
    }
    return live;
}

export function resolveEntitlements(input: ResolveInput): Entitlements {
    const empty: Entitlements = {
        companyId: input.companyId, userId: input.userId, unitId: input.unitId,
        employeeId: input.employeeId, departmentId: input.departmentId,
        provisioned: false, modules: new Set(), permissions: new Map(), denied: new Set(), isAdmin: false, isCompanyOwner: false, version: input.version,
    };
    if (!input.userActive) return empty;

    const activeRoles = input.roles.filter((r) => r.isActive);
    const provisioned = !!input.entitledModules && input.entitledModules.size > 0 && activeRoles.length > 0;
    const modules = effectiveModules(input.entitledModules, input.disabledModules);

    const perms = new Map<string, DataScope>();
    let isAdmin = false;
    let isCompanyOwner = false;
    const grant = (key: string, scope: DataScope) => perms.set(key, widerScope(perms.get(key), scope) as DataScope);

    for (const role of activeRoles) {
        for (const p of role.permissions) grant(p.key, p.scope);
        // "Unit admin — everything enabled in their unit" (plan §5 rule 8): the admin template holds every catalogue
        // permission without needing a row per key, so a newly added permission never locks admins out.
        if (role.templateKey === 'admin') {
            isAdmin = true;
            if (role.unitId === null) isCompanyOwner = true;
            for (const k of ALL_PERMISSION_KEYS) grant(k, 'UNIT');
            for (const m of MODULES) for (const k of m.legacyPermissions) grant(k, 'UNIT');
        }
    }

    // My Workspace: every active employee, OWN scope, cannot be removed by anything but deactivation.
    for (const m of MODULES) if (m.alwaysOn) for (const p of m.permissions ?? []) perms.set(p.key, 'OWN');

    const denied = new Set<string>();
    for (const o of input.overrides) {
        if (o.effect === 'GRANT') grant(o.key, o.scope ?? 'UNIT');
        else denied.add(o.key);
    }
    for (const k of denied) {
        perms.delete(k);
        // A denied legacy key must also stop the new-style keys that arrive through it.
    }

    // Drop permissions whose module is not available (not entitled, switched off, or a dependency is missing).
    for (const k of [...perms.keys()]) {
        const mod = moduleOfPermission(k);
        if (mod && !modules.has(mod.key)) perms.delete(k);
    }

    return { ...empty, provisioned, modules, permissions: perms, denied, isAdmin, isCompanyOwner };
}

/** The scope at which `key` is held, or null. `key` may be a new-style or a legacy key. */
export function can(ent: Entitlements, key: string): DataScope | null {
    if (ent.denied.has(key)) return null;
    const legacy = legacyKeyOf(key);
    if (legacy && ent.denied.has(legacy)) return null;
    const mod = moduleOfPermission(key);
    if (mod && !ent.modules.has(mod.key)) return null;
    let best: DataScope | null = null;
    for (const stored of storageKeysFor(key)) best = widerScope(best, ent.permissions.get(stored));
    return best;
}

export { SCOPE_ORDER };
