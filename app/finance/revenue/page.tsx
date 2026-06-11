'use client';

import { useState, useEffect } from 'react';
import { getRevenueByDepartment, getDailyCollectionSummary, getProfitLossReport } from '@/app/actions/report-actions';
import { DateRangePicker } from '@/app/components/finance/DateRangePicker';
import { ReportChart } from '@/app/components/finance/ReportChart';
import { ExportButton } from '@/app/components/finance/ExportButton';
import { TrendingUp, BarChart3, PieChart, Loader2, IndianRupee, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function RevenuePage() {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [deptData, setDeptData] = useState<any>(null);
    const [dailyData, setDailyData] = useState<any[]>([]);
    const [plData, setPLData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, [from, to]);

    async function loadData() {
        setLoading(true);
        const [deptRes, dailyRes, plRes] = await Promise.all([
            getRevenueByDepartment({ from, to }),
            getDailyCollectionSummary({ from, to }),
            getProfitLossReport({ from, to }),
        ]);
        if (deptRes.success) setDeptData(deptRes.data);
        if (dailyRes.success) setDailyData(dailyRes.data || []);
        if (plRes.success) setPLData(plRes.data);
        setLoading(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    const totalRevenue = deptData?.byDepartment?.reduce((s: number, d: any) => s + d.amount, 0) || 0;
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
                                                {totalRevenue > 0 ? ((d.amount / totalRevenue) * 100).toFixed(1) : '0'}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
        </AppShell>
    );
}
