'use client';

import { useState, useEffect } from 'react';
import { getRevenueByDepartment, getDailyCollectionSummary, getProfitLossReport, getMISReport } from '@/app/actions/report-actions';
import { DateRangePicker } from '@/app/components/finance/DateRangePicker';
import { ReportChart } from '@/app/components/finance/ReportChart';
import { ExportButton } from '@/app/components/finance/ExportButton';
import { TrendingUp, BarChart3, PieChart, Loader2, IndianRupee, ArrowUpRight, ArrowDownRight, ListFilter } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import Link from 'next/link';

// Columns for the detailed per-bill revenue breakup + its Excel export. Keep the
// export list and on-screen table in sync so what's shown is what's downloaded.
const DETAIL_COLUMNS: { key: string; label: string }[] = [
    { key: 'bill_date_fmt', label: 'Bill Date' },
    { key: 'bill_no', label: 'Bill No' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'uhid', label: 'UHID' },
    { key: 'phone', label: 'Phone' },
    { key: 'bill_type', label: 'Bill Type' },
    { key: 'admission_category', label: 'Patient Type' },
    { key: 'tpa_corporate_name', label: 'TPA / Corporate' },
    { key: 'doctor_name', label: 'Doctor' },
    { key: 'department', label: 'Department' },
    { key: 'admission_date_fmt', label: 'Admission Date' },
    { key: 'discharge_date_fmt', label: 'Discharge Date' },
    { key: 'gross_amount', label: 'Gross Amount' },
    { key: 'discount', label: 'Discount' },
    { key: 'net_amount', label: 'Net Amount' },
    { key: 'received_amount', label: 'Payment Collected' },
    { key: 'outstanding_amount', label: 'Outstanding' },
    { key: 'approved_amount', label: 'TPA Approved' },
    { key: 'settled_amount', label: 'TPA Settled' },
    { key: 'status', label: 'Status' },
];

