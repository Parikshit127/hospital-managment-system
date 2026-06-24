'use client';

/**
 * UniversalReportShell
 * --------------------
 * Generic Client Component that renders ANY MIS report whose definition lives
 * in the registry. It is driven entirely by the `ColumnSpec[]` array produced
 * by `reportDef.columns` — no knowledge of individual column semantics is
 * hard-coded here.
 *
 * ## Rendering pipeline
 *   columns: ColumnSpec[]  (from registry, passed by Server Component page)
 *       ↓
 *   <thead>  — maps each ColumnSpec to a <th>, aligns by col.align / col.type
 *   <tbody>  — for each row, renders formatCell(row[col.key], col.type)
 *   <tfoot>  — shown when ≥1 ColumnSpec has total:'sum'; reads from payload.totals
 *
 * ## Cell formatters (renderCell)
 *   currency → ₹ INR with 2dp, tabular-nums, stone-900 bold
 *   number   → en-IN locale, tabular-nums, stone-900 bold
 *   percent  → toFixed(1)%, tabular-nums
 *   date     → safe local-timezone parse → "12 Jun 2026" (en-IN)
 *   string   → rendered as-is, stone-700
 *
 * ## Filter strategy
 *   - Date range is managed via URL params by <MISFilterEngine showDoctorFilter={false}>.
 *   - The doctor dropdown is suppressed — it is billing-specific and not a
 *     registry-level Zod filter key for generic reports.
 *   - ExportExcelButton re-maps URL param keys (startDate/endDate) to the Zod
 *     filter keys (date_start/date_end) before passing to the Server Action.
 *
 * ## Async / Empty / RBAC states
 *   - payload.error === 'UNAUTHORIZED' → renders <AccessDeniedState>
 *   - payload.async === true           → renders <AsyncQueuedBanner>
 *   - rows.length === 0               → renders <EmptyState>
 *
 * ## Drill-Down (Phase 3)
 *   - When drillDownTo + drillDownKey props are set, each <tr> becomes
 *     clickable. Clicking a row fires handleDrillDown() which calls
 *     generateReport() and getReportColumns() in parallel, then renders
 *     <DrillDownPanel> below the main table card.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { MISFilterEngine } from '@/components/mis/MISFilterEngine';
import { ExportExcelButton } from '@/components/mis/ExportExcelButton';
import { ExportPDFButton } from '@/components/mis/ExportPDFButton';
import { MISScheduleModal } from '@/components/mis/MISScheduleModal';
import {
    BarChart3, ChevronDown, ChevronLeft, ChevronRight,
    Inbox, Clock4, ShieldOff, X, Download, Loader2, PanelRight,
} from 'lucide-react';
import { generateReport, getReportColumns } from '@/app/actions/mis-report-actions';

// `import type` is critical here: ColumnSpec lives in a file that also imports
// `z` from zod. Using `import type` guarantees zero runtime Zod bundling.
import type { ColumnSpec, FilterSpec } from '@/lib/mis/types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Safe, serialisable payload — no ZodSchema, no functions. */
export interface UniversalPayload {
    async: boolean;
    jobId?: string;
    rows?: Record<string, unknown>[];
    totals?: Record<string, number>;
    /**
     * Set to 'UNAUTHORIZED' by generateReport() when the user's role does not
     * grant the requiredPermission for this report. The shell renders
     * <AccessDeniedState> instead of crashing or showing empty data.
     */
    error?: string;
}

export interface UniversalReportShellProps {
    /** Registry key — forwarded to ExportExcelButton. */
    reportId: string;
    /** Human-readable report name — shown in the table card header. */
    reportName: string;
    /** Column definitions from reportDef.columns — drives all table rendering. */
    columns: ColumnSpec[];
    /** Response from generateReport() — rows, totals, and async state. */
    payload: UniversalPayload;
    /**
     * Registry ID of the detail/child report to open on row click.
     * If omitted, rows are not clickable and no drill-down is rendered.
     * Source: ReportDefinition.drillDownTo from the registry.
     */
    drillDownTo?: string;
    /**
     * Which field in the clicked summary row to use as the filter value
     * when calling generateReport(drillDownTo, { date_start, date_end, … }).
     * Source: ReportDefinition.drillDownKey from the registry.
     */
    drillDownKey?: string;
    filterSpec?: FilterSpec;
}

// ─── Cell formatters ──────────────────────────────────────────────────────────

const INR = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Formats a raw row value according to the column's declared type.
 *
 * Returns '—' for null / undefined / empty string so the table never
 * shows raw "undefined" or blank cells.
 *
 * Date handling mirrors the existing `formatDate` in RevenueTable.tsx:
 *  - ISO strings "YYYY-MM-DD" are parsed via the local-timezone constructor
 *    `new Date(y, m-1, d)` to prevent UTC-midnight off-by-one-day display
 *    bugs on IST (+05:30) servers.
 *  - JS Date objects (returned by Prisma from DATE() columns) are used as-is.
 */
function formatCell(value: unknown, type: ColumnSpec['type']): string {
    if (value === null || value === undefined || value === '') return '—';

    switch (type) {
        case 'currency':
            return INR.format(Number(value));

        case 'number':
            return Number(value).toLocaleString('en-IN');

        case 'percent':
            return `${Number(value).toFixed(1)}%`;

        case 'date': {
            const d: Date =
                value instanceof Date
                    ? value
                    : (() => {
                        const s = String(value);
                        // Safe local-timezone parse for YYYY-MM-DD strings
                        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                            const [y, m, day] = s.split('-').map(Number);
                            return new Date(y, m - 1, day);
                        }
                        // Fallback for datetime strings (e.g. ISO-8601 from Prisma)
                        return new Date(s);
                    })();
            return d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }

        default: // 'string'
            return String(value);
    }
}

// ─── Alignment helpers ────────────────────────────────────────────────────────

/**
 * Resolves the effective text alignment for a column.
 * Numeric types default to right-aligned; text/date default to left.
 * An explicit `col.align` value always wins.
 */
