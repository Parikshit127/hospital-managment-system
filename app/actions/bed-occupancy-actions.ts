'use server';
/* eslint-disable @typescript-eslint/no-explicit-any -- tenant Prisma client rows are loosely typed (same as ipd-actions) */

/**
 * IPD Bed Occupancy report — server actions.
 *
 * Auth: reuses the MIS RBAC (`mis_reports.admission.view`), which is granted to
 * admin, ipd_manager and finance. Every query is tenant-scoped via
 * requireTenantContext and additionally filters on organizationId.
 *
 * The maths lives in app/lib/reports/bed-occupancy.ts (pure + unit-tested); this file
 * only validates input, loads rows and shapes the response.
 */

import { z } from 'zod';
import { requireTenantContext } from '@/backend/tenant';
import { getMISPermissions, assertReportAccess } from '@/lib/mis/rbac';
import { getDayRange, getOrgTimezone } from '@/app/lib/timezone';
import {
    computeBedOccupancy,
    type OccupancyResult,
    type OccupancyScope,
    type AdmissionRec,
    type TransferRec,
    type WardRec,
    type DayWindow,
} from '@/app/lib/reports/bed-occupancy';

const REQUIRED_PERMISSION = 'mis_reports.admission.view';
const MAX_RANGE_DAYS = 366;

const filtersSchema = z.object({
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid start date'),
    date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date'),
    department_id: z.string().min(1).max(64).optional().nullable(),
    ward_id: z.coerce.number().int().positive().optional().nullable(),
    bed_category: z.string().min(1).max(100).optional().nullable(),
});

export type BedOccupancyFilters = z.input<typeof filtersSchema>;

export interface BedOccupancyReportPayload extends OccupancyResult {
    meta: {
        organizationName: string;
        timezone: string;
        generatedAt: string;
        filters: {
            department: string | null;
            ward: string | null;
            bedCategory: string | null;
        };
    };
}

export type BedOccupancyResponse =
    | { success: true; data: BedOccupancyReportPayload }
    | { success: false; error: string };

export interface BedOccupancyFilterOptions {
    departments: { id: string; name: string }[];
    wards: { id: number; name: string; departmentId: string | null }[];
    categories: string[];
}

/** Every YYYY-MM-DD from start to end inclusive (pure calendar arithmetic, no tz). */
function enumerateDayKeys(start: string, end: string): string[] {
    const out: string[] = [];
    const endMs = Date.parse(`${end}T00:00:00Z`);
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= endMs; t += 86_400_000) {
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
}

async function authorize() {
    const ctx = await requireTenantContext();
    assertReportAccess(REQUIRED_PERMISSION, getMISPermissions(ctx.session.role));
    return ctx;
}

function errorMessage(e: unknown): string {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'MIS_ACCESS_DENIED') return 'You do not have permission to view the bed occupancy report.';
    if (err?.message?.startsWith('AUTH_ERROR')) return 'Your session has expired. Please sign in again.';
    return err?.message || 'Failed to generate bed occupancy report';
}

