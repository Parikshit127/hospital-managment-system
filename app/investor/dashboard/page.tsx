'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getInvestorDashboardData, getInvestorDrilldown, type InvestorDashboardData, type UnitMetrics, type DrilldownSection, type DrilldownResult } from '@/app/actions/investor-actions';
import {
    Activity,
    Users,
    TrendingUp,
    Printer,
    Download,
    Bed,
    PieChart,
    ArrowUpRight,
    CheckCircle2,
    RefreshCw,
    Building2,
    Clock,
    Award,
    ChevronDown,
    ChevronRight,
    Check,
    X,
    Loader2,
    ExternalLink
} from 'lucide-react';

import { useInvestorTheme } from '../investor-theme-context';

// Format numbers: default is currency=false (no ₹ symbol) so counts render as pure numbers!
function fmtINR(n: number, isCurrency = false): string {
    if (n === undefined || n === null) return '-';
    if (!isCurrency) return n.toLocaleString('en-IN');
    return `₹${n.toLocaleString('en-IN')}`;
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
// Default window = current fiscal year (Apr 1 start) to date, so the picker
// always opens on "this FY so far" — including whatever month is current —
// instead of a hardcoded date that goes stale every month.
function defaultFYRange(): { from: string; to: string } {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { from: toISODate(new Date(fyStartYear, 3, 1)), to: toISODate(now) };
}

export default function PromoterDashboardPage() {
    const { theme } = useInvestorTheme();
    const isDark = theme === 'dark';

    const [data, setData] = useState<InvestorDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'day' | 'month' | 'year' | 'custom'>('month');
    // Hospital units are dynamic (every active organization on this server), so
    // the selection starts empty and is populated from the first successful
    // load's `data.units` list — see the loadData success handler below.
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const unitsInitialized = useRef(false);
    const [unitMenuOpen, setUnitMenuOpen] = useState(false);
    const unitMenuRef = useRef<HTMLDivElement>(null);
    const [fromDate, setFromDate] = useState(() => defaultFYRange().from);
    const [toDate, setToDate] = useState(() => defaultFYRange().to);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    // Drill-down: click any hospital's cell in a real (non-derived) row to see
    // the actual records behind that number.
    const [drillTarget, setDrillTarget] = useState<{ section: DrilldownSection; category: string; label: string; unit: string; unitLabel: string } | null>(null);
    const [drillLoading, setDrillLoading] = useState(false);
    const [drillError, setDrillError] = useState<string | null>(null);
    const [drillResult, setDrillResult] = useState<DrilldownResult | null>(null);

    const openDrilldown = async (section: DrilldownSection, category: string, label: string, unit: string, unitLabel: string) => {
        setDrillTarget({ section, category, label, unit, unitLabel });
        setDrillResult(null);
        setDrillError(null);
        setDrillLoading(true);
        try {
            const res = await getInvestorDrilldown({ section, category, unit, fromDate, toDate });
            if (res.success && res.data) {
                setDrillResult(res.data);
            } else {
                setDrillError(res.error || 'Failed to load records');
            }
        } catch (err: any) {
            setDrillError(err.message || 'Unexpected error loading records');
        } finally {
            setDrillLoading(false);
        }
    };
    const closeDrilldown = () => { setDrillTarget(null); setDrillResult(null); setDrillError(null); };

    const toggleUnit = (code: string) => {
        setSelectedUnits((prev) =>
            prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
        );
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (unitMenuRef.current && !unitMenuRef.current.contains(e.target as Node)) {
                setUnitMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleSection = (key: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const loadData = async (overrideFrom?: string, overrideTo?: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await getInvestorDashboardData({
                filterType,
                selectedUnit: selectedUnits.length ? selectedUnits.join(',') : 'all',
                fromDate: overrideFrom ?? fromDate,
                toDate: overrideTo ?? toDate,
            });
            if (res.success && res.data) {
                setData(res.data);
                // First successful load: default the unit selection to every
                // hospital the server returned, now that we know what they are.
                if (!unitsInitialized.current) {
                    setSelectedUnits(res.data.units.map((u) => u.code));
                    unitsInitialized.current = true;
                }
            } else {
                setError(res.error || 'Failed to load dashboard data');
            }
        } catch (err: any) {
            setError(err.message || 'Unexpected error loading data');
        } finally {
            setLoading(false);
        }
    };

    // The Day / Month / Year buttons must actually narrow the query window —
    // previously they only changed a cosmetic `filterType` label while the
    // backend kept using whatever fromDate/toDate was already in state
    // (defaulting to the whole fiscal-year-to-date range), so switching to
    // "day" never changed the numbers. Custom keeps whatever the user picked.
    useEffect(() => {
        if (filterType === 'custom') {
            loadData();
            return;
        }
        const now = new Date();
        let from: Date;
        if (filterType === 'day') {
            from = now;
        } else if (filterType === 'month') {
            from = new Date(now.getFullYear(), now.getMonth(), 1);
        } else {
            const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            from = new Date(fyStartYear, 3, 1);
        }
        const newFrom = toISODate(from);
        const newTo = toISODate(now);
        setFromDate(newFrom);
        setToDate(newTo);
        loadData(newFrom, newTo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType]);

    if (loading) {
        return (
            <div className="min-h-[75vh] flex flex-col items-center justify-center gap-5">
                <div className="relative flex items-center justify-center">
                    <div className={`w-14 h-14 border-4 rounded-full animate-spin ${isDark ? 'border-orange-500/20 border-t-orange-400' : 'border-orange-200 border-t-orange-600'}`} />
                    <Activity className={`w-6 h-6 absolute animate-pulse ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                </div>
                <div className="text-center space-y-1">
                    <p className={`text-base font-black tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>Aggregating Executive Intelligence...</p>
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Consolidating financial ledgers & bed statistics across hospital units</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
                <div className={`rounded-3xl p-8 max-w-lg text-center backdrop-blur-md shadow-2xl space-y-4 border ${
                    isDark ? 'bg-rose-950/40 border-rose-900/60 text-rose-200' : 'bg-white border-rose-200 text-rose-900 shadow-rose-500/10'
                }`}>
                    <p className="text-xl font-black">Executive Audit Connection Warning</p>
                    <p className="text-xs font-medium opacity-90">{error || 'No data returned from server'}</p>
                    <button
                        onClick={() => loadData()}
                        className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-xs font-black transition-all cursor-pointer shadow-lg shadow-orange-500/20"
                    >
                        Retry Audit Sync
                    </button>
                </div>
            </div>
        );
    }

    const {
        executiveKPIs,
        currentAdmittedPatients,
        admissions,
        discharges,
        revenue,
        opdVsIpdRevenue,
        departmentRevenue,
        expenses,
        receivables,
        insuranceAging,
        payables,
        salaries,
        arpob,
        profitLoss,
        units,
    } = data;

    const isAllUnitsSelected = selectedUnits.length === units.length;
    const selectedUnitsLabel = isAllUnitsSelected
        ? 'All Units (Consolidated)'
        : selectedUnits.length === 0
            ? 'No Units Selected'
            : units.filter(u => selectedUnits.includes(u.code)).map(u => u.name).join(' + ');

    const exportToCSV = () => {
        if (!data) return;
        const unitCodes = units.map((u) => u.code);
        const row = (label: string, m: UnitMetrics, isPct = false): Array<string | number> => [
            label,
            ...unitCodes.map((c) => (isPct ? `${m.byOrg[c] || 0}%` : (m.byOrg[c] || 0))),
            isPct ? `${m.total}%` : m.total,
        ];
        const csvRows: Array<Array<string | number>> = [
            ['AxtenOS Promoter Dashboard — Consolidated Executive Financial Report'],
            ['Filter', filterType.toUpperCase()],
            ['Selected Units', selectedUnitsLabel],
            ['Date Range', `${data.fromDate} to ${data.toDate}`],
            [],
            ['Unit / Category', ...units.map((u) => u.name), 'Consolidated Total'],
            [],
            ['1. CURRENT ADMITTED PATIENTS'],
            row('Cash Patients', currentAdmittedPatients.cash),
            row('Insurance Patients', currentAdmittedPatients.insurance),
            row('Panel Patients', currentAdmittedPatients.panel),
            row('Corporate Patients', currentAdmittedPatients.corporate),
            row('Total Admitted Patients', currentAdmittedPatients.total),
            [],
            ['2. ADMISSIONS'],
            row('Cash', admissions.cash),
            row('Insurance', admissions.insurance),
            row('Panel', admissions.panel),
            row('Corporate', admissions.corporate),
            row('Total Admissions', admissions.total),
            [],
            ['3. DISCHARGES'],
            row('Cash', discharges.cash),
            row('Insurance', discharges.insurance),
            row('Panel', discharges.panel),
            row('Corporate', discharges.corporate),
            row('Total Discharges', discharges.total),
            [],
            ['4. REVENUE REALIZATION (₹)'],
            row('Cash', revenue.cash),
            row('Insurance', revenue.insurance),
            row('Panel', revenue.panel),
            row('Corporate', revenue.corporate),
            row('Total Revenue', revenue.total),
            [],
            ['5. OPD vs IPD REVENUE SPLIT (₹)'],
            row('OPD Consultations & Procedures', opdVsIpdRevenue.opd),
            row('IPD Admissions & Surgeries', opdVsIpdRevenue.ipd),
            row('Pharmacy Sales', opdVsIpdRevenue.pharmacy),
            row('Diagnostics & Pathology', opdVsIpdRevenue.diagnostics),
            row('Total Service Revenue', opdVsIpdRevenue.total),
            [],
            ['6. STATUS OF PROFIT / LOSS'],
            row('Net Amount (₹)', profitLoss.amount),
            row('Profit Percentage (%)', profitLoss.percentage, true),
        ];

        const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `AxtenOS_Promoter_Report_${isAllUnitsSelected ? 'all' : `${selectedUnits.length}-units`}_${filterType}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderTableSection = (
        key: string,
        title: string,
        subtitle: string,
        rows: Array<{ label: string; data: UnitMetrics; isCurrency?: boolean; isPercentage?: boolean; isTotalRow?: boolean; drillSection?: DrilldownSection; drillCategory?: string }>
    ) => {
        // By default, sections are expanded unless explicitly collapsed
        const isCollapsed = expandedSections.has(key);
        const isExpanded = !isCollapsed;
        const totalRow = rows.find((r) => r.isTotalRow) || rows[rows.length - 1];
        const totalDisplay = totalRow.isPercentage
            ? `${totalRow.data.total}%`
            : fmtINR(
                  isAllUnitsSelected
                      ? totalRow.data.total
                      : selectedUnits.reduce((sum, u) => sum + (totalRow.data.byOrg[u] || 0), 0),
                  totalRow.isCurrency
              );

        return (
        <div className={`rounded-3xl overflow-hidden shadow-lg mb-8 border transition-all duration-300 print:bg-white print:border-slate-300 print:shadow-none print:mb-6 print:break-inside-avoid ${
            isDark
                ? 'bg-slate-900/80 border-slate-800 backdrop-blur-md'
                : 'bg-white border-slate-200 shadow-slate-200/50'
        }`}>
            <button
                type="button"
                onClick={() => toggleSection(key)}
                className="w-full text-left px-6 py-4 flex items-center justify-between transition-colors bg-[#0f172a] text-white border-b border-slate-800 cursor-pointer print:pointer-events-none group"
            >
                <div>
                    <h3 className="text-sm font-black tracking-wide uppercase flex items-center gap-2.5 print:text-xs print:text-slate-900 text-white">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50" />
                        {title}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5 print:text-[10px] print:text-slate-600">{subtitle}</p>
                    {!isExpanded && (
                        <p className="text-xs font-mono font-bold mt-2 text-orange-400 print:hidden">
                            {isAllUnitsSelected ? 'Consolidated Total' : 'Selected Units Total'}: {totalDisplay}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold hidden sm:inline-block text-slate-400 print:hidden">
                        {rows.length} categories
                    </span>
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 print:hidden group-hover:text-white transition-colors" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 print:hidden group-hover:text-white transition-colors" />
                    )}
                </div>
            </button>
            <div className={`overflow-x-auto ${isExpanded ? '' : 'hidden print:block'}`}>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className={`text-[11px] font-extrabold uppercase tracking-wider border-b print:bg-slate-200 print:text-slate-900 print:text-[10px] ${
                            isDark ? 'bg-slate-950/90 border-slate-800 text-slate-300' : 'bg-slate-100/90 border-slate-200 text-slate-700'
                        }`}>
                            <th className="py-3.5 px-6 min-w-[220px] print:py-2 print:px-4">Category / Line Item</th>
                            {units.map((unit) => (
                                <th key={unit.code} className={`py-3.5 px-4 text-right min-w-[130px] print:py-2 ${selectedUnits.includes(unit.code) ? (isDark ? 'font-black text-white' : 'font-black text-slate-900') : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>
                                    {unit.name}
                                </th>
                            ))}
                            <th className={`py-3.5 px-6 text-right min-w-[160px] font-black border-l print:py-2 print:px-4 print:bg-orange-100 print:text-orange-950 ${
                                isDark ? 'border-slate-800 bg-orange-950/40 text-orange-300' : 'border-slate-200 bg-orange-50/80 text-orange-950'
                            }`}>
                                {isAllUnitsSelected ? 'Consolidated Total' : 'Selected Total'}
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y text-xs print:text-[11px] print:divide-slate-200 ${
                        isDark ? 'divide-slate-800/60' : 'divide-slate-100'
                    }`}>
                        {rows.map((row, idx) => {
                            const isTotal = row.isTotalRow || row.label.toLowerCase() === 'total';
                            return (
                                <tr
                                    key={idx}
                                    className={`transition-colors ${
                                        isTotal
                                            ? (isDark ? 'bg-slate-950 text-white font-black print:bg-slate-900 print:text-white' : 'bg-slate-900 text-white font-black print:bg-slate-900')
                                            : (isDark ? 'hover:bg-slate-800/40 text-slate-200 font-semibold print:text-slate-800 bg-slate-900/30' : 'hover:bg-slate-50 text-slate-800 font-medium bg-white')
                                    }`}
                                >
                                    <td className="py-3.5 px-6 font-bold flex items-center gap-2 print:py-1.5 print:px-4">
                                        {isTotal && <CheckCircle2 className="w-4 h-4 shrink-0 text-orange-400 print:hidden" />}
                                        <span className={isTotal ? 'text-white font-black tracking-wide' : (isDark ? 'text-slate-200' : 'text-slate-900')}>{row.label}</span>
                                    </td>
                                    {units.map((unit) => {
                                        const canDrill = !isTotal && !!row.drillSection && row.drillCategory !== 'panel';
                                        const cellValue = row.isPercentage ? `${row.data.byOrg[unit.code] || 0}%` : fmtINR(row.data.byOrg[unit.code] || 0, row.isCurrency);
                                        return (
                                            <td
                                                key={unit.code}
                                                onClick={canDrill ? () => openDrilldown(row.drillSection!, row.drillCategory!, row.label, unit.code, unit.name) : undefined}
                                                title={canDrill ? `View ${row.label} records for ${unit.name}` : undefined}
                                                className={`py-3.5 px-4 text-right font-mono text-xs print:py-1.5 group ${
                                                    isTotal
                                                        ? 'text-white font-black font-mono'
                                                        : (selectedUnits.includes(unit.code)
                                                            ? (isDark ? 'text-slate-100 font-semibold' : 'text-slate-900 font-semibold')
                                                            : (isDark ? 'text-slate-500' : 'text-slate-400'))
                                                } ${canDrill ? (isDark ? 'cursor-pointer hover:bg-orange-500/10 hover:text-orange-300 transition-colors' : 'cursor-pointer hover:bg-orange-50 hover:text-orange-700 transition-colors') : ''}`}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {cellValue}
                                                    {canDrill && <ExternalLink className={`w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity print:hidden ${isDark ? 'text-orange-400/80' : 'text-orange-600'}`} />}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    <td className={`py-3.5 px-6 text-right font-mono font-bold border-l print:py-1.5 print:px-4 ${
                                        isTotal
                                            ? 'border-slate-800 text-white bg-gradient-to-r from-orange-600 to-amber-600 font-black text-sm'
                                            : (isDark ? 'border-slate-800 text-orange-300 bg-orange-950/20 font-black' : 'border-slate-200 text-orange-950 bg-orange-50/50 font-black')
                                    }`}>
                                        {row.isPercentage
                                            ? `${row.data.total}%`
                                            : fmtINR(
                                                  isAllUnitsSelected
                                                      ? row.data.total
                                                      : selectedUnits.reduce((sum, u) => sum + (row.data.byOrg[u] || 0), 0),
                                                  row.isCurrency
                                              )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Formal Printable Header (Visible ONLY when printing) */}
            <div className="hidden print:block border-b-2 border-[#0a1e42] pb-4 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-black text-[#0a1e42]">AXTENOS HEALTHCARE SYSTEMS</h1>
                        <p className="text-sm font-bold text-emerald-700 uppercase">Executive Promoter Audit Report — Consolidated Multi-Unit Analysis</p>
                    </div>
                    <div className="text-right text-xs text-slate-600 font-mono">
                        <p><strong>Report Date:</strong> {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p><strong>Filter Period:</strong> {filterType.toUpperCase()}</p>
                        <p><strong>Selected Units:</strong> {selectedUnitsLabel}</p>
                    </div>
                </div>
            </div>

            {/* Title Bar & Executive Filter Toolbar (Hidden in Print) */}
            <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl transition-all border shadow-sm print:hidden ${
                isDark
                    ? 'bg-slate-900/90 border-slate-800 backdrop-blur-md text-white'
                    : 'bg-white border-slate-200 text-slate-900'
            }`}>
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h2 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Promoter Intelligence</h2>
                        <span className={`px-3 py-1 rounded-full text-xs font-black font-mono border ${
                            isDark
                                ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                : 'bg-orange-50 text-orange-800 border-orange-200'
                        }`}>
                            {isAllUnitsSelected ? 'Consolidated Multi-Unit' : selectedUnitsLabel}
                        </span>
                    </div>
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Real-time executive operational & financial audit across hospital locations
                    </p>
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Unit Multi-Select Dropdown */}
                    <div className="relative" ref={unitMenuRef}>
                        <button
                            type="button"
                            onClick={() => setUnitMenuOpen((prev) => !prev)}
                            className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-sm border ${
                                isDark
                                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-orange-500/50 hover:text-white'
                                    : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-orange-50 hover:border-orange-200'
                            }`}
                        >
                            <Building2 className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Units:</span>
                            <span className={`font-mono font-extrabold max-w-[220px] truncate ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>{selectedUnitsLabel}</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isDark ? 'text-slate-400' : 'text-slate-500'} ${unitMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {unitMenuOpen && (
                            <div className={`absolute z-30 top-full mt-2 left-0 w-72 rounded-2xl shadow-2xl overflow-hidden border backdrop-blur-xl ${
                                isDark
                                    ? 'bg-slate-900 border-slate-700 text-slate-200'
                                    : 'bg-white border-slate-200 text-slate-900 shadow-xl'
                            }`}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedUnits(isAllUnitsSelected ? [] : units.map(u => u.code))}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-xs font-black border-b cursor-pointer ${
                                        isDark
                                            ? 'hover:bg-slate-800 border-slate-800 text-slate-200'
                                            : 'hover:bg-orange-50 border-slate-100 text-slate-900'
                                    }`}
                                >
                                    <span>{isAllUnitsSelected ? 'Deselect All Units' : 'Select All Units'}</span>
                                    {isAllUnitsSelected && <Check className="w-4 h-4 text-orange-500" />}
                                </button>
                                {units.map((unit) => {
                                    const checked = selectedUnits.includes(unit.code);
                                    return (
                                        <button
                                            type="button"
                                            key={unit.code}
                                            onClick={() => toggleUnit(unit.code)}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold cursor-pointer transition-colors ${
                                                isDark
                                                    ? 'text-slate-300 hover:bg-slate-800'
                                                    : 'text-slate-800 hover:bg-orange-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                                    checked
                                                        ? 'bg-orange-500 border-orange-500 text-white'
                                                        : (isDark ? 'border-slate-600' : 'border-slate-300')
                                                }`}>
                                                    {checked && <Check className="w-3 h-3 font-black text-white" />}
                                                </span>
                                                <span>{unit.name}</span>
                                            </div>
                                            <span className={`font-mono text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({unit.beds} Beds)</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Period Selector */}
                    <div className={`flex items-center p-1 rounded-2xl border text-xs font-bold ${
                        isDark
                            ? 'bg-slate-950 border-slate-800'
                            : 'bg-slate-100 border-slate-200'
                    }`}>
                        {(['day', 'month', 'year', 'custom'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-3.5 py-1.5 rounded-xl transition-all capitalize cursor-pointer font-mono ${
                                    filterType === type
                                        ? 'bg-orange-500 text-white shadow-md font-black'
                                        : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {filterType === 'custom' && (
                        <div className={`flex items-center gap-2 p-1.5 rounded-2xl text-xs font-mono border ${
                            isDark
                                ? 'bg-slate-900 border-slate-700 text-slate-200'
                                : 'bg-white border-slate-200 text-slate-800'
                        }`}>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="bg-transparent focus:outline-none px-2 py-1 rounded"
                            />
                            <span className="text-slate-400">to</span>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="bg-transparent focus:outline-none px-2 py-1 rounded"
                            />
                            <button
                                onClick={() => loadData()}
                                className="px-3 py-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => loadData()}
                        title="Refresh Data"
                        className={`p-2.5 rounded-2xl border transition-colors cursor-pointer ${
                            isDark
                                ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-orange-600 hover:bg-orange-50'
                        }`}
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                        onClick={exportToCSV}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold border flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                            isDark
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                : 'bg-slate-100 hover:bg-orange-50 text-slate-800 border-slate-200 hover:border-orange-200 hover:text-orange-700'
                        }`}
                    >
                        <Download className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
                    >
                        <Printer className="w-4 h-4" />
                        <span>Print Audit</span>
                    </button>
                </div>
            </div>

            {/* Executive Financial Health Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
                <div className={`p-5 rounded-3xl shadow-sm relative overflow-hidden border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-gradient-to-br from-orange-500 to-amber-600 text-white border-orange-500 shadow-orange-500/10'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 ${
                        isDark ? 'text-orange-400 print:text-orange-800' : 'text-orange-100'
                    }`}>
                        <span>EBITDA Margin</span>
                        <Award className={`w-5 h-5 print:hidden ${isDark ? 'text-orange-400' : 'text-white'}`} />
                    </div>
                    <div className={`text-3xl font-black font-mono print:text-xl print:text-slate-900 ${
                        isDark ? 'text-white' : 'text-white'
                    }`}>{executiveKPIs.ebitdaMarginPct}%</div>
                    <div className={`text-xs font-medium mt-1 ${isDark ? 'text-slate-400' : 'text-orange-100'}`}>Operating Performance Yield</div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm relative overflow-hidden border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 ${
                        isDark ? 'text-amber-400 print:text-slate-800' : 'text-orange-600'
                    }`}>
                        <span>Bed Occupancy Rate</span>
                        <Bed className={`w-5 h-5 print:hidden ${isDark ? 'text-amber-400' : 'text-orange-500'}`} />
                    </div>
                    <div className={`text-3xl font-black font-mono print:text-xl print:text-slate-900 ${
                        isDark ? 'text-white' : 'text-slate-900'
                    }`}>{executiveKPIs.bedOccupancyRate}%</div>
                    <div className={`text-xs font-medium mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{currentAdmittedPatients.total.total} / {arpob.noOfBeds.total} Beds Occupied</div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm relative overflow-hidden border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-slate-900 text-white border-slate-800 shadow-slate-900/10'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 ${
                        isDark ? 'text-orange-400 print:text-orange-800' : 'text-orange-400'
                    }`}>
                        <span>Avg Length of Stay (ALOS)</span>
                        <Clock className="w-5 h-5 print:hidden text-orange-400" />
                    </div>
                    <div className="text-3xl font-black font-mono text-white print:text-xl print:text-slate-900">{executiveKPIs.alosDays} Days</div>
                    <div className="text-xs font-medium mt-1 text-slate-400">Optimal Inpatient Turnover</div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm relative overflow-hidden border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 ${
                        isDark ? 'text-amber-400 print:text-amber-800' : 'text-amber-700'
                    }`}>
                        <span>Collection Efficiency</span>
                        <TrendingUp className={`w-5 h-5 print:hidden ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    </div>
                    <div className={`text-3xl font-black font-mono print:text-xl print:text-slate-900 ${
                        isDark ? 'text-white' : 'text-slate-900'
                    }`}>{executiveKPIs.collectionEfficiencyPct}%</div>
                    <div className={`text-xs font-medium mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Billed vs Cash Realized</div>
                </div>
            </div>

            {/* Top KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
                <div className={`p-5 rounded-3xl shadow-sm border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 print:mb-1 ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        <span>Total Capacity</span>
                        <Bed className={`w-4 h-4 print:hidden ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <div className={`text-2xl font-black font-mono print:text-lg print:text-slate-900 ${
                        isDark ? 'text-white' : 'text-slate-900'
                    }`}>{arpob.noOfBeds.total} Beds</div>
                    <div className={`text-[11px] mt-2 font-mono font-semibold print:text-[9px] ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        {units.map((u) => `${u.name}: ${arpob.noOfBeds.byOrg[u.code] || 0}`).join(' • ')}
                    </div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 print:mb-1 ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        <span>Currently Admitted</span>
                        <Users className={`w-4 h-4 print:hidden ${isDark ? 'text-amber-400' : 'text-orange-600'}`} />
                    </div>
                    <div className={`text-2xl font-black font-mono print:text-lg print:text-slate-900 ${
                        isDark ? 'text-white' : 'text-slate-900'
                    }`}>{currentAdmittedPatients.total.total} Patients</div>
                    <div className={`text-[11px] mt-2 font-mono font-semibold print:text-[9px] ${
                        isDark ? 'text-amber-400' : 'text-orange-700'
                    }`}>
                        {currentAdmittedPatients.insurance.total} Ins • {currentAdmittedPatients.cash.total} Cash
                    </div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 print:mb-1 ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        <span>Period Revenue</span>
                        <TrendingUp className={`w-4 h-4 print:hidden ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <div className={`text-2xl font-black font-mono print:text-lg ${
                        isDark ? 'text-orange-400' : 'text-orange-600'
                    }`}>{fmtINR(revenue.total.total, true)}</div>
                    <div className={`text-[11px] mt-2 font-mono font-semibold print:text-[9px] ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        Insurance: {fmtINR(revenue.insurance.total, true)}
                    </div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 print:mb-1 ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        <span>Consolidated ARPOB</span>
                        <Activity className={`w-4 h-4 print:hidden ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    </div>
                    <div className={`text-2xl font-black font-mono print:text-lg ${
                        isDark ? 'text-amber-300' : 'text-amber-700'
                    }`}>{fmtINR(arpob.average.total, true)}</div>
                    <div className={`text-[11px] mt-2 font-semibold print:text-[9px] ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                        Avg Revenue / Bed / Day
                    </div>
                </div>

                <div className={`p-5 rounded-3xl shadow-sm border print:bg-white print:p-3 print:border-slate-300 ${
                    isDark
                        ? 'bg-slate-900 border-slate-800 backdrop-blur-md'
                        : 'bg-white border-slate-200 shadow-slate-200/50'
                }`}>
                    <div className={`flex items-center justify-between text-xs font-black uppercase tracking-wider mb-2 print:mb-1 ${
                        isDark ? 'text-slate-400 print:text-slate-600' : 'text-slate-500'
                    }`}>
                        <span>Net Profit / Loss</span>
                        <PieChart className={`w-4 h-4 print:hidden ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <div className={`text-2xl font-black font-mono print:text-lg ${
                        isDark ? 'text-orange-400' : 'text-orange-600'
                    }`}>{fmtINR(profitLoss.amount.total, true)}</div>
                    <div className={`text-[11px] mt-2 font-bold flex items-center gap-1 print:text-[9px] ${
                        isDark ? 'text-orange-300' : 'text-orange-700'
                    }`}>
                        <ArrowUpRight className="w-3.5 h-3.5 print:hidden" />
                        <span>Margin: {profitLoss.percentage.total}%</span>
                    </div>
                </div>
            </div>

            {/* Quick Navigation Anchor Bar (Hidden in Print) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs font-bold no-scrollbar print:hidden">
                <span className={`uppercase text-[10px] tracking-wider shrink-0 font-extrabold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Jump To:</span>
                {[
                    { href: '#admitted', label: '1. Admitted' },
                    { href: '#admissions', label: '2. Admissions' },
                    { href: '#discharges', label: '3. Discharges' },
                    { href: '#revenue', label: '4. Revenue' },
                    { href: '#opd-ipd', label: '5. OPD vs IPD Split' },
                    { href: '#department', label: '6. Department Revenue' },
                    { href: '#expenses', label: '7. Expenses' },
                    { href: '#receivables', label: '8. Receivables & Aging' },
                    { href: '#payables', label: '9. Payables' },
                    { href: '#salaries', label: '10. Salaries' },
                    { href: '#arpob', label: '11. ARPOB' },
                    { href: '#profit-loss', label: '12. Profit/Loss' },
                ].map((item) => (
                    <a
                        key={item.href}
                        href={item.href}
                        className={`px-3.5 py-1.5 rounded-xl border transition-all shrink-0 shadow-sm ${
                            isDark
                                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-orange-500/50 hover:text-orange-300'
                                : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-orange-200 hover:text-orange-700 hover:bg-orange-50'
                        }`}
                    >
                        {item.label}
                    </a>
                ))}
            </div>


            {/* 1. Current Admitted Patients */}
            <div id="admitted">
                {renderTableSection(
                    'admitted',
                    '1. Current Admitted Patients',
                    'Real-time inpatient count across units by patient category',
                    [
                        { label: 'Cash', data: currentAdmittedPatients.cash, isCurrency: false, drillSection: 'admitted', drillCategory: 'cash' },
                        { label: 'Insurance', data: currentAdmittedPatients.insurance, isCurrency: false, drillSection: 'admitted', drillCategory: 'insurance' },
                        { label: 'Panel', data: currentAdmittedPatients.panel, isCurrency: false },
                        { label: 'Corporate', data: currentAdmittedPatients.corporate, isCurrency: false, drillSection: 'admitted', drillCategory: 'corporate' },
                        { label: 'Total', data: currentAdmittedPatients.total, isCurrency: false, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 2. Admission */}
            <div id="admissions">
                {renderTableSection(
                    'admissions',
                    '2. Admission',
                    'New patient admissions logged within selected period',
                    [
                        { label: 'Cash', data: admissions.cash, isCurrency: false, drillSection: 'admissions', drillCategory: 'cash' },
                        { label: 'Insurance', data: admissions.insurance, isCurrency: false, drillSection: 'admissions', drillCategory: 'insurance' },
                        { label: 'Panel', data: admissions.panel, isCurrency: false },
                        { label: 'Corporate', data: admissions.corporate, isCurrency: false, drillSection: 'admissions', drillCategory: 'corporate' },
                        { label: 'Total', data: admissions.total, isCurrency: false, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 3. Discharge */}
            <div id="discharges">
                {renderTableSection(
                    'discharges',
                    '3. Discharge',
                    'Patient discharge volume breakdown',
                    [
                        { label: 'Cash', data: discharges.cash, isCurrency: false, drillSection: 'discharges', drillCategory: 'cash' },
                        { label: 'Insurance', data: discharges.insurance, isCurrency: false, drillSection: 'discharges', drillCategory: 'insurance' },
                        { label: 'Panel', data: discharges.panel, isCurrency: false },
                        { label: 'Corporate', data: discharges.corporate, isCurrency: false, drillSection: 'discharges', drillCategory: 'corporate' },
                        { label: 'Total', data: discharges.total, isCurrency: false, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 4. Revenue */}
            <div id="revenue">
                {renderTableSection(
                    'revenue',
                    '4. Revenue Realization',
                    'Gross revenue realization by patient financial class (₹)',
                    [
                        { label: 'Cash', data: revenue.cash, isCurrency: true, drillSection: 'revenue', drillCategory: 'cash' },
                        { label: 'Insurance', data: revenue.insurance, isCurrency: true, drillSection: 'revenue', drillCategory: 'insurance' },
                        { label: 'Panel', data: revenue.panel, isCurrency: true },
                        { label: 'Corporate', data: revenue.corporate, isCurrency: true, drillSection: 'revenue', drillCategory: 'corporate' },
                        { label: 'Total Revenue', data: revenue.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 5. OPD vs IPD Revenue Split */}
            <div id="opd-ipd">
                {renderTableSection(
                    'opd-ipd',
                    '5. OPD vs IPD Revenue Breakdown',
                    'Revenue contribution by Outpatient, Inpatient, Pharmacy, and Diagnostics (₹)',
                    [
                        { label: 'OPD Consultations & Procedures', data: opdVsIpdRevenue.opd, isCurrency: true, drillSection: 'opdVsIpd', drillCategory: 'opd' },
                        { label: 'IPD Admissions & Surgeries', data: opdVsIpdRevenue.ipd, isCurrency: true, drillSection: 'opdVsIpd', drillCategory: 'ipd' },
                        { label: 'Pharmacy Sales', data: opdVsIpdRevenue.pharmacy, isCurrency: true, drillSection: 'opdVsIpd', drillCategory: 'pharmacy' },
                        { label: 'Diagnostics & Pathology', data: opdVsIpdRevenue.diagnostics, isCurrency: true, drillSection: 'opdVsIpd', drillCategory: 'diagnostics' },
                        { label: 'Total Service Revenue', data: opdVsIpdRevenue.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 6. Departmental Revenue */}
            <div id="department">
                {renderTableSection(
                    'department',
                    '6. Top Clinical Department Revenue',
                    'Revenue yield generated by major clinical specialties (₹)',
                    departmentRevenue.map(dept => ({
                        label: dept.name,
                        data: dept.metrics,
                        isCurrency: true,
                        drillSection: 'department' as DrilldownSection,
                        drillCategory: dept.name,
                    }))
                )}
            </div>

            {/* 7. Expenses */}
            <div id="expenses">
                {renderTableSection(
                    'expenses',
                    '7. Expenses',
                    'Monthly operational expenditure breakdown (₹)',
                    [
                        ...expenses.byMonth.map(m => ({ label: m.label, data: m.data, isCurrency: true, drillSection: 'expenses' as DrilldownSection, drillCategory: m.label })),
                        { label: 'Total Expenses', data: expenses.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 8. Receivables & Aging */}
            <div id="receivables" className="space-y-6">
                {renderTableSection(
                    'receivables-8a',
                    '8A. Receivables — Yet to Receive',
                    'Outstanding claims, patient balances, and TDS receivables (₹)',
                    [
                        { label: 'Cash', data: receivables.cash, isCurrency: true, drillSection: 'receivables', drillCategory: 'cash' },
                        { label: 'Insurance', data: receivables.insurance, isCurrency: true, drillSection: 'receivables', drillCategory: 'insurance' },
                        { label: 'Panel', data: receivables.panel, isCurrency: true },
                        { label: 'Corporate', data: receivables.corporate, isCurrency: true, drillSection: 'receivables', drillCategory: 'corporate' },
                        { label: 'TDS - Receivables', data: receivables.tdsReceivables, isCurrency: true, drillSection: 'receivables', drillCategory: 'tdsReceivables' },
                        { label: 'Total Receivables', data: receivables.total, isCurrency: true, isTotalRow: true },
                    ]
                )}

                {renderTableSection(
                    'receivables-8b',
                    '8B. Insurance Receivables Aging Analysis',
                    'Outstanding TPA / Insurance claims categorized by days pending (₹)',
                    [
                        { label: '0 to 30 Days (Current)', data: insuranceAging.days0to30, isCurrency: true, drillSection: 'insuranceAging', drillCategory: 'days0to30' },
                        { label: '31 to 60 Days (Follow-up)', data: insuranceAging.days31to60, isCurrency: true, drillSection: 'insuranceAging', drillCategory: 'days31to60' },
                        { label: '60+ Days (Overdue)', data: insuranceAging.days60Plus, isCurrency: true, drillSection: 'insuranceAging', drillCategory: 'days60Plus' },
                        { label: 'Total Outstanding Claims', data: insuranceAging.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 9. Payables - Due for Payments */}
            <div id="payables">
                {renderTableSection(
                    'payables',
                    '9. Payables — Due for Payments',
                    'Pending vendor bills, doctor payouts, and tax obligations (₹)',
                    [
                        { label: 'Vendors', data: payables.vendors, isCurrency: true, drillSection: 'payables', drillCategory: 'vendors' },
                        { label: 'Doctors - Professional', data: payables.doctorsProfessional, isCurrency: true, drillSection: 'payables', drillCategory: 'doctorsProfessional' },
                        { label: 'TDS - Payable', data: payables.tdsPayable, isCurrency: true, drillSection: 'payables', drillCategory: 'tdsPayable' },
                        { label: 'Others', data: payables.others, isCurrency: true, drillSection: 'payables', drillCategory: 'others' },
                        { label: 'Total Payables', data: payables.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 10. Salaries */}
            <div id="salaries">
                {renderTableSection(
                    'salaries',
                    '10. Salaries',
                    'Monthly staff payroll and employee compensation (₹)',
                    [
                        ...salaries.byMonth.map(m => ({ label: m.label, data: m.data, isCurrency: true, drillSection: 'salaries' as DrilldownSection, drillCategory: m.label })),
                        { label: 'Total Salaries', data: salaries.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 11. ARPOB - Average Revenue Per Operational Bed */}
            <div id="arpob">
                {renderTableSection(
                    'arpob',
                    '11. ARPOB — Average Revenue Per Operational Bed',
                    'Operational bed capacity and average daily revenue yield (₹/Bed/Day)',
                    [
                        { label: 'No. of Beds', data: arpob.noOfBeds, isCurrency: false },
                        ...arpob.byMonth.map(m => ({ label: `${m.label} ARPOB`, data: m.data, isCurrency: true })),
                        { label: 'Average ARPOB', data: arpob.average, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 12. Status of Profit/Loss */}
            <div id="profit-loss">
                {renderTableSection(
                    'profit-loss',
                    '12. Status of Profit / Loss',
                    'Net operational profit margin across units',
                    [
                        { label: 'Amount (₹)', data: profitLoss.amount, isCurrency: true },
                        { label: 'Percentage %', data: profitLoss.percentage, isPercentage: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* Report Footer for Printouts */}
            <div className="hidden print:block text-center text-[10px] text-slate-500 pt-4 border-t border-slate-300 mt-8">
                AxtenOS Hospital Systems — Confidential Executive Financial & Operational Audit Report.
            </div>

            {/* Drill-down modal — the actual records behind a clicked cell */}
            {drillTarget && (
                <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md print:hidden ${
                    isDark ? 'bg-slate-950/80' : 'bg-slate-900/50'
                }`} onClick={closeDrilldown}>
                    <div className={`rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden ring-1 border ${
                        isDark
                            ? 'bg-[#0b1329] border-slate-700/80 ring-white/10 text-white'
                            : 'bg-white border-orange-200 ring-orange-500/10 text-slate-900 shadow-orange-500/10'
                    }`} onClick={(e) => e.stopPropagation()}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
                            isDark ? 'border-slate-800 bg-slate-900/60' : 'border-orange-100 bg-orange-50/80'
                        }`}>
                            <div>
                                <h3 className={`text-base font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                    {drillTarget.label} — <span className="text-orange-600 dark:text-orange-400 font-mono">{drillTarget.unitLabel}</span>
                                </h3>
                                <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {drillLoading ? 'Aggregating drilldown ledger records…' : drillResult ? `${drillResult.totalCount} record${drillResult.totalCount !== 1 ? 's' : ''}${drillResult.truncated ? ` (showing first ${drillResult.rows.length})` : ''}` : ' '}
                                </p>
                            </div>
                            <button onClick={closeDrilldown} className={`p-2 rounded-xl transition-all cursor-pointer ${
                                isDark ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-white hover:bg-orange-100 text-slate-600 hover:text-orange-950 border border-orange-200'
                            }`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="overflow-auto flex-1 p-0">
                            {drillLoading ? (
                                <div className={`flex flex-col items-center justify-center py-20 gap-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                                    <span className="text-xs font-semibold">Loading ledger details...</span>
                                </div>
                            ) : drillError ? (
                                <div className={`p-10 text-center text-sm font-medium ${isDark ? 'text-rose-400 bg-rose-950/20' : 'text-rose-700 bg-rose-50'}`}>{drillError}</div>
                            ) : !drillResult || drillResult.rows.length === 0 ? (
                                <div className={`p-10 text-center text-sm font-medium ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>No audit records found for this category selection.</div>
                            ) : (
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead className={`sticky top-0 border-b ${
                                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-orange-50 border-orange-200'
                                    }`}>
                                        <tr className={`text-[10px] font-black uppercase tracking-wider ${
                                            isDark ? 'text-orange-400' : 'text-orange-950'
                                        }`}>
                                            {drillResult.columns.map((col) => (
                                                <th key={col} className="py-3 px-5">{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y font-medium ${
                                        isDark ? 'divide-slate-800/60' : 'divide-orange-100'
                                    }`}>
                                        {drillResult.rows.map((row, idx) => (
                                            <tr key={idx} className={`transition-colors ${
                                                isDark ? 'hover:bg-slate-800/40 text-slate-300' : 'hover:bg-orange-50/70 text-slate-800'
                                            }`}>
                                                {row.map((cell, cellIdx) => (
                                                    <td key={cellIdx} className="py-2.5 px-5 whitespace-nowrap font-mono text-xs">{cell}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