export default function RevenuePage() {
    const _now = new Date();
    const _ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const today = _ld(_now);
    const firstOfMonth = _ld(new Date(_now.getFullYear(), _now.getMonth(), 1));

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [deptData, setDeptData] = useState<any>(null);
    const [dailyData, setDailyData] = useState<any[]>([]);
    const [plData, setPLData] = useState<any>(null);
    const [detailRows, setDetailRows] = useState<any[]>([]);
    const [detailSummary, setDetailSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, [from, to]);

    const fmtDMY = (iso: any) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '');

    async function loadData() {
        setLoading(true);
        const [deptRes, dailyRes, plRes, misRes] = await Promise.all([
            getRevenueByDepartment({ from, to }),
            getDailyCollectionSummary({ from, to }),
            getProfitLossReport({ from, to }),
            getMISReport({ from, to }),
        ]);
        if (deptRes.success) setDeptData(deptRes.data);
        if (dailyRes.success) setDailyData(dailyRes.data || []);
        if (plRes.success) setPLData(plRes.data);
        const misData = misRes.success ? (misRes as any).data : null;
        if (misData) {
            const rows = (misData.rows || []).map((r: any) => ({
                ...r,
                // Pre-format dates so the on-screen table and the Excel export match.
                bill_date_fmt: fmtDMY(r.bill_date),
                admission_date_fmt: fmtDMY(r.admission_date),
                discharge_date_fmt: fmtDMY(r.discharge_date),
            }));
            setDetailRows(rows);
            setDetailSummary(misData.summary || null);
        } else {
            setDetailRows([]);
            setDetailSummary(null);
        }
        setLoading(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    // Department sum is a service-date (accrual) view: it splits a multi-day IPD bill
    // across the days its line items were rendered. Kept only for the department table's
    // %-share denominator so those shares still total 100%.
    const deptRevenueTotal = deptData?.byDepartment?.reduce((s: number, d: any) => s + d.amount, 0) || 0;
    // Headline Total Revenue = the detailed breakup's Net Billed (bill-date basis), so the
    // top card always reconciles with the per-bill table below. Falls back to the
    // department sum only until the MIS summary loads.
    const totalRevenue = detailSummary?.total_net ?? deptRevenueTotal;
    const totalExpenses = plData?.totalExpenses || 0;
    const netProfit = plData?.netProfit || 0;

    return (
        <AppShell pageTitle="Revenue Analytics" pageIcon={<TrendingUp className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Revenue Analytics</h1>
                    <p className="text-sm text-gray-500 mt-1">Comprehensive revenue breakdown and trends</p>
                </div>
                <div className="flex items-center gap-3">
                    <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
                    <ExportButton
                        data={deptData?.byDepartment || []}
                        filename={`revenue-${from}-to-${to}`}
                        columns={[{ key: 'department', label: 'Department' }, { key: 'amount', label: 'Amount' }, { key: 'count', label: 'Items' }]}
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-50 rounded-lg"><ArrowUpRight className="h-5 w-5 text-emerald-600" /></div>
                                <span className="text-sm text-gray-500">Total Revenue</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{fmt(totalRevenue)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-red-50 rounded-lg"><ArrowDownRight className="h-5 w-5 text-red-600" /></div>
                                <span className="text-sm text-gray-500">Total Expenses</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{fmt(totalExpenses)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                    <IndianRupee className={`h-5 w-5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                                </div>
                                <span className="text-sm text-gray-500">Net Profit</span>
                            </div>
                            <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(netProfit)}</p>
                        </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Revenue Trend */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <TrendingUp className="h-4 w-4 text-emerald-600" /> Daily Collections
                            </h3>
                            {dailyData.length > 0 ? (
                                <ReportChart
                                    type="line"
                                    labels={dailyData.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}
                                    datasets={[{ label: 'Collections', data: dailyData.map(d => d.total) }]}
                                    height={280}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">No data for this period</div>
                            )}
                        </div>

                        {/* Department Breakdown */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <BarChart3 className="h-4 w-4 text-emerald-600" /> Revenue by Department
                            </h3>
                            {deptData?.byDepartment?.length > 0 ? (
                                <ReportChart
                                    type="bar"
                                    labels={deptData.byDepartment.map((d: any) => d.department)}
                                    datasets={[{ label: 'Revenue', data: deptData.byDepartment.map((d: any) => d.amount) }]}
                                    height={280}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">No department data</div>
                            )}
                        </div>

                        {/* OPD vs IPD */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <PieChart className="h-4 w-4 text-emerald-600" /> OPD vs IPD Revenue
                            </h3>
                            {deptData?.byType?.length > 0 ? (
                                <ReportChart
                                    type="doughnut"
                                    labels={deptData.byType.map((t: any) => t.type)}
                                    datasets={[{ label: 'Revenue', data: deptData.byType.map((t: any) => t.amount) }]}
                                    height={280}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">No type data</div>
                            )}
                        </div>

                        {/* Income vs Expenses */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <IndianRupee className="h-4 w-4 text-emerald-600" /> Income vs Expenses
                            </h3>
                            {plData ? (
                                <ReportChart
                                    type="bar"
                                    labels={['Income', 'Expenses']}
                                    datasets={[{
                                        label: 'Amount',
                                        data: [plData.totalIncome, plData.totalExpenses],
                                        color: undefined,
                                    }]}
                                    height={280}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">No P&L data</div>
                            )}
                        </div>
                    </div>

                    {/* Top Services Table */}
                    {deptData?.byDepartment?.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-semibold text-gray-900">Department-wise Breakdown</h3>
                            </div>
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Items</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">% Share</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {deptData.byDepartment.sort((a: any, b: any) => b.amount - a.amount).map((d: any) => (
                                        <tr key={d.department} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 text-sm font-medium text-gray-900">{d.department}</td>
                                            <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(d.amount)}</td>
                                            <td className="px-6 py-3 text-sm text-gray-600 text-right">{d.count}</td>
                                            <td className="px-6 py-3 text-sm text-gray-600 text-right">
                                                {deptRevenueTotal > 0 ? ((d.amount / deptRevenueTotal) * 100).toFixed(1) : '0'}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Detailed per-bill Revenue Breakup */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <ListFilter className="h-4 w-4 text-emerald-600" /> Detailed Revenue Breakup
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Every bill for {new Date(from).toLocaleDateString('en-GB')} – {new Date(to).toLocaleDateString('en-GB')} — patient, payment collected, outstanding, IPD dates and TPA amounts.
                                </p>
                            </div>
                            <ExportButton
                                data={detailRows}
                                filename={`revenue-breakup-${from}-to-${to}`}
                                columns={DETAIL_COLUMNS}
                            />
                        </div>

                        {/* Summary chips */}
                        {detailSummary && (
                            <div className="flex flex-wrap gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-sm">
                                <span className="text-gray-500">Bills: <span className="font-bold text-gray-900">{detailSummary.total_bills}</span></span>
                                <span className="text-gray-500">Net Billed: <span className="font-bold text-gray-900">{fmt(detailSummary.total_net || 0)}</span></span>
                                <span className="text-gray-500">Collected: <span className="font-bold text-emerald-600">{fmt(detailSummary.total_received || 0)}</span></span>
                                <span className="text-gray-500">Outstanding: <span className="font-bold text-rose-600">{fmt(detailSummary.total_outstanding || 0)}</span></span>
                                {detailSummary.total_approved > 0 && <span className="text-gray-500">TPA Approved: <span className="font-bold text-gray-900">{fmt(detailSummary.total_approved)}</span></span>}
                                {detailSummary.total_settled > 0 && <span className="text-gray-500">TPA Settled: <span className="font-bold text-gray-900">{fmt(detailSummary.total_settled)}</span></span>}
                            </div>
                        )}

                        {detailRows.length === 0 ? (
                            <div className="py-16 text-center text-sm text-gray-400">No bills in this period.</div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh]">
                                <table className="w-full text-xs whitespace-nowrap">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                                            <th className="px-3 py-2 text-left font-semibold">Bill Date</th>
                                            <th className="px-3 py-2 text-left font-semibold">Bill No</th>
                                            <th className="px-3 py-2 text-left font-semibold">Patient</th>
                                            <th className="px-3 py-2 text-left font-semibold">Type</th>
                                            <th className="px-3 py-2 text-left font-semibold">Patient Type</th>
                                            <th className="px-3 py-2 text-left font-semibold">Doctor</th>
                                            <th className="px-3 py-2 text-left font-semibold">Admit</th>
                                            <th className="px-3 py-2 text-left font-semibold">Discharge</th>
                                            <th className="px-3 py-2 text-right font-semibold">Net</th>
                                            <th className="px-3 py-2 text-right font-semibold">Collected</th>
                                            <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                                            <th className="px-3 py-2 text-right font-semibold">TPA Appr.</th>
                                            <th className="px-3 py-2 text-right font-semibold">TPA Settled</th>
                                            <th className="px-3 py-2 text-left font-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {detailRows.map((r: any, i: number) => (
                                            <tr key={r.invoice_id ?? i} className="hover:bg-emerald-50/30">
                                                <td className="px-3 py-2 text-gray-600">{r.bill_date_fmt}</td>
                                                <td className="px-3 py-2 font-mono text-gray-700">
                                                    {r.invoice_id ? (
                                                        <Link href={`/finance/invoices/${r.invoice_id}`} className="text-emerald-700 hover:underline">{r.bill_no}</Link>
                                                    ) : r.bill_no}
                                                </td>
                                                <td className="px-3 py-2 font-medium text-gray-900">
                                                    {r.uhid ? (
                                                        <Link href={`/billing/patient/${r.uhid}`} className="hover:underline">{r.patient_name}</Link>
                                                    ) : r.patient_name}
                                                    {r.uhid && <span className="block text-[10px] text-gray-400 font-mono">{r.uhid}</span>}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.bill_type === 'IPD' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>{r.bill_type}</span>
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">
                                                    {r.admission_category}
                                                    {r.tpa_corporate_name && <span className="block text-[10px] text-gray-400">{r.tpa_corporate_name}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">{r.doctor_name || '-'}</td>
                                                <td className="px-3 py-2 text-gray-600">{r.admission_date_fmt || '-'}</td>
                                                <td className="px-3 py-2 text-gray-600">{r.discharge_date_fmt || '-'}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(r.net_amount || 0)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(r.received_amount || 0)}</td>
                                                <td className={`px-3 py-2 text-right font-semibold ${(r.outstanding_amount || 0) > 0 ? 'text-rose-600' : 'text-gray-400'}`}>{fmt(r.outstanding_amount || 0)}</td>
                                                <td className="px-3 py-2 text-right text-gray-600">{r.approved_amount > 0 ? fmt(r.approved_amount) : '-'}</td>
                                                <td className="px-3 py-2 text-right text-gray-600">{r.settled_amount > 0 ? fmt(r.settled_amount) : '-'}</td>
                                                <td className="px-3 py-2 text-gray-500">{r.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
        </AppShell>
    );
}
