'use client';

import { useState, useEffect } from 'react';
import {
    getCollectionsReport, getARAgingReport, getCashFlowReport,
    getProfitLossReport, getInsuranceCollectionReport, getRevenueByDepartment,
    getPnLIncomeBreakdown, getPnLExpenseBreakdown, getInvoiceItemsBrief,
} from '@/app/actions/report-actions';
import { DateRangePicker } from '@/app/components/finance/DateRangePicker';
import { ReportChart } from '@/app/components/finance/ReportChart';
import { ExportButton } from '@/app/components/finance/ExportButton';
import {
    BarChart3, Clock, TrendingUp, IndianRupee, ShieldCheck, Building2,
    Loader2, FileText, BookOpenCheck, FileSpreadsheet,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { VoucherModal } from '@/app/components/finance/VoucherModal';
import Link from 'next/link';

type ReportType = 'collections' | 'aging' | 'cashflow' | 'pnl' | 'insurance' | 'department';

const REPORT_TABS: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: 'collections', label: 'Collections', icon: <IndianRupee className="h-4 w-4" /> },
    { key: 'aging', label: 'A/R Aging', icon: <Clock className="h-4 w-4" /> },
    { key: 'cashflow', label: 'Cash Flow', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'pnl', label: 'Profit & Loss', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'insurance', label: 'Insurance', icon: <ShieldCheck className="h-4 w-4" /> },
    { key: 'department', label: 'Department', icon: <Building2 className="h-4 w-4" /> },
];


export default function FinancialReportsPage() {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [activeReport, setActiveReport] = useState<ReportType>('collections');
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [quickFilter, setQuickFilter] = useState<'all' | 'cash' | 'upi' | 'others'>('all');
    const [methodFilter, setMethodFilter] = useState<string>('all');

    useEffect(() => { loadReport(); }, [activeReport, from, to, quickFilter, methodFilter]);

    async function loadReport() {
        setLoading(true);
        setData(null); // always clear stale data before loading new report
        let res;
        switch (activeReport) {
            case 'collections': {
                    const quickFilterMap: Record<string, string> = { cash: 'Cash', upi: 'UPI', others: 'others' };
                    const activeMethod = methodFilter !== 'all' ? methodFilter : quickFilter !== 'all' ? quickFilterMap[quickFilter] : undefined;
                    res = await getCollectionsReport({ from, to, method: activeMethod });
                    break;
                }
            case 'aging': res = await getARAgingReport(); break;
            case 'cashflow': res = await getCashFlowReport({ from, to }); break;
            case 'pnl': res = await getProfitLossReport({ from, to }); break;
            case 'insurance': res = await getInsuranceCollectionReport({ from, to }); break;
            case 'department': res = await getRevenueByDepartment({ from, to }); break;
        }
        if (res?.success) setData(res.data);
        setLoading(false);
    }

    const fmt = (n: number) => {
        if (n == null || isNaN(n)) return '₹0';
        return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    };

    return (
        <AppShell pageTitle="Financial Reports" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadReport} refreshing={loading}>
        <div className="max-w-7xl mx-auto">

            {/* Report Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
                {REPORT_TABS.map(tab => (
                    <button key={tab.key} onClick={() => { setActiveReport(tab.key); setQuickFilter('all'); setMethodFilter('all'); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition ${
                            activeReport === tab.key ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-gray-500 hover:bg-gray-100 border border-transparent'
                        }`}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
                <Link href="/finance/reports/mis"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
                    <FileSpreadsheet className="h-4 w-4" /> MIS Report
                </Link>
            </div>

            {/* Date Range + Export */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                {activeReport !== 'aging' && (
                    <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
                )}
                {activeReport === 'aging' && <div />}
                <button onClick={loadReport} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                    Generate Report
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
            ) : !data ? (
                <div className="text-center py-24 text-gray-400">
                    <FileText className="h-10 w-10 mx-auto mb-3" />
                    <p className="font-medium">Select a report and click Generate</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {activeReport === 'collections' && (
                        <CollectionsReport
                            data={data} fmt={fmt} from={from} to={to}
                            quickFilter={quickFilter} setQuickFilter={setQuickFilter}
                            methodFilter={methodFilter} setMethodFilter={setMethodFilter}
                        />
                    )}
                    {activeReport === 'aging' && <AgingReport data={data} fmt={fmt} />}
                    {activeReport === 'cashflow' && <CashFlowReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'pnl' && <ProfitLossReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'insurance' && <InsuranceReport data={data} fmt={fmt} from={from} to={to} />}
                    {activeReport === 'department' && <DepartmentReport data={data} fmt={fmt} from={from} to={to} />}
                </div>
            )}
        </div>
        </AppShell>
    );
}

