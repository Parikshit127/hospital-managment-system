import { prisma } from '@/backend/db';
import { mobileRoute, ok } from '@/app/lib/mobile/api';
import { requireHr } from '@/app/lib/hr/hr-core';

/** GET /api/v1/hr/devices — active phone sessions in this unit (HR with hr.edit). */
export const GET = mobileRoute(async (_req, { session }) => {
    await requireHr('edit', 'employee');
    const rows = await prisma.mobileSession.findMany({
        where: { org_id: session.organization_id, revoked_at: null, expires_at: { gt: new Date() } },
        orderBy: { last_used_at: 'desc' },
        take: 300,
        include: { user: { select: { name: true, username: true, role: true } } },
    });
    return ok(rows.map((r) => ({
        id: r.id, user: r.user.name || r.user.username, username: r.user.username, role: r.user.role,
        deviceName: r.device_name, platform: r.platform, appVersion: r.app_version,
        loginAt: r.created_at.toISOString(), lastUsedAt: r.last_used_at.toISOString(),
        loginLocation: r.login_lat != null && r.login_lng != null ? { lat: r.login_lat, lng: r.login_lng, accuracyM: r.login_accuracy_m } : null,
    })));
});
