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

export async function getAuditLogs(page: number = 1, limit: number = 50, filters?: {
    module?: string;
    action?: string;
    username?: string;
    entity_id?: string;
    entity_type?: string;
    from?: string;
    to?: string;
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
        
        if (filters?.from || filters?.to) {
            where.created_at = {};
            if (filters?.from) {
                where.created_at.gte = new Date(filters.from);
            }
            if (filters?.to) {
                const toDate = new Date(filters.to);
                toDate.setHours(23, 59, 59, 999);
                where.created_at.lte = toDate;
            }
        }

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

/**
 * Verify the caller may view the underlying entity, MIRRORING the access the
 * existing record-level gate grants — never a new/looser permission model.
 * Unknown entity types default-deny so this can't become "read any entity's
 * audit history by ID".
 */
async function canViewEntity(db: any, entityType: string, entityId: string): Promise<boolean> {
    switch (entityType) {
        case 'invoice': {
            // Mirrors getInvoiceDetail (finance-actions.ts): an invoice is visible
            // to any authenticated user whose org owns it. `invoices` is tenant-
            // scoped, so this findFirst is auto-filtered to the caller's org.
            // Audit rows key on invoice_number, so match on that.
            const invoice = await db.invoices.findFirst({
                where: { invoice_number: entityId },
                select: { id: true },
            });
            return Boolean(invoice);
        }
        default:
            return false;
    }
}

/**
 * Entity-scoped audit history (e.g. one invoice's changes) for inline display.
 * Available to any authenticated user, org-scoped, but ONLY after confirming
 * the caller can view the underlying entity (see canViewEntity). This is the
 * non-admin counterpart to the admin-only getAuditLogs full-trail viewer.
 */
export async function getEntityAuditLogs(entityType: string, entityId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        if (!entityType || !entityId) {
            return { success: false, data: [], error: 'entityType and entityId are required' };
        }

        const allowed = await canViewEntity(db, entityType, entityId);
        if (!allowed) {
            return { success: false, data: [], error: 'Not authorized' };
        }

        const data = await db.system_audit_logs.findMany({
            where: { organizationId, entity_type: entityType, entity_id: entityId },
            orderBy: { created_at: 'desc' },
            take: 100,
        });

        return { success: true, data };
    } catch (error: any) {
        console.error('getEntityAuditLogs error:', error);
        return { success: false, data: [], error: error.message };
    }
}
