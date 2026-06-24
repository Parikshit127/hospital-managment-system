'use client';

/**
 * RevenueTable
 * ------------
 * Presentational table for the MIS Daily Revenue Report.
 *
 * Data Contract (from Server Action `generateReport('billing-revenue-daily', filters)`):
 *   {
 *     async:   boolean          — true when the report is queued as a background job
 *     jobId?:  string           — present when async === true; used to poll job status
 *     rows?:   RevenueRow[]     — the result set (absent while async job is pending)
 *     totals?: RevenueTotals    — server-computed aggregates; do NOT recalculate client-side
 *   }
 *
 * Design decisions:
 *   - Totals in <tfoot> are read directly from payload.totals (server-authoritative).
 *   - "billed_amount" column uses stone-900; "collected_amount" uses emerald-600.
 *   - Both amount columns are right-aligned with tabular-nums for column alignment.
 *   - payer_type rendered as a distinct pill (Insurance / Cash / Corporate / etc.)
 *   - Async state surfaces a non-blocking "queued" banner — table is not rendered.
 */

import React from 'react';
import { Inbox, Clock4, Hash } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One row from the billing-revenue-daily report. */
export interface RevenueRow {
    /**
     * Prisma returns a JS `Date` object from `DATE()` raw-query columns.
     * Legacy mock data used an ISO `string` ("YYYY-MM-DD").
     * Both shapes are accepted and normalised inside `formatDate`.
     */
    date:             string | Date;
    department:       string;
    doctor_name:      string;
    payer_type:       string;  // e.g. "Insurance", "Cash", "Corporate"
    billed_amount:    number;
    collected_amount: number;
    invoice_count:    number;
}

/** Server-computed aggregates — never recalculate these on the client. */
export interface RevenueTotals {
    billed_amount:    number;
    collected_amount: number;
    invoice_count:    number;
}

/** Top-level payload shape returned by generateReport(). */
export interface RevenuePayload {
    async:    boolean;
    jobId?:   string;
    rows?:    RevenueRow[];
    totals?:  RevenueTotals;
}

