/**
 * PortalMISViewerPage
 * -------------------
 * Shared Server Component that renders a single MIS report for any
 * operational portal (finance, doctor, lab, pharmacy, reception, ipd).
 *
 * Mirrors the admin route `app/admin/mis/[reportId]/page.tsx` but without
 * the `AdminPage` wrapper — renders a self-contained page with breadcrumb,
 * header, and the `UniversalReportShell` Client Component.
 *
 * Each portal's `[reportId]/page.tsx` simply calls this with the appropriate
 * `portalName`, `backHref`, and `backLabel`.
 */

import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { FileBarChart2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { generateReport } from '@/app/actions/mis-report-actions';
import { REGISTRY } from '@/lib/mis/runner';
import { UniversalReportShell } from '@/components/mis/UniversalReportShell';
import type { UniversalPayload } from '@/components/mis/UniversalReportShell';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PortalMISViewerPageProps {
    /** The report ID from the URL param. */
    reportId: string;
    /** Resolved search params from the page. */
    searchParams: { [key: string]: string | string[] | undefined };
    /** Human-readable portal name (e.g. "Finance"). */
    portalName: string;
    /** Link target for the "Back" breadcrumb (e.g. "/finance/mis-reports"). */
    backHref: string;
    /** Label for the back breadcrumb (e.g. "MIS Report Catalogue"). */
    backLabel: string;
}

// ─── Filter builder (mirrors admin/mis/[reportId]/page.tsx) ───────────────────

function buildFilters(sp: { [key: string]: string | string[] | undefined }): Record<string, string | undefined> {
    const raw = (key: string): string | undefined => {
        const v = sp[key];
        return Array.isArray(v) ? v[0] : v;
    };

    const today = new Date();
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const iso = (d: Date) => d.toISOString().split('T')[0];

    return {
        date_start: raw('startDate') ?? iso(thirtyAgo),
        date_end: raw('endDate') ?? iso(today),
        branch_id: raw('branch_id'),
        department_id: raw('department_id'),
    };
}

// ─── Component ────────────────────────────────────────────────────────────────

export async function PortalMISViewerPage({
    reportId,
    searchParams,
    portalName,
    backHref,
    backLabel,
}: PortalMISViewerPageProps) {
    // ── Step 1: Registry pre-flight check ────────────────────────────────────
    const reportDef = REGISTRY[reportId];
    if (!reportDef) {
        notFound();
    }

    // ── Step 2: Build Zod-compatible filters from URL search params ──────────
    const filters = buildFilters(searchParams);

    // ── Step 3: Run the report ──────────────────────────────────────────────
    let payload: UniversalPayload;
    try {
        const result = await generateReport(reportId, filters);
        payload = {
            async: result.async,
            jobId: result.jobId,
            rows: result.rows,
            totals: result.totals,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[MIS] Failed to generate report "${reportId}" for ${portalName} portal:`, message);
        notFound();
    }

    // ── Step 4: Extract safe metadata ────────────────────────────────────────
    const { name: reportName, columns } = reportDef;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* ── Breadcrumb ────────────────────────────────────────────── */}
            <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
            </Link>

            {/* ── Page header ───────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-xl">
                    <FileBarChart2 className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-lg font-black text-stone-900">
                        {reportName}
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">
                        {portalName} Portal — MIS Report
                    </p>
                </div>
            </div>

            {/* ── Report shell ──────────────────────────────────────────── */}
            <Suspense fallback={<ViewerSkeleton columnCount={columns.length} />}>
                <UniversalReportShell
                    reportId={reportId}
                    reportName={reportName}
                    columns={columns}
                    payload={payload}
                    drillDownTo={reportDef.drillDownTo}
                    drillDownKey={reportDef.drillDownKey}
                    filterSpec={reportDef.filterSpec}
                />
            </Suspense>
        </div>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ViewerSkeleton({ columnCount }: { columnCount: number }) {
    return (
        <div className="space-y-4 animate-pulse" aria-label="Loading report…" aria-busy="true">
            <div className="h-14 bg-gray-100 rounded-2xl" />
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="h-4 w-40 bg-gray-200 rounded-full" />
                    <div className="h-7 w-28 bg-gray-200 rounded-xl" />
                </div>
                <div className="px-5 py-3 border-b border-gray-100 flex gap-4">
                    {Array.from({ length: Math.min(columnCount, 7) }).map((_, i) => (
                        <div key={i} className="h-3 bg-gray-200 rounded-full flex-1" />
                    ))}
                </div>
                {Array.from({ length: 8 }).map((_, rowIdx) => (
                    <div
                        key={rowIdx}
                        className={`px-5 py-3.5 flex gap-4 border-b border-gray-50 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    >
                        {Array.from({ length: Math.min(columnCount, 7) }).map((_, colIdx) => (
                            <div
                                key={colIdx}
                                className="h-4 bg-gray-100 rounded-full flex-1"
                                style={{ opacity: 1 - colIdx * 0.08 }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
