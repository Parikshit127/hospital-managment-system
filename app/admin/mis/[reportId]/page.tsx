import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { FileBarChart2 } from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { generateReport } from '@/app/actions/mis-report-actions';
import { REGISTRY } from '@/lib/mis/runner';
import { UniversalReportShell } from '@/components/mis/UniversalReportShell';
import type { UniversalPayload } from '@/components/mis/UniversalReportShell';

// Bug 1 fix (belt-and-suspenders): force the route to be dynamic so Next.js
// ALWAYS re-executes the Server Component with the current searchParams on
// every navigation. Without this, the RSC cache may serve a stale payload
// when filter params change.
export const dynamic = 'force-dynamic';

/**
 * Dynamic MIS Report Viewer — `app/admin/mis/[reportId]/page.tsx`
 * ---------------------------------------------------------------
 * Single route that renders ANY report registered in REGISTRY.
 *
 * ## Architecture notes
 *
 * ### Why we import REGISTRY directly (not via a Server Action)
 *   REGISTRY is an in-process Node.js Map — already in memory on the server.
 *   Reading it for column definitions costs zero network latency.
 *   A Server Action call would add an unnecessary HTTP round-trip for data
 *   that never changes at runtime. This pattern is safe because page.tsx is
 *   a Server Component and never ships REGISTRY to the client bundle.
 *
 * ### params / searchParams are synchronous (Next.js 14)
 *   In this project's Next.js 14 configuration, `params` and `searchParams`
 *   are plain synchronous objects — NOT Promises. Do NOT await them.
 *
 * ### 404 handling
 *   We perform a pre-flight REGISTRY check before calling generateReport().
 *   This avoids a Prisma round-trip for completely unknown report IDs and
 *   returns a proper 404 response via Next.js's `notFound()`.
 *
 * ### ColumnSpec[] as a Client Component prop
 *   ColumnSpec contains only primitive values — no ZodSchema, no functions.
 *   It is safe to pass across the Server→Client boundary without any stripping.
 *
 * ### Suspense boundary
 *   Mandatory: UniversalReportShell calls useSearchParams() which suspends
 *   during SSR without a Suspense boundary.
 */

// ─── Route segment types (Next.js 14 — sync params/searchParams) ─────────────

interface PageProps {
    params: Promise<{ reportId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}
// ─── Dynamic metadata ─────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    // Next.js Async Segments: Must await params
    const resolvedParams = await params;
    const reportDef = REGISTRY[resolvedParams.reportId];

    if (!reportDef) {
        return {
            title: 'Report Not Found — MIS | HospitalOS',
            description: 'The requested MIS report does not exist.',
        };
    }
    return {
        title: `${reportDef.name} — MIS | HospitalOS`,
        description: reportDef.description,
    };
}

// ─── Filter builder ───────────────────────────────────────────────────────────

/**
 * Maps URL search param keys (written by MISFilterEngine) to the Zod filter
 * keys expected by the report registry's safeParse schemas.
 *
 * URL key    → Zod key
 * startDate  → date_start
 * endDate    → date_end
 *
 * Default window: last 30 days — consistent with the bespoke `/revenue/daily`
 * page and the Reports Hub convention.
 *
 * `branch_id` and `department_id` are forwarded as-is when present; they are
 * reserved for future multi-branch and department-level filter support.
 */
