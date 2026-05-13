'use client';

import { useState, useEffect } from 'react';
import { getRevenueLeakageInsights, getFinancialAnalytics } from '@/app/actions/analytics-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { 
    TrendingUp, AlertTriangle, IndianRupee, Activity, 
    BarChart3, PieChart, ShieldAlert, ArrowUpRight, ArrowDownRight, Loader2
} from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';

export default function AnalyticsDashboard() {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [leakageData, setLeakageData] = useState<any>(null);
    const [financialData, setFinancialData] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [leakageRes, financeRes] = await Promise.all([
                getRevenueLeakageInsights(),
                getFinancialAnalytics()
            ]);

            if (leakageRes.success) setLeakageData(leakageRes.data);
            if (financeRes.success) setFinancialData(financeRes.data);
        } catch (error) {
            toast.error("Failed to load analytics data");
        }
        setLoading(false);
    }

    const fmt = (n: number) => n?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) || '₹0';

    const getGrowthIndicator = (current: number, previous: number) => {
        if (!previous || previous === 0) return null;
        const growth = ((current - previous) / previous) * 100;
        const isPositive = growth >= 0;
        return (
            <div className={`flex items-center text-xs font-bold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                {Math.abs(growth).toFixed(1)}% vs Last Month
            </div>
        );
    };

    return (
        <AppShell 
            pageTitle="Financial Intelligence" 
            pageIcon={<BarChart3 className="h-5 w-5" />} 
            onRefresh={loadData} 
            refreshing={loading}
        >
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Financial Intelligence</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1">Analytics, Forecasting, and Revenue Leakage Detection</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-sm font-semibold text-gray-400 animate-pulse">Running advanced heuristics...</p>
                    </div>
                ) : (
                    <>
                        {/* KPI ROW 1: Financial Performance */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow md:col-span-1">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                        <IndianRupee className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-600">MTD Revenue</h3>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                                    {fmt(financialData?.mtdRevenue)}
                                </p>
                                {getGrowthIndicator(financialData?.mtdRevenue, financialData?.lastMonthRevenue)}
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-600">Forecasted MTD</h3>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                                    {fmt(financialData?.forecastedMtd)}
                                </p>
                                <p className="text-xs font-semibold text-gray-400">Projected EOM Revenue</p>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-600">MTD Collection</h3>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                                    {fmt(financialData?.mtdCollected)}
                                </p>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                                        <Activity className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-600">Collection Rate</h3>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                                    {financialData?.collectionRate?.toFixed(1)}%
                                </p>
                                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                                    <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${financialData?.collectionRate}%` }}></div>
                                </div>
                            </div>

                            {/* LEAKAGE RISK HIGHLIGHT */}
                            <div className="bg-rose-50 rounded-2xl border border-rose-200 p-5 shadow-sm relative overflow-hidden md:col-span-2 lg:col-span-2">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <ShieldAlert className="w-24 h-24 text-rose-500" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="p-2.5 bg-white text-rose-600 rounded-xl shadow-sm">
                                            <AlertTriangle className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-sm font-bold text-rose-800">Value at Risk (Leakage)</h3>
                                    </div>
                                    <p className="text-3xl font-black text-rose-700 tracking-tight mb-2">
                                        {fmt(leakageData?.totalLeakageRiskValue)}
                                    </p>
                                    <p className="text-xs font-semibold text-rose-600">Action required across {leakageData?.staleDrafts?.length + leakageData?.unsettledAdmissions?.length + leakageData?.unbilledLabs?.length} items</p>
                                </div>
                            </div>
                        </div>

                        {/* ROW 2: Leakage Details & Top Departments */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* LEAKAGE DETECTION ENGINE */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                        <ShieldAlert className="w-5 h-5 text-rose-500" />
                                        Revenue Leakage Engine
                                    </h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Unsettled Discharges */}
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="bg-rose-50 px-4 py-3 border-b border-rose-100 flex justify-between items-center">
                                            <span className="text-sm font-bold text-rose-800">Discharges w/o Settlement</span>
                                            <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                {leakageData?.unsettledAdmissions?.length} Found
                                            </span>
                                        </div>
                                        <div className="p-0 max-h-60 overflow-y-auto">
                                            {leakageData?.unsettledAdmissions?.length === 0 ? (
                                                <div className="p-6 text-center text-sm font-medium text-gray-400">All discharges settled properly.</div>
                                            ) : (
                                                <ul className="divide-y divide-gray-100">
                                                    {leakageData?.unsettledAdmissions?.map((item: any, idx: number) => (
                                                        <li key={idx} className="p-3 hover:bg-gray-50 flex justify-between items-center">
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-800">{item.admission?.patient?.full_name}</p>
                                                                <p className="text-xs font-medium text-gray-500">Invoice: {item.invoice?.invoice_number}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-rose-600">{fmt(item.invoice?.balance_due)}</p>
                                                                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Unpaid</p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stale Draft Invoices */}
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex justify-between items-center">
                                            <span className="text-sm font-bold text-amber-800">Stale Draft Invoices ({'>'}48h)</span>
                                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                {leakageData?.staleDrafts?.length} Found
                                            </span>
                                        </div>
                                        <div className="p-0 max-h-60 overflow-y-auto">
                                            {leakageData?.staleDrafts?.length === 0 ? (
                                                <div className="p-6 text-center text-sm font-medium text-gray-400">No stale drafts found.</div>
                                            ) : (
                                                <ul className="divide-y divide-gray-100">
                                                    {leakageData?.staleDrafts?.map((inv: any, idx: number) => (
                                                        <li key={idx} className="p-3 hover:bg-gray-50 flex justify-between items-center">
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-800">{inv.patient?.full_name || 'Walk-in'}</p>
                                                                <p className="text-xs font-medium text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-amber-600">{fmt(inv.net_amount)}</p>
                                                                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Draft</p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    {/* Unbilled Lab Orders */}
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm md:col-span-2">
                                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                                            <span className="text-sm font-bold text-blue-800">Completed Labs W/O Invoice</span>
                                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                {leakageData?.unbilledLabs?.length} Found
                                            </span>
                                        </div>
                                        <div className="p-0 max-h-48 overflow-y-auto">
                                            {leakageData?.unbilledLabs?.length === 0 ? (
                                                <div className="p-6 text-center text-sm font-medium text-gray-400">All lab orders are billed correctly.</div>
                                            ) : (
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-gray-50 sticky top-0">
                                                        <tr>
                                                            <th className="px-4 py-2 font-semibold text-gray-500">Barcode</th>
                                                            <th className="px-4 py-2 font-semibold text-gray-500">Test</th>
                                                            <th className="px-4 py-2 font-semibold text-gray-500">Date</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {leakageData?.unbilledLabs?.map((lab: any) => (
                                                            <tr key={lab.id} className="hover:bg-gray-50">
                                                                <td className="px-4 py-2 font-mono text-xs text-gray-600">{lab.barcode}</td>
                                                                <td className="px-4 py-2 font-medium text-gray-800">{lab.test_type}</td>
                                                                <td className="px-4 py-2 text-gray-500">{new Date(lab.created_at).toLocaleDateString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: Financial Insights */}
                            <div className="space-y-6">
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-6">
                                        <PieChart className="w-5 h-5 text-indigo-500" />
                                        <h2 className="text-lg font-black text-gray-900">Revenue by Department</h2>
                                    </div>
                                    
                                    {financialData?.topDepartments?.length === 0 ? (
                                        <div className="py-8 text-center text-sm font-medium text-gray-400">No departmental data available yet.</div>
                                    ) : (
                                        <div className="space-y-4">
                                            {financialData?.topDepartments?.map((dept: any, index: number) => {
                                                const totalRev = financialData?.topDepartments.reduce((acc: number, curr: any) => acc + curr.amount, 0);
                                                const percentage = totalRev > 0 ? (dept.amount / totalRev) * 100 : 0;
                                                const colors = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
                                                const colorClass = colors[index % colors.length];

                                                return (
                                                    <div key={dept.name}>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <span className="text-sm font-bold text-gray-700">{dept.name}</span>
                                                            <span className="text-xs font-black text-gray-900">{fmt(dept.amount)}</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                                            <div className={`${colorClass} h-2 rounded-full`} style={{ width: `${percentage}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </>
                )}
            </div>
        </AppShell>
    );
}
