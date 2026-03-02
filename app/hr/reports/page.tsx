'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    BarChart3, Loader2, Users, Clock, CalendarDays, Briefcase
} from 'lucide-react';
import { getHRDashboard, getEmployeeList } from '@/app/actions/hr-actions';

export default function HRReportsPage() {
    const [dashboard, setDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getHRDashboard();
            if (res.success) setDashboard(res.data);
        } catch (e) { console.error(e); }
        finally { setRefreshing(false); setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <AppShell pageTitle="HR Reports" pageIcon={<BarChart3 className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Generating reports...</span>
                </div>
            </AppShell>
        );
    }

    const data = dashboard || {};
    const deptBreakdown = data.departmentBreakdown || [];
    const maxDeptCount = Math.max(...deptBreakdown.map((d: any) => d.count), 1);
    const attendanceRate = data.activeEmployees > 0
        ? Math.round((data.todayPresent / data.activeEmployees) * 100)
        : 0;

    return (
        <AppShell pageTitle="HR Reports & Analytics" pageIcon={<BarChart3 className="h-5 w-5" />}
            onRefresh={loadData} refreshing={refreshing}>
            <div className="space-y-6">
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Staff</span>
                            <Users className="h-4 w-4 text-indigo-400" />
                        </div>
                        <p className="text-2xl font-black text-gray-900">{data.totalEmployees || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Active</span>
                            <Users className="h-4 w-4 text-emerald-400" />
                        </div>
                        <p className="text-2xl font-black text-emerald-600">{data.activeEmployees || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today Present</span>
                            <Clock className="h-4 w-4 text-teal-400" />
                        </div>
                        <p className="text-2xl font-black text-teal-600">{data.todayPresent || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Attendance %</span>
                            <BarChart3 className="h-4 w-4 text-blue-400" />
                        </div>
                        <p className={`text-2xl font-black ${attendanceRate >= 80 ? 'text-emerald-600' : attendanceRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {attendanceRate}%
                        </p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pending Leaves</span>
                            <CalendarDays className="h-4 w-4 text-amber-400" />
                        </div>
                        <p className="text-2xl font-black text-amber-600">{data.pendingLeaves || 0}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Department Headcount Chart */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-indigo-500" /> Department Headcount
                            </h3>
                        </div>
                        {deptBreakdown.length > 0 ? (
                            <div className="p-6 space-y-3">
                                {deptBreakdown.sort((a: any, b: any) => b.count - a.count).map((dept: any, idx: number) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-gray-600 w-28 text-right truncate shrink-0">{dept.dept}</span>
                                        <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                                            <div
                                                className="h-6 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 flex items-center justify-end pr-2 transition-all duration-500"
                                                style={{ width: `${Math.max((dept.count / maxDeptCount) * 100, 10)}%` }}>
                                                <span className="text-[10px] font-black text-white">{dept.count}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-12 text-center text-gray-400">
                                <Briefcase className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                <p className="font-medium text-sm">No department data available</p>
                            </div>
                        )}
                    </div>

                    {/* Attendance Overview */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-teal-500" /> Attendance Overview
                            </h3>
                        </div>
                        <div className="p-6">
                            {/* Attendance Donut */}
                            <div className="flex items-center justify-center gap-8 mb-6">
                                <div className="relative h-32 w-32">
                                    <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
                                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                                        <circle cx="18" cy="18" r="15.9" fill="none"
                                            stroke={attendanceRate >= 80 ? '#10b981' : attendanceRate >= 60 ? '#f59e0b' : '#ef4444'}
                                            strokeWidth="3"
                                            strokeDasharray={`${attendanceRate}, 100`}
                                            strokeLinecap="round" />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-2xl font-black text-gray-900">{attendanceRate}%</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-emerald-500" />
                                        <span className="text-xs text-gray-600">Present: <strong>{data.todayPresent || 0}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-red-400" />
                                        <span className="text-xs text-gray-600">Absent: <strong>{(data.activeEmployees || 0) - (data.todayPresent || 0)}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-amber-400" />
                                        <span className="text-xs text-gray-600">Pending Leaves: <strong>{data.pendingLeaves || 0}</strong></span>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Hires */}
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">New Hires (30 days)</span>
                                    <span className="text-lg font-black text-indigo-600">{data.recentHires || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Print-friendly notice */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-400 font-medium">
                        Use your browser's print function (Ctrl+P / Cmd+P) to export this report as PDF
                    </p>
                </div>
            </div>
        </AppShell>
    );
}
