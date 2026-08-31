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
import ExcelJS from 'exceljs';
import { getFinanceDashboardStats } from '@/app/actions/finance-actions';
import { getExpenseDashboardStats, getExpenseCategories } from '@/app/actions/expense-actions';
import { getIndentReport, type IndentReportFilters } from '@/app/actions/indent-report-actions';
import { getFixedAssets } from '@/app/actions/asset-management-actions';
import { getAssetDepreciationReport } from '@/app/actions/asset-register-actions';
import { EDIT_CANCEL_ACTIONS } from '@/app/lib/audit-actions';
import { maskSecret } from '@/app/lib/secure-config';

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
            assigned_to: a.assigned_to ?? '',
            cpu_details: a.cpu_details ?? '',
            hardware_specs: a.hardware_specs ?? '',
            peripherals: a.peripherals ?? '',
            printer_details: a.printer_details ?? '',
            ups_network: a.ups_network ?? '',
            status: a.status ?? '',
            notes: a.notes ?? '',
            // Deliberately masked: an asset register .xlsx gets emailed around.
            // Use Admin -> Asset Register -> Reveal for the real value.
            access_code: a.access_code ? maskSecret(a.access_code) : '',
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
            { key: 'assigned_to', label: 'User / Role', type: 'string' },
            { key: 'cpu_details', label: 'CPU', type: 'string' },
            { key: 'hardware_specs', label: 'Hardware Specifications (CPU/RAM/Storage)', type: 'string' },
            { key: 'peripherals', label: 'Peripherals (K/B, Mouse, Monitor, Telephone)', type: 'string' },
            { key: 'printer_details', label: 'Printer Details', type: 'string' },
            { key: 'ups_network', label: 'UPS / Power & Network', type: 'string' },
            { key: 'status', label: 'Status', type: 'string' },
            { key: 'notes', label: 'Notes', type: 'string' },
            { key: 'access_code', label: 'Password / Code', type: 'string' },
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

