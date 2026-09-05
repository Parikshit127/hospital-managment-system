'use client';

/**
 * Admission Trail — everything that happened during a stay, in one stream.
 *
 * Direction B from docs/claude/DESIGN-admission-trail.md: a flat reverse-chronological
 * list with category filters, chosen over day-grouping because the measured event count
 * on real data (~50 per admission) is a list, not a haystack.
 *
 * Deliberate divergence from the host chart page: it uses `text-gray-400` for secondary
 * text, which measures 2.52:1 on white and fails WCAG AA. Nothing here goes lighter than
 * `gray-500` (4.80:1) for text that carries meaning. Measured against this project's
 * overridden grey ramp in globals.css @theme, not Tailwind's defaults.
 *
 * Replaces app/components/ipd/PatientTimeline.tsx, which no file ever imported.
 */

import React, { useMemo, useState, useRef } from 'react';
import {
    Pill, FlaskConical, Stethoscope, FileText, ArrowRightLeft, LogIn, LogOut,
    Utensils, ClipboardList, Receipt, CreditCard, Wallet, Undo2, ShieldCheck, Printer,
    Search, CalendarDays, Package, HeartPulse, X,
} from 'lucide-react';
import type { TrailEvent, TrailKind } from '@/app/lib/patient-trail';
import { auditActionLabel, auditActorFromDetails, ENTITY_TYPE_LABELS } from '@/app/lib/audit-actions';

const KIND_ICON: Record<TrailKind, any> = {
    admission: LogIn,
    discharge: LogOut,
    discharge_summary: FileText,
    ward_round: Stethoscope,
    medical_note: FileText,
    nursing_note: ClipboardList,
    vitals: HeartPulse,
    transfer: ArrowRightLeft,
    diet: Utensils,
    nursing_task: ClipboardList,
    medication: Pill,
    lab: FlaskConical,
    pharmacy: Package,
    appointment: CalendarDays,
    invoice_created: Receipt,
    invoice_finalized: Receipt,
    invoice_cancelled: X,
    payment: CreditCard,
    deposit: Wallet,
    refund: Undo2,
    preauth: ShieldCheck,
};

/** Filter buckets. `kinds: null` means "everything". */
const BUCKETS: { key: string; label: string; kinds: TrailKind[] | null }[] = [
    { key: 'all', label: 'All', kinds: null },
    {
        key: 'clinical',
        label: 'Clinical',
        kinds: ['medical_note', 'nursing_note', 'ward_round', 'diet', 'nursing_task', 'lab', 'pharmacy'],
    },
    { key: 'vitals', label: 'Vitals', kinds: ['vitals'] },
    { key: 'medication', label: 'Medication', kinds: ['medication'] },
    {
        key: 'billing',
        label: 'Billing',
        kinds: ['invoice_created', 'invoice_finalized', 'invoice_cancelled', 'payment', 'deposit', 'refund', 'preauth'],
    },
    {
        key: 'admin',
        label: 'Admission',
        kinds: ['admission', 'discharge', 'discharge_summary', 'transfer', 'appointment'],
    },
];

const dayKey = (iso: string) => iso.slice(0, 10);

const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

