'use server';

import { requireTenantContext, requireRoleAndTenant, ForbiddenError, AuthError } from '@/backend/tenant';

// Log an audit event
export async function logAuditEvent(params: {
    userId?: string;
    username?: string;
    role?: string;
    action: string;
    module: string;
    entityType?: string;
    entityId?: string;
    details?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        await db.system_audit_logs.create({
            data: {
                user_id: params.userId,
                username: params.username,
                role: params.role,
                action: params.action,
                module: params.module,
                entity_type: params.entityType,
                entity_id: params.entityId,
                details: params.details,
                organizationId,
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error('logAuditEvent error:', error);
        return { success: false, error: error.message };
    }
}

// Get paginated audit logs
export async function getAuditLogs(page: number = 1, limit: number = 50, filters?: {
    module?: string;
    action?: string;
    username?: string;
    entity_id?: string;
    entity_type?: string;
}) {
    try {
        // Admin-only. system_audit_logs is not auto-tenant-scoped, so we must
        // filter organizationId explicitly to prevent cross-org leakage.
        const { db, organizationId } = await requireRoleAndTenant(['admin']);

        const where: any = { organizationId };
        if (filters?.module) where.module = filters.module;
        if (filters?.action) where.action = { contains: filters.action, mode: 'insensitive' };
        if (filters?.username) where.username = { contains: filters.username, mode: 'insensitive' };
        if (filters?.entity_id) where.entity_id = filters.entity_id;
        if (filters?.entity_type) where.entity_type = filters.entity_type;

        const [logs, total] = await Promise.all([
            db.system_audit_logs.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            db.system_audit_logs.count({ where })
        ]);

        return {
            success: true,
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error: any) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, error: 'Not authorized' };
        }
        console.error('getAuditLogs error:', error);
        return { success: false, error: error.message };
    }
}

// Get audit stats
export async function getAuditStats() {
    try {
        // Admin-only + org-scoped (see getAuditLogs).
        const { db, organizationId } = await requireRoleAndTenant(['admin']);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalToday, totalAll, loginCount] = await Promise.all([
            db.system_audit_logs.count({ where: { organizationId, created_at: { gte: today } } }),
            db.system_audit_logs.count({ where: { organizationId } }),
            db.system_audit_logs.count({ where: { organizationId, action: 'LOGIN', created_at: { gte: today } } })
        ]);

        return {
            success: true,
            data: { totalToday, totalAll, loginCount }
        };
    } catch (error: any) {
        if (error instanceof ForbiddenError || error instanceof AuthError) {
            return { success: false, error: 'Not authorized' };
        }
        console.error('getAuditStats error:', error);
        return { success: false, error: error.message };
    }
}
