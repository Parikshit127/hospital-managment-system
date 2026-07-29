'use server';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { getModuleConfig, updateModuleConfig } from '@/app/actions/module-config-actions';
import { logAudit } from '@/app/lib/audit';
import { readCashThresholds, CASH_COMPLIANCE_DEFAULTS } from '@/app/lib/cash-compliance';

/**
 * Read the configured cash-compliance thresholds (any authenticated user — the
 * payment flow needs them). Stored in the finance ModuleConfig (no new table).
 */
export async function getCashComplianceConfig() {
    try {
        await requireTenantContext();
        const res = await getModuleConfig('finance');
        const cfg = (res?.success && (res.data as any)?.config_json) || {};
        const thresholds = readCashThresholds(cfg);
        return {
            success: true,
            data: {
                ...thresholds,
                updated_by: cfg.cash_compliance_updated_by ?? null,
                updated_at: cfg.cash_compliance_updated_at ?? null,
            },
        };
    } catch (error: any) {
        console.error('getCashComplianceConfig error:', error);
        // Never leave the payment flow without limits — fall back to defaults.
        return { success: true, data: { ...CASH_COMPLIANCE_DEFAULTS, updated_by: null, updated_at: null } };
    }
}

/**
 * Update the cash-compliance thresholds. Finance managers / admins only.
 * Merges into the existing finance config (does not clobber other settings) and
 * writes an explicit audit entry capturing old -> new values.
 */
export async function saveCashComplianceConfig(input: { pan_threshold: number; cash_limit: number }) {
    try {
        const { session } = await requireRoleAndTenant(['admin', 'finance']);

        const pan = Math.round(Number(input.pan_threshold));
        const cash = Math.round(Number(input.cash_limit));
        if (!Number.isFinite(pan) || pan <= 0) {
            return { success: false, error: 'PAN threshold must be a positive amount.' };
        }
        if (!Number.isFinite(cash) || cash <= 0) {
            return { success: false, error: 'Maximum cash limit must be a positive amount.' };
        }
        if (pan > cash) {
            return { success: false, error: 'PAN threshold cannot exceed the maximum cash limit.' };
        }

        const existingRes = await getModuleConfig('finance');
        const current = (existingRes?.success && (existingRes.data as any)?.config_json) || {};
        const old = readCashThresholds(current);

        const merged = {
            ...current,
            pan_threshold: pan,
            cash_limit: cash,
            cash_compliance_updated_by: session.username || session.id,
            cash_compliance_updated_at: new Date().toISOString(),
        };

        const saveRes = await updateModuleConfig('finance', merged);
        if (!saveRes.success) return { success: false, error: saveRes.error || 'Failed to save settings.' };

        await logAudit({
            action: 'UPDATE_CASH_COMPLIANCE_CONFIG',
            module: 'finance',
            entity_type: 'ModuleConfig',
            entity_id: 'finance',
            details: JSON.stringify({
                old: { pan_threshold: old.pan_threshold, cash_limit: old.cash_limit },
                new: { pan_threshold: pan, cash_limit: cash },
                updated_by: session.username || session.id,
            }),
        });

        return { success: true, data: { pan_threshold: pan, cash_limit: cash } };
    } catch (error: any) {
        console.error('saveCashComplianceConfig error:', error);
        if (error?.name === 'ForbiddenError') {
            return { success: false, error: 'You are not authorized to change cash compliance settings.' };
        }
        return { success: false, error: error.message || 'Failed to save settings.' };
    }
}