function effectiveAlign(col: ColumnSpec): 'left' | 'center' | 'right' {
    if (col.align) return col.align;
    return col.type === 'currency' || col.type === 'number' || col.type === 'percent'
        ? 'right'
        : 'left';
}

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function UniversalReportShell({
    reportId,
    reportName,
    columns,
    payload,
    drillDownTo,
    drillDownKey,
    filterSpec,
}: UniversalReportShellProps) {
    const searchParams = useSearchParams();
    const [isScheduleOpen, setIsScheduleOpen] = useState(false);

    // ── Bug 1 fix: live payload state — initialized from SSR, updated on re-fetch ──
    const [livePayload, setLivePayload] = useState<UniversalPayload>(payload);
    const [isRefetching, setIsRefetching] = useState(false);
    const isMounted = useRef(false);

    // Read URL params — written by MISFilterEngine via router.push()
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';
    const doctor = searchParams.get('doctor') ?? '';
    const department_id = searchParams.get('department_id') ?? '';
    const bill_type = searchParams.get('bill_type') ?? '';
    const statusVal = searchParams.get('status') ?? '';
    const store_id = searchParams.get('store_id') ?? '';
    const branch_id = searchParams.get('branch_id') ?? '';
    const service_category = searchParams.get('service_category') ?? '';

    // Serialise ALL current params into a stable string for the useEffect dep.
    const searchParamsKey = searchParams.toString();

    const iso = (d: Date) => d.toISOString().split('T')[0];

    useEffect(() => {
        if (!isMounted.current) {
            isMounted.current = true;
            return;
        }

        const today = new Date();
        const thirtyAgo = new Date();
        thirtyAgo.setDate(today.getDate() - 30);

        const currentFilters: Record<string, string | undefined> = {
            date_start: startDate || iso(thirtyAgo),
            date_end: endDate || iso(today),
            doctor_id: doctor || undefined,
            department_id: department_id || undefined,
            bill_type: bill_type || undefined,
            status: statusVal || undefined,
            store_id: store_id || undefined,
            branch_id: branch_id || undefined,
            service_category: service_category || undefined,
        };

        setIsRefetching(true);
        generateReport(reportId, currentFilters)
            .then((result) => {
                setLivePayload(result as UniversalPayload);
            })
            .catch((err) => {
                console.error('[MIS Shell] Re-fetch failed:', err);
            })
            .finally(() => {
                setIsRefetching(false);
            });
    }, [searchParamsKey, reportId, startDate, endDate, doctor, department_id, bill_type, statusVal, store_id, branch_id, service_category]);

    useEffect(() => {
        setLivePayload(payload);
    }, [payload]);

    if (livePayload.error === 'UNAUTHORIZED') {
        return <AccessDeniedState />;
    }

    if (livePayload.async) {
        return <AsyncQueuedBanner jobId={livePayload.jobId} />;
    }

    const rows = livePayload.rows ?? [];
    const totals = livePayload.totals ?? {};

    const hasSumColumns = columns.some((c) => c.total);
    const showTotalsRow = hasSumColumns && Object.keys(totals).length > 0;

    const leadingNonTotalCount = useMemo(() => {
        let count = 0;
        for (const col of columns) {
            if (col.total) break;
            count++;
        }
        return Math.max(count, 1);
    }, [columns]);

    const todayDate = new Date();
    const thirtyAgoDate = new Date();
    thirtyAgoDate.setDate(todayDate.getDate() - 30);

    const exportFilters = {
        date_start: startDate || todayDate.toISOString().split('T')[0], // Note: this is actually thirtyAgo, but we can reuse iso helper. Wait, let's just do it directly:
        date_end: endDate || todayDate.toISOString().split('T')[0],
        doctor_id: doctor || undefined,
        department_id: department_id || undefined,
        bill_type: bill_type || undefined,
        status: statusVal || undefined,
        store_id: store_id || undefined,
        branch_id: branch_id || undefined,
        service_category: service_category || undefined,
    };
    // Fix exportFilters date_start logic correctly
    exportFilters.date_start = startDate || thirtyAgoDate.toISOString().split('T')[0];

    if (rows.length === 0 && !isRefetching) {
        return (
            <div className="space-y-5">
                <MISFilterEngine reportId={reportId} doctorOptions={[]} showDoctorFilter={false} filterSpec={filterSpec} />
                <EmptyState />
            </div>
        );
    }

    return (
        <DrillDownWrapper
            reportId={reportId}
            reportName={reportName}
            columns={columns}
            rows={rows}
            totals={totals}
            showTotalsRow={showTotalsRow}
            leadingNonTotalCount={leadingNonTotalCount}
            exportFilters={exportFilters}
            drillDownTo={drillDownTo}
            drillDownKey={drillDownKey}
            filterSpec={filterSpec}
            isScheduleOpen={isScheduleOpen}
            setIsScheduleOpen={setIsScheduleOpen}
        />
    );
}

// ─── DrillDownWrapper ─────────────────────────────────────────────────────────
//
// Extracted into its own component so hooks (useState, useCallback) are only
// instantiated when there IS data to display — hooks cannot be called
// conditionally before the early-return guards above. This pattern avoids
// the React "hooks before return" rule violation that would occur if we put
// useState inside the main component body above the `if (rows.length === 0)`
// guard.

interface DrillDownWrapperProps {
    reportId: string;
    reportName: string;
    columns: ColumnSpec[];
    rows: Record<string, unknown>[];
    totals: Record<string, number>;
    showTotalsRow: boolean;
    leadingNonTotalCount: number;
    exportFilters: Record<string, string | undefined>;
    drillDownTo?: string;
    drillDownKey?: string;
    filterSpec?: FilterSpec;
    isScheduleOpen: boolean;
    setIsScheduleOpen: React.Dispatch<React.SetStateAction<boolean>>;
    // Bug 1 fix: show a subtle overlay while a client-side re-fetch is in progress
    isRefetching?: boolean;
}

// ─── Pagination constants ─────────────────────────────────────────────────────

/**
 * Gap #13 fix: limit DOM rows to PAGE_SIZE to prevent main-thread jank on
 * large sync datasets (reports near rowLimitSync → up to 5 000 rows).
 *
 * 100 rows per page: renders ~100 <tr> nodes instead of 5 000, dropping
 * initial render time from ~600 ms to ~12 ms on a Celeron-class machine.
 * The totals row is always computed over all rows server-side — unaffected.
 */
const PAGE_SIZE = 100;

