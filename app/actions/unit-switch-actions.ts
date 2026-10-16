'use server';

import { prisma } from '@/backend/db';
import { createSession, getSession } from '@/app/lib/session';

export interface SwitchableUnit {
    id: string;
    name: string;
    code: string;
    isCurrent: boolean;
}

/**
 * Units = Organizations created from the Super Admin panel. The admin portal lets
 * any admin hop between active units without a logout/login. Admin-portal only:
 * every call re-checks the live session role, never trusts the client.
 */
async function requireAdminSession() {
    const session = await getSession();
    if (!session || session.role !== 'admin') return null;
    return session;
}

export async function getSwitchableUnits(): Promise<SwitchableUnit[]> {
    const session = await requireAdminSession();
    if (!session) return [];

    const orgs = await prisma.organization.findMany({
        where: { is_active: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
    });

    return orgs.map(o => ({
        id: o.id,
        name: o.name.replace(/\s+/g, ' ').trim(),
        code: o.code,
        isCurrent: o.id === session.organization_id,
    }));
}

export async function switchUnit(
    targetOrganizationId: string,
): Promise<{ success: boolean; error?: string }> {
    const session = await requireAdminSession();
    if (!session) return { success: false, error: 'Unauthorized' };

    if (!targetOrganizationId || targetOrganizationId === session.organization_id) {
        return { success: false, error: 'Already in this unit' };
    }

    const org = await prisma.organization.findUnique({ where: { id: targetOrganizationId } });
    if (!org || !org.is_active) {
        return { success: false, error: 'Unit not found or inactive' };
    }

    // Session rows are keyed by a real user of the unit (audit/FK lookups depend on it),
    // so land on the unit's own admin: same username if it exists there, else the oldest.
    const admins = await prisma.user.findMany({
        where: { organizationId: org.id, role: 'admin', is_active: true },
        orderBy: { createdAt: 'asc' },
    });
    const target =
        admins.find(a => a.username.toLowerCase() === session.username.toLowerCase()) ?? admins[0];

    if (!target) {
        return { success: false, error: `${org.name} has no active admin user` };
    }

    await createSession({
        id: target.id,
        username: target.username,
        role: target.role,
        name: target.name || '',
        specialty: target.specialty || null,
        organization_id: org.id,
        organization_slug: org.slug,
        organization_name: org.name,
    });

    // Record on both sides so each unit's trail shows who entered/left.
    const details = JSON.stringify({
        from_unit: session.organization_name,
        from_unit_id: session.organization_id,
        to_unit: org.name,
        to_unit_id: org.id,
        original_admin: session.username,
        acting_as: target.username,
    });
    await prisma.system_audit_logs.createMany({
        data: [session.organization_id, org.id].map(organizationId => ({
            user_id: session.id,
            username: session.username,
            role: session.role,
            action: 'ADMIN_SWITCH_UNIT',
            module: 'admin',
            entity_type: 'organization',
            entity_id: org.id,
            details,
            organizationId,
        })),
    });

    return { success: true };
}
