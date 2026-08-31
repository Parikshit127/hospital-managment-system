'use client';

import { useState, useEffect } from 'react';
import { getFinanceDashboardStats } from '@/app/actions/finance-actions';
import { getExpenseDashboardStats, getExpenseCategories } from '@/app/actions/expense-actions';
import { exportIncomeExpenseExcel } from '@/app/actions/report-export-actions';
import { FileSpreadsheet, Printer, Loader2 } from 'lucide-react';

type ViewPeriod = 'monthly' | 'quarterly' | 'yearly';

interface CategoryItem {
    id: number;
    name: string;
}

interface DepartmentRevenue {
    department: string | null;
    amount: number;
}

interface ExpenseCategoryStat {
    category_id: number;
    amount: number;
}

interface RevenueStats {
    totalRevenue?: number;
    periodRevenue?: number;
    periodCollection?: number;
    todayRevenue?: number;
    totalPaymentsToday?: number;
    pendingBalance?: number;
    revenueByDepartment?: DepartmentRevenue[];
    aging?: {
        days0to30: number;
        days30to60: number;
        days60plus: number;
    };
}

interface ExpenseStats {
    totalExpenses?: number;
    periodExpenses?: number;
    todayTotal?: number;
    pendingApproval?: number;
    byCategory?: ExpenseCategoryStat[];
}

