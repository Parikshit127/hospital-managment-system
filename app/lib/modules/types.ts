/**
 * Module registry types — see docs/COMPANY_OS_PLAN.md §7.1 and ADR-003.
 *
 * MUST stay edge-safe: no Node, Prisma or next/headers imports. proxy.ts (Edge runtime)
 * will import the registry in a later phase.
 *
 * Phase 1 status: the registry DESCRIBES today's behaviour (parity-tested against the
 * hardcoded maps). Nothing at runtime reads it yet.
 */
export type DataScope = 'OWN' | 'TEAM' | 'DEPARTMENT' | 'UNIT' | 'COMPANY';
export type ModuleLayer = 'core' | 'business' | 'pack';

export interface NavItem {
    label: string;
    href: string;
    icon: string; // lucide icon name
    group?: string;
    permission: string; // shown only if the user holds it
}

export interface ModelOwnership {
    employeeField?: string; // OWN / TEAM
    departmentField?: string; // DEPARTMENT
    unitField?: string; // UNIT (usually 'organizationId')
    companyField?: string; // COMPANY
}

/**
 * One entry of proxy.ts ROLE_ROUTES / PERMISSION_ROUTES, preserved verbatim.
 * Order across the whole registry matters: proxy.ts takes the FIRST matching
 * `startsWith` prefix, so MODULES order = ROLE_ROUTES order.
 */
export interface LegacyRouteGate {
    prefix: string; // e.g. '/ipd'
    roles: readonly string[]; // flat role allow-list (ROLE_ROUTES)
    permission: string; // PERMISSION_ROUTES, e.g. 'ipd.view'
}

/**
 * A `module.resource.action` permission (ADR-005).
 *
 * `legacyKey` ties the new key to a legacy 2-part key (`hr.view`, `pharmacy.create` …): whoever holds the
 * legacy key in their role template holds this permission, so NO database seeding is needed and the
 * engine's decision equals today's whenever the legacy key was the real rule.
 * A permission WITHOUT `legacyKey` has no legacy equivalent (today it is a hand-written role list);
 * its `defaultRoles` — copied from that list — are seeded into the role templates by
 * scripts/seed-access-permissions.ts, and tests/access/permission-parity.test.ts proves they equal the legacy list.
 */
export interface PermissionDef {
    key: string;
    legacyKey?: string;
    description: string;
    defaultRoles?: readonly string[];
}

export interface ModuleDef {
    key: string; // 'hr', 'pharmacy', 'ess'
    name: string;
    layer: ModuleLayer;
    pack?: 'healthcare';
    dataLevel: 'company' | 'unit';
    routePrefixes: readonly string[]; // pages + owned API prefixes, e.g. ['/hr']
    actionsFiles: readonly string[]; // basenames in app/actions, without extension
    /**
     * Phase 1: today's 2-part permission keys that belong to this module (`opd.view` …).
     * Phase 3 replaces/extends these with `module.resource.action` keys (ADR-005).
     */
    legacyPermissions: readonly string[];
    permissions?: readonly PermissionDef[]; // Phase 3: the module.resource.action catalogue for this module
    dependsOn: readonly string[]; // PROPOSED — not enforced until Phase 3
    defaultRoles: readonly string[]; // system role slugs that get it by default
    alwaysOn?: boolean; // only 'ess'
    legacyGates?: readonly LegacyRouteGate[];
    nav?: readonly NavItem[]; // Phase 3: replaces NAV_BY_ROLE
    models?: Record<string, ModelOwnership>; // Prisma model → owner fields (Phase 3)
}

export interface SystemRoleDef {
    slug: string;
    label: string;
    /**
     * Landing routes, preserved verbatim from the two places that decide them.
     * `undefined` = that place has no entry for this role.
     */
    legacyHome: {
        proxy?: string; // proxy.ts redirectMap
        login?: string; // app/login/actions.ts switch
    };
    /**
     * The three diverging permission maps, preserved verbatim.
     * `undefined` = the role is absent from that map (so lookups fall through to "no permissions").
     * Reconciled into one canonical set in Phase 3/4 — see LEGACY-QUIRK notes in system-roles.ts.
     */
    legacyPermissions: {
        session?: readonly string[]; // app/lib/session.ts SYSTEM_ROLE_PERMISSIONS
        roleActions?: readonly string[]; // app/actions/role-actions.ts SYSTEM_ROLE_PERMISSIONS
        proxy?: readonly string[]; // proxy.ts ROLE_PERMISSIONS
    };
}