export async function loadBedOccupancy(rawFilters: BedOccupancyFilters): Promise<BedOccupancyResponse> {
    try {
        const { db, organizationId } = await authorize();

        const parsed = filtersSchema.safeParse(rawFilters);
        if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid filters' };
        const f = parsed.data;

        const keys = enumerateDayKeys(f.date_start, f.date_end);
        if (keys.length === 0) return { success: false, error: 'End date must be on or after the start date' };
        if (keys.length > MAX_RANGE_DAYS) return { success: false, error: `Please select a range of ${MAX_RANGE_DAYS} days or less` };

        const tz = await getOrgTimezone();
        const days: DayWindow[] = keys.map((key) => {
            const start = getDayRange(key, tz).start.getTime();
            return { key, start, end: start + 86_400_000 };
        });
        // Correct for zones where a day is not exactly 24h: each day ends where the next begins.
        for (let i = 0; i < days.length - 1; i++) days[i].end = days[i + 1].start;

        const now = new Date();
        const rangeStart = new Date(days[0].start);
        const rangeEnd = new Date(Math.min(days[days.length - 1].end, now.getTime()));

        const [beds, wards, admissionRows, org] = await Promise.all([
            db.beds.findMany({
                where: { organizationId },
                select: { bed_id: true, bed_name: true, bed_category: true, ward_id: true, status: true, is_isolation: true },
            }),
            db.wards.findMany({
                where: { organizationId },
                select: {
                    ward_id: true, ward_name: true, ward_type: true, department_id: true,
                    department: { select: { name: true } },
                },
            }),
            db.admissions.findMany({
                where: {
                    organizationId,
                    admission_date: { lt: rangeEnd },
                    OR: [
                        { status: 'Admitted' },
                        { discharge_date: null },
                        { discharge_date: { gte: rangeStart } },
                    ],
                },
                select: {
                    admission_id: true, status: true, admission_date: true, discharge_date: true,
                    bed_id: true, ward_id: true, discharge_type: true, is_death: true,
                },
            }),
            db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
        ]);

        const admissions: AdmissionRec[] = admissionRows.map((a: any) => ({
            admission_id: a.admission_id,
            status: a.status,
            admission_date: a.admission_date,
            discharge_date: a.discharge_date,
            bed_id: a.bed_id,
            ward_id: a.ward_id,
            discharge_type: a.discharge_type,
            is_death: !!a.is_death,
        }));

        const transfers: TransferRec[] = [];
        const ids = admissions.filter((a) => a.status !== 'Cancelled').map((a) => a.admission_id);
        for (let i = 0; i < ids.length; i += 2000) {
            const chunk = await db.bedTransfer.findMany({
                where: { organizationId, admission_id: { in: ids.slice(i, i + 2000) } },
                select: { admission_id: true, from_bed_id: true, to_bed_id: true, created_at: true },
            });
            for (const t of chunk as any[]) transfers.push(t);
        }

        const wardRecs: WardRec[] = wards.map((w: any) => ({
            ward_id: w.ward_id,
            ward_name: w.ward_name,
            ward_type: w.ward_type,
            department_id: w.department_id,
            department_name: w.department?.name ?? null,
        }));

        const scope: OccupancyScope = {
            departmentId: f.department_id || null,
            wardId: f.ward_id ?? null,
            bedCategory: f.bed_category || null,
        };

        const result = computeBedOccupancy({
            beds: beds as any[],
            wards: wardRecs,
            admissions,
            transfers,
            days,
            now,
            scope,
        });

        return {
            success: true,
            data: {
                ...result,
                meta: {
                    organizationName: org?.name ?? '',
                    timezone: tz,
                    generatedAt: now.toISOString(),
                    filters: {
                        department: f.department_id ? wardRecs.find((w) => w.department_id === f.department_id)?.department_name ?? null : null,
                        ward: f.ward_id ? wardRecs.find((w) => w.ward_id === f.ward_id)?.ward_name ?? null : null,
                        bedCategory: f.bed_category || null,
                    },
                },
            },
        };
    } catch (e) {
        console.error('[bed-occupancy] loadBedOccupancy failed:', e);
        return { success: false, error: errorMessage(e) };
    }
}

export async function getBedOccupancyFilterOptions(): Promise<
    { success: true; data: BedOccupancyFilterOptions } | { success: false; error: string }
> {
    try {
        const { db, organizationId } = await authorize();
        const [departments, wards, beds] = await Promise.all([
            db.department.findMany({
                where: { organizationId, is_active: true },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
            db.wards.findMany({
                where: { organizationId },
                select: { ward_id: true, ward_name: true, department_id: true },
                orderBy: { ward_name: 'asc' },
            }),
            db.beds.findMany({ where: { organizationId }, select: { bed_category: true }, distinct: ['bed_category'] }),
        ]);
        const categories = new Set<string>();
        for (const b of beds as any[]) categories.add((b.bed_category && b.bed_category.trim()) || 'Uncategorised');
        return {
            success: true,
            data: {
                departments: departments as any[],
                wards: (wards as any[]).map((w) => ({ id: w.ward_id, name: w.ward_name, departmentId: w.department_id })),
                categories: [...categories].sort((a, b) => a.localeCompare(b)),
            },
        };
    } catch (e) {
        return { success: false, error: errorMessage(e) };
    }
}

export async function exportBedOccupancyExcel(
    rawFilters: BedOccupancyFilters,
): Promise<{ success: true; fileName: string; base64: string } | { success: false; error: string }> {
    const res = await loadBedOccupancy(rawFilters);
    if (!res.success) return res;
    try {
        const { buildBedOccupancyWorkbook } = await import('@/app/lib/reports/bed-occupancy-excel');
        const { session } = await requireTenantContext();
        const buffer = await buildBedOccupancyWorkbook(res.data, session?.name || session?.username || undefined);
        return {
            success: true,
            fileName: `Bed-Occupancy_${res.data.range.start}_to_${res.data.range.end}.xlsx`,
            base64: buffer.toString('base64'),
        };
    } catch (e) {
        console.error('[bed-occupancy] excel export failed:', e);
        return { success: false, error: 'Failed to build Excel file' };
    }
}