export default function IncomeExpensePage() {
    const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
    const [expenseStats, setExpenseStats] = useState<ExpenseStats | null>(null);
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('monthly');

    useEffect(() => {
        let isMounted = true;
        async function fetchData() {
            setLoading(true);
            const [revRes, expRes, catRes] = await Promise.all([
                getFinanceDashboardStats({ period: viewPeriod }),
                getExpenseDashboardStats(viewPeriod),
                getExpenseCategories(),
            ]);
            if (!isMounted) return;
            if (revRes.success) setRevenueStats(revRes.data as RevenueStats);
            if (expRes.success) setExpenseStats(expRes.data as ExpenseStats);
            if (catRes.success) setCategories((catRes.data || []) as CategoryItem[]);
            setLoading(false);
        }
        fetchData();
        return () => { isMounted = false; };
    }, [viewPeriod]);

    const allTimeRevenue = Math.round(Number(revenueStats?.totalRevenue || 0));
    const allTimeExpenses = Math.round(Number(expenseStats?.totalExpenses || 0));
    const allTimeNetIncome = allTimeRevenue - allTimeExpenses;

    const totalRevenue = Math.round(Number(revenueStats?.periodRevenue || 0));
    const totalCollection = Math.round(Number(revenueStats?.periodCollection || 0));
    const totalExpenses = Math.round(Number(expenseStats?.periodExpenses || 0));
    const netIncome = totalRevenue - totalExpenses;

    // Map category IDs to names
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    const revByDept = (revenueStats?.revenueByDepartment || []).map(d => ({
        department: d.department,
        amount: Math.round(Number(d.amount || 0)),
    }));
    const expByCategory = (expenseStats?.byCategory || []).map(c => ({
        category_id: c.category_id,
        amount: Math.round(Number(c.amount || 0)),
    }));

    const fmt = (n: number) => {
        const val = Math.round(Number(n || 0));
        return val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    };

    async function handleExportExcel() {
        setExportingExcel(true);
        try {
            const res = await exportIncomeExpenseExcel({ period: viewPeriod });
            if (!res.success || !res.base64) {
                alert(res.error || 'Failed to export Excel report.');
                return;
            }
            const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `Income-Expense-Report-${viewPeriod}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Excel export failed:', err);
            alert('Failed to export Excel report. Please try again.');
        } finally {
            setExportingExcel(false);
        }
    }

    function handlePrintPDF() {
        window.open(`/api/reports/income-expense/pdf?period=${viewPeriod}`, '_blank');
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                <span>Loading P&amp;L data...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 print:p-0 print:bg-white">
            <div className="max-w-6xl mx-auto print:max-w-none">
                {/* Header & Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Income &amp; Expense Report</h1>
                        <p className="text-sm text-gray-500">Profit &amp; Loss overview across all departments</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                        {/* Period Switcher */}
                        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
                            {(['monthly', 'quarterly', 'yearly'] as ViewPeriod[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setViewPeriod(p)}
                                    className={`px-3 py-1 rounded text-sm font-medium capitalize transition ${viewPeriod === p ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>

                        {/* Export Excel Button */}
                        <button
                            onClick={handleExportExcel}
                            disabled={loading || exportingExcel}
                            className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download formatted Excel sheet"
                        >
                            {exportingExcel ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" /> Exporting...</>
                            ) : (
                                <><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel</>
                            )}
                        </button>

                        {/* Print / PDF Button */}
                        <button
                            onClick={handlePrintPDF}
                            disabled={loading}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Open printable report with hospital letterhead"
                        >
                            <Printer className="h-3.5 w-3.5" /> Print / PDF
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-6 print:grid-cols-5 print:gap-2">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 print:shadow-none print:border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Revenue (Billed)</p>
                        <p className="text-2xl font-bold text-green-700">{fmt(totalRevenue)}</p>
                        <p className="text-xs text-gray-400 mt-1">Bills created incl. outstanding</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 print:shadow-none print:border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Collection (Received)</p>
                        <p className="text-2xl font-bold text-teal-700">{fmt(totalCollection)}</p>
                        <p className="text-xs text-gray-400 mt-1">Cash actually received</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 print:shadow-none print:border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
                        <p className="text-2xl font-bold text-red-700">{fmt(totalExpenses)}</p>
                        <p className="text-xs text-gray-400 mt-1">Approved &amp; paid expenses</p>
                    </div>
                    <div className={`rounded-lg shadow-sm border p-4 print:shadow-none ${allTimeNetIncome >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-xs text-gray-500 mb-1">Net Income (All Time)</p>
                        <p className={`text-2xl font-bold ${allTimeNetIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(allTimeNetIncome)}</p>
                        <p className="text-xs text-gray-400 mt-1">Cumulative net balance</p>
                    </div>
                    <div className={`rounded-lg shadow-sm border p-4 print:shadow-none ${netIncome >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-xs text-gray-500 mb-1 capitalize">Net Income (This {viewPeriod === 'monthly' ? 'Month' : viewPeriod === 'quarterly' ? 'Quarter' : 'Year'})</p>
                        <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(netIncome)}</p>
                        <p className="text-xs text-gray-400 mt-1">Period profit / loss</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
                    {/* Revenue Section */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 print:shadow-none print:border-gray-200">
                        <h2 className="font-semibold text-sm mb-3 text-green-700">Revenue by Department</h2>
                        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                            {revByDept.length > 0 ? revByDept.map((dept, i) => {
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
                        <div className="border-t border-gray-100 mt-4 pt-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Today&apos;s Collections</span>
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
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 print:shadow-none print:border-gray-200">
                        <h2 className="font-semibold text-sm mb-3 text-red-700">Expenses by Category</h2>
                        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                            {expByCategory.length > 0 ? expByCategory.map((cat, i) => {
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
                        <div className="border-t border-gray-100 mt-4 pt-3 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Today&apos;s Expenses</span>
                                <span className="font-medium">{fmt(expenseStats?.todayTotal || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 capitalize">this {viewPeriod === 'monthly' ? 'month' : viewPeriod === 'quarterly' ? 'quarter' : 'year'}</span>
                                <span className="font-medium">{fmt(expenseStats?.periodExpenses || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Pending Approval</span>
                                <span className="font-medium text-amber-600">{expenseStats?.pendingApproval || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* P&L Summary Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mt-6 print:shadow-none print:border-gray-200">
                    <h2 className="font-semibold text-sm mb-3">Profit &amp; Loss Summary</h2>
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
                            {revByDept.map((dept, i) => (
                                <tr key={`rev-${i}`} className="border-b">
                                    <td className="p-2 pl-6 text-gray-500">{dept.department || 'Other'}</td>
                                    <td className="p-2 text-right text-gray-600">{fmt(dept.amount)}</td>
                                </tr>
                            ))}
                            <tr className="border-b font-medium text-red-700 mt-2">
                                <td className="p-2">B. Total Expenses</td>
                                <td className="p-2 text-right">{fmt(totalExpenses)}</td>
                            </tr>
                            {expByCategory.map((cat, i) => (
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
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mt-6 print:shadow-none print:border-gray-200">
                        <h2 className="font-semibold text-sm mb-3">Outstanding Aging</h2>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                                <p className="text-xs text-green-600 font-semibold">0-30 Days</p>
                                <p className="text-xl font-bold text-green-700">{fmt(revenueStats.aging.days0to30)}</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
                                <p className="text-xs text-amber-600 font-semibold">30-60 Days</p>
                                <p className="text-xl font-bold text-amber-700">{fmt(revenueStats.aging.days30to60)}</p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
                                <p className="text-xs text-red-600 font-semibold">60+ Days</p>
                                <p className="text-xl font-bold text-red-700">{fmt(revenueStats.aging.days60plus)}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
