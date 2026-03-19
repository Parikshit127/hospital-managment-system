'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function getDunningRules() {
    try {
        const { db } = await requireTenantContext();
        const rules = await db.dunningRule.findMany({
            orderBy: { days_overdue: 'asc' },
        });
        return { success: true, data: serialize(rules) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createDunningRule(data: {
    rule_name: string;
    days_overdue: number;
    action_type: string;
    template_text: string;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();
        const rule = await db.dunningRule.create({
            data: {
                rule_name: data.rule_name,
                days_overdue: data.days_overdue,
                action_type: data.action_type,
                template_text: data.template_text,
                is_active: data.is_active ?? true,
            },
        });
        return { success: true, data: serialize(rule) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateDunningRule(id: number, data: { is_active?: boolean; template_text?: string }) {
    try {
        const { db } = await requireTenantContext();
        const rule = await db.dunningRule.update({
            where: { id },
            data,
        });
        return { success: true, data: serialize(rule) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getOverdueInvoices() {
    try {
        const { db } = await requireTenantContext();

        const invoices = await db.invoices.findMany({
            where: {
                status: { in: ['Final', 'Partial'] },
                balance_due: { gt: 0 },
            },
            include: {
                patient: { select: { full_name: true, phone: true, email: true } },
            },
            orderBy: { created_at: 'asc' },
        });

        const now = new Date();
        const overdueInvoices = invoices
            .map((inv: any) => {
                const daysOverdue = Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / 86400000);
                return { ...inv, daysOverdue };
            })
            .filter((inv: any) => inv.daysOverdue > 0)
            .sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);

        return { success: true, data: serialize(overdueInvoices) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function executeDunning() {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Get active rules
        const rules = await db.dunningRule.findMany({
            where: { is_active: true },
            orderBy: { days_overdue: 'asc' },
        });

        if (rules.length === 0) return { success: false, error: 'No active dunning rules configured' };

        // Get overdue invoices
        const invoices = await db.invoices.findMany({
            where: {
                status: { in: ['Final', 'Partial'] },
                balance_due: { gt: 0 },
            },
            include: {
                patient: { select: { full_name: true, phone: true } },
            },
        });

        const now = new Date();
        let actionsCreated = 0;

        for (const inv of invoices) {
            const daysOverdue = Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / 86400000);
            if (daysOverdue <= 0) continue;

            // Find applicable rule (highest days_overdue that is <= actual days overdue)
            const applicableRule = rules
                .filter((r: any) => daysOverdue >= r.days_overdue)
                .pop();

            if (!applicableRule) continue;

            // Check if we already dunned this invoice with this rule recently (within 7 days)
            const recentDunning = await db.dunningLog.findFirst({
                where: {
                    invoice_id: inv.id,
                    rule_id: applicableRule.id,
                    created_at: { gte: new Date(now.getTime() - 7 * 86400000) },
                },
            });

            if (recentDunning) continue;

            // Create dunning log
            await db.dunningLog.create({
                data: {
                    invoice_id: inv.id,
                    rule_id: applicableRule.id,
                    patient_id: inv.patient_id,
                    action_taken: `${applicableRule.action_type}: ${applicableRule.template_text}`,
                    status: 'Sent',
                },
            });

            // Create notification if applicable
            if (applicableRule.action_type === 'notification') {
                try {
                    await db.notification.create({
                        data: {
                            title: `Payment Reminder: ${inv.invoice_number}`,
                            message: applicableRule.template_text.replace('{amount}', String(inv.balance_due)).replace('{days}', String(daysOverdue)),
                            type: 'payment_reminder',
                            priority: daysOverdue > 60 ? 'high' : 'medium',
                            userId: inv.patient_id,
                        },
                    });
                } catch {
                    // Notification creation is best-effort
                }
            }

            actionsCreated++;
        }

        return { success: true, data: { actionsCreated } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDunningLog(filters?: { invoice_id?: number; patient_id?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.invoice_id) where.invoice_id = filters.invoice_id;
        if (filters?.patient_id) where.patient_id = filters.patient_id;

        const logs = await db.dunningLog.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 200,
        });
        return { success: true, data: serialize(logs) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
