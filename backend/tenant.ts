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

/**
 * Named role groups for clinical authority.
 *
 * Route guards in proxy.ts decide who may OPEN a module. They cannot express who
 * may perform a given act, and a server action is an independently reachable
 * endpoint — reaching it does not require rendering the page it was written for.
 * These groups let each action state the authority it needs.
 *
 * Split along the line real wards use: who may ORIGINATE an order versus who may
 * EXECUTE one. A nurse administers but does not prescribe; a doctor prescribes
 * and may chart; neither enters lab results.
 */
export const CLINICAL_ROLES = {
    /** Bedside documentation: vitals, nursing notes, assessments, tasks, handover. */
    CHART: ['admin', 'nurse', 'doctor', 'ipd_manager'],
    /** Give / hold / refuse a dose against an existing order. Nurses execute. */
    ADMINISTER: ['admin', 'nurse', 'ipd_manager'],
    /** Originate a medication or clinical order. Prescribing is a doctor's act. */
    PRESCRIBE: ['admin', 'doctor'],
    /** Enter or amend a laboratory result. */
    LAB_RESULT: ['admin', 'lab_technician'],
    /** Dispense medication from pharmacy stock. */
    DISPENSE: ['admin', 'pharmacist'],
    /** Discharge a patient / close an admission. */
    DISCHARGE: ['admin', 'doctor', 'ipd_manager'],
} as const;

/**
 * Same as requireRoleAndTenant but returns a typed failure instead of throwing,
 * so server actions can surface it in their existing { success, error } shape.
 * Returns null on success.
 */
export async function denyUnlessRole(
    allowedRoles: readonly string[],
    action: string,
): Promise<{ success: false; error: string } | null> {
    const session = await getSession();
    if (!session) return { success: false, error: 'Not signed in.' };
    if (!allowedRoles.includes(session.role)) {
        return {
            success: false,
            error: `Your role (${session.role}) is not permitted to ${action}.`,
        };
    }
    return null;
}
