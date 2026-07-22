'use server';

/**
 * Tenant-scoped wrappers around the fixed-asset engine.
 *
 * The engine in asset-management-actions.ts already handles depreciation,
 * transfers and maintenance, but every function takes an explicit
 * organizationId and nothing in the app ever called them — only the
 * depreciation cron did. These wrappers resolve the org from the session so a
 * client screen can use them safely, and cover the case the team actually
 * asked for: a register of IT assets and housekeeping / reception items.
 */

import { requireTenantContext } from '@/backend/tenant';
import {
    createAssetCategory,
    getAssetCategories,
    createFixedAsset,
    getFixedAssets,
    updateFixedAsset,
    transferAsset,
    recordMaintenance,
    disposeAsset,
} from '@/app/actions/asset-management-actions';

function serialize<T>(v: T): T {
    return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? Number(val) : val)));
}

/** Seeded on first use so the register is usable without an accounting setup. */
const DEFAULT_CATEGORIES = [
    { category_name: 'IT Equipment', category_code: 'IT', asset_type: 'IT Equipment', depreciation_rate: 33.33, useful_life_years: 3 },
    { category_name: 'Housekeeping', category_code: 'HK', asset_type: 'Housekeeping', depreciation_rate: 20, useful_life_years: 5 },
    { category_name: 'Reception & Office', category_code: 'OFF', asset_type: 'Office Equipment', depreciation_rate: 15, useful_life_years: 7 },
    { category_name: 'Furniture & Fixtures', category_code: 'FF', asset_type: 'Furniture', depreciation_rate: 10, useful_life_years: 10 },
    { category_name: 'Medical Equipment', category_code: 'MED', asset_type: 'Medical Equipment', depreciation_rate: 15, useful_life_years: 7 },
];