/** Income & Expense P&L Report → .xlsx with rich styling, cell borders and currency formatting */
export async function exportIncomeExpenseExcel(params: {
    period?: 'monthly' | 'quarterly' | 'yearly';
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const period = params.period || 'monthly';

        const [org, revRes, expRes, catRes] = await Promise.all([
            db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
            getFinanceDashboardStats({ period }),
            getExpenseDashboardStats(period),
            getExpenseCategories(),
        ]);

        const revenueStats = revRes.success ? revRes.data : null;
        const expenseStats = expRes.success ? expRes.data : null;
        const categories = (catRes.success ? catRes.data : []) as { id: number; name: string }[];

        const allTimeRevenue = Math.round(Number(revenueStats?.totalRevenue || 0));
        const allTimeExpenses = Math.round(Number(expenseStats?.totalExpenses || 0));
        const allTimeNetIncome = allTimeRevenue - allTimeExpenses;

        const totalRevenue = Math.round(Number(revenueStats?.periodRevenue || 0));
        const totalCollection = Math.round(Number(revenueStats?.periodCollection || 0));
        const totalExpenses = Math.round(Number(expenseStats?.periodExpenses || 0));
        const netIncome = totalRevenue - totalExpenses;

        const categoryMap = new Map(categories.map(c => [c.id, c.name]));
        const revByDept: { department: string | null; amount: number }[] = revenueStats?.revenueByDepartment || [];
        const expByCategory: { category_id: number; amount: number }[] = expenseStats?.byCategory || [];

        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthName = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

        let periodTitle = '';
        if (period === 'monthly') {
            periodTitle = `Monthly (${currentMonthName} ${currentYear})`;
        } else if (period === 'quarterly') {
            periodTitle = `Quarterly (Q${currentQuarter} ${currentYear})`;
        } else {
            periodTitle = `Yearly (${currentYear})`;
        }

        const dateStr = now.toISOString().slice(0, 10);
        const timestampStr = now.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'HospitalOS Finance';
        workbook.created = now;

        const sheet = workbook.addWorksheet('Income & Expense', {
            views: [{ showGridLines: true }],
        });

        sheet.columns = [
            { key: 'particulars', width: 38 },
            { key: 'category', width: 26 },
            { key: 'type', width: 20 },
            { key: 'amount', width: 22 },
            { key: 'notes', width: 28 },
        ];

        const thinBorder: Partial<ExcelJS.Borders> = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        const headerBorder: Partial<ExcelJS.Borders> = {
            top: { style: 'medium', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };

        let rowIdx = 1;

        // ── 0. Cover Header ──
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const hospCell = sheet.getCell(`A${rowIdx}`);
        hospCell.value = org?.name || 'HospitalOS Health';
        hospCell.font = { bold: true, size: 14, color: { argb: 'FF166534' } };
        hospCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        hospCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sheet.getRow(rowIdx).height = 28;
        rowIdx++;

        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const titleCell = sheet.getCell(`A${rowIdx}`);
        titleCell.value = 'INCOME & EXPENSE REPORT (PROFIT & LOSS OVERVIEW)';
        titleCell.font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sheet.getRow(rowIdx).height = 22;
        rowIdx++;

        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const metaCell = sheet.getCell(`A${rowIdx}`);
        metaCell.value = `Period: ${periodTitle}  ·  Generated: ${timestampStr}  ·  By: ${session?.name || session?.username || 'SYSTEM'}`;
        metaCell.font = { size: 10, color: { argb: 'FF64748B' } };
        metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sheet.getRow(rowIdx).height = 18;
        rowIdx++;

        // Spacer
        sheet.getRow(rowIdx).height = 10;
        rowIdx++;

        // ── 1. Executive Summary ──
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const sec1Header = sheet.getCell(`A${rowIdx}`);
        sec1Header.value = '1. EXECUTIVE SUMMARY';
        sec1Header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        sec1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sec1Header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sheet.getRow(rowIdx).height = 24;
        rowIdx++;

        // Table Header
        const h1Row = sheet.getRow(rowIdx);
        h1Row.values = ['Metric Name', 'Area', 'Classification', 'Amount (₹)', 'Description'];
        h1Row.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
        h1Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        h1Row.height = 22;
        h1Row.eachCell((c) => { c.border = headerBorder; c.alignment = { vertical: 'middle' }; });
        rowIdx++;

        const kpis = [
            ['Revenue (Billed)', 'Billing', 'Billed Revenue', totalRevenue, 'Bills created incl. outstanding'],
            ['Collection (Received)', 'Cash Inflow', 'Cash Actually Received', totalCollection, 'Payments actually collected'],
            ['Total Expenses', 'Expenses', 'Operational Cost', totalExpenses, 'Approved & paid expenses'],
            ['Net Income (All Time)', 'Net Position', 'Cumulative Profit/Loss', allTimeNetIncome, 'Cumulative all-time net income'],
            [`Net Income (${periodTitle})`, 'Net Position', 'Period P&L', netIncome, 'Period revenue minus expenses'],
        ];

        kpis.forEach((kpi, idx) => {
            const r = sheet.getRow(rowIdx);
            r.values = kpi;
            r.height = 20;
            if (idx % 2 === 1) {
                r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
            r.eachCell((c, colNumber) => {
                c.border = thinBorder;
                c.alignment = { vertical: 'middle' };
                if (colNumber === 4) {
                    c.numFmt = '₹#,##0';
                    c.font = { bold: true };
                }
            });
            rowIdx++;
        });

        // Spacer
        sheet.getRow(rowIdx).height = 12;
        rowIdx++;

        // ── 2. Profit & Loss Statement ──
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const sec2Header = sheet.getCell(`A${rowIdx}`);
        sec2Header.value = '2. PROFIT & LOSS SUMMARY STATEMENT';
        sec2Header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        sec2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
        sec2Header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sheet.getRow(rowIdx).height = 24;
        rowIdx++;

        const h2Row = sheet.getRow(rowIdx);
        h2Row.values = ['Particulars', 'Department / Category', 'Classification', 'Amount (₹)', 'Share (%)'];
        h2Row.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
        h2Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        h2Row.height = 22;
        h2Row.eachCell((c) => { c.border = headerBorder; c.alignment = { vertical: 'middle' }; });
        rowIdx++;

        // Revenue Group Header
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const revGroupCell = sheet.getCell(`A${rowIdx}`);
        revGroupCell.value = 'A. REVENUE BY DEPARTMENT (COLLECTIONS)';
        revGroupCell.font = { bold: true, size: 10, color: { argb: 'FF15803D' } };
        revGroupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        revGroupCell.alignment = { vertical: 'middle', indent: 1 };
        sheet.getRow(rowIdx).height = 21;
        rowIdx++;

        revByDept.forEach((dept, idx) => {
            const pct = totalRevenue > 0 ? ((dept.amount / totalRevenue) * 100).toFixed(1) + '%' : '0.0%';
            const r = sheet.getRow(rowIdx);
            r.values = [
                `   ${dept.department || 'Other'}`,
                dept.department || 'Other',
                'Department Revenue',
                Math.round(dept.amount),
                pct,
            ];
            r.height = 19;
            if (idx % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            r.eachCell((c, colNumber) => {
                c.border = thinBorder;
                c.alignment = { vertical: 'middle' };
                if (colNumber === 4) c.numFmt = '₹#,##0';
            });
            rowIdx++;
        });

        // Revenue Total Row
        const revTotalRow = sheet.getRow(rowIdx);
        revTotalRow.values = [
            'TOTAL REVENUE (COLLECTIONS)',
            'All Departments',
            'Revenue Total',
            totalRevenue,
            '100.0%',
        ];
        revTotalRow.font = { bold: true, size: 10, color: { argb: 'FF166534' } };
        revTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        revTotalRow.height = 22;
        revTotalRow.eachCell((c, colNumber) => {
            c.border = headerBorder;
            c.alignment = { vertical: 'middle' };
            if (colNumber === 4) c.numFmt = '₹#,##0';
        });
        rowIdx++;

        // Expenses Group Header
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const expGroupCell = sheet.getCell(`A${rowIdx}`);
        expGroupCell.value = 'B. EXPENSES BY CATEGORY';
        expGroupCell.font = { bold: true, size: 10, color: { argb: 'FFB91C1C' } };
        expGroupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        expGroupCell.alignment = { vertical: 'middle', indent: 1 };
        sheet.getRow(rowIdx).height = 21;
        rowIdx++;

        expByCategory.forEach((cat, idx) => {
            const catName = categoryMap.get(cat.category_id) || `Category ${cat.category_id}`;
            const pct = totalExpenses > 0 ? ((cat.amount / totalExpenses) * 100).toFixed(1) + '%' : '0.0%';
            const r = sheet.getRow(rowIdx);
            r.values = [
                `   ${catName}`,
                catName,
                'Expense Category',
                Math.round(cat.amount),
                pct,
            ];
            r.height = 19;
            if (idx % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            r.eachCell((c, colNumber) => {
                c.border = thinBorder;
                c.alignment = { vertical: 'middle' };
                if (colNumber === 4) c.numFmt = '₹#,##0';
            });
            rowIdx++;
        });

        // Expense Total Row
        const expTotalRow = sheet.getRow(rowIdx);
        expTotalRow.values = [
            'TOTAL EXPENSES',
            'All Categories',
            'Expense Total',
            totalExpenses,
            '100.0%',
        ];
        expTotalRow.font = { bold: true, size: 10, color: { argb: 'FF991B1B' } };
        expTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
        expTotalRow.height = 22;
        expTotalRow.eachCell((c, colNumber) => {
            c.border = headerBorder;
            c.alignment = { vertical: 'middle' };
            if (colNumber === 4) c.numFmt = '₹#,##0';
        });
        rowIdx++;

        // Net Income Grand Total Row
        const netRow = sheet.getRow(rowIdx);
        netRow.values = [
            'C. NET INCOME (A - B)',
            'Net Position',
            'Net Profit / Loss',
            netIncome,
            '-',
        ];
        netRow.font = { bold: true, size: 11, color: { argb: netIncome >= 0 ? 'FF14532D' : 'FF7F1D1D' } };
        netRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: netIncome >= 0 ? 'FFDCFCE7' : 'FFFEE2E2' } };
        netRow.height = 26;
        netRow.eachCell((c, colNumber) => {
            c.border = {
                top: { style: 'medium', color: { argb: 'FF0F172A' } },
                bottom: { style: 'double', color: { argb: 'FF0F172A' } },
                left: { style: 'thin', color: { argb: 'FF0F172A' } },
                right: { style: 'thin', color: { argb: 'FF0F172A' } },
            };
            c.alignment = { vertical: 'middle' };
            if (colNumber === 4) c.numFmt = '₹#,##0';
        });
        rowIdx++;

        // Spacer
        sheet.getRow(rowIdx).height = 12;
        rowIdx++;

        // ── 3. Operational & Receivables Metrics ──
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const sec3Header = sheet.getCell(`A${rowIdx}`);
        sec3Header.value = '3. OPERATIONAL & CASH FLOW METRICS';
        sec3Header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        sec3Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        sec3Header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        sheet.getRow(rowIdx).height = 24;
        rowIdx++;

        const h3Row = sheet.getRow(rowIdx);
        h3Row.values = ['Metric Name', 'Area', 'Classification', 'Amount / Count', 'Description'];
        h3Row.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
        h3Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        h3Row.height = 22;
        h3Row.eachCell((c) => { c.border = headerBorder; c.alignment = { vertical: 'middle' }; });
        rowIdx++;

        const ops: [string, string, string, number, string, boolean][] = [
            ["Today's Collections", 'Collections', 'Cash Flow', Math.round(Number(revenueStats?.todayRevenue || 0)), 'Cash collected on current date', true],
            ['Payments Recorded Today', 'Collections', 'Transaction Count', Number(revenueStats?.totalPaymentsToday || 0), 'Number of completed payment receipts', false],
            ['Total Outstanding Balance', 'Receivables', 'Pending Dues', Math.round(Number(revenueStats?.pendingBalance || 0)), 'Total uncollected dues across all bills', true],
            ["Today's Expenses", 'Expenses', 'Cash Flow', Math.round(Number(expenseStats?.todayTotal || 0)), 'Expenses booked on current date', true],
            [`${periodTitle} Expenses`, 'Expenses', 'Period Expenses', totalExpenses, 'Total operational expenses in period', true],
            ['Expenses Pending Approval', 'Expenses', 'Pending Count', Number(expenseStats?.pendingApproval || 0), 'Number of expenses awaiting approval', false],
        ];

        ops.forEach((op, idx) => {
            const r = sheet.getRow(rowIdx);
            r.values = [op[0], op[1], op[2], op[3], op[4]];
            r.height = 20;
            if (idx % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            r.eachCell((c, colNumber) => {
                c.border = thinBorder;
                c.alignment = { vertical: 'middle' };
                if (colNumber === 4) {
                    c.numFmt = op[5] ? '₹#,##0' : '#,##0';
                    c.font = { bold: true };
                }
            });
            rowIdx++;
        });

        // ── 4. Receivables Aging ──
        if (revenueStats?.aging) {
            // Spacer
            sheet.getRow(rowIdx).height = 12;
            rowIdx++;

            sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
            const sec4Header = sheet.getCell(`A${rowIdx}`);
            sec4Header.value = '4. OUTSTANDING RECEIVABLES AGING';
            sec4Header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
            sec4Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
            sec4Header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            sheet.getRow(rowIdx).height = 24;
            rowIdx++;

            const h4Row = sheet.getRow(rowIdx);
            h4Row.values = ['Aging Bucket', 'Category', 'Risk Level', 'Amount (₹)', 'Share of Outstanding'];
            h4Row.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
            h4Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            h4Row.height = 22;
            h4Row.eachCell((c) => { c.border = headerBorder; c.alignment = { vertical: 'middle' }; });
            rowIdx++;

            const pendingTotal = Number(revenueStats?.pendingBalance || 0);
            const ag0 = Math.round(Number(revenueStats.aging.days0to30 || 0));
            const ag30 = Math.round(Number(revenueStats.aging.days30to60 || 0));
            const ag60 = Math.round(Number(revenueStats.aging.days60plus || 0));

            const agingRows = [
                ['0–30 Days', 'Receivables', 'Current Bucket', ag0, pendingTotal > 0 ? ((ag0 / pendingTotal) * 100).toFixed(1) + '%' : '0.0%'],
                ['30–60 Days', 'Receivables', 'Moderate Aging', ag30, pendingTotal > 0 ? ((ag30 / pendingTotal) * 100).toFixed(1) + '%' : '0.0%'],
                ['60+ Days', 'Receivables', 'High Risk Overdue', ag60, pendingTotal > 0 ? ((ag60 / pendingTotal) * 100).toFixed(1) + '%' : '0.0%'],
                ['Total Outstanding', 'Receivables', 'Total Due', Math.round(pendingTotal), '100.0%'],
            ];

            agingRows.forEach((ar, idx) => {
                const r = sheet.getRow(rowIdx);
                r.values = ar;
                r.height = 20;
                const isTotal = idx === agingRows.length - 1;
                if (isTotal) {
                    r.font = { bold: true };
                    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                } else if (idx % 2 === 1) {
                    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }
                r.eachCell((c, colNumber) => {
                    c.border = isTotal ? headerBorder : thinBorder;
                    c.alignment = { vertical: 'middle' };
                    if (colNumber === 4) {
                        c.numFmt = '₹#,##0';
                        c.font = { bold: true };
                    }
                });
                rowIdx++;
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();

        return {
            success: true,
            base64: Buffer.from(buffer).toString('base64'),
            filename: `Income-Expense-Report-${period}-${dateStr}.xlsx`,
        };
    } catch (error: unknown) {
        console.error('Income Expense Excel Export Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to generate Excel report' };
    }
}

