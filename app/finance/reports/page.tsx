'use client';

import { useState, useEffect } from 'react';
import {
    getCollectionsReport, getARAgingReport, getCashFlowReport,
    getProfitLossReport, getInsuranceCollectionReport, getRevenueByDepartment,
} from '@/app/actions/report-actions';
import { DateRangePicker } from '@/app/components/finance/DateRangePicker';
import { ReportChart } from '@/app/components/finance/ReportChart';
import { ExportButton } from '@/app/components/finance/ExportButton';
import {
    BarChart3, Clock, TrendingUp, IndianRupee, ShieldCheck, Building2,
    Loader2, FileText,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

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

    useEffect(() => { loadReport(); }, [activeReport, from, to]);

    async function loadReport() {
        setLoading(true);
        setData(null);
        let res;
        switch (activeReport) {
            case 'collections': res = await getCollectionsReport({ from, to }); break;
            case 'aging': res = await getARAgingReport(); break;
            case 'cashflow': res = await getCashFlowReport({ from, to }); break;
            case 'pnl': res = await getProfitLossReport({ from, to }); break;
            case 'insurance': res = await getInsuranceCollectionReport({ from, to }); break;
            case 'department': res = await getRevenueByDepartment({ from, to }); break;
        }
        if (res?.success) setData(res.data);
        setLoading(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    return (
        <AppShell pageTitle="Financial Reports" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadReport} refreshing={loading}>
        <div className="max-w-7xl mx-auto">

            {/* Report Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
                {REPORT_TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveReport(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition ${
                            activeReport === tab.key ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-gray-500 hover:bg-gray-100 border border-transparent'
                        }`}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
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
                    {activeReport === 'collections' && <CollectionsReport data={data} fmt={fmt} from={from} to={to} />}
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

function CollectionsReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    const methods = Object.entries(data.totals).filter(([k]) => k !== 'total');
    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard label="Total Collections" value={fmt(data.totals.total || 0)} color="emerald" />
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
                    <h3 className="font-semibold text-gray-900">Payment Details ({data.payments.length})</h3>
                    <ExportButton data={data.payments.map((p: any) => ({
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
                            {data.payments.slice(0, 50).map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 text-sm font-mono text-gray-600">{p.receipt_number}</td>
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
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard label="Total Inflow" value={fmt(data.totalInflow)} color="emerald" />
                <SummaryCard label="Total Outflow" value={fmt(data.totalOutflow)} color="red" />
                <SummaryCard label="Net Cash Flow" value={fmt(data.netFlow)} color={data.netFlow >= 0 ? 'emerald' : 'red'} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Daily Cash Flow</h3>
                {data.daily.length > 0 ? (
                    <ReportChart type="bar"
                        labels={data.daily.map((d: any) => new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}
                        datasets={[
                            { label: 'Inflow', data: data.daily.map((d: any) => d.inflow) },
                            { label: 'Outflow', data: data.daily.map((d: any) => d.outflow) },
                        ]} height={300} />
                ) : <div className="text-center py-12 text-gray-400">No cash flow data</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Daily Breakdown</h3>
                    <ExportButton data={data.daily} filename={`cashflow-${from}-${to}`}
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
                        {data.daily.map((d: any) => (
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
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard label="Total Income" value={fmt(data.totalIncome)} color="emerald" />
                <SummaryCard label="Total Expenses" value={fmt(data.totalExpenses)} color="red" />
                <SummaryCard label="Net Profit" value={fmt(data.netProfit)} color={data.netProfit >= 0 ? 'emerald' : 'red'} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Income by Department</h3>
                    {data.income.length > 0 ? (
                        <ReportChart type="bar" labels={data.income.map((i: any) => i.label)} datasets={[{ label: 'Income', data: data.income.map((i: any) => i.amount) }]} height={250} />
                    ) : <div className="text-center py-12 text-gray-400">No income data</div>}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Expenses by Category</h3>
                    {data.expenses.length > 0 ? (
                        <ReportChart type="doughnut" labels={data.expenses.map((e: any) => e.label)} datasets={[{ label: 'Expenses', data: data.expenses.map((e: any) => e.amount) }]} height={250} />
                    ) : <div className="text-center py-12 text-gray-400">No expense data</div>}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">P&L Statement</h3>
                    <ExportButton data={[
                        ...data.income.map((i: any) => ({ type: 'Income', label: i.label, amount: i.amount })),
                        ...data.expenses.map((e: any) => ({ type: 'Expense', label: e.label, amount: e.amount })),
                        { type: 'Net Profit', label: '', amount: data.netProfit },
                    ]} filename={`pnl-${from}-${to}`} columns={[
                        { key: 'type', label: 'Type' }, { key: 'label', label: 'Category' }, { key: 'amount', label: 'Amount' },
                    ]} />
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2">Income</h4>
                        {data.income.map((i: any) => (
                            <div key={i.label} className="flex justify-between py-1.5 text-sm">
                                <span className="text-gray-700">{i.label}</span>
                                <span className="font-medium text-gray-900">{fmt(i.amount)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                            <span>Total Income</span><span className="text-emerald-600">{fmt(data.totalIncome)}</span>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-red-600 uppercase mb-2">Expenses</h4>
                        {data.expenses.map((e: any) => (
                            <div key={e.label} className="flex justify-between py-1.5 text-sm">
                                <span className="text-gray-700">{e.label}</span>
                                <span className="font-medium text-gray-900">{fmt(e.amount)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200 mt-2">
                            <span>Total Expenses</span><span className="text-red-600">{fmt(data.totalExpenses)}</span>
                        </div>
                    </div>
                    <div className={`flex justify-between py-3 text-lg font-bold border-t-2 border-gray-900 ${data.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className="text-gray-900">Net Profit / (Loss)</span>
                        <span>{fmt(data.netProfit)}</span>
                    </div>
                </div>
            </div>
        </>
    );
}

function InsuranceReport({ data, fmt, from, to }: { data: any; fmt: (n: number) => string; from: string; to: string }) {
    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard label="Total Claims" value={String(data.summary.totalClaims)} color="gray" />
                <SummaryCard label="Claimed" value={fmt(data.summary.totalClaimed)} color="blue" />
                <SummaryCard label="Approved" value={fmt(data.summary.totalApproved)} color="emerald" />
                <SummaryCard label="Rejected" value={fmt(data.summary.totalRejected)} color="red" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <ReportChart type="bar" labels={['Submitted', 'Approved', 'Settled', 'Rejected']}
                    datasets={[{ label: 'Claims', data: [data.summary.pending, data.summary.approved, data.summary.settled, data.summary.rejected] }]} height={250} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Claims Detail</h3>
                    <ExportButton data={data.claims.map((c: any) => ({
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
                        {data.claims.map((c: any) => (
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
        Settled: 'bg-teal-50 text-teal-700', Rejected: 'bg-red-50 text-red-700',
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}