export async function listAssetCategories() {
    try {
        const { organizationId } = await requireTenantContext();
        const res: any = await getAssetCategories(organizationId, { is_active: true });
        if (!res.success) return { success: false, error: res.error };

        // A brand-new tenant has no categories, which would leave the "Add
        // asset" form with an empty required dropdown. Seed the common ones
        // once rather than making the user set up accounting first.
        if (!res.categories?.length) {
            for (const c of DEFAULT_CATEGORIES) {
                await createAssetCategory({
                    organizationId,
                    ...c,
                    depreciation_method: 'SLM',
                }).catch(() => { /* a concurrent seed already created it */ });
            }
            const seeded: any = await getAssetCategories(organizationId, { is_active: true });
            return { success: true, data: serialize(seeded.categories ?? []) };
        }

        return { success: true, data: serialize(res.categories) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function listAssets(filters?: { status?: string; category_id?: string; department?: string }) {
    try {
        const { organizationId } = await requireTenantContext();
        const res: any = await getFixedAssets(organizationId, filters);
        if (!res.success) return { success: false, error: res.error };

        const assets = serialize(res.assets) as any[];
        const summary = {
            count: assets.length,
            active: assets.filter(a => a.status === 'Active').length,
            gross_value: assets.reduce((s, a) => s + Number(a.acquisition_cost || 0), 0),
            book_value: assets.reduce((s, a) => s + Number(a.book_value || 0), 0),
            // Anything whose warranty has lapsed or maintenance is overdue —
            // the two things the team actually chases.
            attention: assets.filter(a => {
                const warrantyGone = a.warranty_expiry && new Date(a.warranty_expiry) < new Date();
                const maintDue = a.next_maintenance_date && new Date(a.next_maintenance_date) < new Date();
                return a.status === 'Active' && (warrantyGone || maintDue);
            }).length,
        };
        return { success: true, data: { assets, summary } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addAsset(input: {
    asset_code?: string;
    asset_name: string;
    category_id: string;
    description?: string;
    location?: string;
    department?: string;
    acquisition_date: string;
    acquisition_cost: number;
    serial_number?: string;
    manufacturer?: string;
    model_number?: string;
    invoice_number?: string;
    warranty_expiry?: string;
    depreciation_rate?: number;
}) {
    try {
        const { organizationId } = await requireTenantContext();

        if (!input.asset_name?.trim()) return { success: false, error: 'Asset name is required.' };
        if (!input.category_id) return { success: false, error: 'Category is required.' };
        const cost = Number(input.acquisition_cost);
        if (!Number.isFinite(cost) || cost < 0) return { success: false, error: 'Enter a valid acquisition cost.' };

        const categories: any = await getAssetCategories(organizationId, { is_active: true });
        const category = (categories.categories ?? []).find((c: any) => c.id === input.category_id);
        if (!category) return { success: false, error: 'Category not found.' };

        // Auto-number within the category (IT-0001, HK-0002…) so staff never
        // have to invent an asset code at the counter.
        let assetCode = (input.asset_code || '').trim();
        if (!assetCode) {
            const existing: any = await getFixedAssets(organizationId, { category_id: input.category_id });
            const n = (existing.assets?.length ?? 0) + 1;
            assetCode = `${category.category_code}-${String(n).padStart(4, '0')}`;
        }

        const res: any = await createFixedAsset({
            organizationId,
            asset_code: assetCode,
            asset_name: input.asset_name.trim(),
            category_id: input.category_id,
            description: input.description || undefined,
            location: input.location || undefined,
            department: input.department || undefined,
            acquisition_date: new Date(input.acquisition_date),
            acquisition_cost: cost,
            invoice_number: input.invoice_number || undefined,
            warranty_expiry: input.warranty_expiry ? new Date(input.warranty_expiry) : undefined,
            depreciation_method: category.depreciation_method || 'SLM',
            depreciation_rate: Number(input.depreciation_rate ?? category.depreciation_rate ?? 0),
            serial_number: input.serial_number || undefined,
            manufacturer: input.manufacturer || undefined,
            model_number: input.model_number || undefined,
        });

        if (!res.success) return { success: false, error: res.error };
        return { success: true, data: serialize(res.asset) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function editAsset(id: string, data: any) {
    try {
        await requireTenantContext();
        const res: any = await updateFixedAsset(id, data);
        if (!res.success) return { success: false, error: res.error };
        return { success: true, data: serialize(res.asset) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function moveAsset(input: {
    asset_id: string;
    to_location?: string;
    to_department?: string;
    transfer_date?: string;
    reason?: string;
}) {
    try {
        const { organizationId, session } = await requireTenantContext();

        // Capture where it is now — transferAsset overwrites the asset's
        // location, so without this the transfer history has no origin and you
        // cannot trace where a laptop actually moved from.
        const current: any = await getFixedAssets(organizationId, {});
        const asset = (current.assets ?? []).find((a: any) => a.id === input.asset_id);
        if (!asset) return { success: false, error: 'Asset not found.' };

        const res: any = await transferAsset({
            organizationId,
            asset_id: input.asset_id,
            from_location: asset.location ?? undefined,
            from_department: asset.department ?? undefined,
            // Fall back to the current value so a blank field means "unchanged"
            // rather than wiping the asset's location.
            to_location: input.to_location || asset.location || undefined,
            to_department: input.to_department || asset.department || undefined,
            transfer_date: input.transfer_date ? new Date(input.transfer_date) : new Date(),
            transfer_reason: input.reason,
            approved_by: session?.username,
        });
        if (!res.success) return { success: false, error: res.error };
        return { success: true, data: serialize(res) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function logMaintenance(input: {
    asset_id: string;
    maintenance_type: string;
    maintenance_date?: string;
    cost?: number;
    description?: string;
    next_maintenance_date?: string;
}) {
    try {
        const { organizationId } = await requireTenantContext();
        const res: any = await recordMaintenance({
            organizationId,
            asset_id: input.asset_id,
            maintenance_type: input.maintenance_type,
            maintenance_date: input.maintenance_date ? new Date(input.maintenance_date) : new Date(),
            cost: Number(input.cost || 0),
            description: input.description,
            next_due_date: input.next_maintenance_date ? new Date(input.next_maintenance_date) : undefined,
        });
        if (!res.success) return { success: false, error: res.error };
        return { success: true, data: serialize(res) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function retireAsset(input: { asset_id: string; disposal_value?: number; reason: string; disposal_date?: string }) {
    try {
        await requireTenantContext();
        if (!input.reason?.trim()) return { success: false, error: 'A disposal reason is required.' };
        const res: any = await disposeAsset(input.asset_id, {
            disposal_date: input.disposal_date ? new Date(input.disposal_date) : new Date(),
            disposal_value: Number(input.disposal_value || 0),
            disposal_reason: input.reason.trim(),
        });
        if (!res.success) return { success: false, error: res.error };
        return { success: true, data: serialize(res) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
