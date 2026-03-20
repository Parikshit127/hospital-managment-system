'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

const MODULE_KEYS = ['opd', 'ipd', 'lab', 'pharmacy', 'finance', 'hr', 'insurance', 'patient_portal'] as const;
type ModuleKey = typeof MODULE_KEYS[number];

// Default configurations per module
const DEFAULT_CONFIGS: Record<string, Record<string, any>> = {
    opd: {
        slot_duration: 15,
        max_patients_per_doctor: 30,
        max_wait_minutes: 20,
        escalation_threshold: 30,
        walk_in_ratio: 20,
        token_format: 'numeric',
        auto_assign_token: true,
        vitals_mandatory: true,
        triage_mode: 'manual',
        base_consultation_fee: 500,
        followup_discount_pct: 50,
        payment_collection: 'before',
        followup_auto_schedule: false,
        prescription_print_format: 'standard',
    },
    ipd: {
        admission_approval: 'auto',
        default_deposit_amount: 10000,
        deposit_mandatory: true,
        auto_bed_assignment: false,
        discharge_billing_clearance: true,
        discharge_checklist: [
            { step: 'Doctor Clearance', required: true },
            { step: 'Billing Finalization', required: true },
            { step: 'Pharmacy Check', required: true },
            { step: 'Discharge Summary', required: true },
            { step: 'Patient Feedback', required: false },
        ],
        nurse_patient_ratio: { General: '1:6', ICU: '1:2', NICU: '1:1' },
        vitals_interval_minutes: { General: 480, ICU: 60, Critical: 30 },
        visiting_hours: { start: '16:00', end: '18:00' },
        max_visitors: 2,
    },
    lab: {
        sample_barcode_prefix: 'LAB',
        result_approval_workflow: 'direct',
        tat_stat_minutes: 60,
        tat_urgent_minutes: 240,
        tat_routine_minutes: 1440,
        tat_breach_alert: true,
        critical_value_auto_alert: true,
        critical_alert_channels: ['in_app'],
        qc_schedule_enabled: false,
        reagent_reorder_alert: true,
        report_header_enabled: true,
        pathologist_signature: true,
    },
    pharmacy: {
        fifo_enforcement: true,
        max_days_supply: 90,
        drug_interaction_check: true,
        generic_substitution: 'auto_suggest',
        expiry_alert_days: [90, 60, 30],
        auto_quarantine_expired: true,
        default_markup_pct: 15,
        max_discount_by_role: { admin: 25, pharmacist: 10, receptionist: 5 },
        controlled_substance_log: true,
        po_auto_approve_below: 5000,
        po_require_approval_above: 5000,
        min_stock_alert: true,
    },
    finance: {
        fiscal_year_start: 'April',
        invoice_prefix: 'INV',
        invoice_number_reset: 'yearly',
        rounding_rule: 'nearest_1',
        decimal_places: 2,
        payment_methods: ['cash', 'card', 'upi', 'insurance'],
        tax_display: 'inclusive',
        discount_authority: { admin: 25, finance: 15, receptionist: 5, doctor: 10 },
        concession_categories: ['BPL', 'Staff', 'Senior Citizen', 'Freedom Fighter'],
        deposit_by_type: { General: 5000, ICU: 25000, Surgery: 50000 },
        late_payment_penalty_pct: 0,
        dunning_enabled: true,
        receipt_print_format: 'standard',
    },
    hr: {
        shift_types: ['Morning', 'Afternoon', 'Night'],
        leave_types: ['Casual', 'Sick', 'Earned', 'Maternity', 'Paternity'],
        attendance_mode: 'manual',
        overtime_enabled: false,
    },
    insurance: {
        pre_auth_required: true,
        claim_auto_submit: false,
        package_rate_enabled: true,
        followup_reminder_days: 7,
    },
    patient_portal: {
        self_booking_enabled: true,
        lab_results_visible: true,
        prescription_visible: true,
        billing_visible: true,
        feedback_enabled: true,
        health_assessment_enabled: true,
    },
};

