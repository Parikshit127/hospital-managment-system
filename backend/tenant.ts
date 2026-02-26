import { getSession, type SessionData } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export async function getTenantDb() {
    const session = await getSession();
    if (!session?.organization_id) {
        throw new Error('TENANT_SCOPE_ERROR: No organization in session');
    }
    return getTenantPrisma(session.organization_id);
}

export async function requireTenantContext(): Promise<{
    db: ReturnType<typeof getTenantPrisma>;
    session: SessionData;
    organizationId: string;
}> {
    const session = await getSession();
    if (!session) throw new Error('AUTH_ERROR: No session');
    if (!session.organization_id) throw new Error('TENANT_ERROR: No organization');

    return {
        db: getTenantPrisma(session.organization_id),
        session,
        organizationId: session.organization_id,
    };
}