function CollectionsReport({ data, fmt, from, to, quickFilter, setQuickFilter, methodFilter, setMethodFilter }: {
    data: any; fmt: (n: number) => string; from: string; to: string;
    quickFilter: 'all' | 'cash' | 'upi' | 'others'; setQuickFilter: (v: 'all' | 'cash' | 'upi' | 'others') => void;
    methodFilter: string; setMethodFilter: (v: string) => void;
}) {
    const methods = Object.entries(data?.totals || {}).filter(([k]) => k !== 'total');
    const payments = data?.payments || [];
    return (
        <>
            {/* Payment Method Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Filter by method</span>
                <div className="flex gap-1.5">
                    {(['all', 'cash', 'upi', 'others'] as const).map(f => (
                        <button key={f}
                            onClick={() => { setQuickFilter(f); setMethodFilter('all'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                                quickFilter === f && methodFilter === 'all'
                                    ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30'
                                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-800'
                            }`}>
                            {f === 'all' ? 'All' : f === 'others' ? 'All Others' : f.toUpperCase()}
                        </button>
                    ))}
                </div>
                <select
                    value={methodFilter}
                    onChange={e => { setMethodFilter(e.target.value); setQuickFilter('all'); }}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-500 focus:outline-none focus:border-emerald-500/50 ml-1">
                    <option value="all">Any Method</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="BankTransfer">Bank Transfer</option>
                    <option value="Razorpay">Razorpay</option>
                </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard label="Total Collections" value={fmt(data?.totals?.total || 0)} color="emerald" />
                {methods.map(([method, amount]) => (
                    <SummaryCard key={method} label={method} value={fmt(amount as number)} color="gray" />
                ))}
            </div>
            {methods.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <ReportChart type="doughnut" labels={methods.map(([m]) => m)} datasets={[{ label: 'Amount', data: methods.map(([, a]) => a as number) }]} height={300} />
                </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Payment Details ({payments.length})</h3>
                    <ExportButton data={payments.map((p: any) => ({
                        receipt: p.receipt_number, patient: p.invoice?.patient?.full_name || '-',
                        invoice: p.invoice?.invoice_number, method: p.payment_method, amount: Number(p.amount),
                        date: new Date(p.created_at).toLocaleDateString('en-IN'),
                    }))} filename={`collections-${from}-${to}`} columns={[
                        { key: 'receipt', label: 'Receipt #' }, { key: 'patient', label: 'Patient' },
                        { key: 'invoice', label: 'Invoice #' }, { key: 'method', label: 'Method' },
                        { key: 'amount', label: 'Amount' }, { key: 'date', label: 'Date' },
                    ]} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead><tr className="bg-gray-50">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {payments.slice(0, 50).map((p: any) => (
                                <tr key={p.id}
                                    onClick={() => window.open(`/api/payment/${p.id}/receipt`, '_blank')}
                                    title="Open receipt"
                                    className="hover:bg-emerald-50/60 cursor-pointer transition-colors">
                                    <td className="px-6 py-3 text-sm font-mono text-emerald-700 hover:underline">{p.receipt_number}</td>
                                    <td className="px-6 py-3 text-sm text-gray-900">{p.invoice?.patient?.full_name || '-'}</td>
                                    <td className="px-6 py-3 text-sm text-gray-600">{p.payment_method}</td>
                                    <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(p.amount))}</td>
                                    <td className="px-6 py-3 text-sm text-gray-500">{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function AgingReport({ data, fmt }: { data: any; fmt: (n: number) => string }) {
    const summary = data.summary || { '0-30': 0, '30-60': 0, '60+': 0 };
    const totalOutstanding = Object.values(summary).reduce((s: number, v: any) => s + v, 0) as number;
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <SummaryCard label="0-30 Days" value={fmt(summary['0-30'] || 0)} color="emerald" />
                <SummaryCard label="30-60 Days" value={fmt(summary['30-60'] || 0)} color="amber" />
                <SummaryCard label="60+ Days" value={fmt(summary['60+'] || 0)} color="red" />
                <SummaryCard label="Total Outstanding" value={fmt(totalOutstanding)} color="gray" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <ReportChart type="bar" labels={['0-30 Days', '30-60 Days', '60+ Days']}
                    datasets={[{ label: 'Outstanding', data: [summary['0-30'] || 0, summary['30-60'] || 0, summary['60+'] || 0] }]} height={250} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Outstanding Invoices ({(data.invoices || []).length})</h3>
                    <ExportButton data={(data.invoices || []).map((inv: any) => ({
                        invoice: inv.invoice_number, patient: inv.patient?.full_name, phone: inv.patient?.phone,
                        balance: Number(inv.balance_due), days: inv.days_overdue, bucket: inv.aging_bucket,
                    }))} filename="ar-aging" columns={[
                        { key: 'invoice', label: 'Invoice' }, { key: 'patient', label: 'Patient' },
                        { key: 'phone', label: 'Phone' }, { key: 'balance', label: 'Balance Due' },
                        { key: 'days', label: 'Days Overdue' }, { key: 'bucket', label: 'Bucket' },
                    ]} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead><tr className="bg-gray-50">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Days</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bucket</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {(data.invoices || []).map((inv: any) => {
                                const bucketColor = inv.aging_bucket === '60+' ? 'bg-red-50 text-red-700' : inv.aging_bucket === '30-60' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
                                return (
                                    <tr key={inv.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-sm font-mono text-gray-600">{inv.invoice_number}</td>
                                        <td className="px-6 py-3 text-sm text-gray-900">{inv.patient?.full_name || '-'}</td>
                                        <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(inv.balance_due))}</td>
                                        <td className="px-6 py-3 text-sm text-gray-600 text-right">{inv.days_overdue}d</td>
                                        <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${bucketColor}`}>{inv.aging_bucket}</span></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function CashFlowReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const daily = data?.daily || [];
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard label="Total Inflow" value={fmt(data?.totalInflow || 0)} color="emerald" />
                <SummaryCard label="Total Outflow" value={fmt(data?.totalOutflow || 0)} color="red" />
                <SummaryCard label="Net Cash Flow" value={fmt(data?.netFlow || 0)} color={(data?.netFlow || 0) >= 0 ? 'emerald' : 'red'} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Daily Cash Flow</h3>
                {daily.length > 0 ? (
                    <ReportChart type="bar"
                        labels={daily.map((d: any) => new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}
                        datasets={[
                            { label: 'Inflow', data: daily.map((d: any) => d.inflow) },
                            { label: 'Outflow', data: daily.map((d: any) => d.outflow) },
                        ]} height={300} />
                ) : <div className="text-center py-12 text-gray-400">No cash flow data</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Daily Breakdown</h3>
                    <ExportButton data={daily} filename={`cashflow-${from}-${to}`}
                        columns={[{ key: 'date', label: 'Date' }, { key: 'inflow', label: 'Inflow' }, { key: 'outflow', label: 'Outflow' }, { key: 'net', label: 'Net' }]} />
                </div>
                <table className="w-full">
                    <thead><tr className="bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-emerald-600">Inflow</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-red-600">Outflow</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Net</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {daily.map((d: any) => (
                            <tr key={d.date} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-sm text-gray-700">{new Date(d.date).toLocaleDateString('en-IN')}</td>
                                <td className="px-6 py-3 text-sm text-emerald-600 text-right font-medium">{fmt(d.inflow)}</td>
                                <td className="px-6 py-3 text-sm text-red-600 text-right font-medium">{fmt(d.outflow)}</td>
                                <td className={`px-6 py-3 text-sm text-right font-semibold ${d.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(d.net)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function ProfitLossReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const income = data?.income || [];
    const expenses = data?.expenses || [];

    // Drill-down state: which row is expanded + its loaded breakdown
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [drillData, setDrillData] = useState<any | null>(null);
    const [drillLoading, setDrillLoading] = useState(false);
    // Voucher drill-down: invoice whose accounting voucher is open (null = closed).
    // Held at this level so the modal renders outside the drill-down tables.
    const [voucherInvoiceId, setVoucherInvoiceId] = useState<number | null>(null);

    async function toggleIncome(department: string) {
        const key = `inc:${department}`;
        if (openKey === key) { setOpenKey(null); setDrillData(null); return; }
        setOpenKey(key); setDrillData(null); setDrillLoading(true);
        const res = await getPnLIncomeBreakdown({ department, from, to });
        if (res.success) setDrillData({ type: 'income', ...res.data });
        setDrillLoading(false);
    }

    async function toggleExpense(categoryLabel: string) {
        const key = `exp:${categoryLabel}`;
        if (openKey === key) { setOpenKey(null); setDrillData(null); return; }
        setOpenKey(key); setDrillData(null); setDrillLoading(true);
        const res = await getPnLExpenseBreakdown({ categoryLabel, from, to });
        if (res.success) setDrillData({ type: 'expense', ...res.data });
        setDrillLoading(false);
    }

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard label="Total Income" value={fmt(data?.totalIncome || 0)} color="emerald" />
                <SummaryCard label="Total Expenses" value={fmt(data?.totalExpenses || 0)} color="red" />
                <SummaryCard label="Net Profit" value={fmt(data?.netProfit || 0)} color={(data?.netProfit || 0) >= 0 ? 'emerald' : 'red'} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Income by Department</h3>
                    {income.length > 0 ? (
                        <ReportChart type="bar" labels={income.map((i: any) => i.label)} datasets={[{ label: 'Income', data: income.map((i: any) => i.amount) }]} height={250} />
                    ) : <div className="text-center py-12 text-gray-400">No income data</div>}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Expenses by Category</h3>
                    {expenses.length > 0 ? (
                        <ReportChart type="doughnut" labels={expenses.map((e: any) => e.label)} datasets={[{ label: 'Expenses', data: expenses.map((e: any) => e.amount) }]} height={250} />
                    ) : <div className="text-center py-12 text-gray-400">No expense data</div>}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">P&L Statement <span className="text-xs font-normal text-gray-400 ml-2">(click any row for breakdown)</span></h3>
                    <ExportButton data={[
                        ...income.map((i: any) => ({ type: 'Income', label: i.label, amount: i.amount })),
                        ...expenses.map((e: any) => ({ type: 'Expense', label: e.label, amount: e.amount })),
                        { type: 'Net Profit', label: '', amount: data?.netProfit || 0 },
                    ]} filename={`pnl-${from}-${to}`} columns={[
                        { key: 'type', label: 'Type' }, { key: 'label', label: 'Category' }, { key: 'amount', label: 'Amount' },
                    ]} />
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2">Income</h4>
                        {income.map((i: any) => {
                            const key = `inc:${i.label}`;
                            const open = openKey === key;
                            return (
                                <div key={i.label}>
                                    <button
                                        type="button"
                                        onClick={() => toggleIncome(i.label)}
                                        className={`w-full flex justify-between py-1.5 text-sm hover:bg-emerald-50 px-2 -mx-2 rounded transition ${open ? 'bg-emerald-50' : ''}`}
                                    >
                                        <span className="text-gray-700 flex items-center gap-2">
                                            <span className="text-emerald-500 text-xs">{open ? '▼' : '▶'}</span>
                                            {i.label}
                                        </span>
                                        <span className="font-medium text-gray-900">{fmt(i.amount)}</span>
                                    </button>
                                    {open && (
                                        <DrillPanel loading={drillLoading} data={drillData} fmt={fmt} kind="income" onViewVoucher={setVoucherInvoiceId} />
                                    )}
                                </div>
                            );
                        })}
                        <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                            <span>Total Income</span><span className="text-emerald-600">{fmt(data?.totalIncome || 0)}</span>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-red-600 uppercase mb-2">Expenses</h4>
                        {expenses.map((e: any) => {
                            const key = `exp:${e.label}`;
                            const open = openKey === key;
                            return (
                                <div key={e.label}>
                                    <button
                                        type="button"
                                        onClick={() => toggleExpense(e.label)}
                                        className={`w-full flex justify-between py-1.5 text-sm hover:bg-red-50 px-2 -mx-2 rounded transition ${open ? 'bg-red-50' : ''}`}
                                    >
                                        <span className="text-gray-700 flex items-center gap-2">
                                            <span className="text-red-500 text-xs">{open ? '▼' : '▶'}</span>
                                            {e.label}
                                        </span>
                                        <span className="font-medium text-gray-900">{fmt(e.amount)}</span>
                                    </button>
                                    {open && (
                                        <DrillPanel loading={drillLoading} data={drillData} fmt={fmt} kind="expense" />
                                    )}
                                </div>
                            );
                        })}
                        <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                            <span>Total Expenses</span><span className="text-red-600">{fmt(data?.totalExpenses || 0)}</span>
                        </div>
                    </div>
                    <div className={`flex justify-between py-3 text-lg font-bold border-t-2 border-gray-900 ${(data?.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className="text-gray-900">Net Profit / (Loss)</span>
                        <span>{fmt(data?.netProfit || 0)}</span>
                    </div>
                </div>
            </div>

            {voucherInvoiceId != null && (
                <VoucherModal invoiceId={voucherInvoiceId} onClose={() => setVoucherInvoiceId(null)} />
            )}
        </>
    );
}

function InvoiceItemsInline({ invoiceId, fmt }: { invoiceId: number; fmt: (n: number) => string }) {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<any[]>([]);
    const [err, setErr] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getInvoiceItemsBrief(invoiceId).then((res) => {
            if (cancelled) return;
            if (res.success) setItems(res.data || []);
            else setErr((res as any).error || 'Failed to load items');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [invoiceId]);

    if (loading) return (
        <div className="px-4 py-3 bg-emerald-50/50 text-xs text-gray-500 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading invoice line items...
        </div>
    );
    if (err) return <div className="px-4 py-3 bg-rose-50 text-xs text-rose-700">{err}</div>;
    if (items.length === 0) return <div className="px-4 py-3 bg-emerald-50/50 text-xs text-gray-400">No line items on this invoice.</div>;

    const subtotal = items.reduce((s, it) => s + Number(it.net_price) + Number(it.tax_amount || 0), 0);

    return (
        <div className="bg-emerald-50/40 border-l-4 border-emerald-300 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Invoice line items</p>
            <table className="w-full text-[11px]">
                <thead>
                    <tr className="text-gray-500">
                        <th className="text-left py-1 font-semibold">Description</th>
                        <th className="text-left py-1 font-semibold">Dept / Category</th>
                        <th className="text-right py-1 font-semibold">Qty</th>
                        <th className="text-right py-1 font-semibold">Unit ₹</th>
                        <th className="text-right py-1 font-semibold">GST%</th>
                        <th className="text-right py-1 font-semibold">Net</th>
                        <th className="text-right py-1 font-semibold">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100/70">
                    {items.map((it) => (
                        <tr key={it.id}>
                            <td className="py-1 text-gray-800">{it.description}</td>
                            <td className="py-1 text-gray-500">{it.department}{it.service_category && it.service_category !== it.department ? ` · ${it.service_category}` : ''}</td>
                            <td className="py-1 text-right text-gray-700">{it.quantity}</td>
                            <td className="py-1 text-right text-gray-700">{fmt(it.unit_price)}</td>
                            <td className="py-1 text-right text-gray-500">{it.tax_rate}%</td>
                            <td className="py-1 text-right text-gray-700">{fmt(it.net_price)}</td>
                            <td className="py-1 text-right font-semibold text-gray-900">{fmt(it.net_price + it.tax_amount)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-emerald-300">
                        <td colSpan={6} className="py-1.5 text-right font-bold text-emerald-800">Invoice total (incl. GST)</td>
                        <td className="py-1.5 text-right font-bold text-emerald-900">{fmt(subtotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

function IncomeRow({ r, fmt, onViewVoucher }: { r: any; fmt: (n: number) => string; onViewVoucher?: (id: number) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <tr className="hover:bg-white">
                <td className="px-2 py-2 align-top">
                    {r.invoice_id ? (
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold w-5"
                            title={open ? 'Hide items' : 'Show line items'}
                        >
                            {open ? '▼' : '▶'}
                        </button>
                    ) : null}
                </td>
                <td className="px-3 py-2 text-gray-500">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                <td className="px-3 py-2 text-gray-900">{r.patient_name}</td>
                <td className="px-3 py-2 font-mono text-gray-600">
                    {r.invoice_id ? (
                        <div className="flex flex-col items-start gap-0.5">
                            <Link
                                href={`/finance/invoices/${r.invoice_id}`}
                                className="text-emerald-700 hover:text-emerald-900 hover:underline font-semibold"
                                title="Open full invoice page"
                            >
                                {r.invoice_number} ↗
                            </Link>
                            <button
                                type="button"
                                onClick={() => onViewVoucher?.(r.invoice_id)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 hover:text-sky-900"
                                title="View accounting voucher"
                            >
                                <BookOpenCheck className="h-3 w-3" /> Voucher
                            </button>
                        </div>
                    ) : (
                        r.invoice_number
                    )}
                </td>
                <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.invoice_type === 'IPD' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                        {r.invoice_type}
                    </span>
                </td>
                <td className="px-3 py-2 text-gray-700">{r.description}</td>
                <td className="px-3 py-2 text-right text-gray-600">{r.quantity}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(r.net_price + r.tax_amount)}</td>
            </tr>
            {open && r.invoice_id && (
                <tr>
                    <td colSpan={8} className="p-0">
                        <InvoiceItemsInline invoiceId={r.invoice_id} fmt={fmt} />
                    </td>
                </tr>
            )}
        </>
    );
}

function DrillPanel({ loading, data, fmt, kind, onViewVoucher }: { loading: boolean; data: any; fmt: (n: number) => string; kind: 'income' | 'expense'; onViewVoucher?: (id: number) => void }) {
    if (loading) {
        return (
            <div className="my-2 ml-6 mr-2 py-4 px-3 bg-gray-50 rounded-lg flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading breakdown...
            </div>
        );
    }
    if (!data || (kind === 'income' && data.type !== 'income') || (kind === 'expense' && data.type !== 'expense')) {
        return null;
    }
    const rows = data.rows || [];
    if (rows.length === 0) {
        return (
            <div className="my-2 ml-6 mr-2 py-4 px-3 bg-gray-50 rounded-lg text-xs text-gray-400 text-center">
                No detailed entries found.
            </div>
        );
    }
    return (
        <div className="my-2 ml-6 mr-2 bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-white border-b border-gray-200">
                        {kind === 'income' ? (
                            <tr>
                                <th className="px-2 py-2 w-8 text-left font-semibold text-gray-400" title="Click ▶ to expand items"></th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Patient</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Invoice</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Type</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Description</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-500">Qty</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount</th>
                            </tr>
                        ) : (
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Voucher #</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Vendor</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Description</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Method</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount</th>
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {kind === 'income'
                            ? rows.map((r: any) => <IncomeRow key={r.id} r={r} fmt={fmt} onViewVoucher={onViewVoucher} />)
                            : rows.map((r: any) => (
                                <tr key={r.id} className="hover:bg-white">
                                    <td className="px-3 py-2 text-gray-500">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                                    <td className="px-3 py-2 font-mono text-gray-600">{r.expense_number}</td>
                                    <td className="px-3 py-2 text-gray-900">{r.vendor}</td>
                                    <td className="px-3 py-2 text-gray-700">{r.description}</td>
                                    <td className="px-3 py-2 text-gray-600">{r.payment_method || '-'}</td>
                                    <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(r.amount)}</td>
                                </tr>
                            ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-white border-t border-gray-200">
                            <td colSpan={kind === 'income' ? 7 : 6} className="px-3 py-2 text-right font-bold text-gray-600">Subtotal</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(data.total || 0)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

function InsuranceReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const summary = data?.summary || {};
    const claims = data?.claims || [];
    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard label="Total Claims" value={String(summary.totalClaims || 0)} color="gray" />
                <SummaryCard label="Claimed" value={fmt(summary.totalClaimed || 0)} color="blue" />
                <SummaryCard label="Approved" value={fmt(summary.totalApproved || 0)} color="emerald" />
                <SummaryCard label="Rejected" value={fmt(summary.totalRejected || 0)} color="red" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <ReportChart type="bar" labels={['Submitted', 'Approved', 'Settled', 'Rejected']}
                    datasets={[{ label: 'Claims', data: [summary.pending || 0, summary.approved || 0, summary.settled || 0, summary.rejected || 0] }]} height={250} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Claims Detail</h3>
                    <ExportButton data={claims.map((c: any) => ({
                        claim: c.claim_number, provider: c.policy?.provider?.provider_name || '-',
                        invoice: c.invoice?.invoice_number, claimed: Number(c.claimed_amount),
                        approved: Number(c.approved_amount || 0), status: c.status,
                    }))} filename={`insurance-${from}-${to}`} columns={[
                        { key: 'claim', label: 'Claim #' }, { key: 'provider', label: 'Provider' },
                        { key: 'invoice', label: 'Invoice' }, { key: 'claimed', label: 'Claimed' },
                        { key: 'approved', label: 'Approved' }, { key: 'status', label: 'Status' },
                    ]} />
                </div>
                <table className="w-full">
                    <thead><tr className="bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Claim #</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Provider</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Claimed</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Approved</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {claims.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No claims found</td></tr>
                        ) : claims.map((c: any) => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-sm font-mono text-gray-600">{c.claim_number}</td>
                                <td className="px-6 py-3 text-sm text-gray-900">{c.policy?.provider?.provider_name || '-'}</td>
                                <td className="px-6 py-3 text-sm text-gray-900 text-right">{fmt(Number(c.claimed_amount))}</td>
                                <td className="px-6 py-3 text-sm text-emerald-600 text-right font-medium">{fmt(Number(c.approved_amount || 0))}</td>
                                <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function DepartmentReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const total = data.byDepartment?.reduce((s: number, d: any) => s + d.amount, 0) || 0;
    return (
        <>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Department Revenue Distribution</h3>
                {data.byDepartment?.length > 0 ? (
                    <ReportChart type="bar" labels={data.byDepartment.map((d: any) => d.department)}
                        datasets={[{ label: 'Revenue', data: data.byDepartment.map((d: any) => d.amount) }]} height={300} />
                ) : <div className="text-center py-12 text-gray-400">No data</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Department Details</h3>
                    <ExportButton data={data.byDepartment || []} filename={`dept-revenue-${from}-${to}`}
                        columns={[{ key: 'department', label: 'Department' }, { key: 'amount', label: 'Revenue' }, { key: 'count', label: 'Items' }]} />
                </div>
                <table className="w-full">
                    <thead><tr className="bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">Department</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Revenue</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">Items</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">% Share</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {(data.byDepartment || []).sort((a: any, b: any) => b.amount - a.amount).map((d: any) => (
                            <tr key={d.department} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-sm font-medium text-gray-900">{d.department}</td>
                                <td className="px-6 py-3 text-sm font-semibold text-right">{fmt(d.amount)}</td>
                                <td className="px-6 py-3 text-sm text-gray-600 text-right">{d.count}</td>
                                <td className="px-6 py-3 text-sm text-gray-600 text-right">{total > 0 ? ((d.amount / total) * 100).toFixed(1) : '0'}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-50 border-emerald-200', red: 'bg-red-50 border-red-200',
        amber: 'bg-amber-50 border-amber-200', blue: 'bg-blue-50 border-blue-200',
        gray: 'bg-gray-50 border-gray-200',
    };
    return (
        <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.gray}`}>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        Submitted: 'bg-blue-50 text-blue-700', Approved: 'bg-emerald-50 text-emerald-700',
        Settled: 'bg-orange-50 text-orange-700', Rejected: 'bg-red-50 text-red-700',
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}
