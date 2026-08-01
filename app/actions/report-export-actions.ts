'use server';

/**
 * Excel exports for the screens that were previously dumping raw CSV.
 *
 * A bare CSV opens in Excel with every column at default width, no title and no
 * indication of which report it is or what filters produced it. These use the
 * same workbook builder as the MIS reports, so an exported file explains itself:
 * hospital, report name, filter summary, generated timestamp, then the table.
 */

import { requireTenantContext } from '@/backend/tenant';
import { generateExcelBuffer } from '@/lib/mis/exporter';
import type { ColumnSpec } from '@/lib/mis/types';
import { getIndentReport, type IndentReportFilters } from '@/app/actions/indent-report-actions';
import { getFixedAssets } from '@/app/actions/asset-management-actions';
import { getAssetDepreciationReport } from '@/app/actions/asset-register-actions';
import { EDIT_CANCEL_ACTIONS } from '@/app/lib/audit-actions';

function fmtDate(v: any) {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function dateOnly(v: any) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function hospitalName(db: any, organizationId: string): Promise<string | undefined> {
    try {
        const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
        return org?.name ?? undefined;
    } catch {
        return undefined;
    }
}

/** Audit trail → .xlsx. Mirrors the on-screen columns, including the resolved user. */
export async function exportAuditReport(params: {
    search?: string;
    action?: string;
    from?: string;
    to?: string;
    scope?: string;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const where: any = { organizationId };
        if (params.action) where.action = params.action;
        if (params.scope === 'edits' && !params.action) where.action = { in: EDIT_CANCEL_ACTIONS };
        if (params.from || params.to) {
            where.created_at = {};
            if (params.from) where.created_at.gte = new Date(params.from);
            if (params.to) where.created_at.lte = new Date(new Date(params.to).setHours(23, 59, 59, 999));
        }
        if (params.search) {
            where.OR = [
                { entity_id: { contains: params.search, mode: 'insensitive' } },
                { action: { contains: params.search, mode: 'insensitive' } },
                { username: { contains: params.search, mode: 'insensitive' } },
                { details: { contains: params.search, mode: 'insensitive' } },
            ];
        }

        // Export the whole filtered set, not just the page on screen.
        const logs = await (db as any).system_audit_logs.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 5000,
        });

        const userIds = Array.from(new Set(logs.map((l: any) => l.user_id).filter(Boolean)));
        const users = userIds.length
            ? await (db as any).user.findMany({
                where: { id: { in: userIds as string[] } },
                select: { id: true, username: true, name: true, role: true },
            })
            : [];
        const userMap = new Map<string, any>(users.map((u: any) => [u.id, u]));

        const rows = logs.map((l: any) => {
            const u = l.user_id ? userMap.get(l.user_id) : null;
            let details = '';
            if (l.details) {
                try {
                    const obj = JSON.parse(l.details);
                    details = Object.entries(obj)
                        .filter(([, v]) => v !== null && v !== undefined && v !== '')
                        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                        .join(' · ');
                } catch { details = String(l.details); }
            }
            return {
                timestamp: fmtDate(l.created_at),
                action: String(l.action ?? '').replace(/_/g, ' '),
                module: l.module ?? '',
                entity: l.entity_id ? `${l.entity_type ?? ''}/${l.entity_id}` : (l.entity_type ?? ''),
                user: l.username || u?.name || u?.username || 'System / not recorded',
                role: l.role || u?.role || '',
                details,
            };
        });

        const columns: ColumnSpec[] = [
            { key: 'timestamp', label: 'Timestamp', type: 'string' },
            { key: 'action', label: 'Action', type: 'string' },
            { key: 'module', label: 'Module', type: 'string' },
            { key: 'entity', label: 'Record', type: 'string' },
            { key: 'user', label: 'Done By', type: 'string' },
            { key: 'role', label: 'Role', type: 'string' },
            { key: 'details', label: 'Details', type: 'string' },
        ];

        const isEdits = params.scope === 'edits';
        const period = [dateOnly(params.from), dateOnly(params.to)].filter(Boolean).join(' to ');
        const filterBits = [
            period ? `Period: ${period}` : 'Period: all dates',
            params.action ? `Action: ${params.action.replace(/_/g, ' ')}` : null,
            params.search ? `Search: "${params.search}"` : null,
        ].filter(Boolean).join('  ·  ');

        const buffer = await generateExcelBuffer(columns, rows, {}, {
            hospital: await hospitalName(db, organizationId),
            title: isEdits ? 'Edit / Cancel Audit Report' : 'Activity Audit Trail',
            subtitle: isEdits
                ? 'Every edited, cancelled, reversed or refunded transaction — who did it and when.'
                : 'All recorded system activity.',
            filters: filterBits,
            generatedBy: session?.username,
        });

        return {
            success: true,
            base64: buffer.toString('base64'),
            filename: `${isEdits ? 'edit-cancel-audit' : 'activity-audit'}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** Fixed-asset register → .xlsx, matching the other reports' presentation. */
export async function exportAssetRegister(filters?: { status?: string; category_id?: string }) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const res: any = await getFixedAssets(organizationId, filters);
        if (!res.success) return { success: false, error: res.error };

        const assets = (res.assets ?? []) as any[];
        const rows = assets.map((a) => ({
            asset_code: a.asset_code,
            asset_name: a.asset_name,
            category: a.category?.category_name ?? '',
            location: a.location ?? '',
            department: a.department ?? '',
            serial_number: a.serial_number ?? '',
            manufacturer: [a.manufacturer, a.model_number].filter(Boolean).join(' ') || '',
            acquisition_date: a.acquisition_date ? dateOnly(a.acquisition_date) : '',
            acquisition_cost: Number(a.acquisition_cost || 0),
            book_value: Number(a.book_value || 0),
            warranty_expiry: a.warranty_expiry ? dateOnly(a.warranty_expiry) : '',
            next_maintenance: a.next_maintenance_date ? dateOnly(a.next_maintenance_date) : '',
            status: a.status ?? '',
            disposal_reason: a.disposal_reason ?? '',
        }));

        const columns: ColumnSpec[] = [
            { key: 'asset_code', label: 'Asset Code', type: 'string' },
            { key: 'asset_name', label: 'Asset', type: 'string' },
            { key: 'category', label: 'Category', type: 'string' },
            { key: 'location', label: 'Location', type: 'string' },
            { key: 'department', label: 'Department', type: 'string' },
            { key: 'serial_number', label: 'Serial No', type: 'string' },
            { key: 'manufacturer', label: 'Make / Model', type: 'string' },
            { key: 'acquisition_date', label: 'Acquired On', type: 'string' },
            { key: 'acquisition_cost', label: 'Cost', type: 'currency', total: 'sum' },
            { key: 'book_value', label: 'Book Value', type: 'currency', total: 'sum' },
            { key: 'warranty_expiry', label: 'Warranty Until', type: 'string' },
            { key: 'next_maintenance', label: 'Next Service', type: 'string' },
            { key: 'status', label: 'Status', type: 'string' },
            { key: 'disposal_reason', label: 'Disposal Reason', type: 'string' },
        ];

        const totals = {
            acquisition_cost: rows.reduce((s, r) => s + r.acquisition_cost, 0),
            book_value: rows.reduce((s, r) => s + r.book_value, 0),
        };

        const buffer = await generateExcelBuffer(columns, rows, totals, {
            hospital: await hospitalName(db, organizationId),
            title: 'Asset Register',
            subtitle: 'Fixed assets — IT equipment, housekeeping, reception and other owned items.',
            filters: [
                filters?.status ? `Status: ${filters.status}` : 'Status: all',
                filters?.category_id ? 'Category: filtered' : 'Category: all',
            ].join('  ·  '),
            generatedBy: session?.username,
        });

        return {
            success: true,
            base64: buffer.toString('base64'),
            filename: `asset-register-${new Date().toISOString().slice(0, 10)}.xlsx`,
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** Category-wise depreciation / book value summary → .xlsx. */
export async function exportAssetDepreciationReport(filters?: { category_id?: string }) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const res: any = await getAssetDepreciationReport(filters);
        if (!res.success) return { success: false, error: res.error };

        const rows = (res.data.rows ?? []).map((r: any) => ({
            category: r.category,
            count: r.count,
            cost: r.cost,
            accumulated_depreciation: r.accumulated_depreciation,
            book_value: r.book_value,
            percent_depreciated: r.percent_depreciated,
        }));

        const columns: ColumnSpec[] = [
            { key: 'category', label: 'Category', type: 'string' },
            { key: 'count', label: 'Asset Count', type: 'number', total: 'sum' },
            { key: 'cost', label: 'Total Cost', type: 'currency', total: 'sum' },
            { key: 'accumulated_depreciation', label: 'Accumulated Depreciation', type: 'currency', total: 'sum' },
            { key: 'book_value', label: 'Book Value', type: 'currency', total: 'sum' },
            { key: 'percent_depreciated', label: '% Depreciated', type: 'percent' },
        ];

        const totals = {
            count: res.data.totals.count,
            cost: res.data.totals.cost,
            accumulated_depreciation: res.data.totals.accumulated_depreciation,
            book_value: res.data.totals.book_value,
        };

        const buffer = await generateExcelBuffer(columns, rows, totals, {
            hospital: await hospitalName(db, organizationId),
            title: 'Asset Depreciation Report',
            subtitle: 'Category-wise acquisition cost, accumulated depreciation and book value.',
            filters: filters?.category_id ? 'Category: filtered' : 'Category: all',
            generatedBy: session?.username,
        });

        return {
            success: true,
            base64: buffer.toString('base64'),
            filename: `asset-depreciation-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/** Indent register → .xlsx, including the columns the CSV was missing. */
export async function exportIndentReport(filters: IndentReportFilters) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const res: any = await getIndentReport(filters);
        if (!res.success) return { success: false, error: res.error };

        const rows = (res.data.rows as any[]).map((r) => ({
            indent_number: r.indent_number,
            created_at: fmtDate(r.created_at),
            patient_name: r.patient_name ?? '',
            patient_id: r.patient_id ?? '',
            admission_id: r.admission_id ?? '',
            type: r.is_ipd ? 'IPD' : 'OPD / Counter',
            requested_by: r.requested_by ?? '',
            status: r.status ?? '',
            verified_by: r.verified_by ?? '',
            verified_at: r.verified_at ? fmtDate(r.verified_at) : '',
            line_count: r.line_count,
            qty_requested: r.qty_requested,
            qty_dispensed: r.qty_dispensed,
            qty_short: r.qty_short,
            age_hours: r.age_hours,
            value: r.value,
            medicines: (r.items ?? [])
                .map((i: any) => `${i.medicine_name} (req ${i.quantity_requested}/disp ${i.quantity_dispensed ?? 0})`)
                .join('; '),
        }));

        const columns: ColumnSpec[] = [
            { key: 'indent_number', label: 'Indent No', type: 'string' },
            { key: 'created_at', label: 'Raised On', type: 'string' },
            { key: 'patient_name', label: 'Patient', type: 'string' },
            { key: 'patient_id', label: 'UHID', type: 'string' },
            { key: 'admission_id', label: 'Admission ID', type: 'string' },
            { key: 'type', label: 'Type', type: 'string' },
            { key: 'requested_by', label: 'Raised By', type: 'string' },
            { key: 'status', label: 'Status', type: 'string' },
            { key: 'verified_by', label: 'Verified By', type: 'string' },
            { key: 'verified_at', label: 'Verified On', type: 'string' },
            { key: 'line_count', label: 'Line Items', type: 'number', total: 'sum' },
            { key: 'qty_requested', label: 'Qty Requested', type: 'number', total: 'sum' },
            { key: 'qty_dispensed', label: 'Qty Dispensed', type: 'number', total: 'sum' },
            { key: 'qty_short', label: 'Qty Short', type: 'number', total: 'sum' },
            { key: 'age_hours', label: 'Age (hours)', type: 'number' },
            { key: 'value', label: 'Value', type: 'currency', total: 'sum' },
            { key: 'medicines', label: 'Medicines', type: 'string' },
        ];

        const totals = {
            line_count: rows.reduce((s, r) => s + Number(r.line_count || 0), 0),
            qty_requested: rows.reduce((s, r) => s + Number(r.qty_requested || 0), 0),
            qty_dispensed: rows.reduce((s, r) => s + Number(r.qty_dispensed || 0), 0),
            qty_short: rows.reduce((s, r) => s + Number(r.qty_short || 0), 0),
            value: rows.reduce((s, r) => s + Number(r.value || 0), 0),
        };

        const period = [dateOnly(filters?.from), dateOnly(filters?.to)].filter(Boolean).join(' to ');
        const filterBits = [
            period ? `Period: ${period}` : 'Period: all dates',
            filters?.status ? `Status: ${filters.status}` : 'Status: all',
            filters?.search ? `Search: "${filters.search}"` : null,
        ].filter(Boolean).join('  ·  ');

        const buffer = await generateExcelBuffer(columns, rows, totals, {
            hospital: await hospitalName(db, organizationId),
            title: 'Pharmacy Indent Report',
            subtitle: 'Ward indents raised on pharmacy, with quantities requested vs dispensed and ageing.',
            filters: filterBits,
            generatedBy: session?.username,
        });

        return {
            success: true,
            base64: buffer.toString('base64'),
            filename: `indent-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
