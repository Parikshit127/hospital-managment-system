'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    DollarSign, FileText, TrendingUp, TrendingDown, Clock, AlertTriangle,
    Loader2, Wallet, Receipt, BarChart3, ArrowUpRight, LayoutDashboard,
    Settings2, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { getFinanceDashboardStats } from '@/app/actions/finance-actions';
import { getExpenseDashboardStats } from '@/app/actions/expense-actions';
import { getDepositStats } from '@/app/actions/deposit-actions';

const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'settings', label: 'Settings', icon: Settings2 },
];

const DEPT_COLORS = [
    'from-blue-500 to-blue-400',
    'from-emerald-500 to-emerald-400',
    'from-violet-500 to-violet-400',
    'from-amber-500 to-amber-400',
    'from-rose-500 to-rose-400',
    'from-cyan-500 to-cyan-400',
    'from-indigo-500 to-indigo-400',
    'from-teal-500 to-teal-400',
];

export default function AdminFinanceHub() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [financeStats, setFinanceStats] = useState<any>(null);
    const [expenseStats, setExpenseStats] = useState<any>(null);
    const [depositStats, setDepositStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [finRes, expRes, depRes] = await Promise.all([
                getFinanceDashboardStats(),
                getExpenseDashboardStats(),
                getDepositStats(),
            ]);
            if (finRes.success) setFinanceStats(finRes.data);
            if (expRes.success) setExpenseStats(expRes.data);
            if (depRes.success) setDepositStats(depRes.data);
        } catch (err) {
            console.error('Finance load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const fmt = (v: number) => `${(v / 1000).toFixed(1)}K`;

    // Revenue by department: find max for bar scaling
    const deptData = financeStats?.revenueByDepartment || [];
    const maxDeptRevenue = Math.max(...deptData.map((d: any) => d.amount), 1);

    // Aging totals
    const agingTotal =
        (financeStats?.aging?.days0to30 || 0) +
        (financeStats?.aging?.days30to60 || 0) +
        (financeStats?.aging?.days60plus || 0) || 1;

    return (
        <ModuleHubLayout
            moduleKey="finance"
            moduleTitle="Finance Module"
            moduleDescription="Billing, invoicing, payments & revenue management"
            moduleIcon={<DollarSign className="h-5 w-5" />}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={activeTab === 'dashboard' ? loadData : undefined}
            refreshing={loading}
        >
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {loading && !financeStats ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                        </div>
                    ) : (
                        <>
                            {/* KPI ROW */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                {/* Today's Revenue */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Today&apos;s Revenue</span>
                                        <div className="p-1.5 bg-emerald-50 rounded-lg">
                                            <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">
                                        {'\u20B9'}{fmt(financeStats?.todayRevenue || 0)}
                                    </p>
                                    <p className="text-xs font-bold text-emerald-600 mt-1">
                                        {financeStats?.totalPaymentsToday || 0} payments today
                                    </p>
                                </div>

                                {/* Total Revenue */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Total Revenue</span>
                                        <div className="p-1.5 bg-teal-50 rounded-lg">
                                            <Wallet className="h-3.5 w-3.5 text-teal-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">
                                        {'\u20B9'}{fmt(financeStats?.totalRevenue || 0)}
                                    </p>
                                    <p className="text-xs font-bold text-teal-600 mt-1">
                                        {financeStats?.totalInvoices || 0} invoices
                                    </p>
                                </div>

                                {/* Expenses (Month) */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Expenses (Month)</span>
                                        <div className="p-1.5 bg-red-50 rounded-lg">
                                            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">
                                        {'\u20B9'}{fmt(expenseStats?.thisMonthTotal || 0)}
                                    </p>
                                    <p className="text-xs font-bold text-red-600 mt-1">
                                        {expenseStats?.pendingApproval || 0} pending approval
                                    </p>
                                </div>

                                {/* Outstanding */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Outstanding</span>
                                        <div className="p-1.5 bg-amber-50 rounded-lg">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">
                                        {'\u20B9'}{fmt(financeStats?.pendingBalance || 0)}
                                    </p>
                                    <p className="text-xs font-bold text-amber-600 mt-1">
                                        {financeStats?.outstandingInvoices || 0} invoices
                                    </p>
                                </div>

                                {/* Draft Bills */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Draft Bills</span>
                                        <div className="p-1.5 bg-violet-50 rounded-lg">
                                            <FileText className="h-3.5 w-3.5 text-violet-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">
                                        {financeStats?.draftInvoices || 0}
                                    </p>
                                    <p className="text-xs font-bold text-violet-600 mt-1">
                                        Awaiting finalization
                                    </p>
                                </div>

                                {/* Active Deposits */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Active Deposits</span>
                                        <div className="p-1.5 bg-cyan-50 rounded-lg">
                                            <Wallet className="h-3.5 w-3.5 text-cyan-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">
                                        {'\u20B9'}{fmt(depositStats?.activeBalance || 0)}
                                    </p>
                                    <p className="text-xs font-bold text-cyan-600 mt-1">
                                        {depositStats?.activeDeposits || 0} active
                                    </p>
                                </div>
                            </div>

                            {/* REVENUE BY DEPARTMENT */}
                            {deptData.length > 0 && (
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-5">
                                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4 text-gray-400" />
                                            Revenue by Department
                                        </h3>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                                            All Time
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        {deptData.map((dept: any, idx: number) => {
                                            const pct = (dept.amount / maxDeptRevenue) * 100;
                                            const gradient = DEPT_COLORS[idx % DEPT_COLORS.length];
                                            return (
                                                <div key={dept.department || idx}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-semibold text-gray-700">
                                                            {dept.department || 'Uncategorized'}
                                                        </span>
                                                        <span className="text-xs font-bold text-gray-900">
                                                            {'\u20B9'}{dept.amount.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* OUTSTANDING AGING REPORT */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-gray-400" />
                                        Outstanding Aging Report
                                    </h3>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                                        Receivables
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* 0-30 days */}
                                    <div className="border border-emerald-100 bg-emerald-50/30 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.15em]">0 - 30 Days</span>
                                            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900">
                                            {'\u20B9'}{fmt(financeStats?.aging?.days0to30 || 0)}
                                        </p>
                                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                                                style={{ width: `${((financeStats?.aging?.days0to30 || 0) / agingTotal) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* 30-60 days */}
                                    <div className="border border-amber-100 bg-amber-50/30 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-[0.15em]">30 - 60 Days</span>
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900">
                                            {'\u20B9'}{fmt(financeStats?.aging?.days30to60 || 0)}
                                        </p>
                                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
                                                style={{ width: `${((financeStats?.aging?.days30to60 || 0) / agingTotal) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* 60+ days */}
                                    <div className="border border-rose-100 bg-rose-50/30 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-[0.15em]">60+ Days</span>
                                            <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900">
                                            {'\u20B9'}{fmt(financeStats?.aging?.days60plus || 0)}
                                        </p>
                                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400"
                                                style={{ width: `${((financeStats?.aging?.days60plus || 0) / agingTotal) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* QUICK LINKS */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Link href="/finance/invoices"
                                    className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-emerald-300 transition-all flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-50 rounded-xl">
                                            <Receipt className="h-5 w-5 text-emerald-500" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">Invoices</h4>
                                            <p className="text-xs text-gray-400">Create & manage bills</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500" />
                                </Link>
                                <Link href="/finance/collections"
                                    className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-300 transition-all flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 rounded-xl">
                                            <DollarSign className="h-5 w-5 text-blue-500" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">Collections</h4>
                                            <p className="text-xs text-gray-400">Payment collection desk</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                                </Link>
                                <Link href="/finance/expenses"
                                    className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-rose-300 transition-all flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-rose-50 rounded-xl">
                                            <TrendingDown className="h-5 w-5 text-rose-500" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">Expenses</h4>
                                            <p className="text-xs text-gray-400">Track & approve expenses</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-rose-500" />
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-4">
                    <Link
                        href="/finance/invoices"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-emerald-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 rounded-xl">
                                <Receipt className="h-6 w-6 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Billing & Invoice Settings</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Invoice templates, tax rules, payment methods & Razorpay</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                    </Link>
                    <Link
                        href="/finance/expenses"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-rose-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-rose-50 rounded-xl">
                                <TrendingDown className="h-6 w-6 text-rose-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Expense Configuration</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Expense categories, approval workflows & budgets</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-rose-500 transition-colors" />
                    </Link>
                </div>
            )}
        </ModuleHubLayout>
    );
}
