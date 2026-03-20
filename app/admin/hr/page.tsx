'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Briefcase, LayoutDashboard, Settings2, Users, UserCheck, Clock,
    FileText, TrendingUp, Loader2, ChevronRight, CalendarClock, BarChart3,
    UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { HRSettingsContent } from './HRSettingsContent';
import { getHRDashboard } from '@/app/actions/hr-actions';

const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminHRHub() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getHRDashboard();
            if (res.success) setStats(res.data);
        } catch (err) {
            console.error('HR load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const maxDeptCount = stats?.departmentBreakdown?.length
        ? Math.max(...stats.departmentBreakdown.map((d: any) => d.count))
        : 1;

    return (
        <ModuleHubLayout
            moduleKey="hr"
            moduleTitle="HR Module"
            moduleDescription="Human resources, payroll, attendance & leave management"
            moduleIcon={<Briefcase className="h-5 w-5" />}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={activeTab === 'dashboard' ? loadData : undefined}
            refreshing={loading}
        >
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {loading && !stats ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <>
                            {/* KPI ROW */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Employees</span>
                                        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                                            <Users className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black text-gray-900">{stats?.totalEmployees ?? 0}</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Active Employees</span>
                                        <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
                                            <UserCheck className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black text-gray-900">{stats?.activeEmployees ?? 0}</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Present Today</span>
                                        <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-lime-600 text-white">
                                            <Clock className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black text-gray-900">{stats?.todayPresent ?? 0}</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pending Leaves</span>
                                        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                                            <FileText className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black text-gray-900">{stats?.pendingLeaves ?? 0}</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recent Hires 30d</span>
                                        <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white">
                                            <TrendingUp className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-black text-gray-900">{stats?.recentHires ?? 0}</p>
                                </div>
                            </div>

                            {/* QUICK ACTIONS */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Link
                                        href="/hr/employees/new"
                                        className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:opacity-90 transition-opacity"
                                    >
                                        <UserPlus className="h-5 w-5" />
                                        <span className="text-sm">Add Employee</span>
                                    </Link>
                                    <Link
                                        href="/hr/attendance"
                                        className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:opacity-90 transition-opacity"
                                    >
                                        <CalendarClock className="h-5 w-5" />
                                        <span className="text-sm">Mark Attendance</span>
                                    </Link>
                                    <Link
                                        href="/hr/leave"
                                        className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:opacity-90 transition-opacity"
                                    >
                                        <FileText className="h-5 w-5" />
                                        <span className="text-sm">View Leaves</span>
                                    </Link>
                                </div>
                            </div>

                            {/* DEPARTMENT BREAKDOWN */}
                            {stats?.departmentBreakdown?.length > 0 && (
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <BarChart3 className="h-4 w-4 text-gray-400" />
                                        <h3 className="text-sm font-bold text-gray-900">Department Breakdown</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {stats.departmentBreakdown.map((d: any) => (
                                            <div key={d.dept} className="flex items-center gap-3">
                                                <span className="text-xs font-semibold text-gray-600 w-32 truncate">{d.dept}</span>
                                                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-500"
                                                        style={{ width: `${Math.max((d.count / maxDeptCount) * 100, 4)}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-black text-gray-900 w-10 text-right">{d.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* QUICK LINKS */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Links</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Link
                                        href="/hr/shifts"
                                        className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-5 transition-all flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-xl">
                                                <Clock className="h-5 w-5 text-blue-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Shift Management</h4>
                                                <p className="text-xs text-gray-400">Manage shift patterns & rosters</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                    </Link>

                                    <Link
                                        href="/hr/reports"
                                        className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-5 transition-all flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-violet-50 rounded-xl">
                                                <BarChart3 className="h-5 w-5 text-violet-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">HR Reports</h4>
                                                <p className="text-xs text-gray-400">Attendance, leave & payroll analytics</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
                                    </Link>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'settings' && <HRSettingsContent />}
        </ModuleHubLayout>
    );
}
