'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    LayoutDashboard, Users, UserCheck, Clock, FileText,
    UserPlus, CalendarCheck, ClipboardList, Loader2, AlertCircle,
    TrendingUp, Briefcase
} from 'lucide-react';
import { getHRDashboard } from '@/app/actions/hr-actions';
import Link from 'next/link';

interface DashboardData {
    totalEmployees: number;
    activeEmployees: number;
    todayPresent: number;
    pendingLeaves: number;
    recentHires: number;
    departmentBreakdown: { dept: string; count: number }[];
}

export default function HRDashboard() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await getHRDashboard();
            if (res.success && res.data) {
                setData(res.data as DashboardData);
            } else {
                setError(true);
            }
        } catch {
            setError(true);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <AppShell pageTitle="HR Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading HR Dashboard...</span>
                </div>
            </AppShell>
        );
    }

    if (error || !data) {
        return (
            <AppShell pageTitle="HR Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex flex-col items-center justify-center py-20">
                    <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                    <p className="text-gray-600 font-bold text-lg">Failed to load dashboard data</p>
                    <button onClick={loadData} className="mt-4 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-shadow">
                        Retry
                    </button>
                </div>
            </AppShell>
        );
    }

    const maxDeptCount = Math.max(...data.departmentBreakdown.map(d => d.count), 1);

    const kpiCards = [
        { label: 'Total Employees', value: data.totalEmployees, icon: Users, color: 'from-blue-500 to-indigo-600' },
        { label: 'Active Employees', value: data.activeEmployees, icon: UserCheck, color: 'from-teal-500 to-emerald-600' },
        { label: 'Present Today', value: data.todayPresent, icon: Clock, color: 'from-green-500 to-lime-600' },
        { label: 'Pending Leaves', value: data.pendingLeaves, icon: FileText, color: 'from-amber-500 to-orange-600' },
        { label: 'Recent Hires (30d)', value: data.recentHires, icon: TrendingUp, color: 'from-purple-500 to-fuchsia-600' },
    ];

    return (
        <AppShell
            pageTitle="HR Dashboard"
            pageIcon={<LayoutDashboard className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                {kpiCards.map((kpi) => (
                    <div key={kpi.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{kpi.label}</p>
                            <div className={`p-2 rounded-xl bg-gradient-to-br ${kpi.color} text-white`}>
                                <kpi.icon className="h-4 w-4" />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <Link
                    href="/hr/employees/new"
                    className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:shadow-lg hover:shadow-teal-500/20 transition-all"
                >
                    <UserPlus className="h-5 w-5" />
                    Add Employee
                </Link>
                <Link
                    href="/hr/attendance"
                    className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:shadow-lg hover:shadow-teal-500/20 transition-all"
                >
                    <CalendarCheck className="h-5 w-5" />
                    Mark Attendance
                </Link>
                <Link
                    href="/hr/leave"
                    className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:shadow-lg hover:shadow-teal-500/20 transition-all"
                >
                    <ClipboardList className="h-5 w-5" />
                    View Leaves
                </Link>
            </div>

            {/* Department Breakdown */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6">
                    <Briefcase className="h-5 w-5 text-teal-600" />
                    <h2 className="text-lg font-black text-gray-900">Department Breakdown</h2>
                </div>
                {data.departmentBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Users className="h-10 w-10 mb-3" />
                        <p className="text-sm font-medium">No department data available</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {data.departmentBreakdown.map((dept) => (
                            <div key={dept.dept} className="flex items-center gap-4">
                                <div className="w-32 sm:w-48 text-sm font-semibold text-gray-700 truncate">{dept.dept}</div>
                                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                                        style={{ width: `${Math.max((dept.count / maxDeptCount) * 100, 8)}%` }}
                                    >
                                        <span className="text-[10px] font-bold text-white">{dept.count}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
