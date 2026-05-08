import { NextRequest, NextResponse } from 'next/server';
import { getSession, createSession } from '@/app/lib/session';
import { prisma } from '@/backend/db';

/**
 * Admin Impersonation — creates a real session for any user in the org
 * without requiring their password. Only accessible by admin role.
 *
 * POST /api/admin/impersonate
 * Body: { user_id: string }
 * Returns: { redirect_url: string } — frontend opens this in new tab
 */

const ROLE_REDIRECT: Record<string, string> = {
    receptionist:   '/reception',
    doctor:         '/doctor/dashboard',
    lab_technician: '/lab/technician',
    pharmacist:     '/pharmacy/billing',
    finance:        '/finance/dashboard',
    ipd_manager:    '/ipd',
    nurse:          '/nurse/dashboard',
    opd_manager:    '/opd-manager/dashboard',
    hr:             '/hr/dashboard',
    coordinator:    '/doctor/pending-approvals',
    admin:          '/admin/dashboard',
};

export async function POST(request: NextRequest) {
    // 1. Verify caller is admin
    const adminSession = await getSession();
    if (!adminSession || adminSession.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
        return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    // 2. Fetch target user — must be in same org
    const user = await (prisma.user.findFirst as any)({
        where: {
            id: user_id,
            organizationId: adminSession.organization_id,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.is_active) {
        return NextResponse.json({ error: 'User account is inactive' }, { status: 403 });
    }

    // 3. Fetch org details
    const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
    });

    if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // 4. Create session for target user
    const sessionData = {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name || '',
        specialty: user.specialty || null,
        organization_id: org.id,
        organization_slug: org.slug,
        organization_name: org.name,
    };

    await createSession(sessionData);

    // 5. Audit log
    await prisma.system_audit_logs.create({
        data: {
            user_id: adminSession.id,
            username: adminSession.username,
            role: adminSession.role,
            action: 'ADMIN_IMPERSONATE',
            module: 'admin',
            entity_type: 'user',
            entity_id: user.id,
            details: JSON.stringify({
                impersonated_user: user.username,
                impersonated_role: user.role,
                admin: adminSession.username,
            }),
            organizationId: adminSession.organization_id,
        },
    });

    const redirectUrl = ROLE_REDIRECT[user.role] || '/';

    return NextResponse.json({ success: true, redirect_url: redirectUrl, role: user.role });
}
