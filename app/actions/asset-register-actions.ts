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

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { assetFieldsFor, deriveAssetName } from '@/app/lib/asset-fields';
import { createWithUniqueRetry } from '@/app/lib/sequence-generator';
import { encryptSecret, decryptSecret, maskSecret } from '@/app/lib/secure-config';
import { logAudit } from '@/app/lib/audit';
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
    { category_name: 'Computer/Laptop', category_code: 'PC', asset_type: 'IT Equipment', depreciation_rate: 33.33, useful_life_years: 3 },
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

        // Seed any default category this org is missing — not just when it has
        // none. Orgs onboarded before a category existed (Computer/Laptop) would
        // otherwise never see it, because the old "only if empty" guard never
        // fired again after the first seed.
        const have = new Set((res.categories ?? []).map((c: any) => String(c.category_name).trim().toLowerCase()));
        const missing = DEFAULT_CATEGORIES.filter(c => !have.has(c.category_name.toLowerCase()));
        if (missing.length) {
            for (const c of missing) {
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

        // The register is a screen anyone with asset access can open; the
        // stored code never leaves the server in the clear. `revealAssetAccessCode`
        // is the one admin-only door.
        const assets = (serialize(res.assets) as any[]).map(a => ({
            ...a,
            access_code: a.access_code ? maskSecret(a.access_code) : null,
            has_access_code: Boolean(a.access_code),
        }));
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
    asset_name?: string;
    category_id: string;
    description?: string;
    location?: string;
    department?: string;
    acquisition_date?: string;
    acquisition_cost?: number;
    serial_number?: string;
    manufacturer?: string;
    model_number?: string;
    invoice_number?: string;
    warranty_expiry?: string;
    depreciation_rate?: number;
    // IT inventory sheet columns
    assigned_to?: string;
    cpu_details?: string;
    hardware_specs?: string;
    peripherals?: string;
    printer_details?: string;
    ups_network?: string;
    // Computer/Laptop sheet columns
    asset_type?: string;
    ram?: string;
    storage?: string;
    operating_system?: string;
    vendor_name?: string;
    working_status?: string;
    condition?: string;
    notes?: string;
    access_code?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        if (!input.category_id) return { success: false, error: 'Category is required.' };

        const categories: any = await getAssetCategories(organizationId, { is_active: true });
        const category = (categories.categories ?? []).find((c: any) => c.id === input.category_id);
        if (!category) return { success: false, error: 'Category not found.' };

        // Which columns this category actually uses decides what is required.
        // The Computer/Laptop sheet has no Asset Name column, so the name is
        // built from Asset Type + Brand + Model rather than demanded of the user.
        const fields = assetFieldsFor(category.category_name);
        const assetName = deriveAssetName(input as Record<string, unknown>).trim();
        if (!assetName) {
            return {
                success: false,
                error: fields.some(f => f.key === 'asset_name')
                    ? 'Asset name is required.'
                    : 'Enter at least an asset type, brand or model — the asset name is built from those.',
            };
        }
        for (const field of fields) {
            if (!field.required) continue;
            if (String((input as any)[field.key] ?? '').trim() === '') {
                return { success: false, error: `${field.label} is required.` };
            }
        }

        // Cost and acquisition date are not on every category's sheet (the IT
        // inventory list has neither). Default rather than reject: a register
        // row with no purchase price is still a register row, it just
        // depreciates from zero.
        const cost = Number(input.acquisition_cost ?? 0);
        if (!Number.isFinite(cost) || cost < 0) return { success: false, error: 'Enter a valid acquisition cost.' };
        const acquiredOn = input.acquisition_date ? new Date(input.acquisition_date) : new Date();
        if (isNaN(acquiredOn.getTime())) return { success: false, error: 'Enter a valid acquisition date.' };

        // The hospital types its own Asset ID. Auto-number only as a fallback so
        // a blank field still produces a usable tag (IT-0001, PC-0002…).
        let assetCode = (input.asset_code || '').trim();

        // s_no is the register's key, so allocate and insert inside the retry —
        // two concurrent adds can read the same max before either commits.
        const res: any = await createWithUniqueRetry(async () => {
            const [maxSNo, inCategory] = await Promise.all([
                db.fixedAsset.aggregate({ _max: { s_no: true } }),
                assetCode ? Promise.resolve(0) : db.fixedAsset.count({ where: { category_id: input.category_id } }),
            ]);
            const code = assetCode || `${category.category_code}-${String(inCategory + 1).padStart(4, '0')}`;

            const created: any = await createFixedAsset({
                organizationId,
                s_no: (maxSNo._max.s_no ?? 0) + 1,
                asset_code: code,
                asset_name: assetName,
                category_id: input.category_id,
                description: input.description || undefined,
                location: input.location || undefined,
                department: input.department || undefined,
                acquisition_date: acquiredOn,
                acquisition_cost: cost,
                invoice_number: input.invoice_number || undefined,
                warranty_expiry: input.warranty_expiry ? new Date(input.warranty_expiry) : undefined,
                depreciation_method: category.depreciation_method || 'SLM',
                depreciation_rate: Number(input.depreciation_rate ?? category.depreciation_rate ?? 0),
                serial_number: input.serial_number || undefined,
                manufacturer: input.manufacturer || undefined,
                model_number: input.model_number || undefined,
                assigned_to: input.assigned_to?.trim() || undefined,
                cpu_details: input.cpu_details?.trim() || undefined,
                hardware_specs: input.hardware_specs?.trim() || undefined,
                peripherals: input.peripherals?.trim() || undefined,
                printer_details: input.printer_details?.trim() || undefined,
                ups_network: input.ups_network?.trim() || undefined,
                asset_type: input.asset_type?.trim() || undefined,
                ram: input.ram?.trim() || undefined,
                storage: input.storage?.trim() || undefined,
                operating_system: input.operating_system?.trim() || undefined,
                vendor_name: input.vendor_name?.trim() || undefined,
                working_status: input.working_status?.trim() || undefined,
                condition: input.condition?.trim() || undefined,
                notes: input.notes?.trim() || undefined,
                access_code: encryptSecret(input.access_code?.trim()) || undefined,
            });
            // createFixedAsset swallows Prisma errors into { success:false }, so
            // re-throw for createWithUniqueRetry — but only for s_no. A clash on
            // asset_code means the hospital typed an Asset ID it has already
            // used; retrying would just fail four more times.
            if (!created.success && /unique constraint/i.test(String(created.error ?? ''))) {
                if (/s_no/i.test(String(created.error))) {
                    throw Object.assign(new Error(created.error), { code: 'P2002' });
                }
                return { success: false, error: `Asset ID "${code}" is already used by another asset.` };
            }
            return created;
        });

        if (!res.success) return { success: false, error: res.error };
        const asset: any = serialize(res.asset);
        return { success: true, data: { ...asset, access_code: asset.access_code ? maskSecret(asset.access_code) : null } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** Blank cells mean "not supplied", never "clear this field" — an import sheet
 *  often carries only the columns one category uses. */
function optCell(row: Record<string, unknown>, key: string): string | undefined {
    const v = String(row[key] ?? '').trim();
    return v === '' ? undefined : v;
}

/** Sheet row -> the descriptive fields addAsset / updateFixedAsset accept. */
function pickAssetFields(row: Record<string, unknown>) {
    const keys = [
        'asset_code', 'asset_name', 'location', 'department', 'serial_number', 'manufacturer',
        'model_number', 'invoice_number', 'acquisition_date', 'warranty_expiry', 'assigned_to',
        'cpu_details', 'hardware_specs', 'peripherals', 'printer_details', 'ups_network',
        'asset_type', 'ram', 'storage', 'operating_system', 'vendor_name', 'working_status',
        'condition', 'notes', 'access_code',
    ] as const;
    const out: Record<string, string | undefined> = {};
    for (const k of keys) out[k] = optCell(row, k);
    out.asset_name = deriveAssetName(row) || undefined;
    return out as Record<(typeof keys)[number], string | undefined>;
}

/** Case-insensitive category name -> id, for import rows that carry a category name, not an id. */
async function resolveCategoryId(organizationId: string, categoryName: string) {
    const categories: any = await getAssetCategories(organizationId, { is_active: true });
    const name = categoryName.trim().toLowerCase();
    const match = (categories.categories ?? []).find((c: any) => c.category_name.trim().toLowerCase() === name);
    return match ?? null;
}

/**
 * Bulk-import row -> new asset. Used only by the generic master-data importer
 * (master-import-actions.ts), which resolves whether to create or update by
 * looking up `asset_code` before calling this. Category comes in as a name
 * (what an import sheet can reasonably contain), not the id `addAsset` wants.
 */
export async function createAssetFromImportRow(row: Record<string, unknown>) {
    try {
        const { organizationId } = await requireTenantContext();
        const categoryName = String(row.category ?? '').trim();
        const category = categoryName ? await resolveCategoryId(organizationId, categoryName) : null;
        if (!category) {
            return { success: false, error: `Category "${categoryName}" not found — check spelling or add it in Asset Categories first.` };
        }
        return addAsset({
            ...pickAssetFields(row),
            category_id: category.id,
            acquisition_cost: row.acquisition_cost === undefined || row.acquisition_cost === '' ? 0 : Number(row.acquisition_cost),
        });
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk-import row -> update an existing asset (matched on `s_no`).
 * Only touches the fields `updateFixedAsset` actually supports — descriptive
 * and location fields. Category, cost, acquisition date and invoice number
 * are set once at creation and deliberately left alone here: changing them
 * on an asset that may already have accumulated depreciation needs the
 * dedicated lifecycle actions (or a fresh row), not a silent bulk overwrite.
 */
export async function updateAssetFromImportRow(id: string, row: Record<string, unknown>) {
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const picked = pickAssetFields(row);

        // What the row looked like before, so the audit entry can say what an
        // import actually changed. An import that silently rewrites a register
        // row with no trace is how a bad match goes unnoticed.
        const before = await db.fixedAsset.findFirst({
            where: { id, organizationId },
            include: { category: true },
        });
        if (!before) return { success: false, error: 'Asset not found.' };

        // A category correction has to be possible: an asset filed under the
        // wrong category shows the wrong columns and cannot be found by filter,
        // and nothing else in the UI can move it.
        const categoryName = String(row.category ?? '').trim();
        let categoryChange: { id: string; name: string } | null = null;
        if (categoryName && categoryName.toLowerCase() !== String(before.category?.category_name ?? '').toLowerCase()) {
            const target = await resolveCategoryId(organizationId, categoryName);
            if (!target) return { success: false, error: `Category "${categoryName}" not found.` };
            categoryChange = { id: target.id, name: target.category_name };
            // Depreciation is driven by the category, so move the rate with it.
            await db.fixedAsset.update({
                where: { id },
                data: { category_id: target.id, depreciation_rate: target.depreciation_rate ?? before.depreciation_rate },
            });
        }
        const res: any = await updateFixedAsset(id, {
            asset_name: deriveAssetName(row) || undefined,
            location: picked.location,
            department: picked.department,
            serial_number: picked.serial_number,
            manufacturer: picked.manufacturer,
            model_number: picked.model_number,
            warranty_expiry: picked.warranty_expiry ? new Date(picked.warranty_expiry) : undefined,
            assigned_to: picked.assigned_to,
            cpu_details: picked.cpu_details,
            hardware_specs: picked.hardware_specs,
            peripherals: picked.peripherals,
            printer_details: picked.printer_details,
            ups_network: picked.ups_network,
            asset_type: picked.asset_type,
            ram: picked.ram,
            storage: picked.storage,
            operating_system: picked.operating_system,
            vendor_name: picked.vendor_name,
            working_status: picked.working_status,
            condition: picked.condition,
            notes: picked.notes,
            access_code: encryptSecret(picked.access_code ?? null) || undefined,
        });
        if (!res.success) return { success: false, error: res.error };

        const changed = Object.keys(picked).filter(
            k => picked[k as keyof typeof picked] !== undefined
                && String((before as any)[k] ?? '') !== String(picked[k as keyof typeof picked] ?? ''),
        );
        await logAudit({
            action: 'ASSET_UPDATED_BY_IMPORT',
            module: 'Assets',
            entity_type: 'FixedAsset',
            entity_id: id,
            details: `Import matched Asset ID ${before.asset_code} (S.No ${before.s_no ?? '—'}) and updated `
                + `${changed.length ? changed.join(', ') : 'no fields'}`
                + (categoryChange ? `; category ${before.category?.category_name ?? '—'} -> ${categoryChange.name}` : '')
                + ` (by ${session?.username ?? 'unknown'})`,
        });

        const updated: any = serialize(res.asset);
        return { success: true, data: { ...updated, access_code: updated.access_code ? maskSecret(updated.access_code) : null } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Category-wise depreciation / book value summary. Reuses the same
 * `getFixedAssets` data the register table already fetches — no new query
 * shape, just a different aggregation.
 */
export async function getAssetDepreciationReport(filters?: { category_id?: string }) {
    try {
        const { organizationId } = await requireTenantContext();
        const res: any = await getFixedAssets(organizationId, filters);
        if (!res.success) return { success: false, error: res.error };

        const assets = serialize(res.assets) as any[];
        const byCategory = new Map<string, { category: string; count: number; cost: number; accumulated_depreciation: number; book_value: number }>();
        for (const a of assets) {
            const name = a.category?.category_name ?? 'Uncategorised';
            const row = byCategory.get(name) ?? { category: name, count: 0, cost: 0, accumulated_depreciation: 0, book_value: 0 };
            row.count += 1;
            row.cost += Number(a.acquisition_cost || 0);
            row.accumulated_depreciation += Number(a.accumulated_depreciation || 0);
            row.book_value += Number(a.book_value || 0);
            byCategory.set(name, row);
        }
        const rows = Array.from(byCategory.values())
            .sort((a, b) => a.category.localeCompare(b.category))
            .map(r => ({ ...r, percent_depreciated: r.cost > 0 ? (r.accumulated_depreciation / r.cost) * 100 : 0 }));

        const totals = rows.reduce((acc, r) => ({
            count: acc.count + r.count,
            cost: acc.cost + r.cost,
            accumulated_depreciation: acc.accumulated_depreciation + r.accumulated_depreciation,
            book_value: acc.book_value + r.book_value,
        }), { count: 0, cost: 0, accumulated_depreciation: 0, book_value: 0 });

        return {
            success: true,
            data: {
                rows,
                totals: { ...totals, percent_depreciated: totals.cost > 0 ? (totals.accumulated_depreciation / totals.cost) * 100 : 0 },
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function editAsset(id: string, data: any) {
    try {
        await requireTenantContext();
        // `data` comes straight from a client form, so encrypt here rather than
        // trusting every future caller to remember.
        const res: any = await updateFixedAsset(id, {
            ...data,
            ...(data?.access_code !== undefined && { access_code: encryptSecret(data.access_code) || undefined }),
        });
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
        if (asset.status !== 'Active') {
            return { success: false, error: `Cannot transfer a ${String(asset.status).toLowerCase()} asset.` };
        }

        // An empty submission used to create a transfer row with no destination
        // and no reason — a meaningless entry in the asset's history.
        const toLocation = (input.to_location ?? '').trim();
        const toDepartment = (input.to_department ?? '').trim();
        const reason = (input.reason ?? '').trim();
        if (!toLocation && !toDepartment) {
            return { success: false, error: 'Enter a new location or a new department to transfer this asset.' };
        }
        if (!reason) return { success: false, error: 'A reason for the transfer is required.' };

        const sameLocation = toLocation === (asset.location ?? '').trim();
        const sameDepartment = toDepartment === (asset.department ?? '').trim();
        if (sameLocation && sameDepartment) {
            return { success: false, error: 'Nothing changed — the location and department are the same as now.' };
        }

        const res: any = await transferAsset({
            organizationId,
            asset_id: input.asset_id,
            from_location: asset.location ?? undefined,
            from_department: asset.department ?? undefined,
            // Fall back to the current value so a blank field means "unchanged"
            // rather than wiping the asset's location.
            to_location: toLocation || asset.location || undefined,
            to_department: toDepartment || asset.department || undefined,
            transfer_date: input.transfer_date ? new Date(input.transfer_date) : new Date(),
            transfer_reason: reason,
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

        // Without this an empty Save wrote a blank service record — a row in the
        // asset's history saying nothing was done, on no date, for no reason.
        const description = (input.description ?? '').trim();
        if (!input.maintenance_type?.trim()) return { success: false, error: 'Select the type of service.' };
        if (!description) return { success: false, error: 'Describe what was done — this is the service record.' };
        const cost = Number(input.cost || 0);
        if (!Number.isFinite(cost) || cost < 0) return { success: false, error: 'Enter a valid cost (0 or more).' };

        // The service itself is recorded as happening now, so the *next* one
        // falling due in the past is a contradiction — it would also land in the
        // register as permanently "overdue" the moment it was saved.
        const servicedOn = input.maintenance_date ? new Date(input.maintenance_date) : new Date();
        if (input.next_maintenance_date) {
            const next = new Date(input.next_maintenance_date);
            if (isNaN(next.getTime())) return { success: false, error: 'Enter a valid next service date.' };
            // Compare on date, not timestamp, so "today" is allowed.
            const startOfServiceDay = new Date(servicedOn.getFullYear(), servicedOn.getMonth(), servicedOn.getDate());
            if (next < startOfServiceDay) {
                return { success: false, error: 'The next service date cannot be before the date of this service.' };
            }
        }

        const res: any = await recordMaintenance({
            organizationId,
            asset_id: input.asset_id,
            maintenance_type: input.maintenance_type,
            maintenance_date: input.maintenance_date ? new Date(input.maintenance_date) : new Date(),
            cost,
            description,
            next_due_date: input.next_maintenance_date ? new Date(input.next_maintenance_date) : undefined,
        });
        if (!res.success) return { success: false, error: res.error };
        return { success: true, data: serialize(res) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Everything that has happened to one asset: where it moved, what was serviced,
 * and how it was disposed of — each with the reason that was typed at the time.
 * Those reasons were being recorded and then never shown anywhere.
 */
export async function getAssetHistory(assetId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const asset = await db.fixedAsset.findFirst({
            where: { id: assetId, organizationId },
            include: { category: true },
        });
        if (!asset) return { success: false, error: 'Asset not found.' };

        const [transfers, maintenance] = await Promise.all([
            db.assetTransfer.findMany({ where: { asset_id: assetId }, orderBy: { transfer_date: 'desc' } }),
            db.assetMaintenance.findMany({ where: { asset_id: assetId }, orderBy: { maintenance_date: 'desc' } }),
        ]);

        // One merged, newest-first timeline is easier to read than three lists.
        const events = [
            {
                kind: 'Acquired',
                at: asset.acquisition_date,
                detail: `${asset.category?.category_name ?? 'Asset'} added to the register`,
                note: asset.invoice_number ? `Invoice ${asset.invoice_number}` : '',
                amount: Number(asset.acquisition_cost || 0),
                by: '',
            },
            ...transfers.map((t: any) => {
                // Only mention the part that actually moved — showing
                // "(Reception → Reception)" for an unchanged department is noise.
                const locMoved = (t.from_location ?? '') !== (t.to_location ?? '');
                const deptMoved = (t.from_department ?? '') !== (t.to_department ?? '');
                const bits: string[] = [];
                if (locMoved) bits.push(`location: ${t.from_location || '—'} → ${t.to_location || '—'}`);
                if (deptMoved) bits.push(`dept: ${t.from_department || '—'} → ${t.to_department || '—'}`);
                return {
                    kind: 'Transferred',
                    at: t.transfer_date,
                    detail: bits.join('  ·  ') || 'Location updated',
                    note: t.transfer_reason || '',
                    amount: null as number | null,
                    by: t.approved_by || '',
                };
            }),
            ...maintenance.map((m: any) => ({
                kind: 'Serviced',
                at: m.maintenance_date,
                detail: m.maintenance_type,
                note: m.description || '',
                amount: Number(m.cost || 0),
                by: m.performed_by || '',
            })),
            ...(asset.status === 'Disposed'
                ? [{
                    kind: 'Disposed',
                    at: asset.disposed_date,
                    detail: 'Removed from the active register',
                    note: asset.disposal_reason || '',
                    amount: Number(asset.disposal_value || 0),
                    by: '',
                }]
                : []),
        ]
            .filter(e => e.at)
            .sort((a, b) => new Date(b.at as any).getTime() - new Date(a.at as any).getTime());

        return { success: true, data: serialize({ asset, events }) };
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

/**
 * The one place a stored asset password/code is returned in the clear.
 * Admin-only and audited — everywhere else the register serves the mask.
 */
export async function revealAssetAccessCode(assetId: string) {
    try {
        const { db, organizationId, session } = await requireRoleAndTenant(['admin']);
        const asset = await db.fixedAsset.findFirst({
            where: { id: assetId, organizationId },
            select: { asset_code: true, access_code: true },
        });
        if (!asset) return { success: false, error: 'Asset not found.' };
        if (!asset.access_code) return { success: false, error: 'No code stored for this asset.' };

        await logAudit({
            action: 'ASSET_ACCESS_CODE_VIEWED',
            module: 'Assets',
            entity_type: 'FixedAsset',
            entity_id: assetId,
            details: `Revealed stored code for asset ${asset.asset_code} (by ${session?.username ?? 'unknown'})`,
        });

        return { success: true, data: decryptSecret(asset.access_code) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