interface RevenueTableProps {
    payload: RevenuePayload;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const INR = new Intl.NumberFormat('en-IN', {
    style:                 'currency',
    currency:              'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Converts a `string | Date` date value to a human-readable Indian locale
 * string (e.g. "12 Jun 2026").
 *
 * Two cases handled:
 *
 *   1. `Date` object  — Prisma maps PostgreSQL `DATE(...)` columns to a JS
 *      Date at midnight UTC (e.g. 2026-06-12T00:00:00.000Z). We call
 *      `toLocaleDateString` on it directly; in IST (+05:30) this still
 *      resolves to June 12, so no timezone-shift risk for Indian deployments.
 *
 *   2. `string`       — Legacy ISO string "YYYY-MM-DD" from mock data.
 *      We construct `new Date(year, month-1, day)` via the *local-time*
 *      constructor (not `new Date(isoString)` which parses as UTC) to
 *      prevent any off-by-one-day display bugs regardless of server timezone.
 */
function formatDate(value: string | Date): string {
    const d: Date =
        value instanceof Date
            ? value
            : (() => {
                  // Safe local-timezone construction — avoids UTC midnight shift
                  const parts = (value as string).split('-').map(Number);
                  return new Date(parts[0], parts[1] - 1, parts[2]);
              })();

    return d.toLocaleDateString('en-IN', {
        day:   '2-digit',
        month: 'short',
        year:  'numeric',
    });
}

// ─── Look-up maps ─────────────────────────────────────────────────────────────

const DEPT_COLOR_MAP: Record<string, { bg: string; text: string }> = {
    Cardiology:       { bg: 'bg-rose-50',    text: 'text-rose-700'    },
    Neurology:        { bg: 'bg-violet-50',  text: 'text-violet-700'  },
    Orthopedics:      { bg: 'bg-sky-50',     text: 'text-sky-700'     },
    Dermatology:      { bg: 'bg-pink-50',    text: 'text-pink-700'    },
    Gastroenterology: { bg: 'bg-amber-50',   text: 'text-amber-700'   },
    Pulmonology:      { bg: 'bg-teal-50',    text: 'text-teal-700'    },
};

const PAYER_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
    Insurance:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200'  },
    Cash:       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    Corporate:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
    Government: { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
};

function getDeptStyle(dept: string)  { return DEPT_COLOR_MAP[dept]  ?? { bg: 'bg-gray-100', text: 'text-gray-600' }; }
function getPayerStyle(payer: string){ return PAYER_COLOR_MAP[payer] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' }; }

// ─── Component ────────────────────────────────────────────────────────────────

export function RevenueTable({ payload }: RevenueTableProps) {
    // ── 1. Async / queued state ──────────────────────────────────────────────
    if (payload.async) {
        return <AsyncQueuedState jobId={payload.jobId} />;
    }

    const rows    = payload.rows    ?? [];
    const totals  = payload.totals;

    // ── 2. Empty state ───────────────────────────────────────────────────────
    if (rows.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="overflow-x-auto" role="region" aria-label="Daily revenue transactions">
            <table className="w-full min-w-[860px] text-sm border-collapse">

                {/* ── thead ─────────────────────────────────────────────────── */}
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead>Consultant</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Payer Type</TableHead>
                        <TableHead className="text-right w-[80px]">
                            <span className="flex items-center justify-end gap-1">
                                <Hash className="h-3 w-3" /> Invoices
                            </span>
                        </TableHead>
                        <TableHead className="text-right">Billed (INR)</TableHead>
                        <TableHead className="text-right">Collected (INR)</TableHead>
                    </tr>
                </thead>

                {/* ── tbody ─────────────────────────────────────────────────── */}
                <tbody>
                    {rows.map((row, idx) => {
                        const deptStyle  = getDeptStyle(row.department);
                        const payerStyle = getPayerStyle(row.payer_type);
                        const isEven     = idx % 2 === 0;
                        // Collection efficiency ratio for subtle variance signal
                        const efficiency = row.billed_amount > 0
                            ? (row.collected_amount / row.billed_amount) * 100
                            : 0;

                        return (
                            <tr
                                key={`${row.date}-${row.doctor_name}-${idx}`}
                                className={`
                                    group border-b border-gray-50
                                    transition-colors duration-100
                                    hover:bg-emerald-50/40
                                    ${isEven ? 'bg-white' : 'bg-gray-50/30'}
                                `}
                            >
                                {/* Date */}
                                <td className="px-6 py-3.5 whitespace-nowrap">
                                    <span className="font-semibold text-stone-900 text-[13px]">
                                        {formatDate(row.date)}
                                    </span>
                                </td>

                                {/* Doctor */}
                                <td className="px-6 py-3.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2.5">
                                        <DoctorAvatar name={row.doctor_name} />
                                        <span className="font-semibold text-stone-900 text-[13px]">
                                            {row.doctor_name}
                                        </span>
                                    </div>
                                </td>

                                {/* Department */}
                                <td className="px-6 py-3.5">
                                    <span className={`
                                        inline-block text-[11px] font-bold uppercase tracking-widest
                                        px-2.5 py-1 rounded-full
                                        ${deptStyle.bg} ${deptStyle.text}
                                    `}>
                                        {row.department}
                                    </span>
                                </td>

                                {/* Payer Type */}
                                <td className="px-6 py-3.5">
                                    <span className={`
                                        inline-flex items-center gap-1
                                        text-[11px] font-bold px-2.5 py-1 rounded-full border
                                        ${payerStyle.bg} ${payerStyle.text} ${payerStyle.border}
                                    `}>
                                        {row.payer_type}
                                    </span>
                                </td>

                                {/* Invoice Count */}
                                <td className="px-6 py-3.5 text-right">
                                    <span className="font-bold text-[13px] text-stone-900 tabular-nums">
                                        {row.invoice_count}
                                    </span>
                                </td>

                                {/* Billed Amount — stone-900 (neutral; not yet realised) */}
                                <td className="px-6 py-3.5 text-right whitespace-nowrap">
                                    <span className="font-semibold text-[13px] text-stone-900 tabular-nums">
                                        {INR.format(row.billed_amount)}
                                    </span>
                                </td>

                                {/* Collected Amount — emerald-600 (positive realised cash) */}
                                <td className="px-6 py-3.5 text-right whitespace-nowrap">
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="font-black text-[14px] text-emerald-600 tabular-nums">
                                            {INR.format(row.collected_amount)}
                                        </span>
                                        {/* Efficiency micro-indicator */}
                                        {row.billed_amount > 0 && (
                                            <span className={`text-[10px] font-bold tabular-nums ${
                                                efficiency >= 95 ? 'text-emerald-500'
                                                : efficiency >= 80 ? 'text-amber-500'
                                                : 'text-rose-500'
                                            }`}>
                                                {efficiency.toFixed(0)}% collected
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>

                {/* ── tfoot — Server-authoritative totals ───────────────────── */}
                {totals && (
                    <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                            {/* Label spanning non-numeric columns */}
                            <td colSpan={4} className="px-6 py-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                    Grand Total
                                    <span className="ml-2 text-gray-400 font-medium normal-case tracking-normal">
                                        ({rows.length} row{rows.length !== 1 ? 's' : ''})
                                    </span>
                                </span>
                            </td>

                            {/* Invoice count total */}
                            <td className="px-6 py-4 text-right">
                                <span className="font-black text-[14px] text-stone-900 tabular-nums">
                                    {totals.invoice_count.toLocaleString('en-IN')}
                                </span>
                            </td>

                            {/* Billed total */}
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                <span className="font-black text-[14px] text-stone-900 tabular-nums">
                                    {INR.format(totals.billed_amount)}
                                </span>
                            </td>

                            {/* Collected total */}
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-black text-[15px] text-emerald-600 tabular-nums">
                                        {INR.format(totals.collected_amount)}
                                    </span>
                                    {totals.billed_amount > 0 && (
                                        <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                                            {((totals.collected_amount / totals.billed_amount) * 100).toFixed(1)}% overall
                                        </span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TableHead({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <th className={`
            px-6 py-3
            text-[10px] font-bold uppercase tracking-widest
            text-gray-500 text-left whitespace-nowrap select-none
            ${className}
        `}>
            {children}
        </th>
    );
}

/**
 * AsyncQueuedState
 * Shown when payload.async === true — the report exceeds the synchronous
 * execution budget and has been dispatched as a background job.
 */
function AsyncQueuedState({ jobId }: { jobId?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            {/* Animated clock icon */}
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
                This report spans a large dataset and is being generated in the background.
                You can safely navigate away — we'll notify you when it's ready.
            </p>

            {jobId && (
                <div className="mt-4 inline-flex items-center gap-2 bg-gray-100 border border-gray-200 text-gray-500 text-[11px] font-mono font-bold px-3 py-1.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                    Job ID: {jobId}
                </div>
            )}
        </div>
    );
}

/** Deterministic initials avatar — hash-based colour slot */
function DoctorAvatar({ name }: { name: string }) {
    const initials = name
        .replace(/^Dr\.\s*/i, '')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    const palette = [
        'bg-violet-100 text-violet-700',
        'bg-sky-100 text-sky-700',
        'bg-emerald-100 text-emerald-700',
        'bg-rose-100 text-rose-700',
        'bg-amber-100 text-amber-700',
        'bg-teal-100 text-teal-700',
    ];
    const hash  = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const color = palette[hash % palette.length];

    return (
        <span
            className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-black shrink-0 ${color}`}
            aria-hidden="true"
        >
            {initials}
        </span>
    );
}

/** Empty state — shown when filters yield zero rows */
function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="p-4 bg-gray-100 rounded-2xl mb-4 inline-flex">
                <Inbox className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="font-bold text-stone-900 mb-1">No transactions found</h3>
            <p className="text-sm text-gray-500 max-w-xs">
                Your current filter combination returned zero results.
                Try widening the date range or selecting a different doctor.
            </p>
        </div>
    );
}
