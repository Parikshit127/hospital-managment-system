import { getSession, type SessionData } from '@/app/lib/session';
import { AuthError, ForbiddenError } from '@/backend/tenant';
import { generateProxyRolePermissions } from './legacy-maps';
import { roleMayOpenWith } from './legacy-pages';

/**
 * "Same door as the page" server-action guard (docs/COMPANY_OS_PLAN.md Phase 0).
 *
 * proxy.ts only protects page navigation; server actions are addressable by action id and
 * can be POSTed from any page. This guard re-applies, inside the action, EXACTLY the
 * decision proxy.ts makes for a route prefix today — the flat role list first, then the
 * `*.view` permission fallback — using the registry-generated copies of those maps
 * (parity-tested against proxy.ts by `npm run check:parity`).
 *
 * Why this and not requireRoleAndTenant(['admin','finance']): a stricter list would lock out
 * roles that can open the page today through the permission fallback (e.g. a doctor holding
 * `finance.view`). The point of this guard is to close the hole (patients, other realms,
 * cross-unit ids) with ZERO change for anyone who legitimately reaches the screen. Tightening
 * who may use a screen is a separate, deliberate decision (Phase 3/4).
 *
 * Staff session only — never falls back to a patient session.
 */
const PROXY_PERMISSIONS = generateProxyRolePermissions();

export function roleMayOpen(role: string, prefix: string): boolean {
    return roleMayOpenWith(role, PROXY_PERMISSIONS[role] ?? [], prefix);
}

export async function requireLegacyRouteAccess(prefix: string): Promise<{ session: SessionData; organizationId: string }> {
    const session = await getSession();
    if (!session) throw new AuthError();
    if (!session.organization_id) throw new Error('TENANT_ERROR: No organization');
    if (!roleMayOpen(session.role, prefix)) {
        throw new ForbiddenError(`FORBIDDEN_ERROR: Role '${session.role}' may not use ${prefix}`);
    }
    return { session, organizationId: session.organization_id };
}

export function isAccessDenial(e: unknown): boolean {
    return e instanceof AuthError || e instanceof ForbiddenError;
}
