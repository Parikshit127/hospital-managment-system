'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    LayoutDashboard, CalendarCheck, UserCheck, Loader2, Clock,
    CheckCircle2, Users, Activity, AlertTriangle, Stethoscope
} from 'lucide-react';
import {
    getOPDManagerDashboard,
    getDoctorUtilization,
    getWaitTimeAnalytics,
} from '@/app/actions/opd-manager-actions';
import Link from 'next/link';

export default function OPDManagerDashboardPage() {
    const [dashboard, setDashboard] = useState<any>(null);
    const [utilization, setUtilization] = useState<any[]>([]);
    const [waitTimes, setWaitTimes] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        const [dashRes, utilRes, waitRes] = await Promise.all([
            getOPDManagerDashboard(),
            getDoctorUtilization(),
            getWaitTimeAnalytics(),
        ]);
        if (dashRes.success) setDashboard(dashRes.data);
        if (utilRes.success) setUtilization(utilRes.data || []);
        if (waitRes.success) setWaitTimes(waitRes.data || []);
        setRefreshing(false);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const kpis = [
        { label: 'Total Appointments', value: dashboard?.totalAppointments || 0, icon: CalendarCheck, color: 'text-indigo-500', bg: 'bg-indigo-50' },
        { label: 'Checked In', value: dashboard?.checkedInCount || 0, icon: UserCheck, color: 'text-teal-500', bg: 'bg-teal-50' },
        { label: 'In Progress', value: dashboard?.inProgressCount || 0, icon: Activity, color: 'text-violet-500', bg: 'bg-violet-50' },
        { label: 'Completed', value: dashboard?.completedCount || 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { label: 'Avg Wait Time', value: dashboard?.avgWait ? `${dashboard.avgWait}m` : '0m', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
        { label: 'Active Doctors', value: dashboard?.activeDoctors || 0, icon: Stethoscope, color: 'text-blue-500', bg: 'bg-blue-50' },
    ];

    // Sort utilization by percentage descending
    const sortedUtilization = [...utilization].sort((a, b) => b.utilizationPct - a.utilizationPct);

    if (loading) {
        return (
            <AppShell pageTitle="OPD Manager Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading dashboard...</span>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle="OPD Manager Dashboard"
            pageIcon={<LayoutDashboard className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
            headerActions={
                <Link
                    href="/opd-manager/queues"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all"
                >
                    <Activity className="h-3.5 w-3.5" /> Live Queues
                </Link>
            }
        >
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                {kpis.map((kpi, index) => {
                    const Icon = kpi.icon;
                    return (
                        <div key={index} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{kpi.label}</p>
                                <div className={`p-2 rounded-xl ${kpi.bg}`}>
                                    <Icon className={`h-4 w-4 ${kpi.color}`} />
                                </div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{kpi.value}</p>
                        </div>
                    );
                })}
            </div>

            {/* No-show alert banner */}
            {(dashboard?.noShowCount || 0) > 0 && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-xl">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-amber-800">
                            {dashboard.noShowCount} cancellation{dashboard.noShowCount !== 1 ? 's' : ''} today
                        </p>
                        <p className="text-xs text-amber-600">Review the no-show report for details and follow-up actions.</p>
                    </div>
                    <Link
                        href="/opd-manager/appointments"
                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold rounded-lg transition-colors"
                    >
                        View Report
                    </Link>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Doctor Utilization */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-indigo-500" /> Doctor Utilization
                        </h3>
                        <Link href="/opd-manager/doctors" className="text-xs font-bold text-teal-600 hover:text-teal-700">
                            View All
                        </Link>
                    </div>
                    {sortedUtilization.length > 0 ? (
                        <div className="space-y-4">
                            {sortedUtilization.slice(0, 6).map((doc) => (
                                <div key={doc.doctorId}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{doc.doctorName}</p>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">{doc.specialty}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-black text-gray-900">{doc.utilizationPct}%</span>
                                            <p className="text-[10px] text-gray-400">{doc.completedAppointments}/{doc.totalSlots} slots</p>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className={`h-2 rounded-full transition-all duration-500 ${
                                                doc.utilizationPct >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                                                doc.utilizationPct >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                'bg-gradient-to-r from-red-300 to-red-500'
                                            }`}
                                            style={{ width: `${Math.min(doc.utilizationPct, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm font-medium">No doctor data available</p>
                        </div>
                    )}
                </div>

                {/* Wait Time by Department */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-500" /> Wait Time by Department
                        </h3>
                        <Link href="/opd-manager/reports" className="text-xs font-bold text-teal-600 hover:text-teal-700">
                            Full Report
                        </Link>
                    </div>
                    {waitTimes.length > 0 ? (
                        <div className="space-y-3">
                            {waitTimes.sort((a, b) => b.avgWait - a.avgWait).map((dept, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-8 rounded-full ${
                                            dept.avgWait > 30 ? 'bg-red-400' :
                                            dept.avgWait > 15 ? 'bg-amber-400' :
                                            'bg-emerald-400'
                                        }`} />
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{dept.department}</p>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">{dept.patientCount} patient{dept.patientCount !== 1 ? 's' : ''} today</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-lg font-black ${
                                            dept.avgWait > 30 ? 'text-red-600' :
                                            dept.avgWait > 15 ? 'text-amber-600' :
                                            'text-emerald-600'
                                        }`}>{dept.avgWait}m</p>
                                        <p className="text-[10px] text-gray-400">avg wait</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm font-medium">No wait time data yet</p>
                            <p className="text-xs text-gray-300 mt-1">Data populates after patients check in</p>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
