'use client';

import React, { useState, useEffect } from 'react';
import { getInvestorDashboardData, type InvestorDashboardData, type UnitMetrics } from '@/app/actions/investor-actions';
import {
    Activity,
    Users,
    UserCheck,
    UserMinus,
    TrendingUp,
    CreditCard,
    DollarSign,
    Calendar,
    Filter,
    Printer,
    Download,
    Bed,
    PieChart,
    ArrowUpRight,
    Building,
    CheckCircle2,
    RefreshCw
} from 'lucide-react';

function fmtINR(n: number, isCurrency = true): string {
    if (n === undefined || n === null) return '-';
    if (!isCurrency) return n.toLocaleString('en-IN');
    return `₹${n.toLocaleString('en-IN')}`;
}

export default function PromoterDashboardPage() {
    const [data, setData] = useState<InvestorDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<'day' | 'month' | 'year' | 'custom'>('month');
    const [fromDate, setFromDate] = useState('2026-04-01');
    const [toDate, setToDate] = useState('2026-07-31');

    const loadData = async () => {
        setLoading(true);
        const res = await getInvestorDashboardData({ filterType, fromDate, toDate });
        if (res.success && res.data) {
            setData(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, [filterType]);

    if (loading || !data) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 text-slate-400">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium animate-pulse">Aggregating Multi-Unit Promoter Metrics...</p>
            </div>
        );
    }

    const {
        units,
        currentAdmittedPatients,
        admissions,
        discharges,
        revenue,
        expenses,
        receivables,
        payables,
        salaries,
        arpob,
        profitLoss,
    } = data;

    const exportToCSV = () => {
        if (!data) return;
        const csvRows = [
            ['Promoter Dashboard — Consolidated Multi-Unit Report'],
            ['Filter', filterType.toUpperCase()],
            ['Date Range', `${fromDate} to ${toDate}`],
            [],
            ['Unit', 'Axten - EOK', 'Axten - HQ', 'Axten - Gurugram', 'Axten - Nehru Enclave', 'Consolidated Total'],
            [],
            ['CURRENT ADMITTED PATIENTS'],
            ['Cash', currentAdmittedPatients.cash.eok, currentAdmittedPatients.cash.hq, currentAdmittedPatients.cash.gurugram, currentAdmittedPatients.cash.nehruEnclave, currentAdmittedPatients.cash.total],
            ['Insurance', currentAdmittedPatients.insurance.eok, currentAdmittedPatients.insurance.hq, currentAdmittedPatients.insurance.gurugram, currentAdmittedPatients.insurance.nehruEnclave, currentAdmittedPatients.insurance.total],
            ['Panel', currentAdmittedPatients.panel.eok, currentAdmittedPatients.panel.hq, currentAdmittedPatients.panel.gurugram, currentAdmittedPatients.panel.nehruEnclave, currentAdmittedPatients.panel.total],
            ['Corporate', currentAdmittedPatients.corporate.eok, currentAdmittedPatients.corporate.hq, currentAdmittedPatients.corporate.gurugram, currentAdmittedPatients.corporate.nehruEnclave, currentAdmittedPatients.corporate.total],
            ['Total', currentAdmittedPatients.total.eok, currentAdmittedPatients.total.hq, currentAdmittedPatients.total.gurugram, currentAdmittedPatients.total.nehruEnclave, currentAdmittedPatients.total.total],
            [],
            ['REVENUE'],
            ['Cash', revenue.cash.eok, revenue.cash.hq, revenue.cash.gurugram, revenue.cash.nehruEnclave, revenue.cash.total],
            ['Insurance', revenue.insurance.eok, revenue.insurance.hq, revenue.insurance.gurugram, revenue.insurance.nehruEnclave, revenue.insurance.total],
            ['Panel', revenue.panel.eok, revenue.panel.hq, revenue.panel.gurugram, revenue.panel.nehruEnclave, revenue.panel.total],
            ['Corporate', revenue.corporate.eok, revenue.corporate.hq, revenue.corporate.gurugram, revenue.corporate.nehruEnclave, revenue.corporate.total],
            ['Total', revenue.total.eok, revenue.total.hq, revenue.total.gurugram, revenue.total.nehruEnclave, revenue.total.total],
            [],
            ['STATUS OF PROFIT / LOSS'],
            ['Net Amount (₹)', profitLoss.amount.eok, profitLoss.amount.hq, profitLoss.amount.gurugram, profitLoss.amount.nehruEnclave, profitLoss.amount.total],
            ['Percentage (%)', `${profitLoss.percentage.eok}%`, `${profitLoss.percentage.hq}%`, `${profitLoss.percentage.gurugram}%`, `${profitLoss.percentage.nehruEnclave}%`, `${profitLoss.percentage.total}%`],
        ];

        const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Promoter_Dashboard_${filterType}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderTableSection = (
        title: string,
        subtitle: string,
        rows: Array<{ label: string; data: UnitMetrics; isCurrency?: boolean; isPercentage?: boolean; isTotalRow?: boolean }>
    ) => (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-8">
            <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        {title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
                            <th className="py-3.5 px-6 min-w-[200px]">Type / Category</th>
                            <th className="py-3.5 px-4 text-right min-w-[130px] text-emerald-400">Axten - EOK</th>
                            <th className="py-3.5 px-4 text-right min-w-[130px] text-amber-400">Axten - HQ</th>
                            <th className="py-3.5 px-4 text-right min-w-[130px] text-indigo-400">Axten - Gurugram</th>
                            <th className="py-3.5 px-4 text-right min-w-[130px] text-cyan-400">Axten - Nehru Enclave</th>
                            <th className="py-3.5 px-6 text-right min-w-[160px] bg-slate-900/90 text-white font-black border-l border-slate-800">
                                Consolidated Total
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-xs">
                        {rows.map((row, idx) => {
                            const isTotal = row.isTotalRow || row.label.toLowerCase() === 'total';
                            return (
                                <tr
                                    key={idx}
                                    className={`transition-colors ${
                                        isTotal
                                            ? 'bg-slate-950/90 font-bold text-white'
                                            : 'hover:bg-slate-800/40 text-slate-200'
                                    }`}
                                >
                                    <td className="py-3 px-6 font-semibold flex items-center gap-2">
                                        {isTotal && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                        <span>{row.label}</span>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                                        {row.isPercentage
                                            ? `${row.data.eok}%`
                                            : fmtINR(row.data.eok, row.isCurrency)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                                        {row.isPercentage
                                            ? `${row.data.hq}%`
                                            : fmtINR(row.data.hq, row.isCurrency)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                                        {row.isPercentage
                                            ? `${row.data.gurugram}%`
                                            : fmtINR(row.data.gurugram, row.isCurrency)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                                        {row.isPercentage
                                            ? `${row.data.nehruEnclave}%`
                                            : fmtINR(row.data.nehruEnclave, row.isCurrency)}
                                    </td>
                                    <td className="py-3 px-6 text-right font-mono font-bold bg-slate-900/60 border-l border-slate-800 text-emerald-400">
                                        {row.isPercentage
                                            ? `${row.data.total}%`
                                            : fmtINR(row.data.total, row.isCurrency)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Title Bar & Filter Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-white tracking-tight">Promoter Dashboard</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            Consolidated View (All Units)
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Consolidated Operational & Financial Analytics across EOK, HQ, Gurugram, and Nehru Enclave
                    </p>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                        {(['day', 'month', 'year', 'custom'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-3 py-1.5 rounded-lg transition-all capitalize cursor-pointer ${
                                    filterType === type
                                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-bold'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {filterType === 'custom' && (
                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-1.5 rounded-xl text-xs">
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="bg-transparent text-slate-200 focus:outline-none"
                            />
                            <span className="text-slate-500">to</span>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="bg-transparent text-slate-200 focus:outline-none"
                            />
                            <button
                                onClick={loadData}
                                className="p-1 rounded bg-emerald-500 text-slate-950 font-bold"
                            >
                                Apply
                            </button>
                        </div>
                    )}

                    <button
                        onClick={loadData}
                        title="Refresh Data"
                        className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                        onClick={exportToCSV}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Report</span>
                    </button>
                </div>
            </div>

            {/* Top KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                        <span>Total Operational Beds</span>
                        <Bed className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-white font-mono">{arpob.noOfBeds.total} Beds</div>
                    <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1 font-medium">
                        <span>EOK: 20</span> • <span>Gurugram: 50</span> • <span>Nehru: 55</span>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                        <span>Currently Admitted</span>
                        <Users className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-2xl font-black text-white font-mono">{currentAdmittedPatients.total.total} Patients</div>
                    <div className="text-[11px] text-indigo-400 mt-2 font-medium">
                        {currentAdmittedPatients.insurance.total} Insurance • {currentAdmittedPatients.cash.total} Cash
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                        <span>Period Revenue</span>
                        <TrendingUp className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="text-2xl font-black text-emerald-400 font-mono">{fmtINR(revenue.total.total)}</div>
                    <div className="text-[11px] text-slate-400 mt-2 font-medium">
                        Insurance: {fmtINR(revenue.insurance.total)}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                        <span>Consolidated ARPOB</span>
                        <Activity className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-2xl font-black text-white font-mono">{fmtINR(arpob.average.total)}</div>
                    <div className="text-[11px] text-cyan-400 mt-2 font-medium">
                        Average Revenue / Bed / Day
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                        <span>Net Profit / Loss</span>
                        <PieChart className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-emerald-400 font-mono">{fmtINR(profitLoss.amount.total)}</div>
                    <div className="text-[11px] text-emerald-400 mt-2 font-bold flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Profit Margin: {profitLoss.percentage.total}%</span>
                    </div>
                </div>
            </div>

            {/* Quick Navigation Anchor Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs text-slate-400 font-semibold no-scrollbar">
                <span className="text-slate-500 uppercase text-[10px] tracking-wider shrink-0">Jump To Section:</span>
                <a href="#admitted" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">1. Admitted</a>
                <a href="#admissions" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">2. Admissions</a>
                <a href="#discharges" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">3. Discharges</a>
                <a href="#revenue" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">4. Revenue</a>
                <a href="#expenses" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">5. Expenses</a>
                <a href="#receivables" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">6. Receivables</a>
                <a href="#payables" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">7. Payables</a>
                <a href="#salaries" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">8. Salaries</a>
                <a href="#arpob" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">9. ARPOB</a>
                <a href="#profit-loss" className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white transition-colors shrink-0">10. Profit/Loss</a>
            </div>

            {/* 1. Current Admitted Patients */}
            <div id="admitted">
                {renderTableSection(
                    '1. Current Admitted Patients',
                    'Real-time inpatient count across units by patient category',
                    [
                        { label: 'Cash', data: currentAdmittedPatients.cash },
                        { label: 'Insurance', data: currentAdmittedPatients.insurance },
                        { label: 'Panel', data: currentAdmittedPatients.panel },
                        { label: 'Corporate', data: currentAdmittedPatients.corporate },
                        { label: 'Total', data: currentAdmittedPatients.total, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 2. Admission */}
            <div id="admissions">
                {renderTableSection(
                    '2. Admission',
                    'New patient admissions logged within selected period',
                    [
                        { label: 'Cash', data: admissions.cash },
                        { label: 'Insurance', data: admissions.insurance },
                        { label: 'Panel', data: admissions.panel },
                        { label: 'Corporate', data: admissions.corporate },
                        { label: 'Total', data: admissions.total, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 3. Discharge */}
            <div id="discharges">
                {renderTableSection(
                    '3. Discharge',
                    'Patient discharge volume breakdown',
                    [
                        { label: 'Cash', data: discharges.cash },
                        { label: 'Insurance', data: discharges.insurance },
                        { label: 'Panel', data: discharges.panel },
                        { label: 'Corporate', data: discharges.corporate },
                        { label: 'Total', data: discharges.total, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 4. Revenue */}
            <div id="revenue">
                {renderTableSection(
                    '4. Revenue',
                    'Gross revenue realization by patient financial class (₹)',
                    [
                        { label: 'Cash', data: revenue.cash, isCurrency: true },
                        { label: 'Insurance', data: revenue.insurance, isCurrency: true },
                        { label: 'Panel', data: revenue.panel, isCurrency: true },
                        { label: 'Corporate', data: revenue.corporate, isCurrency: true },
                        { label: 'Total', data: revenue.total, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 5. Expenses */}
            <div id="expenses">
                {renderTableSection(
                    '5. Expenses',
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

            {/* 6. Receivables - Yet to Receive */}
            <div id="receivables">
                {renderTableSection(
                    '6. Receivables — Yet to Receive',
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
            </div>

            {/* 7. Payables - Due for Payments */}
            <div id="payables">
                {renderTableSection(
                    '7. Payables — Due for Payments',
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

            {/* 8. Salaries */}
            <div id="salaries">
                {renderTableSection(
                    '8. Salaries',
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

            {/* 9. ARPOB - Average Revenue Per Operational Bed */}
            <div id="arpob">
                {renderTableSection(
                    '9. ARPOB — Average Revenue Per Operational Bed',
                    'Operational bed capacity and average daily revenue yield (₹/Bed/Day)',
                    [
                        { label: 'No. of Beds', data: arpob.noOfBeds },
                        { label: 'April ARPOB', data: arpob.april, isCurrency: true },
                        { label: 'May ARPOB', data: arpob.may, isCurrency: true },
                        { label: 'June ARPOB', data: arpob.june, isCurrency: true },
                        { label: 'July ARPOB', data: arpob.july, isCurrency: true },
                        { label: 'Average ARPOB', data: arpob.average, isCurrency: true, isTotalRow: true },
                    ]
                )}
            </div>

            {/* 10. Status of Profit/Loss */}
            <div id="profit-loss">
                {renderTableSection(
                    '10. Status of Profit / Loss',
                    'Net operational profit margin across units',
                    [
                        { label: 'Amount (₹)', data: profitLoss.amount, isCurrency: true },
                        { label: 'Percentage %', data: profitLoss.percentage, isPercentage: true, isTotalRow: true },
                    ]
                )}
            </div>
        </div>
    );
}