const fmtMoney = (n: number) =>
    `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface AdmissionTrailProps {
    events: TrailEvent[];
    audit: any[];
    fullHistory: boolean;
    loading?: boolean;
    onScopeChange: (fullHistory: boolean) => void;
    admissionRef?: string;
}

export function AdmissionTrail({
    events,
    audit,
    fullHistory,
    loading = false,
    onScopeChange,
    admissionRef,
}: AdmissionTrailProps) {
    const [view, setView] = useState<'journey' | 'audit'>('journey');
    const [bucket, setBucket] = useState('all');
    const [query, setQuery] = useState('');
    const tablistRef = useRef<HTMLDivElement>(null);

    // Printing opens the server-rendered document (letterhead, bordered tables,
    // per-page header/footer spacers) rather than putting the screen UI on paper.
    const handlePrint = () => {
        const qs = new URLSearchParams();
        if (fullHistory) qs.set('full', '1');
        if (view === 'audit') qs.set('audit', '1');
        const q = qs.toString();
        window.open(`/api/ipd/trail/${encodeURIComponent(admissionRef ?? '')}${q ? `?${q}` : ''}`, '_blank');
    };

    // Counts are computed off the unfiltered set so the chips always show the true total.
    const bucketCounts = useMemo(() => {
        const counts: Record<string, number> = { all: events.length };
        for (const b of BUCKETS) {
            if (!b.kinds) continue;
            counts[b.key] = events.filter((e) => b.kinds!.includes(e.kind)).length;
        }
        return counts;
    }, [events]);

    const visible = useMemo(() => {
        const active = BUCKETS.find((b) => b.key === bucket);
        const q = query.trim().toLowerCase();
        return events.filter((e) => {
            if (active?.kinds && !active.kinds.includes(e.kind)) return false;
            if (!q) return true;
            return `${e.label} ${e.meta ?? ''} ${e.actor ?? ''}`.toLowerCase().includes(q);
        });
    }, [events, bucket, query]);

    // Date dividers: a readability aid inside the flat list, not day-grouping.
    const rows = useMemo(() => {
        const out: ({ divider: string } | { event: TrailEvent })[] = [];
        let lastDay = '';
        for (const e of visible) {
            const d = dayKey(e.ts);
            if (d !== lastDay) {
                out.push({ divider: e.ts });
                lastDay = d;
            }
            out.push({ event: e });
        }
        return out;
    }, [visible]);

    const onTabKey = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        setView((v) => (v === 'journey' ? 'audit' : 'journey'));
        // Move focus with the selection so keyboard and screen-reader state stay in step.
        requestAnimationFrame(() => {
            const next = tablistRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
            next?.focus();
        });
    };

    return (
        <div className="space-y-4">
            {/* ── Header: sub-tabs, scope, print ─────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                    ref={tablistRef}
                    role="tablist"
                    aria-label="Trail view"
                    onKeyDown={onTabKey}
                    className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                >
                    {([['journey', 'Journey', events.length], ['audit', 'Who changed what', audit.length]] as const).map(
                        ([key, label, count]) => (
                            <button
                                key={key}
                                role="tab"
                                aria-selected={view === key}
                                tabIndex={view === key ? 0 : -1}
                                onClick={() => setView(key as 'journey' | 'audit')}
                                className={`min-h-[32px] px-3 rounded-md text-xs font-bold transition-colors ${
                                    view === key
                                        ? 'bg-white text-orange-700 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {label}
                                <span className="ml-1.5 text-[10px] font-black text-gray-500 tabular-nums">{count}</span>
                            </button>
                        ),
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                        {([[false, 'This admission'], [true, 'Full patient history']] as const).map(([val, label]) => (
                            <button
                                key={String(val)}
                                onClick={() => onScopeChange(val)}
                                aria-pressed={fullHistory === val}
                                className={`min-h-[32px] px-3 rounded-md text-xs font-bold transition-colors ${
                                    fullHistory === val
                                        ? 'bg-white text-orange-700 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handlePrint}
                        className="min-h-[32px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                </div>
            </div>

            {view === 'journey' ? (
                <>
                    {/* ── Filters ───────────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center gap-2">
                        {BUCKETS.map((b) => {
                            const count = bucketCounts[b.key] ?? 0;
                            const active = bucket === b.key;
                            return (
                                <button
                                    key={b.key}
                                    onClick={() => setBucket(b.key)}
                                    aria-pressed={active}
                                    disabled={count === 0 && b.key !== 'all'}
                                    className={`min-h-[28px] px-2.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                        active
                                            ? 'bg-orange-50 border-orange-300 text-orange-700'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
                                    }`}
                                >
                                    {b.label}
                                    <span className="ml-1 tabular-nums text-gray-500">{count}</span>
                                </button>
                            );
                        })}
                        <label className="relative ml-auto">
                            <span className="sr-only">Search trail</span>
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search events…"
                                className="min-h-[28px] w-52 pl-7 pr-2 rounded-lg border border-gray-200 text-xs text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-400"
                            />
                        </label>
                    </div>

                    {/* ── Stream ────────────────────────────────────────────── */}
                    {loading ? (
                        <p className="text-xs text-gray-500 py-8 text-center">Loading trail…</p>
                    ) : rows.length === 0 ? (
                        <p className="text-xs text-gray-500 py-8 text-center">
                            {events.length === 0
                                ? 'Nothing recorded for this admission yet.'
                                : 'No events match this filter.'}
                        </p>
                    ) : (
                        <ol className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                            {rows.map((row, i) =>
                                'divider' in row ? (
                                    <li
                                        key={`d-${i}`}
                                        className="bg-gray-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-gray-600"
                                    >
                                        {fmtDay(row.divider)}
                                    </li>
                                ) : (
                                    <TrailRow key={`e-${i}`} event={row.event} />
                                ),
                            )}
                        </ol>
                    )}
                </>
            ) : (
                <AuditTable rows={audit} loading={loading} />
            )}
        </div>
    );
}

function TrailRow({ event }: { event: TrailEvent }) {
    const Icon = KIND_ICON[event.kind] ?? FileText;
    // Colour never carries meaning alone — the label always names the event kind.
    const dot =
        event.group === 'financial'
            ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
            : event.group === 'clinical'
              ? 'bg-gray-100 text-gray-700'
              : 'bg-white text-gray-700 ring-1 ring-gray-300';

    return (
        <li className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50/70 transition-colors">
            <span className={`mt-0.5 shrink-0 h-6 w-6 rounded-lg flex items-center justify-center ${dot}`}>
                <Icon className="h-3 w-3" />
            </span>
            <span className="shrink-0 w-16 pt-0.5 text-[10px] font-bold text-gray-500 tabular-nums">
                {fmtTime(event.ts)}
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-gray-900">{event.label}</span>
                {(event.meta || event.actor) && (
                    <span className="block text-[11px] text-gray-500 truncate">
                        {[event.meta, event.actor && `by ${event.actor}`].filter(Boolean).join(' · ')}
                    </span>
                )}
            </span>
            {event.amount !== undefined && event.amount !== 0 && (
                <span
                    className={`shrink-0 pt-0.5 text-xs font-black tabular-nums ${
                        event.amount < 0 ? 'text-rose-600' : 'text-gray-900'
                    }`}
                >
                    {fmtMoney(event.amount)}
                </span>
            )}
        </li>
    );
}

/** Audit rows are a log, so they render as a log — a dense table, not a timeline. */
function AuditTable({ rows, loading }: { rows: any[]; loading: boolean }) {
    if (loading) return <p className="text-xs text-gray-500 py-8 text-center">Loading audit log…</p>;
    if (!rows.length)
        return <p className="text-xs text-gray-500 py-8 text-center">No recorded changes for this admission.</p>;

    return (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-gray-50">
                    <tr className="text-[10px] font-black uppercase tracking-wide text-gray-600">
                        <th scope="col" className="px-3 py-2 whitespace-nowrap">When</th>
                        <th scope="col" className="px-3 py-2 whitespace-nowrap">Who</th>
                        <th scope="col" className="px-3 py-2 whitespace-nowrap">Action</th>
                        <th scope="col" className="px-3 py-2 whitespace-nowrap">On</th>
                        <th scope="col" className="px-3 py-2">Details</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50/70 align-top">
                            <td className="px-3 py-2 text-[11px] text-gray-700 whitespace-nowrap tabular-nums">
                                {new Date(r.created_at).toLocaleString('en-IN', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
                                })}
                            </td>
                            <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                                <span className="font-bold text-gray-900">{auditWho(r)}</span>
                                {r.role && <span className="block text-[10px] text-gray-500">{r.role}</span>}
                            </td>
                            <td className="px-3 py-2 text-[11px] font-bold text-gray-900 whitespace-nowrap">
                                {tidyActionLabel(r.action)}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-gray-700 whitespace-nowrap">
                                {ENTITY_TYPE_LABELS[r.entity_type] ?? r.entity_type ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-gray-500 max-w-md">
                                {formatAuditDetails(r.details)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Many actions log with user_id 'system' and bury the real actor inside `details`
 * ("by: mohitk", "cancelled by: Admin.Gauttam"). A "Who" column that says "system"
 * for every row is worse than useless on an accountability view, so fall back to
 * the existing extractor before giving up.
 */
function auditWho(row: any): string {
    const name = String(row.username || '').trim();
    if (name && name !== 'system' && name !== 'unknown') return name;
    return auditActorFromDetails(row.details) || name || 'system';
}

/** Some actions are logged SHOUTING ("ADMIT PATIENT IPD"); even them out. */
function tidyActionLabel(action?: string | null): string {
    const label = auditActionLabel(action);
    if (!label || label !== label.toUpperCase()) return label;
    const lower = label.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Audit details are stored as a JSON string; raw JSON is unreadable in a table cell. */
function formatAuditDetails(details: any): string {
    if (!details) return '';
    let obj = details;
    if (typeof details === 'string') {
        try {
            obj = JSON.parse(details);
        } catch {
            return details;
        }
    }
    if (!obj || typeof obj !== 'object') return String(obj);
    return Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ');
}
