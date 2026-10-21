/**
 * Generators that rebuild today's hardcoded access maps from the registry + system roles
 * (docs/COMPANY_OS_PLAN.md Phase 1, rule "parity before deletion").
 *
 * Each function returns exactly what the corresponding literal in the legacy file contains,
 * including key ORDER where order is behaviour (ROLE_ROUTES). `npm run check:parity` proves
 * that, and fails the build the moment either side drifts.
 *
 * Nothing here is used at runtime yet. Edge-safe: pure functions over data.
 */
import { MODULES } from '../modules/registry';
import { SYSTEM_ROLES } from './system-roles';
import { LEGACY_NAV_BY_ROLE, LEGACY_MY_WORKSPACE, type LegacyNavSection } from './legacy-nav';

/** proxy.ts ROLE_ROUTES — prefix → flat role allow-list, in declaration order. */
export function generateRoleRoutes(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const m of MODULES) for (const g of m.legacyGates ?? []) out[g.prefix] = [...g.roles];
    return out;
}

/** proxy.ts PERMISSION_ROUTES — prefix → required `*.view` permission. */
export function generatePermissionRoutes(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of MODULES) for (const g of m.legacyGates ?? []) out[g.prefix] = g.permission;
    return out;
}

function permissionMap(pick: (r: (typeof SYSTEM_ROLES)[number]) => readonly string[] | undefined): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const r of SYSTEM_ROLES) {
        const p = pick(r);
        if (p) out[r.slug] = [...p];
    }
    return out;
}

/** proxy.ts ROLE_PERMISSIONS */
export const generateProxyRolePermissions = () => permissionMap((r) => r.legacyPermissions.proxy);
/** app/lib/session.ts SYSTEM_ROLE_PERMISSIONS */
export const generateSessionRolePermissions = () => permissionMap((r) => r.legacyPermissions.session);
/** app/actions/role-actions.ts SYSTEM_ROLE_PERMISSIONS */
export const generateRoleActionsRolePermissions = () => permissionMap((r) => r.legacyPermissions.roleActions);

function homeMap(pick: (r: (typeof SYSTEM_ROLES)[number]) => string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of SYSTEM_ROLES) {
        const h = pick(r);
        if (h) out[r.slug] = h;
    }
    return out;
}

/** proxy.ts redirectMap (post-login landing when hitting /login while signed in) */
export const generateProxyHomeMap = () => homeMap((r) => r.legacyHome.proxy);
/** app/login/actions.ts `switch (user.role)` redirects */
export const generateLoginHomeMap = () => homeMap((r) => r.legacyHome.login);

/** Sidebar.tsx NAV_BY_ROLE */
export function generateNavByRole(): Record<string, readonly LegacyNavSection[]> {
    return LEGACY_NAV_BY_ROLE;
}

/** Sidebar.tsx MY_WORKSPACE */
export function generateMyWorkspace(): LegacyNavSection {
    return LEGACY_MY_WORKSPACE;
}
