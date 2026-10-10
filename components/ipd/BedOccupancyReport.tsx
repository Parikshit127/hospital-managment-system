'use client';

/**
 * BedOccupancyReport — interactive IPD Bed Occupancy report.
 *
 * Shared by /ipd/bed-occupancy, /admin/bed-occupancy and /finance/bed-occupancy (thin
 * page wrappers around this component). All numbers come from loadBedOccupancy(); this component only
 * presents them. Filters re-query automatically (debounced); a live range (one that
 * includes today) can auto-refresh every minute.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
    BarController, LineController, DoughnutController, Tooltip, Legend, Filler,
} from 'chart.js';
import { Chart, Doughnut, Bar } from 'react-chartjs-2';
import {
    BedDouble, Users, DoorOpen, Ban, Percent, LogIn, LogOut, Timer, RefreshCw, Loader2,
    FileSpreadsheet, FileText, AlertTriangle, Info, ChevronDown, ChevronUp, Search, TrendingUp, Repeat, X,
} from 'lucide-react';
import {
    loadBedOccupancy,
    getBedOccupancyFilterOptions,
    exportBedOccupancyExcel,
    type BedOccupancyReportPayload,
    type BedOccupancyFilterOptions,
} from '@/app/actions/bed-occupancy-actions';
import type { DocumentProps } from '@react-pdf/renderer';
import type { OccupancyGroupRow } from '@/app/lib/reports/bed-occupancy';
import { istDayKey } from '@/app/lib/ist';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
    BarController, LineController, DoughnutController, Tooltip, Legend, Filler,
);

// ─── helpers ────────────────────────────────────────────────────────────────

const COLORS = {
    occupied: '#e11d48',
    vacant: '#10b981',
    blocked: '#64748b',
    line: '#ea580c',
    admit: 'rgba(59,130,246,0.75)',
    discharge: 'rgba(244,63,94,0.7)',
};

const shiftKey = (key: string, days: number) =>
    new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const ddmmyyyy = (key: string) => {
    const [y, m, d] = key.split('-');
    return `${d}/${m}/${y}`;
};
const shortDay = (key: string) => {
    const [, m, d] = key.split('-');
    return `${d}/${m}`;
};
const num = (v: number | null | undefined, digits = 1) =>
    v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const occTone = (p: number) => (p > 90 ? 'text-red-600 bg-red-50' : p > 70 ? 'text-amber-600 bg-amber-50' : 'text-emerald-700 bg-emerald-50');
const occBar = (p: number) => (p > 90 ? 'bg-red-500' : p > 70 ? 'bg-amber-500' : 'bg-orange-500');

type Preset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'custom';
type TabKey = 'department' | 'ward' | 'category' | 'wardType' | 'bed' | 'daily';
// Heterogeneous table rows (group / bed / day) rendered by one generic table.
type TableRow = Record<string, string | number | boolean | null>;

function presetRange(preset: Preset, today: string): { start: string; end: string } | null {
    switch (preset) {
        case 'today': return { start: today, end: today };
        case '7d': return { start: shiftKey(today, -6), end: today };
        case '30d': return { start: shiftKey(today, -29), end: today };
        case 'month': return { start: `${today.slice(0, 8)}01`, end: today };
        case 'lastMonth': {
            const firstThis = `${today.slice(0, 8)}01`;
            const lastPrev = shiftKey(firstThis, -1);
            return { start: `${lastPrev.slice(0, 8)}01`, end: lastPrev };
        }
        default: return null;
    }
}

const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'month', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
];

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── small presentational pieces ────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; tone: string }) {
    return (
        <div className="bg-white border border-gray-200 hover:border-orange-400 transition-colors shadow-sm rounded-2xl p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">{label}</p>
                <p className="text-2xl font-black text-gray-900 leading-tight">{value}</p>
                {sub && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{sub}</p>}
            </div>
            <div className={`p-2.5 rounded-xl shrink-0 ${tone}`}>{icon}</div>
        </div>
    );
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden ${className}`}>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
                {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

const selectCls = 'h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400';

// ─── component ──────────────────────────────────────────────────────────────

interface BedOccupancyReportProps {
    /** Data source overrides — default to the server actions. Used to render the report with fixture data. */
    loader?: typeof loadBedOccupancy;
    optionsLoader?: typeof getBedOccupancyFilterOptions;
}

