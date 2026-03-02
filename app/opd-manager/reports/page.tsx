'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    BarChart3, Loader2, Clock, Users, CalendarCheck,
    CheckCircle2, AlertTriangle, TrendingUp, Activity,
    UserCheck, Stethoscope, ArrowUpRight
} from 'lucide-react';
import {
    getOPDManagerDashboard,
    getWaitTimeAnalytics,
    getDoctorUtilization,
} from '@/app/actions/opd-manager-actions';

export default function OPDManagerReportsPage() {
    const [dashboard, setDashboard] = useState<any>(null);
    const [waitTimes, setWaitTimes] = useState<any[]>([]);
    const [utilization, setUtilization] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        const [dashRes, waitRes, utilRes] = await Promise.all([
            getOPDManagerDashboard(),
            getWaitTimeAnalytics(),
            getDoctorUtilization(),
        ]);
        if (dashRes.success) setDashboard(dashRes.data);
        if (waitRes.success) setWaitTimes(waitRes.data || []);
        if (utilRes.success) setUtilization(utilRes.data || []);
        setRefreshing(false);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Derived stats
    const totalPatientsSeen = dashboard?.completedCount || 0;
    const totalCheckedIn = dashboard?.checkedInCount || 0;
    const totalPending = dashboard?.pendingCount || 0;
    const totalFootfall = dashboard?.totalAppointments || 0;
    const completionRate = totalFootfall > 0 ? Math.round((totalPatientsSeen / totalFootfall) * 100) : 0;
    const noShowRate = totalFootfall > 0 ? Math.round(((dashboard?.noShowCount || 0) / totalFootfall) * 100) : 0;

    // Overall avg wait from departments
    const overallAvgWait = waitTimes.length > 0
        ? Math.round(waitTimes.reduce((s, d) => s + d.avgWait * d.patientCount, 0) / Math.max(waitTimes.reduce((s, d) => s + d.patientCount, 0), 1))
        : 0;

    // Find max wait time
    const maxWaitDept = waitTimes.length > 0
        ? waitTimes.reduce((prev, curr) => curr.avgWait > prev.avgWait ? curr : prev)
        : null;

    // Peak hours placeholder data
    const peakHours = [
        { hour: '8 AM', label: 'Early Morning', load: 15 },
        { hour: '9 AM', label: 'Morning', load: 45 },
        { hour: '10 AM', label: 'Mid Morning', load: 80 },
        { hour: '11 AM', label: 'Late Morning', load: 95 },
        { hour: '12 PM', label: 'Noon', load: 60 },
        { hour: '1 PM', label: 'Afternoon', load: 35 },
        { hour: '2 PM', label: 'Afternoon', load: 55 },
        { hour: '3 PM', label: 'Afternoon', load: 70 },
        { hour: '4 PM', label: 'Late Afternoon', load: 50 },
        { hour: '5 PM', label: 'Evening', load: 25 },
    ];

    if (loading) {
        return (
            <AppShell pageTitle="OPD Reports" pageIcon={<BarChart3 className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Generating reports...</span>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle="OPD Reports & Analytics"
            pageIcon={<BarChart3 className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            {/* Footfall Stats */}
            <div className="mb-6">
                <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" /> Today's Footfall Summary
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Footfall</span>
                            <CalendarCheck className="h-4 w-4 text-indigo-400" />
                        </div>
                        <p className="text-2xl font-black text-gray-900">{totalFootfall}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Checked In</span>
                            <UserCheck className="h-4 w-4 text-teal-400" />
                        </div>
                        <p className="text-2xl font-black text-teal-600">{totalCheckedIn}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">In Progress</span>
                            <Activity className="h-4 w-4 text-violet-400" />
                        </div>
                        <p className="text-2xl font-black text-violet-600">{dashboard?.inProgressCount || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed</span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        </div>
                        <p className="text-2xl font-black text-emerald-600">{totalPatientsSeen}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completion Rate</span>
                            <ArrowUpRight className="h-4 w-4 text-blue-400" />
                        </div>
                        <p className={`text-2xl font-black ${completionRate >= 70 ? 'text-emerald-600' : completionRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{completionRate}%</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">No-Show Rate</span>
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                        </div>
                        <p className={`text-2xl font-black ${noShowRate <= 5 ? 'text-emerald-600' : noShowRate <= 15 ? 'text-amber-600' : 'text-red-600'}`}>{noShowRate}%</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Wait Time Analysis Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-500" /> Wait Time Analysis
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Overall Avg:</span>
                            <span className={`text-sm font-black ${
                                overallAvgWait > 30 ? 'text-red-600' :
                                overallAvgWait > 15 ? 'text-amber-600' :
                                'text-emerald-600'
                            }`}>{overallAvgWait}m</span>
                        </div>
                    </div>
                    {waitTimes.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                    <tr>
                                        <th className="px-6 py-3">Department</th>
                                        <th className="px-6 py-3 text-center">Patients</th>
                                        <th className="px-6 py-3 text-center">Avg Wait</th>
                                        <th className="px-6 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {waitTimes.sort((a, b) => b.avgWait - a.avgWait).map((dept, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-3">
                                                <p className="font-bold text-gray-900">{dept.department}</p>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <span className="font-black text-gray-900">{dept.patientCount}</span>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`font-black ${
                                                    dept.avgWait > 30 ? 'text-red-600' :
                                                    dept.avgWait > 15 ? 'text-amber-600' :
                                                    'text-emerald-600'
                                                }`}>{dept.avgWait}m</span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full ${
                                                    dept.avgWait > 30 ? 'bg-red-100 text-red-700' :
                                                    dept.avgWait > 15 ? 'bg-amber-100 text-amber-700' :
                                                    'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                    {dept.avgWait > 30 ? 'High' : dept.avgWait > 15 ? 'Moderate' : 'Normal'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-gray-400">
                            <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm font-medium">No wait time data available yet</p>
                            <p className="text-xs text-gray-300 mt-1">Data populates as patients check in</p>
                        </div>
                    )}

                    {/* Bottleneck alert */}
                    {maxWaitDept && maxWaitDept.avgWait > 20 && (
                        <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-700 font-medium">
                                Bottleneck detected: <span className="font-bold">{maxWaitDept.department}</span> has the longest average wait at <span className="font-bold">{maxWaitDept.avgWait}m</span>
                            </p>
                        </div>
                    )}
                </div>

                {/* Peak Hours Placeholder */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-indigo-500" /> Peak Hours (Estimated)
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full uppercase">Today</span>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {peakHours.map((slot) => (
                                <div key={slot.hour} className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-gray-500 w-12 text-right shrink-0">{slot.hour}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                        <div
                                            className={`h-5 rounded-full transition-all duration-700 flex items-center justify-end pr-2 ${
                                                slot.load >= 80 ? 'bg-gradient-to-r from-red-400 to-red-500' :
                                                slot.load >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                            }`}
                                            style={{ width: `${slot.load}%` }}
                                        >
                                            {slot.load >= 30 && (
                                                <span className="text-[10px] font-black text-white">{slot.load}%</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-4 justify-center">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Low</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500" />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Moderate</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-400 to-red-500" />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">High</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400 text-center mt-2">
                                Peak hour analysis is estimated based on typical OPD patterns. Real-time data integration coming soon.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Doctor Performance Summary */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-teal-500" /> Doctor Performance Summary
                    </h3>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{utilization.length} active doctors</span>
                </div>
                {utilization.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                <tr>
                                    <th className="px-6 py-3">Doctor</th>
                                    <th className="px-6 py-3">Specialty</th>
                                    <th className="px-6 py-3 text-center">Booked</th>
                                    <th className="px-6 py-3 text-center">Completed</th>
                                    <th className="px-6 py-3 text-center">Slots</th>
                                    <th className="px-6 py-3">Utilization</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {[...utilization]
                                    .sort((a, b) => b.utilizationPct - a.utilizationPct)
                                    .map((doc) => (
                                    <tr key={doc.doctorId} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-3">
                                            <p className="font-bold text-gray-900">{doc.doctorName}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{doc.specialty}</span>
                                        </td>
                                        <td className="px-6 py-3 text-center font-black text-gray-900">{doc.totalAppointments}</td>
                                        <td className="px-6 py-3 text-center font-black text-emerald-600">{doc.completedAppointments}</td>
                                        <td className="px-6 py-3 text-center font-black text-blue-600">{doc.totalSlots}</td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[120px]">
                                                    <div
                                                        className={`h-2 rounded-full transition-all ${
                                                            doc.utilizationPct >= 70 ? 'bg-emerald-500' :
                                                            doc.utilizationPct >= 40 ? 'bg-amber-500' :
                                                            'bg-red-400'
                                                        }`}
                                                        style={{ width: `${Math.min(doc.utilizationPct, 100)}%` }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-black w-10 text-right ${
                                                    doc.utilizationPct >= 70 ? 'text-emerald-600' :
                                                    doc.utilizationPct >= 40 ? 'text-amber-600' :
                                                    'text-red-600'
                                                }`}>{doc.utilizationPct}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-400">
                        <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm font-medium">No doctor performance data yet</p>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
