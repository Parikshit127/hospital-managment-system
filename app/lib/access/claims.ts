/**
 * Access claims carried in the staff JWT, and the pure helpers proxy.ts / the sidebar use with them
 * (docs/COMPANY_OS_PLAN.md §7.5–7.6). Edge-safe: no Node, Prisma or next/headers imports.
 *
 * Claims are minted ONLY for units whose `access_engine` flag is `enforce` and whose user is provisioned
 * (scripts/backfill-company-os.ts has run). Everyone else has no claims, and proxy.ts / Sidebar.tsx take exactly
 * the code path they always did.
 */
import { MODULES } from '../modules/registry';
import type { ModuleDef } from '../modules/types';
import { LEGACY_MY_WORKSPACE, LEGACY_NAV_BY_ROLE, type LegacyNavSection } from './legacy-nav';
import { roleMayOpenWith } from './legacy-pages';
import { moduleOfPermission } from './permissions';
import type { Entitlements } from './resolve';
import { generateProxyRolePermissions } from './legacy-maps';

export interface AccessClaims {
    /** company id */
    cid: string | null;
    /** employee id */
    eid: number | null;
    /** modules in which the user holds at least one permission (+ My Workspace) */
    mods: string[];
    /** entitlement version the claims were minted from: `${company.module_version}.${user.access_version}` */
    mv: string;
    /** engine mode when minted — only 'enforce' ever reaches a token */
    ae: 'enforce';
}

export function isAccessClaims(v: unknown): v is AccessClaims {
    const c = v as Partial<AccessClaims> | null;
    return !!c && c.ae === 'enforce' && Array.isArray(c.mods) && typeof c.mv === 'string';
}

// ── which modules a user holds ──
const PROXY_PERMS = generateProxyRolePermissions();

/**
 * Modules to put in the claims.
 *
 * - A MIGRATED module (it declares permissions in the registry: ess, hr, pharmacy, finance today): held iff the
 *   user holds at least one of its permissions under the new engine.
 * - An UNMIGRATED module has no permission catalogue yet, so the engine cannot judge it. It follows the rule it has
 *   always followed — the proxy.ts page gate for that role, or "open to any staff" where it never had a gate —
 *   so turning `enforce` on for a unit can never lock users out of modules Phase 3 has not reached.
 */
export function claimModules(ent: Pick<Entitlements, 'modules' | 'permissions'> & Partial<Pick<Entitlements, 'managed' | 'appModules'>>, role: string): string[] {
    // A per-employee access profile is explicit and complete: the apps they hold are exactly the apps on it.
    if (ent.managed && ent.appModules) return [...ent.appModules].sort();
    const out: string[] = [];
    for (const m of MODULES) {
        if (!ent.modules.has(m.key)) continue;
        if (m.alwaysOn) { out.push(m.key); continue; }
        if (m.permissions?.length) {
            let holds = false;
            for (const k of ent.permissions.keys()) if (moduleOfPermission(k)?.key === m.key) { holds = true; break; }
            if (holds) out.push(m.key);
        } else if (!m.legacyGates?.length) {
            out.push(m.key); // never had a gate
        } else if (m.legacyGates.some((g) => roleMayOpenWith(role, PROXY_PERMS[role] ?? [], g.prefix))) {
            out.push(m.key);
        }
    }
    return out.sort();
}

// ── path → module (longest prefix wins; fixes the '/opd' vs '/opd-manager' ordering quirk of ROLE_ROUTES) ──
const PAGE_PREFIXES: { prefix: string; module: ModuleDef }[] = MODULES
    .flatMap((m) => m.routePrefixes.filter((p) => !p.startsWith('/api')).map((prefix) => ({ prefix, module: m })))
    .sort((a, b) => b.prefix.length - a.prefix.length);

export function moduleForPath(pathname: string): ModuleDef | undefined {
    for (const { prefix, module } of PAGE_PREFIXES) {
        if (pathname === prefix || pathname.startsWith(prefix + '/')) return module;
    }
    return undefined;
}

/** May a user with these claims open this page? Paths outside every module (login, public, realms) are not gated here. */
export function claimsAllowPath(claims: Pick<AccessClaims, 'mods'>, pathname: string): boolean {
    const mod = moduleForPath(pathname);
    if (!mod || mod.alwaysOn) return true;
    return claims.mods.includes(mod.key);
}

// ── navigation ──
// Keeps each role's familiar layout, removes entries for modules the user does not hold, and adds one launcher
// entry for every held module the role's own menu never mentioned. Replaces NAV_BY_ROLE in Phase 4.
const MORE_APPS_TITLE = 'More Apps';

export function buildNav(role: string, claims: Pick<AccessClaims, 'mods'>): LegacyNavSection[] {
    const holds = (href: string) => {
        const m = moduleForPath(href);
        return !m || m.alwaysOn || claims.mods.includes(m.key);
    };
    const base = (LEGACY_NAV_BY_ROLE[role] ?? [])
        .map((sec) => ({ title: sec.title, items: sec.items.filter((i) => holds(i.href)) }))
        .filter((sec) => sec.items.length > 0);

    const shown = new Set(base.flatMap((s) => s.items.map((i) => moduleForPath(i.href)?.key)).filter(Boolean) as string[]);
    const extra = [];
    for (const key of claims.mods) {
        const mod = MODULES.find((m) => m.key === key);
        if (!mod || mod.alwaysOn || shown.has(key)) continue;
        // first nav entry any role's menu has for this module = its landing page
        const entry = Object.values(LEGACY_NAV_BY_ROLE).flatMap((secs) => secs.flatMap((s) => s.items)).find((i) => moduleForPath(i.href)?.key === key);
        if (entry) extra.push(entry);
    }
    if (extra.length) base.push({ title: MORE_APPS_TITLE, items: extra });
    return base;
}

export { LEGACY_MY_WORKSPACE };

/** Same version and same module set ⇒ re-minting the token would change nothing. */
export function sameClaims(a: Pick<AccessClaims, 'mv' | 'mods'> | null | undefined, b: Pick<AccessClaims, 'mv' | 'mods'> | null | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.mv === b.mv && a.mods.length === b.mods.length && [...a.mods].sort().join('|') === [...b.mods].sort().join('|');
}
