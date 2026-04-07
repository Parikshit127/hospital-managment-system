'use client';

import { useState, useEffect } from 'react';
import { getFinanceDashboardStats } from '@/app/actions/finance-actions';
import { getExpenseDashboardStats, getExpenseCategories } from '@/app/actions/expense-actions';

type ViewPeriod = 'monthly' | 'quarterly' | 'yearly';

export default function IncomeExpensePage() {
    const [revenueStats, setRevenueStats] = useState<any>(null);
    const [expenseStats, setExpenseStats] = useState<any>(null);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('monthly');

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [revRes, expRes, catRes] = await Promise.all([
            getFinanceDashboardStats(),
            getExpenseDashboardStats(),
            getExpenseCategories(),
        ]);
        if (revRes.success) setRevenueStats(revRes.data);
        if (expRes.success) setExpenseStats(expRes.data);
        if (catRes.success) setCategories(catRes.data);
        setLoading(false);
    }

    const totalRevenue = revenueStats?.totalRevenue || 0;
    const totalExpenses = expenseStats?.totalExpenses || 0;
    const monthRevenue = revenueStats?.todayRevenue || 0;
    const monthExpenses = expenseStats?.thisMonthTotal || 0;
    const netIncome = totalRevenue - totalExpenses;
    const monthNetIncome = monthRevenue - monthExpenses;

    // Map category IDs to names
    const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

    const revByDept = revenueStats?.revenueByDepartment || [];
    const expByCategory = expenseStats?.byCategory || [];

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    if (loading) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading P&L data...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Income & Expense Report</h1>
                        <p className="text-sm text-gray-500">Profit & Loss overview across all departments</p>
                    </div>
                    <div className="flex gap-1 bg-white rounded-lg border p-1">
                        {(['monthly', 'quarterly', 'yearly'] as ViewPeriod[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setViewPeriod(p)}
                                className={`px-3 py-1 rounded text-sm font-medium capitalize ${viewPeriod === p ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-lg shadow p-4">
                        <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
                        <p className="text-2xl font-bold text-green-700">{fmt(totalRevenue)}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
                        <p className="text-2xl font-bold text-red-700">{fmt(totalExpenses)}</p>
                    </div>
                    <div className={`rounded-lg shadow p-4 ${netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className="text-xs text-gray-500 mb-1">Net Income (All Time)</p>
                        <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(netIncome)}</p>
                    </div>
                    <div className={`rounded-lg shadow p-4 ${monthNetIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className="text-xs text-gray-500 mb-1">Net Income (This Month)</p>
                        <p className={`text-2xl font-bold ${monthNetIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(monthNetIncome)}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    {/* Revenue Section */}
                    <div className="bg-white rounded-lg shadow p-4">
                        <h2 className="font-semibold text-sm mb-3 text-green-700">Revenue by Department</h2>
                        <div className="space-y-2">
                            {revByDept.length > 0 ? revByDept.map((dept: any, i: number) => {
                                const pct = totalRevenue > 0 ? (dept.amount / totalRevenue) * 100 : 0;
                                return (
                                    <div key={i}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-700">{dept.department || 'Other'}</span>
                                            <span className="font-medium">{fmt(dept.amount)}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-sm text-gray-400 text-center py-4">No revenue data available</p>
                            )}
                        </div>

                        {/* Revenue summary */}
                        <div className="border-t mt-4 pt-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Today's Collections</span>
                                <span className="font-medium">{fmt(revenueStats?.todayRevenue || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Payments Today</span>
                                <span className="font-medium">{revenueStats?.totalPaymentsToday || 0}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Outstanding Balance</span>
                                <span className="font-medium text-red-600">{fmt(revenueStats?.pendingBalance || 0)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Expense Section */}
                    <div className="bg-white rounded-lg shadow p-4">
                        <h2 className="font-semibold text-sm mb-3 text-red-700">Expenses by Category</h2>
                        <div className="space-y-2">
                            {expByCategory.length > 0 ? expByCategory.map((cat: any, i: number) => {
                                const catName = categoryMap.get(cat.category_id) || `Category ${cat.category_id}`;
                                const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
                                return (
                                    <div key={i}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-700">{catName}</span>
                                            <span className="font-medium">{fmt(cat.amount)}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-red-400 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-sm text-gray-400 text-center py-4">No expense data available</p>
                            )}
                        </div>

                        {/* Expense summary */}
                        <div className="border-t mt-4 pt-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Today's Expenses</span>
                                <span className="font-medium">{fmt(expenseStats?.todayTotal || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">This Month</span>
                                <span className="font-medium">{fmt(expenseStats?.thisMonthTotal || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Pending Approval</span>
                                <span className="font-medium text-amber-600">{expenseStats?.pendingApproval || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* P&L Summary Table */}
                <div className="bg-white rounded-lg shadow p-4 mt-6">
                    <h2 className="font-semibold text-sm mb-3">Profit & Loss Summary</h2>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="p-2 text-left">Particulars</th>
                                <th className="p-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b font-medium text-green-700">
                                <td className="p-2">A. Total Revenue (Collections)</td>
                                <td className="p-2 text-right">{fmt(totalRevenue)}</td>
                            </tr>
                            {revByDept.map((dept: any, i: number) => (
                                <tr key={`rev-${i}`} className="border-b">
                                    <td className="p-2 pl-6 text-gray-500">{dept.department || 'Other'}</td>
                                    <td className="p-2 text-right text-gray-600">{fmt(dept.amount)}</td>
                                </tr>
                            ))}
                            <tr className="border-b font-medium text-red-700 mt-2">
                                <td className="p-2">B. Total Expenses</td>
                                <td className="p-2 text-right">{fmt(totalExpenses)}</td>
                            </tr>
                            {expByCategory.map((cat: any, i: number) => (
                                <tr key={`exp-${i}`} className="border-b">
                                    <td className="p-2 pl-6 text-gray-500">{categoryMap.get(cat.category_id) || `Category ${cat.category_id}`}</td>
                                    <td className="p-2 text-right text-gray-600">{fmt(cat.amount)}</td>
                                </tr>
                            ))}
                            <tr className={`font-bold text-lg ${netIncome >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                                <td className="p-3">C. Net Income (A - B)</td>
                                <td className="p-3 text-right">{fmt(netIncome)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Outstanding Aging */}
                {revenueStats?.aging && (
                    <div className="bg-white rounded-lg shadow p-4 mt-6">
                        <h2 className="font-semibold text-sm mb-3">Outstanding Aging</h2>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-green-600">0-30 Days</p>
                                <p className="text-xl font-bold text-green-700">{fmt(revenueStats.aging.days0to30)}</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-amber-600">30-60 Days</p>
                                <p className="text-xl font-bold text-amber-700">{fmt(revenueStats.aging.days30to60)}</p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-red-600">60+ Days</p>
                                <p className="text-xl font-bold text-red-700">{fmt(revenueStats.aging.days60plus)}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