function buildFilters(sp: { [key: string]: string | string[] | undefined }): Record<string, string | undefined> {
    // Coerce string | string[] | undefined → string | undefined
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
        branch_id: raw('branch_id'),      // reserved — multi-branch
        department_id: raw('department_id'),  // reserved — department filter
        doctor_id: raw('doctor'),         // Note: MISFilterEngine writes 'doctor' to URL
        bill_type: raw('bill_type'),
        status: raw('status'),
        store_id: raw('store_id'),
        // Bug 3A fix: forward service_category so Revenue Service Type report
        // receives the correct billing category filter on the SSR pass.
        service_category: raw('service_category'),
    };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DynamicReportPage({ params, searchParams }: PageProps) {
    // Next.js explicitly demands we await these now
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;

    const { reportId } = resolvedParams;

    // ── Step 1: Registry pre-flight check (no DB call) ──────────────────────
    const reportDef = REGISTRY[reportId];
    if (!reportDef) {
        notFound();
    }

    // ── Step 2: Build Zod-compatible filters from URL search params ──────────
    const filters = buildFilters(resolvedSearchParams);

    // ── Step 3: Run the report via Server Action ─────────────────────────────
    // generateReport() validates filters against the report's Zod schema,
    // checks permissions, and dispatches either a sync or async execution.
    let payload: UniversalPayload;
    try {
        const result = await generateReport(reportId, filters);
        // GenerateReportResponse is a superset of UniversalPayload (it also
        // includes `meta`). We pick only the fields UniversalReportShell needs.
        payload = {
            async: result.async,
            jobId: result.jobId,
            rows: result.rows,
            totals: result.totals,
            // Forward the error flag so AccessDeniedState renders correctly.
            // Without this line, { error: 'UNAUTHORIZED' } from generateReport()
            // is silently dropped and the shell falls through to EmptyState.
            error: result.error,
        };
    } catch (err: unknown) {
        // This catches both "report not found" (belt-and-suspenders) and any
        // permission / validation errors thrown by runner.ts.
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[MIS] Failed to generate report "${reportId}":`, message);
        notFound();
    }

    // ── Step 4: Extract safe metadata from the registry ──────────────────────
    // `columns` is ColumnSpec[] — all primitive values, safe to pass to a
    // Client Component without any stripping.
    // `reportDef.filters` (ZodSchema) is intentionally NOT passed.
    // `drillDownTo` / `drillDownKey` are optional strings — safe to pass.
    const { name: reportName, columns, drillDownTo, drillDownKey, filterSpec } = reportDef;

    return (
        <AdminPage
            pageTitle={reportName}
            pageIcon={<FileBarChart2 className="h-5 w-5" />}
        >
            {/*
             * Suspense is mandatory: UniversalReportShell calls useSearchParams()
             * in its Client Component subtree, which suspends during SSR.
             */}
            <Suspense fallback={<ReportPageSkeleton columnCount={columns.length} />}>
                <UniversalReportShell
                    reportId={reportId}
                    reportName={reportName}
                    columns={columns}
                    payload={payload!}
                    drillDownTo={drillDownTo}
                    drillDownKey={drillDownKey}
                    filterSpec={filterSpec}
                />
            </Suspense>
        </AdminPage>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

/**
 * Loading skeleton shown inside the Suspense boundary while the Client
 * Component tree hydrates. Column count drives how many header shimmer
 * bars to show, making the skeleton feel contextually accurate.
 */
function ReportPageSkeleton({ columnCount }: { columnCount: number }) {
    return (
        <div className="space-y-4 animate-pulse" aria-label="Loading report…" aria-busy="true">
            {/* Filter bar skeleton */}
            <div className="h-14 bg-gray-100 rounded-2xl" />

            {/* Table card skeleton */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="h-4 w-40 bg-gray-200 rounded-full" />
                    <div className="h-7 w-28 bg-gray-200 rounded-xl" />
                </div>

                {/* Table header row */}
                <div className="px-5 py-3 border-b border-gray-100 flex gap-4">
                    {Array.from({ length: Math.min(columnCount, 7) }).map((_, i) => (
                        <div key={i} className="h-3 bg-gray-200 rounded-full flex-1" />
                    ))}
                </div>

                {/* Table body rows */}
                {Array.from({ length: 8 }).map((_, rowIdx) => (
                    <div
                        key={rowIdx}
                        className={`px-5 py-3.5 flex gap-4 border-b border-gray-50 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                            }`}
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
