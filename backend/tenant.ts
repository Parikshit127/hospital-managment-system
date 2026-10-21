import { getSession, getPatientSession, getDevPortalSession, type SessionData, type PatientSessionData } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export class AuthError extends Error {
    constructor(message = 'AUTH_ERROR: No session') {
        super(message);
        this.name = 'AuthError';
    }
}

export class ForbiddenError extends Error {
    constructor(message = 'FORBIDDEN_ERROR: Access denied') {
        super(message);
        this.name = 'ForbiddenError';
    }
}

export async function getTenantDb() {
    let session: any = await getSession();
    if (!session) session = await getPatientSession();
    
    if (!session?.organization_id) {
        throw new Error('TENANT_SCOPE_ERROR: No organization in session');
    }
    return getTenantPrisma(session.organization_id);
}

export async function requireTenantContext(): Promise<{
    db: ReturnType<typeof getTenantPrisma>;
    session: any;
    organizationId: string;
}> {
    let session: any = await getSession();
    if (!session) {
        session = await getPatientSession();
    }

    if (!session) throw new AuthError();
    if (!session.organization_id) throw new Error('TENANT_ERROR: No organization');

    return {
        db: getTenantPrisma(session.organization_id),
        session,
        organizationId: session.organization_id,
    };
}

/**
 * Staff-only tenant context: like requireTenantContext() but WITHOUT the patient-session
 * fallback, so a patient logged into the portal cannot satisfy it by POSTing a server
 * action id directly. Still authentication only — pair it with a role/permission check
 * (requireRoleAndTenant, or requireAccess once the access engine ships).
 *
 * Additive: nothing calls this yet. Adopt it in staff-only actions module by module;
 * see docs/COMPANY_OS_PLAN.md Phase 0 / Phase 3.
 */
export async function requireStaffContext(): Promise<{
    db: ReturnType<typeof getTenantPrisma>;
    session: SessionData;
    organizationId: string;
}> {
    const session = await getSession();
    if (!session) throw new AuthError();
    if (!session.organization_id) throw new Error('TENANT_ERROR: No organization');

    return {
        db: getTenantPrisma(session.organization_id),
        session,
        organizationId: session.organization_id,
    };
}

/**
 * Session-agnostic tenant context: accepts a hospital staff session, a patient
 * session, OR a dev-portal session. Use this for shared, non-privileged actions
 * that are legitimately reached from BOTH the hospital app and the Dev Portal
 * (e.g. minting an attachment signed URL, listing branches) — where a Dev Admin
 * authenticated only via `dev_portal_session` has no hospital `session` cookie
 * and would otherwise hit a spurious AuthError from requireTenantContext().
 *
 * This only broadens *authentication*; it is not an authorization check. Actions
 * that must be Dev-Admin-only still use requireDevAdmin()/requireDeveloper().
 */
export async function requireAnyTenantContext(): Promise<{
    db: ReturnType<typeof getTenantPrisma>;
    session: any;
    organizationId: string;
}> {
    let session: any = await getSession();
    if (!session) session = await getPatientSession();
    if (!session) session = await getDevPortalSession();

    if (!session) throw new AuthError();
    if (!session.organization_id) throw new Error('TENANT_ERROR: No organization');

    return {
        db: getTenantPrisma(session.organization_id),
        session,
        organizationId: session.organization_id,
    };
}

export async function requireRoleAndTenant(allowedRoles: string[]): Promise<{
    db: ReturnType<typeof getTenantPrisma>;
    session: SessionData;
    organizationId: string;
}> {
    const ctx = await requireTenantContext();
    if (allowedRoles.length > 0 && !allowedRoles.includes(ctx.session.role)) {
        throw new ForbiddenError(`FORBIDDEN_ERROR: Role '${ctx.session.role}' not permitted`);
    }
    return ctx;
}
