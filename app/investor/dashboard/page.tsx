'use client';

import React, { useState, useEffect } from 'react';
import { getInvestorDashboardData, type InvestorDashboardData, type UnitMetrics } from '@/app/actions/investor-actions';
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
    ChevronRight
} from 'lucide-react';

// Format numbers: default is currency=false (no ₹ symbol) so counts render as pure numbers!
function fmtINR(n: number, isCurrency = false): string {
    if (n === undefined || n === null) return '-';
    if (!isCurrency) return n.toLocaleString('en-IN');
    return `₹${n.toLocaleString('en-IN')}`;
}

export default function PromoterDashboardPage() {
    const [data, setData] = useState<InvestorDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<'day' | 'month' | 'year' | 'custom'>('month');
    const [selectedUnit, setSelectedUnit] = useState<string>('all');
    const [fromDate, setFromDate] = useState('2026-04-01');
    const [toDate, setToDate] = useState('2026-07-31');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    const toggleSection = (key: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const loadData = async () => {
        setLoading(true);
        const res = await getInvestorDashboardData({ filterType, selectedUnit, fromDate, toDate });
        if (res.success && res.data) {
            setData(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, [filterType, selectedUnit]);

    if (loading || !data) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 text-slate-500">
                <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold animate-pulse text-[#0a1e42]">Aggregating AxtenOS Executive Analytics...</p>
            </div>
        );
    }

    const {
        units,
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
    } = data;

    const exportToCSV = () => {
        if (!data) return;
        const csvRows = [
            ['AxtenOS Promoter Dashboard — Consolidated Executive Financial Report'],
            ['Filter', filterType.toUpperCase()],
            ['Selected Unit', selectedUnit.toUpperCase()],
            ['Date Range', `${fromDate} to ${toDate}`],
            [],
            ['Unit / Category', 'Axten Hospital', 'Avise Hospital', 'Axten HQ', 'Consolidated Total'],
            [],
            ['1. CURRENT ADMITTED PATIENTS'],
            ['Cash Patients', currentAdmittedPatients.cash.axten, currentAdmittedPatients.cash.avise, currentAdmittedPatients.cash.axtenHq, currentAdmittedPatients.cash.total],
            ['Insurance Patients', currentAdmittedPatients.insurance.axten, currentAdmittedPatients.insurance.avise, currentAdmittedPatients.insurance.axtenHq, currentAdmittedPatients.insurance.total],
            ['Panel Patients', currentAdmittedPatients.panel.axten, currentAdmittedPatients.panel.avise, currentAdmittedPatients.panel.axtenHq, currentAdmittedPatients.panel.total],
            ['Corporate Patients', currentAdmittedPatients.corporate.axten, currentAdmittedPatients.corporate.avise, currentAdmittedPatients.corporate.axtenHq, currentAdmittedPatients.corporate.total],
            ['Total Admitted Patients', currentAdmittedPatients.total.axten, currentAdmittedPatients.total.avise, currentAdmittedPatients.total.axtenHq, currentAdmittedPatients.total.total],
            [],
            ['2. ADMISSIONS'],
            ['Cash', admissions.cash.axten, admissions.cash.avise, admissions.cash.axtenHq, admissions.cash.total],
            ['Insurance', admissions.insurance.axten, admissions.insurance.avise, admissions.insurance.axtenHq, admissions.insurance.total],
            ['Panel', admissions.panel.axten, admissions.panel.avise, admissions.panel.axtenHq, admissions.panel.total],
            ['Corporate', admissions.corporate.axten, admissions.corporate.avise, admissions.corporate.axtenHq, admissions.corporate.total],
            ['Total Admissions', admissions.total.axten, admissions.total.avise, admissions.total.axtenHq, admissions.total.total],
            [],
            ['3. DISCHARGES'],
            ['Cash', discharges.cash.axten, discharges.cash.avise, discharges.cash.axtenHq, discharges.cash.total],
            ['Insurance', discharges.insurance.axten, discharges.insurance.avise, discharges.insurance.axtenHq, discharges.insurance.total],
            ['Panel', discharges.panel.axten, discharges.panel.avise, discharges.panel.axtenHq, discharges.panel.total],
            ['Corporate', discharges.corporate.axten, discharges.corporate.avise, discharges.corporate.axtenHq, discharges.corporate.total],
            ['Total Discharges', discharges.total.axten, discharges.total.avise, discharges.total.axtenHq, discharges.total.total],
            [],
            ['4. REVENUE REALIZATION (₹)'],
            ['Cash', revenue.cash.axten, revenue.cash.avise, revenue.cash.axtenHq, revenue.cash.total],
            ['Insurance', revenue.insurance.axten, revenue.insurance.avise, revenue.insurance.axtenHq, revenue.insurance.total],
            ['Panel', revenue.panel.axten, revenue.panel.avise, revenue.panel.axtenHq, revenue.panel.total],
            ['Corporate', revenue.corporate.axten, revenue.corporate.avise, revenue.corporate.axtenHq, revenue.corporate.total],
            ['Total Revenue', revenue.total.axten, revenue.total.avise, revenue.total.axtenHq, revenue.total.total],
            [],
            ['5. OPD vs IPD REVENUE SPLIT (₹)'],
            ['OPD Consultations & Procedures', opdVsIpdRevenue.opd.axten, opdVsIpdRevenue.opd.avise, opdVsIpdRevenue.opd.axtenHq, opdVsIpdRevenue.opd.total],
            ['IPD Admissions & Surgeries', opdVsIpdRevenue.ipd.axten, opdVsIpdRevenue.ipd.avise, opdVsIpdRevenue.ipd.axtenHq, opdVsIpdRevenue.ipd.total],
            ['Pharmacy Sales', opdVsIpdRevenue.pharmacy.axten, opdVsIpdRevenue.pharmacy.avise, opdVsIpdRevenue.pharmacy.axtenHq, opdVsIpdRevenue.pharmacy.total],
            ['Diagnostics & Pathology', opdVsIpdRevenue.diagnostics.axten, opdVsIpdRevenue.diagnostics.avise, opdVsIpdRevenue.diagnostics.axtenHq, opdVsIpdRevenue.diagnostics.total],
            ['Total Service Revenue', opdVsIpdRevenue.total.axten, opdVsIpdRevenue.total.avise, opdVsIpdRevenue.total.axtenHq, opdVsIpdRevenue.total.total],
            [],
            ['6. STATUS OF PROFIT / LOSS'],
            ['Net Amount (₹)', profitLoss.amount.axten, profitLoss.amount.avise, profitLoss.amount.axtenHq, profitLoss.amount.total],
            ['Profit Percentage (%)', `${profitLoss.percentage.axten}%`, `${profitLoss.percentage.avise}%`, `${profitLoss.percentage.axtenHq}%`, `${profitLoss.percentage.total}%`],
        ];

        const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `AxtenOS_Promoter_Report_${selectedUnit}_${filterType}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderTableSection = (
        key: string,
        title: string,
        subtitle: string,
        rows: Array<{ label: string; data: UnitMetrics; isCurrency?: boolean; isPercentage?: boolean; isTotalRow?: boolean }>
    ) => {
        const isExpanded = expandedSections.has(key);
        const totalRow = rows.find((r) => r.isTotalRow) || rows[rows.length - 1];
        const totalDisplay = totalRow.isPercentage
            ? `${totalRow.data.total}%`
            : fmtINR(totalRow.data.total, totalRow.isCurrency);

        return (
        <div className="bg-white border border-[#ede9e2] rounded-2xl overflow-hidden shadow-sm mb-8 print:border-slate-300 print:shadow-none print:mb-6 print:break-inside-avoid">
            <button
                type="button"
                onClick={() => toggleSection(key)}
                className="w-full text-left bg-[#faf9f6] border-b border-[#ede9e2] px-6 py-4 flex items-center justify-between print:py-2 print:px-4 cursor-pointer hover:bg-[#f1efe9] transition-colors print:pointer-events-none"
            >
                <div>
                    <h3 className="text-sm font-black text-[#0a1e42] tracking-wide uppercase flex items-center gap-2 print:text-xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 print:hidden" />
                        {title}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 print:text-[10px]">{subtitle}</p>
                    {!isExpanded && (
                        <p className="text-sm font-black text-emerald-800 mt-2 print:hidden">
                            Consolidated Total: {totalDisplay}
                        </p>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 print:hidden" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 print:hidden" />
                )}
            </button>
            <div className={`overflow-x-auto ${isExpanded ? '' : 'hidden print:block'}`}>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[#f1f5f9] border-b border-[#e2e8f0] text-[11px] font-black text-[#0a1e42] uppercase tracking-wider print:text-[10px]">
                            <th className="py-3.5 px-6 min-w-[200px] print:py-2 print:px-4">Type / Category</th>
                            <th className={`py-3.5 px-4 text-right min-w-[130px] print:py-2 ${selectedUnit === 'axten' ? 'bg-emerald-100/80 text-emerald-950 font-black' : 'text-slate-700'}`}>
                                Axten Hospital
                            </th>
                            <th className={`py-3.5 px-4 text-right min-w-[130px] print:py-2 ${selectedUnit === 'avise' ? 'bg-indigo-100/80 text-indigo-950 font-black' : 'text-slate-700'}`}>
                                Avise Hospital
                            </th>
                            <th className={`py-3.5 px-4 text-right min-w-[130px] print:py-2 ${selectedUnit === 'axtenHq' ? 'bg-amber-100/80 text-amber-950 font-black' : 'text-slate-700'}`}>
                                Axten HQ
                            </th>
                            <th className={`py-3.5 px-6 text-right min-w-[160px] font-black border-l border-[#e2e8f0] print:py-2 print:px-4 ${selectedUnit === 'all' ? 'bg-[#ecfdf5] text-[#065f46]' : 'bg-[#f1f5f9] text-[#0a1e42]'}`}>
                                Consolidated Total
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs print:text-[11px]">
                        {rows.map((row, idx) => {
                            const isTotal = row.isTotalRow || row.label.toLowerCase() === 'total';
                            return (
                                <tr
                                    key={idx}
                                    className={`transition-colors ${
                                        isTotal
                                            ? 'bg-[#0a1e42] text-white font-black print:bg-slate-900'
                                            : 'hover:bg-[#f8fafc] text-slate-800 font-semibold'
                                    }`}
                                >
                                    <td className="py-3 px-6 font-bold flex items-center gap-2 print:py-1.5 print:px-4">
                                        {isTotal && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 print:hidden" />}
                                        <span>{row.label}</span>
                                    </td>
                                    <td className={`py-3 px-4 text-right font-mono print:py-1.5 ${selectedUnit === 'axten' ? (isTotal ? 'bg-[#061329]' : 'bg-emerald-50/70 font-black text-emerald-950') : ''}`}>
                                        {row.isPercentage ? `${row.data.axten}%` : fmtINR(row.data.axten, row.isCurrency)}
                                    </td>
                                    <td className={`py-3 px-4 text-right font-mono print:py-1.5 ${selectedUnit === 'avise' ? (isTotal ? 'bg-[#061329]' : 'bg-indigo-50/70 font-black text-indigo-950') : ''}`}>
                                        {row.isPercentage ? `${row.data.avise}%` : fmtINR(row.data.avise, row.isCurrency)}
                                    </td>
                                    <td className={`py-3 px-4 text-right font-mono print:py-1.5 ${selectedUnit === 'axtenHq' ? (isTotal ? 'bg-[#061329]' : 'bg-amber-50/70 font-black text-amber-950') : ''}`}>
                                        {row.isPercentage ? `${row.data.axtenHq}%` : fmtINR(row.data.axtenHq, row.isCurrency)}
                                    </td>
                                    <td className={`py-3 px-6 text-right font-mono font-bold border-l print:py-1.5 print:px-4 ${
                                        isTotal
                                            ? 'border-slate-800 text-emerald-400 bg-[#061329]'
                                            : 'border-[#ede9e2] text-emerald-800 bg-[#ecfdf5]/60 font-black'
                                    }`}>
                                        {row.isPercentage ? `${row.data.total}%` : fmtINR(row.data.total, row.isCurrency)}
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
                        <p><strong>Selected Unit:</strong> {selectedUnit === 'all' ? 'All Units (Consolidated)' : units.find(u => u.code === selectedUnit)?.name}</p>
                    </div>
                </div>
            </div>

            {/* Title Bar & Filter Controls (Hidden in Print) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-[#ede9e2] p-6 rounded-2xl shadow-sm print:hidden">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-[#0a1e42] tracking-tight">AxtenOS Promoter Dashboard</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {selectedUnit === 'all' ? 'Consolidated All Units' : units.find(u => u.code === selectedUnit)?.name}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Executive Operational & Financial Intelligence across Axten Hospital Units
                    </p>
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Unit Selection Dropdown */}
                    <div className="flex items-center gap-2 bg-[#faf9f6] border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-[#0a1e42]">
                        <Building2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-slate-500">Unit:</span>
                        <select
                            value={selectedUnit}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="bg-transparent font-extrabold text-[#0a1e42] focus:outline-none cursor-pointer pr-2"
                        >
                            <option value="all">All Units (Consolidated)</option>
                            <option value="axten">Axten Hospital (20 Beds)</option>
                            <option value="avise">Avise Hospital (50 Beds)</option>
                            <option value="axtenHq">Axten HQ (0 Beds)</option>
                        </select>
                    </div>

                    {/* Period Selector */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                        {(['day', 'month', 'year', 'custom'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-3 py-1.5 rounded-lg transition-all capitalize cursor-pointer ${
                                    filterType === type
                                        ? 'bg-emerald-600 text-white shadow-sm font-extrabold'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {filterType === 'custom' && (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl text-xs font-semibold">
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="bg-transparent text-slate-700 focus:outline-none"
                            />
                            <span className="text-slate-400">to</span>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="bg-transparent text-slate-700 focus:outline-none"
                            />
                            <button
                                onClick={loadData}
                                className="px-2 py-1 rounded bg-emerald-600 text-white font-bold"
                            >
                                Apply
                            </button>
                        </div>
                    )}

                    <button
                        onClick={loadData}
                        title="Refresh Data"
                        className="p-2.5 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                        onClick={exportToCSV}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Report</span>
                    </button>
                </div>
            </div>

            {/* Executive Financial Health Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 p-4 rounded-2xl shadow-sm print:bg-white print:p-3">
                    <div className="flex items-center justify-between text-emerald-800 text-xs font-bold mb-1">
                        <span>EBITDA Margin</span>
                        <Award className="w-4 h-4 text-emerald-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-emerald-950 font-mono print:text-xl">{executiveKPIs.ebitdaMarginPct}%</div>
                    <div className="text-[11px] text-emerald-700 mt-1 font-semibold print:text-[9px]">Healthy Operating Margin</div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-100/50 border border-blue-200 p-4 rounded-2xl shadow-sm print:bg-white print:p-3">
                    <div className="flex items-center justify-between text-blue-800 text-xs font-bold mb-1">
                        <span>Bed Occupancy Rate</span>
                        <Bed className="w-4 h-4 text-blue-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-blue-950 font-mono print:text-xl">{executiveKPIs.bedOccupancyRate}%</div>
                    <div className="text-[11px] text-blue-700 mt-1 font-semibold print:text-[9px]">{currentAdmittedPatients.total.total} / {arpob.noOfBeds.total} Beds Occupied</div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-violet-100/50 border border-purple-200 p-4 rounded-2xl shadow-sm print:bg-white print:p-3">
                    <div className="flex items-center justify-between text-purple-800 text-xs font-bold mb-1">
                        <span>Avg Length of Stay (ALOS)</span>
                        <Clock className="w-4 h-4 text-purple-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-purple-950 font-mono print:text-xl">{executiveKPIs.alosDays} Days</div>
                    <div className="text-[11px] text-purple-700 mt-1 font-semibold print:text-[9px]">Optimal Inpatient Turnover</div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-orange-100/50 border border-amber-200 p-4 rounded-2xl shadow-sm print:bg-white print:p-3">
                    <div className="flex items-center justify-between text-amber-800 text-xs font-bold mb-1">
                        <span>Collection Efficiency</span>
                        <TrendingUp className="w-4 h-4 text-amber-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-amber-950 font-mono print:text-xl">{executiveKPIs.collectionEfficiencyPct}%</div>
                    <div className="text-[11px] text-amber-700 mt-1 font-semibold print:text-[9px]">High Cash Realization</div>
                </div>
            </div>

            {/* Top KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
                <div className="bg-white border border-[#ede9e2] p-5 rounded-2xl shadow-sm print:p-3">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2 print:mb-1">
                        <span>Total Operational Beds</span>
                        <Bed className="w-4 h-4 text-emerald-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-[#0a1e42] font-mono print:text-lg">{arpob.noOfBeds.total} Beds</div>
                    <div className="text-[11px] text-slate-500 mt-2 font-semibold print:text-[9px]">
                        Axten: 20 • Avise: 50
                    </div>
                </div>

                <div className="bg-white border border-[#ede9e2] p-5 rounded-2xl shadow-sm print:p-3">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2 print:mb-1">
                        <span>Currently Admitted</span>
                        <Users className="w-4 h-4 text-indigo-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-[#0a1e42] font-mono print:text-lg">{currentAdmittedPatients.total.total} Patients</div>
                    <div className="text-[11px] text-indigo-700 mt-2 font-semibold print:text-[9px]">
                        {currentAdmittedPatients.insurance.total} Ins • {currentAdmittedPatients.cash.total} Cash
                    </div>
                </div>

                <div className="bg-white border border-[#ede9e2] p-5 rounded-2xl shadow-sm print:p-3">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2 print:mb-1">
                        <span>Period Revenue</span>
                        <TrendingUp className="w-4 h-4 text-emerald-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-emerald-700 font-mono print:text-lg">{fmtINR(revenue.total.total, true)}</div>
                    <div className="text-[11px] text-slate-500 mt-2 font-semibold print:text-[9px]">
                        Insurance: {fmtINR(revenue.insurance.total, true)}
                    </div>
                </div>

                <div className="bg-white border border-[#ede9e2] p-5 rounded-2xl shadow-sm print:p-3">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2 print:mb-1">
                        <span>Consolidated ARPOB</span>
                        <Activity className="w-4 h-4 text-cyan-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-[#0a1e42] font-mono print:text-lg">{fmtINR(arpob.average.total, true)}</div>
                    <div className="text-[11px] text-cyan-700 mt-2 font-semibold print:text-[9px]">
                        Avg Revenue / Bed / Day
                    </div>
                </div>

                <div className="bg-white border border-[#ede9e2] p-5 rounded-2xl shadow-sm print:p-3">
                    <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2 print:mb-1">
                        <span>Net Profit / Loss</span>
                        <PieChart className="w-4 h-4 text-emerald-600 print:hidden" />
                    </div>
                    <div className="text-2xl font-black text-emerald-700 font-mono print:text-lg">{fmtINR(profitLoss.amount.total, true)}</div>
                    <div className="text-[11px] text-emerald-700 mt-2 font-bold flex items-center gap-1 print:text-[9px]">
                        <ArrowUpRight className="w-3.5 h-3.5 print:hidden" />
                        <span>Margin: {profitLoss.percentage.total}%</span>
                    </div>
                </div>
            </div>

            {/* Quick Navigation Anchor Bar (Hidden in Print) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs text-slate-600 font-bold no-scrollbar print:hidden">
                <span className="text-slate-400 uppercase text-[10px] tracking-wider shrink-0">Jump To Section:</span>
                <a href="#admitted" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">1. Admitted</a>
                <a href="#admissions" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">2. Admissions</a>
                <a href="#discharges" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">3. Discharges</a>
                <a href="#revenue" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">4. Revenue</a>
                <a href="#opd-ipd" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">5. OPD vs IPD Split</a>
                <a href="#department" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">6. Department Revenue</a>
                <a href="#expenses" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">7. Expenses</a>
                <a href="#receivables" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">8. Receivables & Aging</a>
                <a href="#payables" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">9. Payables</a>
                <a href="#salaries" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">10. Salaries</a>
                <a href="#arpob" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">11. ARPOB</a>
                <a href="#profit-loss" className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:text-emerald-700 transition-colors shrink-0 shadow-sm">12. Profit/Loss</a>
            </div>

            {/* 1. Current Admitted Patients */}
            <div id="admitted">
                {renderTableSection(
                    'admitted',
                    '1. Current Admitted Patients',
                    'Real-time inpatient count across units by patient category',
                    [
                        { label: 'Cash', data: currentAdmittedPatients.cash, isCurrency: false },
                        { label: 'Insurance', data: currentAdmittedPatients.insurance, isCurrency: false },
                        { label: 'Panel', data: currentAdmittedPatients.panel, isCurrency: false },
                        { label: 'Corporate', data: currentAdmittedPatients.corporate, isCurrency: false },
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
                        { label: 'Cash', data: admissions.cash, isCurrency: false },
                        { label: 'Insurance', data: admissions.insurance, isCurrency: false },
                        { label: 'Panel', data: admissions.panel, isCurrency: false },
                        { label: 'Corporate', data: admissions.corporate, isCurrency: false },
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
                        { label: 'Cash', data: discharges.cash, isCurrency: false },
                        { label: 'Insurance', data: discharges.insurance, isCurrency: false },
                        { label: 'Panel', data: discharges.panel, isCurrency: false },
                        { label: 'Corporate', data: discharges.corporate, isCurrency: false },
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
                        { label: 'Cash', data: revenue.cash, isCurrency: true },
                        { label: 'Insurance', data: revenue.insurance, isCurrency: true },
                        { label: 'Panel', data: revenue.panel, isCurrency: true },
                        { label: 'Corporate', data: revenue.corporate, isCurrency: true },
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
                        { label: 'OPD Consultations & Procedures', data: opdVsIpdRevenue.opd, isCurrency: true },
                        { label: 'IPD Admissions & Surgeries', data: opdVsIpdRevenue.ipd, isCurrency: true },
                        { label: 'Pharmacy Sales', data: opdVsIpdRevenue.pharmacy, isCurrency: true },
                        { label: 'Diagnostics & Pathology', data: opdVsIpdRevenue.diagnostics, isCurrency: true },
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
                        isCurrency: true
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
                        { label: 'April', data: expenses.april, isCurrency: true },
                        { label: 'May', data: expenses.may, isCurrency: true },
                        { label: 'June', data: expenses.june, isCurrency: true },
                        { label: 'July', data: expenses.july, isCurrency: true },
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
                        { label: 'Cash', data: receivables.cash, isCurrency: true },
                        { label: 'Insurance', data: receivables.insurance, isCurrency: true },
                        { label: 'Panel', data: receivables.panel, isCurrency: true },
                        { label: 'Corporate', data: receivables.corporate, isCurrency: true },
                        { label: 'TDS - Receivables', data: receivables.tdsReceivables, isCurrency: true },
                        { label: 'Total Receivables', data: receivables.total, isCurrency: true, isTotalRow: true },
                    ]
                )}

                {renderTableSection(
                    'receivables-8b',
                    '8B. Insurance Receivables Aging Analysis',
                    'Outstanding TPA / Insurance claims categorized by days pending (₹)',
                    [
                        { label: '0 to 30 Days (Current)', data: insuranceAging.days0to30, isCurrency: true },
                        { label: '31 to 60 Days (Follow-up)', data: insuranceAging.days31to60, isCurrency: true },
                        { label: '60+ Days (Overdue)', data: insuranceAging.days60Plus, isCurrency: true },
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
                        { label: 'Vendors', data: payables.vendors, isCurrency: true },
                        { label: 'Doctors - Professional', data: payables.doctorsProfessional, isCurrency: true },
                        { label: 'TDS - Payable', data: payables.tdsPayable, isCurrency: true },
                        { label: 'Others', data: payables.others, isCurrency: true },
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
                        { label: 'April', data: salaries.april, isCurrency: true },
                        { label: 'May', data: salaries.may, isCurrency: true },
                        { label: 'June', data: salaries.june, isCurrency: true },
                        { label: 'July', data: salaries.july, isCurrency: true },
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
                        { label: 'April ARPOB', data: arpob.april, isCurrency: true },
                        { label: 'May ARPOB', data: arpob.may, isCurrency: true },
                        { label: 'June ARPOB', data: arpob.june, isCurrency: true },
                        { label: 'July ARPOB', data: arpob.july, isCurrency: true },
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
        </div>
    );
}
