import { NextRequest, NextResponse } from 'next/server';
import { requireRoleAndTenant, ForbiddenError, AuthError } from '@/backend/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/audit-logs
 * Admin-only audit log viewer. Non-admins receive 403 here; the /admin/audit-logs
 * PAGE additionally redirects non-admins (defense in depth).
 *
 * Query params: limit, offset, action, module, entityType, from (ISO), to (ISO).
 */
export async function GET(request: NextRequest) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(['admin']);
        const sp = request.nextUrl.searchParams;

        const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);
        const offset = Math.max(Number(sp.get('offset')) || 0, 0);

        const where: Record<string, unknown> = { organizationId };
        if (sp.get('action')) where.action = sp.get('action');
        if (sp.get('module')) where.module = sp.get('module');
        if (sp.get('entityType')) where.entity_type = sp.get('entityType');
        const from = sp.get('from');
        const to = sp.get('to');
        if (from || to) {
            where.created_at = {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
            };
        }

        const [rows, total] = await Promise.all([
            db.system_audit_logs.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset,
            }),
            db.system_audit_logs.count({ where }),
        ]);

        const logs = rows.map((r: any) => ({
            id: r.id,
            actorId: r.user_id,
            actorUsername: r.username,
            role: r.role,
            action: r.action,
            module: r.module,
            entityType: r.entity_type,
            entityId: r.entity_id,
            details: r.details,
            ipAddress: r.ip_address,
            createdAt: r.created_at.toISOString(),
        }));

        return NextResponse.json({ success: true, logs, total, limit, offset });
    } catch (error) {
        if (error instanceof ForbiddenError) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
        if (error instanceof AuthError) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Audit Logs Error:', error);
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
}
