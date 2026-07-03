import { getDevPortalSession, type DevPortalSessionData } from '@/app/lib/session';
import { prisma, getTenantPrisma } from '@/backend/db';
import { AuthError, ForbiddenError } from '@/backend/tenant';

/**
 * Dev Admin / Developer portal authorization guards.
 *
 * These enforce the SECOND, independent layer of the Dev Admin portal gate
 * (PRD Addendum v3 §6 / OQ-7): even a valid `dev_portal_session` cookie must
 * pass a DB re-check on every request. The cookie only proves "someone logged
 * into the portal recently"; the database `is_dev_admin` / `is_developer` flags
 * are the authoritative source of truth and are re-read here so that revoking a
 * user's access takes effect immediately, not after the token expires.
 *
 * This is a plain server-only module (NOT `'use server'`) — like backend/tenant.ts —
 * because it returns a non-serializable Prisma client and must not be exposed as
 * a callable Server Action.
 */

export interface DevPortalContext {
    /** The verified portal-session claims from the `dev_portal_session` cookie. */
    session: DevPortalSessionData;
    /** The user's freshly-read DB flags (authoritative). */
    user: { id: string; is_dev_admin: boolean; is_developer: boolean; is_active: boolean; organizationId: string };
    /** Tenant-scoped Prisma client for the portal user's organization. */
    db: ReturnType<typeof getTenantPrisma>;
    organizationId: string;
}

/**
 * Base guard: requires a valid dev-portal session AND re-validates the user in
 * the DB (exists, active, still flagged for the portal). Throws AuthError if
 * the session is missing/invalid or the user is no longer a portal member.
 */
export async function requireDevPortalContext(): Promise<DevPortalContext> {
    const session = await getDevPortalSession();
    if (!session) throw new AuthError('AUTH_ERROR: No dev portal session');

    const user = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, is_dev_admin: true, is_developer: true, is_active: true, organizationId: true },
    });

    if (!user || user.is_active === false) {
        throw new AuthError('AUTH_ERROR: Dev portal user not found or disabled');
    }

    // Defense in depth: neither flag set in the DB → not a portal member anymore,
    // regardless of what the (still-valid) cookie claims.
    if (!user.is_dev_admin && !user.is_developer) {
        throw new ForbiddenError('FORBIDDEN_ERROR: Dev portal access revoked');
    }

    return {
        session,
        user,
        db: getTenantPrisma(user.organizationId),
        organizationId: user.organizationId,
    };
}

/**
 * Requires a Dev Admin (full internal tooling: all-tickets command center,
 * broadcast composer, release publishing, audit logs). Verified against the DB
 * `is_dev_admin` flag, not just the cookie.
 */
export async function requireDevAdmin(): Promise<DevPortalContext> {
    const ctx = await requireDevPortalContext();
    if (!ctx.user.is_dev_admin) {
        throw new ForbiddenError('FORBIDDEN_ERROR: Dev Admin role required');
    }
    return ctx;
}

/**
 * Requires at least Developer access (assigned-tickets scope). A Dev Admin is a
 * strict superset of a Developer, so a Dev Admin also passes this guard.
 * Verified against the DB flags.
 */
export async function requireDeveloper(): Promise<DevPortalContext> {
    const ctx = await requireDevPortalContext();
    if (!ctx.user.is_developer && !ctx.user.is_dev_admin) {
        throw new ForbiddenError('FORBIDDEN_ERROR: Developer role required');
    }
    return ctx;
}