export default function BedOccupancyReport({ loader = loadBedOccupancy, optionsLoader = getBedOccupancyFilterOptions }: BedOccupancyReportProps = {}) {
    const today = useMemo(() => istDayKey(new Date()) ?? new Date().toISOString().slice(0, 10), []);
    const initial = presetRange('30d', today)!;

    const [preset, setPreset] = useState<Preset>('30d');
    const [start, setStart] = useState(initial.start);
    const [end, setEnd] = useState(initial.end);
    const [departmentId, setDepartmentId] = useState('');
    const [wardId, setWardId] = useState('');
    const [category, setCategory] = useState('');

    const [options, setOptions] = useState<BedOccupancyFilterOptions | null>(null);
    const [data, setData] = useState<BedOccupancyReportPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [reloadTick, setReloadTick] = useState(0);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const [tab, setTab] = useState<TabKey>('ward');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [showNotes, setShowNotes] = useState(false);
    const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const reqId = useRef(0);
    const rangeError = start && end && start > end ? 'End date must be on or after the start date' : null;

    // Filter option lists (departments / wards / bed categories) load once.
    useEffect(() => {
        optionsLoader().then((r) => {
            if (r.success) setOptions(r.data);
        });
    }, [optionsLoader]);

    // Re-query whenever a filter changes (debounced) or a refresh is requested.
    useEffect(() => {
        if (!start || !end || start > end) return;
        const id = ++reqId.current;
        const t = setTimeout(async () => {
            setLoading(true);
            const res = await loader({
                date_start: start,
                date_end: end,
                department_id: departmentId || null,
                ward_id: wardId ? Number(wardId) : null,
                bed_category: category || null,
            });
            if (id !== reqId.current) return; // a newer request superseded this one
            if (res.success) {
                setData(res.data);
                setError(null);
            } else {
                setError(res.error);
            }
            setLoading(false);
        }, 250);
        return () => clearTimeout(t);
    }, [start, end, departmentId, wardId, category, reloadTick, loader]);

    const isLive = data?.snapshot.isLive ?? false;
    useEffect(() => {
        if (!autoRefresh || !isLive) return;
        const t = setInterval(() => {
            if (document.visibilityState === 'visible') setReloadTick((n) => n + 1);
        }, 60_000);
        return () => clearInterval(t);
    }, [autoRefresh, isLive]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    const applyPreset = (p: Preset) => {
        setPreset(p);
        const r = presetRange(p, today);
        if (r) {
            setStart(r.start);
            setEnd(r.end);
        }
    };

    const wardChoices = useMemo(
        () => (options?.wards ?? []).filter((w) => !departmentId || w.departmentId === departmentId),
        [options, departmentId],
    );

    const anyFilter = !!(departmentId || wardId || category);
    const clearFilters = () => {
        setDepartmentId('');
        setWardId('');
        setCategory('');
    };

    // ── drill-down from charts / table ──
    const drillWard = (row: OccupancyGroupRow) => {
        if (row.key !== '__none') setWardId(row.key);
    };
    const drillDepartment = (row: OccupancyGroupRow) => {
        if (row.key === '__none') return;
        setDepartmentId(row.key);
        setWardId('');
    };
    const drillCategory = (row: OccupancyGroupRow) => setCategory(row.key);

    // ── export ──
    const filtersForExport = {
        date_start: start,
        date_end: end,
        department_id: departmentId || null,
        ward_id: wardId ? Number(wardId) : null,
        bed_category: category || null,
    };

    const handleExcel = async () => {
        setExporting('xlsx');
        try {
            const res = await exportBedOccupancyExcel(filtersForExport);
            if (!res.success) {
                setToast(res.error);
                return;
            }
            const bin = atob(res.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            downloadBlob(
                new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                res.fileName,
            );
        } catch {
            setToast('Excel export failed. Please try again.');
        } finally {
            setExporting(null);
        }
    };

    const handlePdf = async () => {
        if (!data) return;
        setExporting('pdf');
        try {
            const [{ pdf }, { BedOccupancyPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('@/components/ipd/BedOccupancyPDF'),
            ]);
            const blob = await pdf(<BedOccupancyPDF data={data} /> as React.ReactElement<DocumentProps>).toBlob();
            downloadBlob(blob, `Bed-Occupancy_${data.range.start}_to_${data.range.end}.pdf`);
        } catch (e) {
            console.error('PDF export failed:', e);
            setToast('PDF generation failed. Please try again or use Excel export.');
        } finally {
            setExporting(null);
        }
    };

    // ── chart datasets ──
    const trendChart = useMemo(() => {
        if (!data) return null;
        const labels = data.daily.map((d) => shortDay(d.date));
        return {
            labels,
            datasets: [
                {
                    type: 'line' as const,
                    label: 'Occupancy %',
                    data: data.daily.map((d) => d.occupancyPct),
                    borderColor: COLORS.line,
                    backgroundColor: 'rgba(234,88,12,0.10)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: data.daily.length > 45 ? 0 : 3,
                    pointHoverRadius: 6,
                    yAxisID: 'y',
                    order: 1,
                },
                {
                    type: 'bar' as const,
                    label: 'Admissions',
                    data: data.daily.map((d) => d.admissions),
                    backgroundColor: COLORS.admit,
                    borderRadius: 3,
                    yAxisID: 'y1',
                    order: 2,
                },
                {
                    type: 'bar' as const,
                    label: 'Discharges',
                    data: data.daily.map((d) => d.discharges),
                    backgroundColor: COLORS.discharge,
                    borderRadius: 3,
                    yAxisID: 'y1',
                    order: 3,
                },
            ],
        };
    }, [data]);

    const wardRows = data?.byWard ?? [];

    // ── table model ──
    const tableModel = useMemo(() => {
        if (!data) return null;
        const groupCols = (label: string, withParent = false) => [
            { key: 'label', label, align: 'left' as const },
            ...(withParent ? [{ key: 'parent', label: 'Department', align: 'left' as const }] : []),
            { key: 'totalBeds', label: 'Total Beds', align: 'right' as const },
            { key: 'occupiedAsOf', label: data.snapshot.isLive ? 'Occupied (now)' : 'Occupied (end)', align: 'right' as const },
            { key: 'vacantAsOf', label: data.snapshot.isLive ? 'Vacant (now)' : 'Vacant (end)', align: 'right' as const },
            { key: 'blockedAsOf', label: 'Blocked (now)', align: 'right' as const },
            { key: 'avgOccupiedBeds', label: 'Avg Occupied', align: 'right' as const },
            { key: 'avgVacantBeds', label: 'Avg Vacant', align: 'right' as const },
            { key: 'bedDaysOccupied', label: 'Bed-days Occ.', align: 'right' as const },
            { key: 'occupancyPct', label: 'Occupancy %', align: 'right' as const },
            { key: 'admissions', label: 'Admissions', align: 'right' as const },
            { key: 'discharges', label: 'Discharges', align: 'right' as const },
            { key: 'alosDays', label: 'ALOS (d)', align: 'right' as const },
        ];
        switch (tab) {
            case 'department': return { cols: groupCols('Department'), rows: data.byDepartment as unknown as TableRow[], group: true as const };
            case 'ward': return { cols: groupCols('Ward', true), rows: data.byWard as unknown as TableRow[], group: true as const };
            case 'category': return { cols: groupCols('Bed Category'), rows: data.byCategory as unknown as TableRow[], group: true as const };
            case 'wardType': return { cols: groupCols('Ward Type'), rows: data.byWardType as unknown as TableRow[], group: true as const };
            case 'bed': return {
                group: false as const,
                rows: data.beds as unknown as TableRow[],
                cols: [
                    { key: 'bedLabel', label: 'Bed', align: 'left' as const },
                    { key: 'ward', label: 'Ward', align: 'left' as const },
                    { key: 'department', label: 'Department', align: 'left' as const },
                    { key: 'category', label: 'Category', align: 'left' as const },
                    { key: 'currentStatus', label: 'Status Now', align: 'left' as const },
                    { key: 'stays', label: 'Patient Stays', align: 'right' as const },
                    { key: 'bedDaysOccupied', label: 'Bed-days Occ.', align: 'right' as const },
                    { key: 'occupancyPct', label: 'Occupancy %', align: 'right' as const },
                ],
            };
            default: return {
                group: false as const,
                rows: data.daily as unknown as TableRow[],
                cols: [
                    { key: 'date', label: 'Date', align: 'left' as const },
                    { key: 'totalBeds', label: 'Total Beds', align: 'right' as const },
                    { key: 'avgOccupiedBeds', label: 'Avg Occupied', align: 'right' as const },
                    { key: 'closingOccupiedBeds', label: 'Closing Occupied', align: 'right' as const },
                    { key: 'avgVacantBeds', label: 'Avg Vacant', align: 'right' as const },
                    { key: 'occupancyPct', label: 'Occupancy %', align: 'right' as const },
                    { key: 'admissions', label: 'Admissions', align: 'right' as const },
                    { key: 'discharges', label: 'Discharges', align: 'right' as const },
                ],
            };
        }
    }, [data, tab]);

    const visibleRows = useMemo(() => {
        if (!tableModel) return [];
        const q = search.trim().toLowerCase();
        let rows = tableModel.rows;
        if (q) {
            rows = rows.filter((r) =>
                [r.label, r.parent, r.bedLabel, r.ward, r.department, r.category, r.currentStatus, r.date]
                    .some((v) => typeof v === 'string' && v.toLowerCase().includes(q)),
            );
        }
        if (sort) {
            const { key, dir } = sort;
            rows = [...rows].sort((a, b) => {
                const av = a[key];
                const bv = b[key];
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                const cmp = typeof av === 'number' && typeof bv === 'number'
                    ? av - bv
                    : String(av).localeCompare(String(bv), undefined, { numeric: true });
                return dir === 'asc' ? cmp : -cmp;
            });
        }
        return rows;
    }, [tableModel, search, sort]);

    const toggleSort = (key: string) =>
        setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

    const changeTab = (k: TabKey) => {
        setTab(k);
        setSort(null);
        setSearch('');
    };

    const renderCell = (col: { key: string }, row: TableRow) => {
        const v = row[col.key];
        const n = typeof v === 'number' ? v : 0;
        const text = v == null ? '' : String(v);
        switch (col.key) {
            case 'label': {
                const g = row as unknown as OccupancyGroupRow;
                const clickable = tab === 'category' || ((tab === 'ward' || tab === 'department') && g.key !== '__none');
                const onClick = tab === 'ward' ? () => drillWard(g) : tab === 'department' ? () => drillDepartment(g) : () => drillCategory(g);
                return clickable ? (
                    <button onClick={onClick} className="font-bold text-gray-900 hover:text-orange-600 underline-offset-2 hover:underline text-left" title="Filter the report to this row">
                        {text}
                    </button>
                ) : <span className="font-bold text-gray-900">{text}</span>;
            }
            case 'parent': return <span className="text-gray-500">{text || '—'}</span>;
            case 'blockedAsOf': return v == null ? <span className="text-gray-400" title="Bed status history is not recorded">n/a</span> : num(n, 0);
            case 'occupancyPct': return (
                <div className="flex items-center justify-end gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${occTone(n)}`}>{num(n)}%</span>
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                        <div className={`h-full ${occBar(n)}`} style={{ width: `${Math.min(100, n)}%` }} />
                    </div>
                </div>
            );
            case 'date': return <span className="font-semibold text-gray-800">{ddmmyyyy(text)}</span>;
            case 'alosDays': return v == null ? '—' : num(n);
            case 'currentStatus': return <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-semibold">{text}</span>;
            case 'bedLabel': case 'ward': case 'department': case 'category': return <span className="text-gray-800 font-medium">{text}</span>;
            default: return typeof v === 'number' ? num(v, col.key.startsWith('bedDays') || col.key.startsWith('avg') ? 1 : 0) : (text || '—');
        }
    };

    // ── render ─────────────────────────────────────────────────────────────────
    const s = data?.summary;
    const snap = data?.snapshot;
    const asOfText = snap
        ? snap.isLive ? 'Right now' : `End of ${ddmmyyyy(data!.range.end)}`
        : '';
    const noBeds = !!data && data.snapshot.total === 0 && data.summary.totalBeds === 0;
    const mismatch = (data?.integrity?.statusOccupiedNoPatient.length ?? 0) + (data?.integrity?.patientWithoutOccupiedStatus.length ?? 0);

    return (
        <div className="space-y-5 pb-10">
            {/* ── Filters ─────────────────────────────────────────────────────── */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {PRESETS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => applyPreset(p.key)}
                            className={`h-8 px-3 rounded-full text-xs font-bold border transition-colors ${preset === p.key ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:text-orange-600'}`}
                        >
                            {p.label}
                        </button>
                    ))}
                    <div className="flex items-center gap-2 ml-0 sm:ml-2">
                        <input type="date" value={start} max={end} onChange={(e) => { setPreset('custom'); setStart(e.target.value); }} className={selectCls} aria-label="Start date" />
                        <span className="text-gray-400 text-sm">to</span>
                        <input type="date" value={end} min={start} onChange={(e) => { setPreset('custom'); setEnd(e.target.value); }} className={selectCls} aria-label="End date" />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setWardId(''); }} className={selectCls} aria-label="Department">
                        <option value="">All departments</option>
                        {options?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={wardId} onChange={(e) => setWardId(e.target.value)} className={selectCls} aria-label="Ward">
                        <option value="">All wards</option>
                        {wardChoices.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} aria-label="Bed category">
                        <option value="">All bed categories</option>
                        {options?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {anyFilter && (
                        <button onClick={clearFilters} className="h-9 px-3 rounded-xl text-xs font-bold text-gray-600 hover:text-red-600 inline-flex items-center gap-1">
                            <X className="h-3.5 w-3.5" /> Clear filters
                        </button>
                    )}

                    <div className="flex-1" />

                    {isLive && (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer select-none">
                            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-orange-600" />
                            Auto-refresh (1 min)
                        </label>
                    )}
                    <button onClick={() => setReloadTick((n) => n + 1)} disabled={loading} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-orange-600 hover:border-orange-400 disabled:opacity-50" title="Refresh">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={handleExcel} disabled={!data || exporting !== null} className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                        {exporting === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Excel
                    </button>
                    <button onClick={handlePdf} disabled={!data || exporting !== null} className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50">
                        {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} PDF
                    </button>
                </div>
            </div>

            {toast && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium px-4 py-2.5">{toast}</div>}

            {(rangeError || error) && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 text-sm text-red-700">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-bold">{rangeError ? 'Check the date range' : 'Could not load the report'}</p>
                        <p>{rangeError ?? error}</p>
                    </div>
                    <button onClick={() => setReloadTick((n) => n + 1)} className="font-bold underline">Retry</button>
                </div>
            )}

            {!data && loading && (
                <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Calculating occupancy…</div>
            )}

            {data && s && snap && (
                <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
                    {noBeds && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            No beds match the current filters. Adjust the filters or add beds in IPD Setup.
                        </div>
                    )}

                    {/* ── Snapshot cards ─────────────────────────────────────────── */}
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-2">
                            Bed status · {asOfText}
                            {snap.isLive && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> live</span>}
                        </p>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <KpiCard label="Total Beds" value={snap.total} sub={data.byWard.length > 0 ? `${data.byWard.length} ward${data.byWard.length === 1 ? '' : 's'}` : undefined} icon={<BedDouble className="h-5 w-5 text-indigo-600" />} tone="bg-indigo-50" />
                            <KpiCard label="Occupied" value={snap.occupied} sub={`${num(snap.occupancyPct)}% of beds`} icon={<Users className="h-5 w-5 text-rose-600" />} tone="bg-rose-50" />
                            <KpiCard
                                label="Vacant"
                                value={snap.vacant}
                                sub={snap.available != null ? `${snap.available} ready · ${snap.cleaning} cleaning · ${snap.reserved} reserved` : 'Includes any beds out of service then'}
                                icon={<DoorOpen className="h-5 w-5 text-emerald-600" />} tone="bg-emerald-50"
                            />
                            <KpiCard
                                label="Blocked / Maintenance"
                                value={snap.blocked == null ? 'n/a' : snap.blocked}
                                sub={snap.blocked == null ? 'Bed status history is not recorded — pick a range ending today' : 'Out of service'}
                                icon={<Ban className="h-5 w-5 text-slate-600" />} tone="bg-slate-100"
                            />
                            <KpiCard label="Occupancy % (period)" value={`${num(s.occupancyPct)}%`} sub={`${num(s.bedDaysOccupied)} of ${num(s.bedDaysAvailable)} bed-days`} icon={<Percent className="h-5 w-5 text-orange-600" />} tone="bg-orange-50" />
                        </div>
                    </div>

                    {/* ── Period cards ───────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <KpiCard label="Admissions" value={s.admissions} sub={s.cancelled > 0 ? `${s.cancelled} cancelled` : undefined} icon={<LogIn className="h-5 w-5 text-blue-600" />} tone="bg-blue-50" />
                        <KpiCard label="Discharges" value={s.discharges} sub={`${s.deaths} death${s.deaths === 1 ? '' : 's'}${s.awaitingFinalDischarge ? ` · ${s.awaitingFinalDischarge} awaiting final` : ''}`} icon={<LogOut className="h-5 w-5 text-rose-600" />} tone="bg-rose-50" />
                        <KpiCard label="Avg Length of Stay" value={s.alosDays == null ? '—' : `${num(s.alosDays)} d`} sub="Patients discharged in period" icon={<Timer className="h-5 w-5 text-violet-600" />} tone="bg-violet-50" />
                        <KpiCard label="Bed Turnover" value={s.bedTurnoverRate == null ? '—' : num(s.bedTurnoverRate, 2)} sub={s.turnoverIntervalDays == null ? 'Discharges per bed' : `Discharges per bed · ${num(s.turnoverIntervalDays)} d idle between patients`} icon={<Repeat className="h-5 w-5 text-teal-600" />} tone="bg-teal-50" />
                        <KpiCard label="Peak / Low Day" value={s.peakDay ? `${num(s.peakDay.occupancyPct)}%` : '—'} sub={s.peakDay ? `Peak ${ddmmyyyy(s.peakDay.date)}${s.lowDay ? ` · low ${num(s.lowDay.occupancyPct)}% on ${shortDay(s.lowDay.date)}` : ''}` : undefined} icon={<TrendingUp className="h-5 w-5 text-amber-600" />} tone="bg-amber-50" />
                    </div>

                    {/* ── Charts ─────────────────────────────────────────────────── */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <Panel className="xl:col-span-2" title="Daily occupancy trend" subtitle="Line: occupancy % (left axis) · Bars: admissions and discharges (right axis). Click a day to inspect it.">
                            <div className="h-72">
                                {trendChart && (
                                    <Chart
                                        type="bar"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixed bar+line dataset typing
                                        data={trendChart as any}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            interaction: { mode: 'index', intersect: false },
                                            onClick: (_e, els) => {
                                                if (!els.length) return;
                                                const d = data.daily[els[0].index]?.date;
                                                if (d) { setSelectedDay(d); changeTab('daily'); }
                                            },
                                            plugins: {
                                                legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11, weight: 600 } } },
                                                tooltip: {
                                                    callbacks: {
                                                        title: (items) => ddmmyyyy(data.daily[items[0].dataIndex].date),
                                                        label: (item) => item.dataset.label === 'Occupancy %' ? ` Occupancy: ${item.parsed.y}%` : ` ${item.dataset.label}: ${item.parsed.y}`,
                                                        afterBody: (items) => {
                                                            const d = data.daily[items[0].dataIndex];
                                                            return [`Avg occupied: ${num(d.avgOccupiedBeds)} of ${d.totalBeds} beds`, `Closing occupied: ${d.closingOccupiedBeds}`];
                                                        },
                                                    },
                                                },
                                            },
                                            scales: {
                                                x: { grid: { display: false }, ticks: { maxTicksLimit: 16, font: { size: 10 } } },
                                                y: { min: 0, max: 100, position: 'left', ticks: { callback: (v) => `${v}%`, font: { size: 10 } }, grid: { color: '#f3f4f6' } },
                                                y1: { min: 0, position: 'right', ticks: { precision: 0, font: { size: 10 } }, grid: { display: false } },
                                            },
                                        }}
                                    />
                                )}
                            </div>
                        </Panel>

                        <Panel title="Bed status" subtitle={asOfText}>
                            <div className="h-72 relative">
                                <Doughnut
                                    data={{
                                        labels: ['Occupied', 'Vacant', ...(snap.blocked != null ? ['Blocked'] : [])],
                                        datasets: [{
                                            data: [snap.occupied, snap.vacant, ...(snap.blocked != null ? [snap.blocked] : [])],
                                            backgroundColor: [COLORS.occupied, COLORS.vacant, COLORS.blocked],
                                            borderColor: '#fff', borderWidth: 2,
                                        }],
                                    }}
                                    options={{
                                        responsive: true, maintainAspectRatio: false, cutout: '62%',
                                        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11, weight: 600 } } } },
                                    }}
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                                    <span className="text-2xl font-black text-gray-900">{num(snap.occupancyPct)}%</span>
                                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">occupied</span>
                                </div>
                            </div>
                        </Panel>

                        <Panel className="xl:col-span-2" title="Ward-wise occupancy" subtitle="Time-weighted occupancy % for the period. Click a bar to filter to that ward.">
                            {wardRows.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No wards to display</p> : (
                                <div style={{ height: Math.max(220, wardRows.length * 30 + 40) }}>
                                    <Bar
                                        data={{
                                            labels: wardRows.map((w) => w.label),
                                            datasets: [{
                                                label: 'Occupancy %',
                                                data: wardRows.map((w) => w.occupancyPct),
                                                backgroundColor: wardRows.map((w) => (w.occupancyPct > 90 ? '#ef4444' : w.occupancyPct > 70 ? '#f59e0b' : '#f97316')),
                                                borderRadius: 6,
                                            }],
                                        }}
                                        options={{
                                            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                                            onClick: (_e, els) => { if (els.length) drillWard(wardRows[els[0].index]); },
                                            plugins: {
                                                legend: { display: false },
                                                tooltip: {
                                                    callbacks: {
                                                        label: (i) => ` ${i.parsed.x}% occupancy`,
                                                        afterLabel: (i) => {
                                                            const w = wardRows[i.dataIndex];
                                                            return [`${w.totalBeds} beds · ${num(w.bedDaysOccupied)} of ${num(w.bedDaysAvailable)} bed-days`, `Admissions ${w.admissions} · Discharges ${w.discharges}`];
                                                        },
                                                    },
                                                },
                                            },
                                            scales: {
                                                x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 10 } }, grid: { color: '#f3f4f6' } },
                                                y: { grid: { display: false }, ticks: { font: { size: 11, weight: 600 } } },
                                            },
                                        }}
                                    />
                                </div>
                            )}
                        </Panel>

                        <Panel title="Bed category-wise" subtitle="Average occupied vs vacant beds. Click to filter.">
                            {data.byCategory.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No categories</p> : (
                                <div style={{ height: Math.max(220, data.byCategory.length * 34 + 60) }}>
                                    <Bar
                                        data={{
                                            labels: data.byCategory.map((c) => c.label),
                                            datasets: [
                                                { label: 'Avg occupied', data: data.byCategory.map((c) => c.avgOccupiedBeds), backgroundColor: COLORS.occupied, borderRadius: 4 },
                                                { label: 'Avg vacant', data: data.byCategory.map((c) => c.avgVacantBeds), backgroundColor: COLORS.vacant, borderRadius: 4 },
                                            ],
                                        }}
                                        options={{
                                            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                                            onClick: (_e, els) => { if (els.length) drillCategory(data.byCategory[els[0].index]); },
                                            plugins: {
                                                legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11, weight: 600 } } },
                                                tooltip: { callbacks: { afterBody: (items) => `Occupancy ${num(data.byCategory[items[0].dataIndex].occupancyPct)}%` } },
                                            },
                                            scales: {
                                                x: { stacked: true, ticks: { font: { size: 10 } }, grid: { color: '#f3f4f6' } },
                                                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: 600 } } },
                                            },
                                        }}
                                    />
                                </div>
                            )}
                        </Panel>
                    </div>

                    {/* ── Admission & discharge statistics ───────────────────────── */}
                    <Panel title="Admission & discharge statistics" subtitle={`${ddmmyyyy(data.range.start)} to ${ddmmyyyy(data.range.end)}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <Stat label="Admissions" value={s.admissions} />
                            <Stat label="Discharges" value={s.discharges} />
                            <Stat label="Net census change" value={s.netCensusChange > 0 ? `+${s.netCensusChange}` : s.netCensusChange} />
                            <Stat label="Awaiting final discharge" value={s.awaitingFinalDischarge} hint="Summary done, bed still held" />
                        </div>
                        {s.dischargeTypes.length > 0 && (
                            <div className="mt-4 space-y-1.5">
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Discharge type</p>
                                {s.dischargeTypes.map((d) => (
                                    <div key={d.type} className="flex items-center gap-3 text-xs">
                                        <span className="w-24 font-semibold text-gray-700">{d.type}</span>
                                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-orange-500" style={{ width: `${(d.count / s.discharges) * 100}%` }} />
                                        </div>
                                        <span className="w-16 text-right font-bold text-gray-700">{d.count} <span className="text-gray-400 font-medium">({num((d.count / s.discharges) * 100, 0)}%)</span></span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    {/* ── Detailed table ─────────────────────────────────────────── */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                        <div className="p-3 border-b border-gray-200 bg-gray-50/50 flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-1">
                                {([
                                    ['department', 'Department'], ['ward', 'Ward'], ['category', 'Bed Category'],
                                    ['wardType', 'Ward Type'], ['bed', 'Bed-wise'], ['daily', 'Daily'],
                                ] as [TabKey, string][]).map(([k, label]) => (
                                    <button key={k} onClick={() => changeTab(k)} className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${tab === k ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</button>
                                ))}
                            </div>
                            <div className="flex-1" />
                            <div className="relative">
                                <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-44 pl-8 pr-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-[560px]">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 sticky top-0 z-10">
                                    <tr>
                                        {tableModel?.cols.map((c) => (
                                            <th key={c.key} className={`px-4 py-3 font-bold text-xs uppercase ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                                                <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-orange-600 uppercase">
                                                    {c.label}
                                                    {sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visibleRows.map((row, idx) => (
                                        <tr
                                            key={String(row.key ?? row.bedId ?? row.date ?? idx)}
                                            className={`hover:bg-gray-50 ${tab === 'daily' && row.date === selectedDay ? 'bg-orange-50 ring-1 ring-inset ring-orange-300' : ''}`}
                                            onClick={tab === 'daily' ? () => setSelectedDay(String(row.date)) : undefined}
                                        >
                                            {tableModel?.cols.map((c) => (
                                                <td key={c.key} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums text-gray-700' : ''}`}>{renderCell(c, row)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                    {visibleRows.length === 0 && (
                                        <tr><td colSpan={tableModel?.cols.length ?? 1} className="px-4 py-10 text-center text-gray-400">No rows match.</td></tr>
                                    )}
                                </tbody>
                                {tableModel?.group && visibleRows.length > 0 && !search && (
                                    <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold text-gray-900 sticky bottom-0">
                                        <tr>
                                            {tableModel.cols.map((c, i) => {
                                                const rows = tableModel.rows as unknown as OccupancyGroupRow[];
                                                const sum = (k: keyof OccupancyGroupRow) => rows.reduce((a, r) => a + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
                                                let content: React.ReactNode = '';
                                                if (i === 0) content = 'Total';
                                                else if (c.key === 'totalBeds') content = num(sum('totalBeds'), 0);
                                                else if (c.key === 'occupiedAsOf') content = num(sum('occupiedAsOf'), 0);
                                                else if (c.key === 'vacantAsOf') content = num(sum('vacantAsOf'), 0);
                                                else if (c.key === 'blockedAsOf') content = snap.blocked == null ? 'n/a' : num(snap.blocked, 0);
                                                else if (c.key === 'avgOccupiedBeds') content = num(sum('avgOccupiedBeds'));
                                                else if (c.key === 'avgVacantBeds') content = num(sum('avgVacantBeds'));
                                                else if (c.key === 'bedDaysOccupied') content = num(sum('bedDaysOccupied'));
                                                else if (c.key === 'occupancyPct') content = `${num(s.occupancyPct)}%`;
                                                else if (c.key === 'admissions') content = num(sum('admissions'), 0);
                                                else if (c.key === 'discharges') content = num(sum('discharges'), 0);
                                                else if (c.key === 'alosDays') content = s.alosDays == null ? '—' : num(s.alosDays);
                                                return <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{content}</td>;
                                            })}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* ── Data notes ─────────────────────────────────────────────── */}
                    {(mismatch > 0 || data.dataQuality.overlappingStays > 0 || data.dataQuality.admissionsWithoutBed > 0 || data.dataQuality.dischargedWithoutDate > 0 || data.dataQuality.unknownBedStays > 0) && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
                            <p className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Data checks</p>
                            {(data.integrity?.statusOccupiedNoPatient.length ?? 0) > 0 && <p>Marked “Occupied” but no active admission holds the bed: <b>{data.integrity!.statusOccupiedNoPatient.join(', ')}</b>.</p>}
                            {(data.integrity?.patientWithoutOccupiedStatus.length ?? 0) > 0 && <p>Has an active patient but is not marked “Occupied”: <b>{data.integrity!.patientWithoutOccupiedStatus.join(', ')}</b>.</p>}
                            {data.dataQuality.overlappingStays > 0 && <p>{data.dataQuality.overlappingStays} bed(s) have overlapping patient stays; overlaps are counted once.</p>}
                            {data.dataQuality.admissionsWithoutBed > 0 && <p>{data.dataQuality.admissionsWithoutBed} admission(s) have no bed recorded and are excluded from bed-days.</p>}
                            {data.dataQuality.dischargedWithoutDate > 0 && <p>{data.dataQuality.dischargedWithoutDate} discharged admission(s) have no discharge date and were counted as zero-length stays.</p>}
                            {data.dataQuality.unknownBedStays > 0 && <p>{data.dataQuality.unknownBedStays} stay segment(s) refer to beds that no longer exist.</p>}
                        </div>
                    )}

                    <div className="rounded-2xl border border-gray-200 bg-white">
                        <button onClick={() => setShowNotes((v) => !v)} className="w-full px-4 py-3 flex items-center gap-2 text-sm font-bold text-gray-700">
                            <Info className="h-4 w-4 text-gray-400" /> How occupancy is calculated
                            <span className="flex-1" />
                            {showNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {showNotes && (
                            <ul className="px-5 pb-4 text-xs text-gray-600 space-y-1.5 list-disc list-inside leading-relaxed">
                                <li><b>Occupancy %</b> = occupied bed-hours ÷ (beds × hours observed). It uses each patient’s actual bed allocation: admission time, every bed transfer, and discharge time — not just today’s bed status.</li>
                                <li>Patients <b>awaiting final discharge</b> (discharge summary done, TPA/payment pending) still hold their bed and count as occupying it.</li>
                                <li><b>Cancelled</b> admissions are not counted as occupancy. Overlapping stays in one bed are counted once, so a bed never exceeds 100%.</li>
                                <li>Today is measured only up to the current time, so a partial day is not diluted.</li>
                                <li>The bed master has no commissioning/retirement dates, so the <b>current bed list</b> is applied to the whole period (retired beds appear only if they held a patient).</li>
                                <li><b>Blocked / maintenance</b> status is not historised. It is shown only when the selected range includes today, and counted separately from vacant beds.</li>
                                <li>Admissions and discharges are attributed to the bed the patient was first / last in. Days follow the hospital timezone ({data.meta.timezone}).</li>
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
    return (
        <div>
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{label}</p>
            <p className="text-xl font-black text-gray-900">{value}</p>
            {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
        </div>
    );
}
