'use server';

import { prisma } from '@/backend/db';
import { createSession, getSession } from '@/app/lib/session';

export interface SwitchableUnit {
    id: string;
    name: string;
    code: string;
    isCurrent: boolean;
    isHome: boolean;
}

/**
 * Units = Organizations created from the Super Admin panel. The admin portal lets
 * an admin hop between the units they have been granted without a logout/login.
 * Admin-portal only: every call re-checks the live session role and the DB grants,
 * never trusts the client. The signed-in user never changes on a switch, only the
 * organization the session is scoped to.
 */
async function requireAdminSession() {
    const session = await getSession();
    if (!session || session.role !== 'admin') return null;
    return session;
}

/**
 * Units this admin may enter: the home unit (where the user record lives) plus
 * explicit grants, or every active unit when `can_access_all_units` is set.
 * Resolved from the DB on each call so revoking access takes effect immediately.
 */
async function resolveAccessibleUnits(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            is_active: true,
            role: true,
            organizationId: true,
            can_access_all_units: true,
            unit_access: { select: { organizationId: true } },
        },
    });
    if (!user || !user.is_active || user.role !== 'admin') return null;

    const allowedIds = new Set([user.organizationId, ...user.unit_access.map(a => a.organizationId)]);
    const orgs = await prisma.organization.findMany({
        where: {
            is_active: true,
            ...(user.can_access_all_units ? {} : { id: { in: [...allowedIds] } }),
        },
        select: { id: true, name: true, code: true, slug: true },
        orderBy: { name: 'asc' },
    });

    return { homeOrganizationId: user.organizationId, orgs };
}

export async function getSwitchableUnits(): Promise<SwitchableUnit[]> {
    const session = await requireAdminSession();
    if (!session) return [];

    const resolved = await resolveAccessibleUnits(session.id);
    if (!resolved) return [];

    return resolved.orgs.map(o => ({
        id: o.id,
        name: o.name.replace(/\s+/g, ' ').trim(),
        code: o.code,
        isCurrent: o.id === session.organization_id,
        isHome: o.id === resolved.homeOrganizationId,
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

    const resolved = await resolveAccessibleUnits(session.id);
    const org = resolved?.orgs.find(o => o.id === targetOrganizationId);
    if (!org) {
        return { success: false, error: 'You do not have access to this unit' };
    }

    const fromUnit = { name: session.organization_name, id: session.organization_id };

    // Same user, different unit: identity fields come from the current session untouched.
    await createSession({
        ...session,
        organization_id: org.id,
        organization_slug: org.slug,
        organization_name: org.name,
    });

    // Record on both sides so each unit's trail shows who entered/left.
    const details = JSON.stringify({
        from_unit: fromUnit.name,
        from_unit_id: fromUnit.id,
        to_unit: org.name,
        to_unit_id: org.id,
        admin: session.username,
    });
    await prisma.system_audit_logs.createMany({
        data: [fromUnit.id, org.id].map(organizationId => ({
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
