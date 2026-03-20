'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

const DEFAULT_ALERT_RULES = [
    {
        category: 'clinical',
        trigger_key: 'lab_critical_value',
        name: 'Critical Lab Value',
        enabled: true,
        channels: ['in_app', 'sms'],
        recipients: { roles: ['doctor', 'admin'] },
        threshold: { operator: 'outside_range', description: 'When lab result falls outside critical range' },
    },
    {
        category: 'operational',
        trigger_key: 'bed_occupancy_high',
        name: 'High Bed Occupancy',
        enabled: true,
        channels: ['in_app'],
        recipients: { roles: ['admin', 'ipd_manager'] },
        threshold: { operator: '>', value: 85, unit: '%' },
    },
    {
        category: 'operational',
        trigger_key: 'stock_low',
        name: 'Low Medicine Stock',
        enabled: true,
        channels: ['in_app', 'email'],
        recipients: { roles: ['pharmacist', 'admin'] },
        threshold: { operator: '<', value: 10, unit: 'units' },
    },
    {
        category: 'financial',
        trigger_key: 'invoice_overdue',
        name: 'Invoice Overdue',
        enabled: true,
        channels: ['email'],
        recipients: { roles: ['finance', 'admin'] },
        threshold: { operator: '>', value: 30, unit: 'days' },
    },
    {
        category: 'operational',
        trigger_key: 'lab_tat_breach',
        name: 'Lab TAT Breach',
        enabled: true,
        channels: ['in_app'],
        recipients: { roles: ['lab_technician', 'admin'] },
        threshold: { description: 'When lab result not released within target TAT' },
    },
    {
        category: 'patient',
        trigger_key: 'appointment_reminder',
        name: 'Appointment Reminder',
        enabled: true,
        channels: ['sms', 'whatsapp'],
        recipients: { roles: [] },
        threshold: { value: 24, unit: 'hours_before' },
    },
    {
        category: 'operational',
        trigger_key: 'discharge_pending',
        name: 'Discharge Pending',
        enabled: true,
        channels: ['in_app'],
        recipients: { roles: ['finance', 'ipd_manager'] },
        threshold: { operator: '>', value: 2, unit: 'hours', description: 'Doctor cleared but billing incomplete' },
    },
    {
        category: 'staff',
        trigger_key: 'credential_expiry',
        name: 'Staff Credential Expiry',
        enabled: false,
        channels: ['email'],
        recipients: { roles: ['admin', 'hr'] },
        threshold: { value: 30, unit: 'days_before' },
    },
    {
        category: 'system',
        trigger_key: 'integration_failure',
        name: 'Integration Failure',
        enabled: true,
        channels: ['in_app', 'email'],
        recipients: { roles: ['admin'] },
        threshold: { description: 'When a third-party integration fails' },
    },
    {
        category: 'financial',
        trigger_key: 'large_discount',
        name: 'Large Discount Applied',
        enabled: true,
        channels: ['in_app'],
        recipients: { roles: ['admin', 'finance'] },
        threshold: { operator: '>', value: 20, unit: '%' },
    },
];

export async function listAlertRules() {
    try {
        const { db } = await requireTenantContext();
        const rules = await db.alertRule.findMany({
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
        });
        return { success: true, data: rules };
    } catch (error: any) {
        console.error('listAlertRules error:', error);
        return { success: false, error: error.message };
    }
}

export async function getAlertRule(ruleId: string) {
    try {
        const { db } = await requireTenantContext();
        const rule = await db.alertRule.findFirst({ where: { id: ruleId } });
        if (!rule) return { success: false, error: 'Alert rule not found' };
        return { success: true, data: rule };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateAlertRule(ruleId: string, data: {
    enabled?: boolean;
    channels?: string[];
    recipients?: any;
    threshold?: any;
    escalation?: any;
    template?: string;
    quiet_hours?: any;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const rule = await db.alertRule.update({
            where: { id: ruleId },
            data,
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'UPDATE_ALERT_RULE',
                module: 'admin',
                entity_type: 'AlertRule',
                entity_id: ruleId,
                details: `Updated alert rule: ${rule.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/notifications');
        return { success: true, data: rule };
    } catch (error: any) {
        console.error('updateAlertRule error:', error);
        return { success: false, error: error.message };
    }
}

export async function createAlertRule(data: {
    category: string;
    trigger_key: string;
    name: string;
    channels: string[];
    recipients: any;
    threshold?: any;
    escalation?: any;
    template?: string;
    quiet_hours?: any;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const rule = await db.alertRule.create({
            data: {
                organizationId,
                ...data,
            },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'CREATE_ALERT_RULE',
                module: 'admin',
                entity_type: 'AlertRule',
                entity_id: rule.id,
                details: `Created alert rule: ${data.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/notifications');
        return { success: true, data: rule };
    } catch (error: any) {
        console.error('createAlertRule error:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteAlertRule(ruleId: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const rule = await db.alertRule.findFirst({ where: { id: ruleId } });
        if (!rule) return { success: false, error: 'Alert rule not found' };

        await db.alertRule.delete({ where: { id: ruleId } });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'DELETE_ALERT_RULE',
                module: 'admin',
                entity_type: 'AlertRule',
                entity_id: ruleId,
                details: `Deleted alert rule: ${rule.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/notifications');
        return { success: true };
    } catch (error: any) {
        console.error('deleteAlertRule error:', error);
        return { success: false, error: error.message };
    }
}

export async function seedDefaultAlertRules() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const existing = await db.alertRule.count();
        if (existing > 0) {
            return { success: true, message: 'Alert rules already exist' };
        }

        for (const rule of DEFAULT_ALERT_RULES) {
            await db.alertRule.create({
                data: {
                    organizationId,
                    category: rule.category,
                    trigger_key: rule.trigger_key,
                    name: rule.name,
                    enabled: rule.enabled,
                    channels: rule.channels,
                    recipients: rule.recipients,
                    threshold: rule.threshold,
                },
            });
        }

        return { success: true, message: 'Default alert rules seeded' };
    } catch (error: any) {
        console.error('seedDefaultAlertRules error:', error);
        return { success: false, error: error.message };
    }
}

export async function toggleAlertRule(ruleId: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const rule = await db.alertRule.findFirst({ where: { id: ruleId } });
        if (!rule) return { success: false, error: 'Rule not found' };

        const updated = await db.alertRule.update({
            where: { id: ruleId },
            data: { enabled: !rule.enabled },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: updated.enabled ? 'ENABLE_ALERT' : 'DISABLE_ALERT',
                module: 'admin',
                entity_type: 'AlertRule',
                entity_id: ruleId,
                details: `${updated.enabled ? 'Enabled' : 'Disabled'} alert: ${rule.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/notifications');
        return { success: true, data: updated };
    } catch (error: any) {
        console.error('toggleAlertRule error:', error);
        return { success: false, error: error.message };
    }
}