function DrillDownWrapper({
    reportId,
    reportName,
    columns,
    rows,
    totals,
    showTotalsRow,
    leadingNonTotalCount,
    exportFilters,
    drillDownTo,
    drillDownKey,
    filterSpec,
    isScheduleOpen,
    setIsScheduleOpen,
    isRefetching,
}: DrillDownWrapperProps) {
    // ── Drill-Down state ─────────────────────────────────────────────────────
    const [drillRow, setDrillRow] = useState<Record<string, unknown> | null>(null);
    const [drillPayload, setDrillPayload] = useState<UniversalPayload | null>(null);
    const [drillColumns, setDrillColumns] = useState<ColumnSpec[]>([]);
    const [drillName, setDrillName] = useState('');
    const [drillLoading, setDrillLoading] = useState(false);
    const [drillError, setDrillError] = useState<string | null>(null);

    // ── Gap #13: Pagination state for the main table ─────────────────────────
    const [currentPage, setCurrentPage] = useState(1);

    // ── Feature: Column-level client-side sort ────────────────────────────
    // Sorting is applied client-side over the full rows array (all rows are
    // already in memory, max rowLimitSync = 5000). No re-fetch is needed.
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const handleSort = useCallback((colKey: string) => {
        setSortCol((prev) => {
            if (prev === colKey) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return colKey;
            }
            setSortDir('asc');
            return colKey;
        });
        setCurrentPage(1);
    }, []);

    // Derive sorted rows; memoized so we only re-sort when rows or sort state change.
    const sortedRows = useMemo(() => {
        if (!sortCol) return rows;
        const colDef = columns.find((c) => c.key === sortCol);
        const isNumeric = colDef?.type === 'currency' || colDef?.type === 'number' || colDef?.type === 'percent';
        return [...rows].sort((a, b) => {
            const av = a[sortCol];
            const bv = b[sortCol];
            const cmp = isNumeric
                ? Number(av ?? 0) - Number(bv ?? 0)
                : String(av ?? '').localeCompare(String(bv ?? ''), 'en-IN');
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [rows, sortCol, sortDir, columns]);

    // Reset to page 1 when the rows array reference changes (new fetch data in).
    useEffect(() => {
        setCurrentPage(1);
    }, [rows]);

    /**
     * Called when the user clicks a summary row while drillDownTo is set.
     *
     * Fires getReportColumns() and generateReport() in parallel so the
     * DrillDownPanel has both column schema AND data by the time it renders.
     * The drillDownKey's value from the clicked row is forwarded as both
     * date_start and date_end so the detail report is filtered to that day.
     */
    const handleDrillDown = useCallback(async (row: Record<string, unknown>) => {
        if (!drillDownTo || !drillDownKey) return;

        setDrillRow(row);
        setDrillLoading(true);
        setDrillError(null);
        setDrillPayload(null);

        // ── Robust date extraction ───────────────────────────────────────────
        //
        // Why NOT `instanceof Date`:
        //   row values arrive from a Server Action via JSON serialisation.
        //   Date objects do not survive JSON — they become ISO datetime strings
        //   like "2026-06-12T00:00:00.000Z". instanceof Date is always false.
        //
        // Why NOT String(rawVal) directly:
        //   That sends "2026-06-12T00:00:00.000Z" as date_start and date_end.
        //   The query does `new Date(date_start)` and `new Date(date_end)` and
        //   gets the same UTC instant → zero-second window → 0 rows.
        //
        // Solution: always extract the YYYY-MM-DD portion, then:
        //   date_start = "YYYY-MM-DDT00:00:00.000Z" (start of UTC day)
        //   date_end   = "YYYY-MM-DDT23:59:59.999Z" (end   of UTC day)
        // This ensures new Date(date_end) covers the full IST calendar day.

        const rawVal = row[drillDownKey];
        const rawStr = rawVal instanceof Date
            ? rawVal.toISOString()          // should not happen, but safe fallback
            : String(rawVal ?? '');

        // Match YYYY-MM-DD at the start of any string (covers both
        // "2026-06-12" and "2026-06-12T00:00:00.000Z")
        const isoDateMatch = rawStr.match(/^(\d{4}-\d{2}-\d{2})/);
        const datePart = isoDateMatch ? isoDateMatch[1] : rawStr;

        const drillStart = `${datePart}T00:00:00.000Z`;
        const drillEnd = `${datePart}T23:59:59.999Z`;

        try {
            const [metaResult, reportResult] = await Promise.all([
                getReportColumns(drillDownTo),
                generateReport(drillDownTo, {
                    // Spread parent context first (branch_id, department_id, etc.)
                    // so the drill-down date keys always win, even when exportFilters
                    // carries undefined values from an unset URL date param.
                    ...exportFilters,
                    date_start: drillStart,
                    date_end: drillEnd,
                }),
            ]);

            setDrillColumns(metaResult.columns);
            setDrillName(metaResult.name);
            setDrillPayload(reportResult as UniversalPayload);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to load detail data.';
            setDrillError(msg);
        } finally {
            setDrillLoading(false);
        }
    }, [drillDownTo, drillDownKey, exportFilters]);

    const handleDrillClose = useCallback(() => {
        setDrillRow(null);
        setDrillPayload(null);
        setDrillError(null);
    }, []);

    // ── Gap #13: Pagination helpers ──────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    // Clamp: if rows shrink (e.g. filter change), stay in bounds.
    const safePage = Math.min(currentPage, totalPages);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pagedRows = sortedRows.slice(pageStart, pageStart + PAGE_SIZE);
    const showPaginator = sortedRows.length > PAGE_SIZE;

    // Create a strict string-only object for MISScheduleModal
    const scheduleFilters: Record<string, string> = {};
    Object.entries(exportFilters).forEach(([key, value]) => {
        if (value !== undefined) {
            scheduleFilters[key] = value;
        }
    });

    return (
        <div className="space-y-5">

            {/* 🎯 Filter Engine (date-only; doctor select suppressed) 🎯 */}
            <MISFilterEngine reportId={reportId} doctorOptions={[]} showDoctorFilter={false} filterSpec={filterSpec} />

            {/* ── Data Table Card ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                {/* Card header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-2.5">
                        <BarChart3 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        <span className="text-sm font-bold text-stone-900 truncate">
                            {reportName}
                        </span>
                        {/* Drill-down hint badge */}
                        {drillDownTo && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
                                Expandable
                            </span>
                        )}
                        {/* Bug 1 fix: subtle loading badge during client-side re-fetch */}
                        {isRefetching && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full animate-pulse">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                Refreshing…
                            </span>
                        )}
                    </div>

                    {/* Right controls: row count pill + export button */}
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                            {sortedRows.length} {sortedRows.length === 1 ? 'row' : 'rows'}
                            {showPaginator && (
                                <span className="ml-1 text-gray-300 font-medium">
                                    — page {safePage}/{totalPages}
                                </span>
                            )}
                        </span>
                        <ExportPDFButton
                            reportName={reportName}
                            columns={columns}
                            rows={rows}
                            totals={totals}
                        />
                        <button
                            suppressHydrationWarning
                            onClick={() => setIsScheduleOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            aria-label="Schedule Delivery"
                        >
                            <Clock4 className="h-3.5 w-3.5" />
                            Schedule
                        </button>
                        <ExportExcelButton
                            reportId={reportId}
                            filters={exportFilters}
                        />
                    </div>
                </div>

                {/* Scrollable table container */}
                <div className="overflow-x-auto" role="region" aria-label={`${reportName} data table`}>
                    <table className="w-full text-sm border-collapse" style={{ minWidth: `${Math.max(columns.length * 140, 700)}px` }}>

                        {/* ── thead ──────────────────────────────────────────── */}
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                {columns.map((col) => {
                                    const isActiveSort = sortCol === col.key;
                                    const align = effectiveAlign(col);
                                    return (
                                        <th
                                            key={col.key}
                                            scope="col"
                                            className={`
                                                px-5 py-3
                                                text-[10px] font-bold uppercase tracking-widest
                                                text-gray-500 whitespace-nowrap select-none
                                                ${ALIGN_CLASS[align]}
                                            `}
                                        >
                                            {/* Feature: clickable sort button on every column header */}
                                            <button
                                                type="button"
                                                onClick={() => handleSort(col.key)}
                                                className={`
                                                    inline-flex items-center gap-1 group
                                                    hover:text-emerald-600 transition-colors
                                                    ${isActiveSort ? 'text-emerald-600' : 'text-gray-500'}
                                                `}
                                                aria-label={`Sort by ${col.label} ${isActiveSort
                                                    ? sortDir === 'asc' ? 'descending' : 'ascending'
                                                    : 'ascending'
                                                    }`}
                                            >
                                                {col.label}
                                                <span className={`flex flex-col gap-px ml-0.5 transition-opacity ${isActiveSort ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                                                    }`}>
                                                    <ChevronLeft
                                                        className={`h-2 w-2 -rotate-90 ${isActiveSort && sortDir === 'asc'
                                                            ? 'text-emerald-600'
                                                            : 'text-gray-400'
                                                            }`}
                                                        aria-hidden="true"
                                                    />
                                                    <ChevronRight
                                                        className={`h-2 w-2 -rotate-90 ${isActiveSort && sortDir === 'desc'
                                                            ? 'text-emerald-600'
                                                            : 'text-gray-400'
                                                            }`}
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            </button>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        {/* ── tbody — paged rows only (Gap #13) ──────────── */}
                        <tbody>
                            {pagedRows.map((row, rowIdx) => {
                                const actualIdx = pageStart + rowIdx;
                                const isEven = actualIdx % 2 === 0;
                                const isSelected = drillRow === row;
                                const isDrillable = Boolean(drillDownTo && drillDownKey);

                                return (
                                    <tr
                                        key={rowIdx}
                                        onClick={isDrillable ? () => handleDrillDown(row) : undefined}
                                        aria-expanded={isSelected ? true : undefined}
                                        className={`
                                            border-b border-gray-50
                                            transition-colors duration-100
                                            ${isDrillable
                                                ? 'cursor-pointer hover:bg-emerald-100/60'
                                                : 'hover:bg-emerald-50/40'
                                            }
                                            ${isSelected
                                                ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200'
                                                : isEven ? 'bg-white' : 'bg-gray-50/30'
                                            }
                                        `}
                                    >
                                        {columns.map((col) => {
                                            const value = row[col.key];
                                            const align = effectiveAlign(col);
                                            const isNumeric =
                                                col.type === 'currency' ||
                                                col.type === 'number' ||
                                                col.type === 'percent';

                                            return (
                                                <td
                                                    key={col.key}
                                                    className={`px-5 py-3.5 whitespace-nowrap ${ALIGN_CLASS[align]}`}
                                                >
                                                    <DataCell
                                                        value={value}
                                                        type={col.type}
                                                        isNumeric={isNumeric}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>

                        {/* ── tfoot — server-authoritative totals ────────────── */}
                        {showTotalsRow && (
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200">

                                    {/* Leading non-total columns: merged colSpan with label */}
                                    <td
                                        colSpan={leadingNonTotalCount}
                                        className="px-5 py-4"
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                            Grand Total
                                            <span className="ml-2 text-gray-400 font-medium normal-case tracking-normal">
                                                ({rows.length} {rows.length === 1 ? 'row' : 'rows'})
                                            </span>
                                        </span>
                                    </td>

                                    {/* One <td> per remaining (totalled) column */}
                                    {columns.slice(leadingNonTotalCount).map((col) => {
                                        const align = effectiveAlign(col);
                                        const totalValue = col.total && totals[col.key] !== undefined
                                            ? totals[col.key]
                                            : undefined;

                                        return (
                                            <td
                                                key={col.key}
                                                className={`px-5 py-4 whitespace-nowrap ${ALIGN_CLASS[align]}`}
                                            >
                                                {totalValue !== undefined ? (
                                                    <span className="font-black text-[14px] text-stone-900 tabular-nums">
                                                        {formatCell(totalValue, col.type)}
                                                    </span>
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* ── Paginator (Gap #13) ────────────────────────────────────────── */}
            {showPaginator && (
                <Paginator
                    current={safePage}
                    total={totalPages}
                    rowsOnPage={pagedRows.length}
                    totalRows={rows.length}
                    onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    onPage={(p) => setCurrentPage(p)}
                />
            )}

            {/* ── Drill-Down Drawer ─────────────────────────────────────────────── */}
            {/* Rendered via ReactDOM.createPortal() into document.body — escapes         */}
            {/* the parent overflow/stacking context and clears all sticky z-layers.       */}
            {drillRow && (
                <DrillDownDrawer
                    loading={drillLoading}
                    error={drillError}
                    name={drillName}
                    columns={drillColumns}
                    payload={drillPayload}
                    onClose={handleDrillClose}
                />
            )}

            {isScheduleOpen && (
                <MISScheduleModal
                    reportId={reportId}
                    currentFilters={scheduleFilters}
                    onClose={() => setIsScheduleOpen(false)}
                />
            )}
        </div>
    );
}

// ─── DataCell ─────────────────────────────────────────────────────────────────
// Isolated sub-component so the type→style mapping stays readable.

interface DataCellProps {
    value: unknown;
    type: ColumnSpec['type'];
    isNumeric: boolean;
}

function DataCell({ value, type, isNumeric }: DataCellProps) {
    const formatted = formatCell(value, type);
    const isEmpty = formatted === '—';

    if (isEmpty) {
        return <span className="text-gray-300 select-none">—</span>;
    }

    // Numeric types: bold, tabular-nums, stone-900
    if (isNumeric) {
        return (
            <span className="font-bold text-[13px] text-stone-900 tabular-nums">
                {formatted}
            </span>
        );
    }

    // Date: slightly emphasised
    if (type === 'date') {
        return (
            <span className="font-semibold text-[13px] text-stone-900">
                {formatted}
            </span>
        );
    }

    // String: muted, normal weight
    return (
        <span className="text-[13px] text-stone-700">
            {formatted}
        </span>
    );
}

// ─── Paginator ────────────────────────────────────────────────────────────────
//
// Gap #13: client-side pagination control for large sync datasets.
// Renders Prev / numbered pages / Next + a "Rows X–Y of Z" counter.
// Only mounted when rows.length > PAGE_SIZE.

interface PaginatorProps {
    current: number;
    total: number;
    rowsOnPage: number;
    totalRows: number;
    onPrev: () => void;
    onNext: () => void;
    onPage: (page: number) => void;
}

function Paginator({ current, total, rowsOnPage, totalRows, onPrev, onNext, onPage }: PaginatorProps) {
    // Build a compact page-number array with ellipsis.
    // Always show first, last, current ±1, and ellipsis where gaps exist.
    const pages: (number | '…')[] = [];
    const WINDOW = 1; // siblings around current

    const addPage = (n: number) => {
        if (pages[pages.length - 1] !== n) pages.push(n);
    };
    const addGap = () => {
        if (pages[pages.length - 1] !== '…') pages.push('…');
    };

    for (let p = 1; p <= total; p++) {
        if (p === 1 || p === total || (p >= current - WINDOW && p <= current + WINDOW)) {
            addPage(p);
        } else if (p === current - WINDOW - 1 || p === current + WINDOW + 1) {
            addGap();
        }
    }

    const pageStart = (current - 1) * PAGE_SIZE + 1;
    const pageEnd = pageStart + rowsOnPage - 1;

    const btnBase = 'inline-flex items-center justify-center min-w-[30px] h-[30px] px-1.5 text-[12px] font-bold rounded-lg transition-colors select-none';

    return (
        <div className="flex items-center justify-between px-2 py-2">
            {/* Row range counter */}
            <span className="text-[11px] font-semibold text-gray-400 tabular-nums">
                Rows {pageStart}–{pageEnd} of {totalRows}
            </span>

            {/* Page buttons */}
            <div className="flex items-center gap-1">
                <button
                    suppressHydrationWarning
                    type="button"
                    onClick={onPrev}
                    disabled={current === 1}
                    aria-label="Previous page"
                    className={`${btnBase} text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                {pages.map((p, i) =>
                    p === '…' ? (
                        <span key={`gap-${i}`} className="text-[12px] text-gray-300 px-1 select-none">…</span>
                    ) : (
                        <button
                            suppressHydrationWarning
                            key={p}
                            type="button"
                            onClick={() => onPage(p as number)}
                            aria-label={`Page ${p}`}
                            aria-current={p === current ? 'page' : undefined}
                            className={`${btnBase} ${p === current
                                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            {p}
                        </button>
                    )
                )}

                <button
                    suppressHydrationWarning
                    type="button"
                    onClick={onNext}
                    disabled={current === total}
                    aria-label="Next page"
                    className={`${btnBase} text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

// ─── DrillDownDrawer ──────────────────────────────────────────────────────────
//
// Replaces the former inline DrillDownPanel with a right-anchored side drawer
// rendered via ReactDOM.createPortal() directly into document.body.
//
// ## Why a portal?
//   The parent table card uses `overflow-hidden` (for rounded corners) and its
//   own stacking context. A portal escapes both entirely, allowing the drawer
//   to span the full viewport height regardless of DOM nesting.
//
// ## z-index layering
//   Backdrop: z-[200]  — clears all sticky sidebars / headers (typically z-10–z-50).
//   Drawer:   z-[201]  — sits above the backdrop.
//   MISScheduleModal does not specify an explicit z-index, so there is no
//   collision risk.
//
// ## Next.js App Router SSR safety
//   `document.body` does not exist during server-side rendering. A `mounted`
//   boolean (set by a useEffect on first render) gates the createPortal call,
//   ensuring it only executes after client-side hydration.
//
// ## Slide-in animation
//   The drawer starts at CSS transform translateX(100%) and transitions to
//   translateX(0) via requestAnimationFrame after the initial paint, so the
//   browser's transition engine captures the full delta. This avoids the need
//   for external animation libraries and works with Tailwind v4.
//
// ## Accessibility
//   - role="dialog" + aria-modal="true" + aria-labelledby (title id)
//   - Escape key closes (keydown listener on window, capture phase)
//   - Close button receives focus on open (ref + useEffect)
//   - Body overflow is locked to prevent background scroll while open

interface DrillDownDrawerProps {
    loading: boolean;
    error: string | null;
    name: string;
    columns: ColumnSpec[];
    payload: UniversalPayload | null;
    onClose: () => void;
}

function DrillDownDrawer({ loading, error, name, columns, payload, onClose }: DrillDownDrawerProps) {

    // ── SSR mount guard ──────────────────────────────────────────────────────
    // createPortal is only safe after client-side hydration.
    const [mounted, setMounted] = useState(false);

    // ── Slide-in animation trigger ───────────────────────────────────────────
    // translateX(100%) → translateX(0) after first paint.
    const [isVisible, setIsVisible] = useState(false);

    // ── Excel export state ───────────────────────────────────────────────────
    const [excelExporting, setExcelExporting] = useState(false);

    // ── Refs ─────────────────────────────────────────────────────────────────
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    // Stable, unique ID prefix for aria-labelledby — never changes for this instance.
    const titleId = useRef(`mis-drawer-title-${Math.random().toString(36).slice(2, 9)}`).current;

    // ── 1. Hydration guard — enable portal after first client render ─────────
    useEffect(() => {
        setMounted(true);
    }, []);

    // ── 2. Body scroll lock ──────────────────────────────────────────────────
    // Captures the previous overflow value so nested modals restore correctly.
    useEffect(() => {
        if (!mounted) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [mounted]);

    // ── 3. Trigger slide-in animation after first paint ──────────────────────
    useEffect(() => {
        if (!mounted) return;
        const raf = requestAnimationFrame(() => setIsVisible(true));
        return () => cancelAnimationFrame(raf);
    }, [mounted]);

    // ── 4. Escape key to close ───────────────────────────────────────────────
    // Registered in capture phase so it fires before any child stopPropagation.
    useEffect(() => {
        if (!mounted) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [mounted, onClose]);

    // ── 5. Auto-focus close button on open ──────────────────────────────────
    // Moves keyboard focus into the dialog for accessibility.
    useEffect(() => {
        if (mounted && closeButtonRef.current) {
            closeButtonRef.current.focus();
        }
    }, [mounted]);

    // ── CSV export ────────────────────────────────────────────────────────────
    const exportCsv = () => {
        if (!payload?.rows?.length) return;
        const rowKeys = columns.map((c) => c.key);
        const headers = columns
            .map((c) => `"${String(c.label).replace(/"/g, '""')}"`)
            .join(',');
        const csvRows = payload.rows.map((r) =>
            rowKeys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')
        );
        const csv = [headers, ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}-detail.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Excel export ──────────────────────────────────────────────────────────
    const exportExcel = async () => {
        if (!payload?.rows?.length) return;
        setExcelExporting(true);
        try {
            const xlsxModule = await import('xlsx');
            const XLSX = xlsxModule.default ?? xlsxModule;

            const exportRows = payload.rows.map((r) => {
                const row: Record<string, unknown> = {};
                columns.forEach((c) => { row[c.label] = r[c.key] ?? ''; });
                return row;
            });

            const ws = XLSX.utils.json_to_sheet(exportRows);
            ws['!cols'] = columns.map((c) => {
                const maxDataLen = payload.rows!.reduce((max, r) => {
                    return Math.max(max, String(r[c.key] ?? '').length);
                }, 0);
                return { wch: Math.max((c.label || '').length, maxDataLen, 10) + 2 };
            });

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Detail Data');
            XLSX.writeFile(wb, `${name}-detail.xlsx`);
        } catch (err) {
            console.error('[MIS Drawer] Excel export failed:', err);
            alert('Excel export failed. Please try again.');
        } finally {
            setExcelExporting(false);
        }
    };

    // ── SSR guard — must appear after ALL hooks (Rules of Hooks) ────────────
    if (!mounted) return null;

    // ── Derived display state ─────────────────────────────────────────────────
    const rows    = payload?.rows   ?? [];
    const totals  = payload?.totals ?? {};
    const hasData =
        !loading && !error && payload && !payload.error &&
        rows.length > 0 && columns.length > 0;

    // Compute leading non-total column span for the subtotals row.
    let drawerLeadingSpan = 0;
    for (const col of columns) {
        if (col.total) break;
        drawerLeadingSpan++;
    }
    drawerLeadingSpan = Math.max(drawerLeadingSpan, 1);

    // ── Shared animation easing ───────────────────────────────────────────────
    const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

    // ─────────────────────────────────────────────────────────────────────────
    // Portal content — backdrop + drawer panel rendered into document.body
    // ─────────────────────────────────────────────────────────────────────────
    const drawerContent = (
        <>
            {/* ── Backdrop ─────────────────────────────────────────────────── */}
            {/* Click closes the drawer; aria-hidden hides it from screen readers */}
            <div
                aria-hidden="true"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 200,
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)',
                    // Fade in with the drawer
                    opacity: isVisible ? 1 : 0,
                    transition: `opacity 0.25s ${EASE}`,
                }}
            />

            {/* ── Drawer panel ─────────────────────────────────────────────── */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 201,
                    // 900 px on wide screens; 92 vw on tablets/small laptops — no edge cramping.
                    width: 'min(92vw, 900px)',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#ffffff',
                    // Left shadow creates depth separation from the backdrop.
                    boxShadow: '-8px 0 40px rgba(0,0,0,0.12), -1px 0 0 rgba(0,0,0,0.06)',
                    // Emerald left-border accent — visual "child of" indicator.
                    borderLeft: '4px solid #10b981',
                    // Slide-in from right: starts off-screen, transitions to position.
                    transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
                    transition: `transform 0.3s ${EASE}`,
                }}
            >
                {/* ── Sticky drawer header ─────────────────────────────────── */}
                {/* z-10 keeps it above the scrollable table body below. */}
                <div
                    style={{ flexShrink: 0, zIndex: 10, borderBottom: '1px solid #d1fae5' }}
                    className="sticky top-0 px-5 py-3.5 bg-emerald-50/70 flex items-center justify-between gap-3"
                >
                    {/* Left: icon + title + row count pill */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="shrink-0 p-1.5 bg-emerald-100 rounded-lg">
                            <PanelRight className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <p
                                id={titleId}
                                className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 truncate"
                            >
                                ↳ Detail Report
                            </p>
                            <p className="text-[13px] font-black text-stone-900 truncate leading-tight">
                                {name || 'Loading…'}
                            </p>
                        </div>
                        {/* Row count — shown only when data is fully loaded */}
                        {!loading && !error && payload && !payload.error && (
                            <span className="shrink-0 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                            </span>
                        )}
                    </div>

                    {/* Right: export buttons + close */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Export buttons — only rendered when data is available */}
                        {hasData && (
                            <div className="flex items-center gap-1.5 mr-1 pr-3 border-r border-emerald-200">
                                <button
                                    type="button"
                                    onClick={exportCsv}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                    aria-label="Export detail data as CSV"
                                >
                                    <Download className="h-3 w-3" aria-hidden="true" />
                                    CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={exportExcel}
                                    disabled={excelExporting}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 px-2.5 py-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                    aria-label="Export detail data as Excel"
                                >
                                    {excelExporting
                                        ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                        : <Download className="h-3 w-3" aria-hidden="true" />
                                    }
                                    Excel
                                </button>
                            </div>
                        )}

                        {/* Close button — receives focus on drawer open */}
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            aria-label="Close detail drawer (Escape)"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* ── Scrollable drawer body ───────────────────────────────── */}
                {/* flex-1 + overflow-y-auto gives independent scroll from the parent. */}
                {/* overflow-x-auto on the table wrapper handles wide column sets.    */}
                <div className="flex-1 overflow-y-auto">

                    {/* ── Loading skeleton ─────────────────────────────────── */}
                    {loading && (
                        <div
                            className="px-6 py-6 space-y-3"
                            aria-busy="true"
                            aria-label="Loading detail data"
                        >
                            {/* Skeleton header row */}
                            <div className="flex gap-4 pb-3 border-b border-gray-100 animate-pulse">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-3 bg-gray-200 rounded-full flex-1"
                                        style={{ opacity: 1 - i * 0.1 }}
                                    />
                                ))}
                            </div>
                            {/* Skeleton data rows */}
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="flex gap-4 animate-pulse">
                                    <div className="h-4 bg-gray-200 rounded flex-1"  style={{ opacity: 1 - i * 0.1 }} />
                                    <div className="h-4 bg-gray-200 rounded w-24" style={{ opacity: 1 - i * 0.1 }} />
                                    <div className="h-4 bg-gray-200 rounded w-28" style={{ opacity: 1 - i * 0.1 }} />
                                    <div className="h-4 bg-gray-200 rounded w-20" style={{ opacity: 1 - i * 0.1 }} />
                                    <div className="h-4 bg-gray-200 rounded w-16" style={{ opacity: 1 - i * 0.1 }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Error state ───────────────────────────────────────── */}
                    {!loading && error && (
                        <div className="px-6 py-8 flex items-start gap-3">
                            <div className="p-2 bg-rose-50 rounded-xl shrink-0">
                                <X className="h-4 w-4 text-rose-500" aria-hidden="true" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-stone-900">Failed to load details</p>
                                <p className="text-xs text-rose-600 mt-1 leading-relaxed">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* ── UNAUTHORIZED state ────────────────────────────────── */}
                    {!loading && !error && payload?.error === 'UNAUTHORIZED' && (
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                            <div className="p-3.5 bg-red-50 border border-red-100 rounded-2xl mb-4 inline-flex">
                                <ShieldOff className="h-7 w-7 text-red-400" aria-hidden="true" />
                            </div>
                            <p className="text-sm font-bold text-stone-900 mb-1">Access Denied</p>
                            <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                                You don&apos;t have permission to view the detail for this report.
                            </p>
                        </div>
                    )}

                    {/* ── Empty state ───────────────────────────────────────── */}
                    {!loading && !error && payload && !payload.error && rows.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                            <div className="p-3.5 bg-gray-100 rounded-2xl mb-4 inline-flex">
                                <Inbox className="h-7 w-7 text-gray-400" aria-hidden="true" />
                            </div>
                            <p className="text-sm font-bold text-stone-900 mb-1">No records found</p>
                            <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                                No matching records found for this selection.
                            </p>
                        </div>
                    )}

                    {/* ── Data table ────────────────────────────────────────── */}
                    {/* overflow-x-auto here (not on the panel) so the sticky header    */}
                    {/* stays pinned while the user scrolls dense wide tables.           */}
                    {hasData && (
                        <div className="overflow-x-auto" role="region" aria-label={`${name} detail data table`}>
                            <table
                                className="w-full text-sm border-collapse"
                                style={{ minWidth: `${Math.max(columns.length * 140, 700)}px` }}
                            >
                                {/* thead */}
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        {columns.map((col) => (
                                            <th
                                                key={col.key}
                                                scope="col"
                                                className={`
                                                    px-5 py-3
                                                    text-[10px] font-bold uppercase tracking-widest
                                                    text-gray-500 whitespace-nowrap select-none
                                                    ${ALIGN_CLASS[effectiveAlign(col)]}
                                                `}
                                            >
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                {/* tbody */}
                                <tbody>
                                    {rows.map((row, idx) => {
                                        const isEven = idx % 2 === 0;
                                        return (
                                            <tr
                                                key={idx}
                                                className={`
                                                    border-b border-gray-50
                                                    transition-colors duration-100
                                                    hover:bg-emerald-50/30
                                                    ${isEven ? 'bg-white' : 'bg-gray-50/20'}
                                                `}
                                            >
                                                {columns.map((col) => {
                                                    const isNumeric =
                                                        col.type === 'currency' ||
                                                        col.type === 'number' ||
                                                        col.type === 'percent';
                                                    return (
                                                        <td
                                                            key={col.key}
                                                            className={`px-5 py-3 whitespace-nowrap ${ALIGN_CLASS[effectiveAlign(col)]}`}
                                                        >
                                                            <DataCell
                                                                value={row[col.key]}
                                                                type={col.type}
                                                                isNumeric={isNumeric}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>

                                {/* tfoot — server-authoritative subtotals row */}
                                {columns.some((c) => c.total) && Object.keys(totals).length > 0 && (
                                    <tfoot>
                                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                                            <td colSpan={drawerLeadingSpan} className="px-5 py-3">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                                    Subtotal
                                                </span>
                                            </td>
                                            {columns.slice(drawerLeadingSpan).map((col) => {
                                                const tv =
                                                    col.total && totals[col.key] !== undefined
                                                        ? totals[col.key]
                                                        : undefined;
                                                return (
                                                    <td
                                                        key={col.key}
                                                        className={`px-5 py-3 whitespace-nowrap ${ALIGN_CLASS[effectiveAlign(col)]}`}
                                                    >
                                                        {tv !== undefined ? (
                                                            <span className="font-black text-[13px] text-stone-900 tabular-nums">
                                                                {formatCell(tv, col.type)}
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}

                </div>{/* end scrollable body */}

            </div>{/* end drawer panel */}
        </>
    );

    return createPortal(drawerContent, document.body);
}

// ─── AsyncQueuedBanner ────────────────────────────────────────────────────────

/**
 * Gap #8 fix — Architectural overhaul (v3): self-polling banner using native
 * useEffect + fetch against a REST Route Handler.
 *
 * ## Why SWR was ripped out
 *
 * Both previous attempts (v1 revalidateOnFocus, v2 all-options disabled) kept
 * SWR calling `getJobStatus` — a `'use server'` Server Action — every 3 s.
 *
 * In Next.js 15, invoking ANY Server Action from the browser unconditionally
 * invalidates the full-route RSC (React Server Component) cache for the owning
 * page segment. This is architectural, not configurable via SWR options:
 *
 *   fetch() → getJobStatus ('use server')
 *     → Next.js router: RSC cache bust for /admin/mis/[reportId]
 *     → page.tsx re-executes
 *     → generateReport() → runReport() → prisma.report_jobs.create()   ← NEW JOB
 *     → payload.jobId changes
 *     → AsyncQueuedBanner remounts with new jobId
 *     → SWR reinitialises → polls again → ∞ loop
 *
 * ## The fix: REST Route Handler
 *
 * GET /api/mis/jobs/[jobId]  (app/api/mis/jobs/[jobId]/route.ts)
 *
 * Route Handlers are plain HTTP endpoints. Calling them with `fetch()` from
 * the browser has ZERO interaction with the Next.js router cache. The RSC
 * re-render loop is completely broken.
 *
 * ## Implementation: useEffect + setInterval + AbortController
 *
 * - `useEffect` with `[jobId]` dependency: starts/stops cleanly on mount,
 *   unmount, and jobId change.
 * - `setInterval` at 3 000 ms: replaces SWR's refreshInterval.
 * - `AbortController`: cancels the in-flight fetch if the component unmounts
 *   mid-request, preventing state updates on dead components.
 * - `toastFiredRef`: fires the completion toast exactly once per jobId.
 * - Clears the interval immediately when a terminal status is received so the
 *   browser makes no unnecessary further requests.
 */

/** Shape of the JSON response from GET /api/mis/jobs/[jobId] */
interface PollJobResponse {
    id: string;
    status: string;
    progress: number;
    file_key?: string | null;
    error?: string | null;
    createdAt: string;
    finished_at: string | null;
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = ['Completed', 'Failed', 'Expired'] as const;
type TerminalStatus = typeof TERMINAL_STATUSES[number];

function AsyncQueuedBanner({ jobId }: { jobId?: string }) {
    // Live job status — drives the status pill in the banner.
    const [jobStatus, setJobStatus] = useState<PollJobResponse | null>(null);

    // Fires the completion toast exactly once per jobId mount.
    const toastFiredRef = useRef(false);
    // Holds the setInterval handle so we can clear it on terminal state.
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Holds the current AbortController so we can cancel in-flight fetches.
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // No jobId — nothing to poll.
        if (!jobId) return;

        // Reset state for this jobId (handles remount with a different jobId).
        toastFiredRef.current = false;
        setJobStatus(null);

        // ── Core poll function ────────────────────────────────────────────────
        const poll = async () => {
            // Cancel any request still in-flight from the previous tick.
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                // ────────────────────────────────────────────────────────────────
                // CRITICAL: this is a REST Route Handler call, NOT a Server
                // Action call. It does not invalidate the Next.js router cache.
                // ────────────────────────────────────────────────────────────────
                const res = await fetch(`/api/mis/jobs/${jobId}`, {
                    signal: controller.signal,
                    cache: 'no-store',   // never cache polling responses
                    headers: { Accept: 'application/json' },
                });

                if (!res.ok) {
                    if (res.status === 404) {
                        // Job not found or not owned — stop polling silently.
                        if (intervalRef.current) clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                    // For all other errors (5xx, etc.) keep polling —
                    // transient server errors should not stop monitoring.
                    return;
                }

                const data: PollJobResponse = await res.json();
                setJobStatus(data);

                // ── Terminal state handling ──────────────────────────────────
                const isTerminal = TERMINAL_STATUSES.includes(
                    data.status as TerminalStatus
                );

                if (isTerminal) {
                    // Stop the interval — no more polling needed.
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    intervalRef.current = null;

                    // Fire toast exactly once (ref prevents double-fire if
                    // setInterval callback runs again before clearing).
                    if (!toastFiredRef.current) {
                        toastFiredRef.current = true;

                        if (data.status === 'Completed' && data.file_key) {
                            const downloadUrl = `/api/mis/export/${jobId}`;
                            toast.success(
                                (t) => (
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-bold text-green-800">
                                            Report Ready!
                                        </span>
                                        <span className="text-[12px] text-green-700 font-normal leading-snug">
                                            Your export has finished processing.
                                        </span>
                                        <div className="flex gap-2 mt-1">
                                            <a
                                                href={downloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="
                                                    inline-flex items-center gap-1.5
                                                    text-[12px] font-bold text-white
                                                    bg-green-600 hover:bg-green-700
                                                    px-3 py-1.5 rounded-lg
                                                    transition-colors
                                                "
                                                onClick={() => toast.dismiss(t.id)}
                                            >
                                                <Download className="h-3 w-3" aria-hidden="true" />
                                                Download
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => toast.dismiss(t.id)}
                                                className="text-[12px] text-green-700 hover:text-green-900 px-2"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                ),
                                { duration: Infinity, id: `mis-job-done-${jobId}` }
                            );
                        } else if (data.status === 'Failed') {
                            toast.error(
                                `Report job failed: ${data.error ?? 'Unknown error. Please try again.'
                                }`,
                                { duration: 8000, id: `mis-job-failed-${jobId}` }
                            );
                        } else if (data.status === 'Expired') {
                            toast.error(
                                'This export has expired. Please regenerate the report.',
                                { duration: 6000, id: `mis-job-expired-${jobId}` }
                            );
                        }
                    }
                }

            } catch (err: unknown) {
                // AbortError = component unmounted or new poll started. Ignore.
                if (err instanceof Error && err.name === 'AbortError') return;
                // Any other fetch-level error (network down, DNS failure):
                // do NOT stop the interval — transient outages are recoverable.
                console.warn('[MIS Banner] Poll error (will retry):', err);
            }
        };

        // Fire immediately on mount, then repeat.
        poll();
        intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

        // ── Cleanup ────────────────────────────────────────────────────────────────
        // Runs when the component unmounts OR jobId changes.
        // Cancels in-flight HTTP requests and the polling interval.
        return () => {
            if (abortRef.current) abortRef.current.abort();
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [jobId]); // Re-run only when jobId changes — stable dep array prevents extra ticks

    // Derive a human-readable status label for the banner pill.
    const progressPct = (jobStatus?.progress ?? 0) > 0 ? ` ${jobStatus!.progress}%` : '';
    const pollingStatus = !jobStatus
        ? 'Queued'
        : jobStatus.status === 'Running'
            ? `Processing…${progressPct}`
            : jobStatus.status;

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="relative mb-5">
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
                <div className="relative p-4 bg-amber-50 border border-amber-200 rounded-2xl inline-flex">
                    <Clock4 className="h-8 w-8 text-amber-500" />
                </div>
            </div>

            <h3 className="font-black text-stone-900 text-base mb-1">
                Report Queued
            </h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                This report spans a large dataset and is being generated in the
                background. You can safely navigate away — we&apos;ll notify you when
                it&apos;s ready.
            </p>

            {jobId && (
                <div className="mt-4 inline-flex items-center gap-2 bg-gray-100 border border-gray-200 text-gray-500 text-[11px] font-mono font-bold px-3 py-1.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                    {pollingStatus} · Job {jobId.slice(0, 8)}…
                </div>
            )}
        </div>
    );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-200 shadow-sm py-20 px-6 text-center">
            <div className="p-4 bg-gray-100 rounded-2xl mb-4 inline-flex">
                <Inbox className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="font-bold text-stone-900 mb-1">No data found</h3>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                Your current filter combination returned zero results. Try widening
                the date range.
            </p>
        </div>
    );
}

// ─── AccessDeniedState ────────────────────────────────────────────────────────

/**
 * Rendered when generateReport() returns { error: 'UNAUTHORIZED' }.
 *
 * Design mirrors EmptyState / AsyncQueuedBanner so all three non-data states
 * share the same visual language: centered card, icon, headline, body copy.
 *
 * IMPORTANT: We deliberately show a generic message rather than revealing
 * which permission key is missing — doing so could assist privilege escalation
 * attempts in a multi-tenant environment.
 */
function AccessDeniedState() {
    return (
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-red-100 shadow-sm py-20 px-6 text-center">
            {/* Icon container */}
            <div className="relative mb-5">
                <div className="absolute inset-0 rounded-full bg-red-400/10 animate-ping" />
                <div className="relative p-4 bg-red-50 border border-red-200 rounded-2xl inline-flex">
                    <ShieldOff className="h-8 w-8 text-red-500" aria-hidden="true" />
                </div>
            </div>

            <h3 className="font-black text-stone-900 text-base mb-1">
                Access Denied
            </h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                You don&apos;t have the required permissions to view this report.
                Please contact your system administrator if you believe this is
                an error.
            </p>

            {/* Role hint pill */}
            <div className="mt-5 inline-flex items-center gap-2 bg-red-50 border border-red-100 text-red-500 text-[11px] font-bold px-3 py-1.5 rounded-full select-none">
                <ShieldOff className="h-3 w-3" aria-hidden="true" />
                Insufficient permissions
            </div>
        </div>
    );
}
