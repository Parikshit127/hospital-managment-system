import { getSession, type SessionData } from '@/app/lib/session';
import { AuthError, ForbiddenError } from '@/backend/tenant';
import { prisma, getTenantPrisma } from '@/backend/db';
import { getAccessEngineMode, getCompanyIdForOrg, type AccessEngineMode } from '@/app/lib/feature-flags';
import type { DataScope } from '../modules/types';
import { getEntitlements } from './entitlements';
import { can, type Entitlements } from './resolve';
import { scopeWhere } from './scope';
import { reportIds } from './scope-db';

/**
 * The single server-side guard for the new access model — docs/COMPANY_OS_PLAN.md §7.3.
 *
 *   const { db, session, organizationId, scope, where } = await requireAccess('hr.leave.approve', {
 *       legacy: () => oldCheck(),          // the guard this call site used before; throws to deny
 *   });
 *
 * Behaviour by the unit's `access_engine` flag (default `legacy`):
 *
 *   legacy   the OLD check decides. The new engine is not consulted at all (no extra queries, no new failure modes).
 *   shadow   the OLD check still decides. The new engine is evaluated too and every disagreement is written to
 *            access_shadow_logs — this is how we learn who would be affected before anything is enforced.
 *   enforce  the NEW engine decides. Users the backfill has not provisioned yet fall back to the old check, so a
 *            half-migrated company can never be locked out.
 *
 * In every mode only a STAFF session is accepted (patient / investor / dev-portal / superadmin cookies are not).
 */

export interface AccessOptions {
    /** The check this call site used before; throws (any error) to deny. Omitted ⇒ "any staff member". */
    legacy?: () => Promise<unknown> | unknown;
    /** Label recorded with shadow disagreements (defaults to the permission key). */
    target?: string;
}

export interface AccessContext {
    db: ReturnType<typeof getTenantPrisma>;
    session: SessionData;
    organizationId: string;
    mode: AccessEngineMode;
    /** Resolved entitlements — null in legacy mode (not consulted). */
    ent: Entitlements | null;
    /** Scope the permission is held at under the new engine; 'UNIT' while the old check decides. */
    scope: DataScope;
    /** Extra Prisma `where` implied by `scope` for a model. `{}` unless the new engine is enforcing. */
    where: (model: string) => Record<string, unknown>;
}

const SHADOW_THROTTLE_MS = 5 * 60_000;
const shadowSeen = new Map<string, number>();

async function recordShadow(row: { companyId: string | null; userId: string; permission: string; target: string; legacy: boolean; next: boolean }) {
    if (!row.companyId) return; // access_shadow_logs.company_id is required; nothing to attribute it to
    const k = `${row.userId}|${row.permission}|${row.legacy}|${row.next}`;
    const last = shadowSeen.get(k) ?? 0;
    if (Date.now() - last < SHADOW_THROTTLE_MS) return;
    shadowSeen.set(k, Date.now());
    if (shadowSeen.size > 5000) shadowSeen.clear();
    try {
        await prisma.accessShadowLog.create({
            data: { company_id: row.companyId, user_id: row.userId, permission: row.permission, target: row.target, legacy: row.legacy, next: row.next },
        });
    } catch {
        /* shadow logging must never affect the request */
    }
}

export async function requireAccess(permission: string, opts: AccessOptions = {}): Promise<AccessContext> {
    const session = await getSession();
    if (!session?.organization_id || !session.id) throw new AuthError();
    const unitId = session.organization_id;
    const db = getTenantPrisma(unitId);

    const companyId = await getCompanyIdForOrg(unitId);
    const mode = await getAccessEngineMode(unitId, companyId);

    // Run the old check first, remembering — not yet throwing — its verdict.
    let legacyError: unknown = null;
    if (opts.legacy) {
        try { await opts.legacy(); } catch (e) { legacyError = e; }
    }
    const legacyAllowed = legacyError === null;

    const legacyCtx = (ent: Entitlements | null): AccessContext => ({
        db, session, organizationId: unitId, mode, ent, scope: 'UNIT', where: () => ({}),
    });

    if (mode === 'legacy') {
        if (legacyError) throw legacyError;
        return legacyCtx(null);
    }

    let ent: Entitlements | null = null;
    try {
        ent = await getEntitlements(session.id, unitId);
    } catch (e) {
        if (mode === 'shadow') {
            if (legacyError) throw legacyError;
            return legacyCtx(null); // engine hiccup in shadow: invisible to the user
        }
        console.error('[access] entitlement load failed in enforce mode', e);
        throw legacyError ?? new ForbiddenError('FORBIDDEN_ERROR: access could not be verified');
    }

    const heldScope = can(ent, permission);

    if (mode === 'shadow') {
        if ((heldScope !== null) !== legacyAllowed) {
            await recordShadow({
                companyId: ent.companyId ?? companyId, userId: session.id, permission,
                target: opts.target ?? permission, legacy: legacyAllowed, next: heldScope !== null,
            });
        }
        if (legacyError) throw legacyError;
        return legacyCtx(ent);
    }

    // enforce
    if (!ent.provisioned) {
        // Not backfilled yet: do not lock the user out — the old check still decides.
        if (opts.legacy) {
            if (legacyError) throw legacyError;
            return legacyCtx(ent);
        }
        throw new ForbiddenError('FORBIDDEN_ERROR: access is not provisioned for this user yet');
    }
    if (heldScope === null) throw new ForbiddenError(`FORBIDDEN_ERROR: ${permission} required`);

    const ctx = {
        unitId, companyId: ent.companyId, employeeId: ent.employeeId, departmentId: ent.departmentId,
        teamEmployeeIds: heldScope === 'TEAM' && ent.employeeId != null ? await reportIds(ent.employeeId) : undefined,
    };
    return {
        db, session, organizationId: unitId, mode, ent, scope: heldScope,
        where: (model: string) => scopeWhere(ctx, heldScope, model),
    };
}

/**
 * "Me, as an employee" — for My Workspace actions. Staff session only; never consults permissions
 * (ess.self.* is implicit for every active employee) and never creates an Employee row.
 */
export async function requireSelf(): Promise<{ db: ReturnType<typeof getTenantPrisma>; session: SessionData; organizationId: string; employeeId: number }> {
    const session = await getSession();
    if (!session?.organization_id || !session.id) throw new AuthError();
    const employee = await prisma.employee.findFirst({ where: { user_id: session.id }, select: { id: true, is_active: true } });
    if (!employee || !employee.is_active) throw new ForbiddenError('FORBIDDEN_ERROR: no active employee profile');
    return { db: getTenantPrisma(session.organization_id), session, organizationId: session.organization_id, employeeId: employee.id };
}