export async function getModuleConfig(moduleKey: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        let config = await db.moduleConfig.findFirst({
            where: { module_key: moduleKey },
        });

        if (!config) {
            config = await db.moduleConfig.create({
                data: {
                    organizationId,
                    module_key: moduleKey,
                    enabled: true,
                    config_json: DEFAULT_CONFIGS[moduleKey] || {},
                },
            });
        }

        return { success: true, data: config };
    } catch (error: any) {
        console.error('getModuleConfig error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateModuleConfig(moduleKey: string, configData: Record<string, any>) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const existing = await db.moduleConfig.findFirst({
            where: { module_key: moduleKey },
        });

        let config;
        if (existing) {
            config = await db.moduleConfig.update({
                where: { id: existing.id },
                data: {
                    config_json: configData,
                    updated_at: new Date(),
                },
            });
        } else {
            config = await db.moduleConfig.create({
                data: {
                    organizationId,
                    module_key: moduleKey,
                    enabled: true,
                    config_json: configData,
                },
            });
        }

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'UPDATE_MODULE_CONFIG',
                module: 'admin',
                entity_type: 'ModuleConfig',
                entity_id: config.id,
                details: `Updated ${moduleKey} module configuration`,
                organizationId,
            },
        });

        revalidatePath('/admin');
        return { success: true, data: config };
    } catch (error: any) {
        console.error('updateModuleConfig error:', error);
        return { success: false, error: error.message };
    }
}

export async function toggleModule(moduleKey: string, enabled: boolean) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const existing = await db.moduleConfig.findFirst({
            where: { module_key: moduleKey },
        });

        let config;
        if (existing) {
            config = await db.moduleConfig.update({
                where: { id: existing.id },
                data: { enabled },
            });
        } else {
            config = await db.moduleConfig.create({
                data: {
                    organizationId,
                    module_key: moduleKey,
                    enabled,
                    config_json: DEFAULT_CONFIGS[moduleKey] || {},
                },
            });
        }

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: enabled ? 'ENABLE_MODULE' : 'DISABLE_MODULE',
                module: 'admin',
                entity_type: 'ModuleConfig',
                entity_id: config.id,
                details: `${enabled ? 'Enabled' : 'Disabled'} ${moduleKey} module`,
                organizationId,
            },
        });

        revalidatePath('/admin');
        return { success: true, data: config };
    } catch (error: any) {
        console.error('toggleModule error:', error);
        return { success: false, error: error.message };
    }
}

export async function getAllModuleStatuses() {
    try {
        const { db } = await requireTenantContext();

        const configs = await db.moduleConfig.findMany({
            select: { module_key: true, enabled: true },
        });

        // Fill in defaults for missing modules
        const statusMap: Record<string, boolean> = {};
        for (const key of MODULE_KEYS) {
            const existing = configs.find((c: any) => c.module_key === key);
            statusMap[key] = existing ? existing.enabled : true;
        }

        return { success: true, data: statusMap };
    } catch (error: any) {
        console.error('getAllModuleStatuses error:', error);
        return { success: false, error: error.message };
    }
}

export async function resetModuleConfig(moduleKey: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const existing = await db.moduleConfig.findFirst({
            where: { module_key: moduleKey },
        });

        const defaultConfig = DEFAULT_CONFIGS[moduleKey] || {};

        let config;
        if (existing) {
            config = await db.moduleConfig.update({
                where: { id: existing.id },
                data: { config_json: defaultConfig },
            });
        } else {
            config = await db.moduleConfig.create({
                data: {
                    organizationId,
                    module_key: moduleKey,
                    enabled: true,
                    config_json: defaultConfig,
                },
            });
        }

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'RESET_MODULE_CONFIG',
                module: 'admin',
                entity_type: 'ModuleConfig',
                entity_id: config.id,
                details: `Reset ${moduleKey} module to default configuration`,
                organizationId,
            },
        });

        revalidatePath('/admin');
        return { success: true, data: config };
    } catch (error: any) {
        console.error('resetModuleConfig error:', error);
        return { success: false, error: error.message };
    }
}
