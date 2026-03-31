'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Calendar, Clock, Users, Activity, UserPlus, Filter,
    Loader2, Stethoscope, Phone, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { SkeletonCard, Skeleton } from '@/app/components/ui/Skeleton';
import { getOPDDashboardStats, getTodaysAppointments } from '@/app/actions/opd-actions';

export default function OPDDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [deptFilter, setDeptFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, apptRes] = await Promise.all([
                getOPDDashboardStats(),
                getTodaysAppointments({ department: deptFilter || undefined, status: statusFilter || undefined }),
            ]);
            if (statsRes.success) setStats(statsRes.data);
            if (apptRes.success) setAppointments(apptRes.data || []);
        } catch (err) {
            console.error('OPD load error:', err);
        }
        setLoading(false);
    }, [deptFilter, statusFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            'Pending': 'bg-amber-50 text-amber-700 border border-amber-200',
            'Scheduled': 'bg-blue-50 text-blue-700 border border-blue-200',
            'Checked In': 'bg-teal-50 text-teal-700 border border-teal-200',
            'In Progress': 'bg-violet-50 text-violet-700 border border-violet-200',
            'Completed': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            'Cancelled': 'bg-gray-100 text-gray-500 border border-gray-200',
            'Admitted': 'bg-rose-50 text-rose-700 border border-rose-200',
        };
        return map[status] || 'bg-gray-100 text-gray-500';
    };

    const headerActions = (
        <Link href="/reception/register"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all">
            <UserPlus className="h-3.5 w-3.5" /> Register Patient
        </Link>
    );

    return (
        <AppShell
            pageTitle="OPD Dashboard"
            pageIcon={<Stethoscope className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">
                {/* KPI ROW */}
                {loading && !stats ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : null}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ display: loading && !stats ? 'none' : undefined }}>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Today</span>
                            <div className="p-1.5 bg-blue-50 rounded-lg"><Calendar className="h-3.5 w-3.5 text-blue-500" /></div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats?.totalToday || 0}</p>
                        <p className="text-xs text-gray-400 mt-1">Appointments</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Waiting</span>
                            <div className="p-1.5 bg-amber-50 rounded-lg"><Clock className="h-3.5 w-3.5 text-amber-500" /></div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats?.pending || 0}</p>
                        <p className="text-xs text-gray-400 mt-1">In queue</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">In Progress</span>
                            <div className="p-1.5 bg-violet-50 rounded-lg"><Activity className="h-3.5 w-3.5 text-violet-500" /></div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats?.inProgress || 0}</p>
                        <p className="text-xs text-gray-400 mt-1">With doctors</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Completed</span>
                            <div className="p-1.5 bg-emerald-50 rounded-lg"><Users className="h-3.5 w-3.5 text-emerald-500" /></div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats?.completed || 0}</p>
                        <p className="text-xs text-gray-400 mt-1">Consultations done</p>
                    </div>
                </div>

                {/* DEPARTMENT QUEUE COUNTS */}
                {stats?.byDepartment?.length > 0 && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                        <h3 className="text-sm font-bold text-gray-900 mb-4">Department-wise Queue</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {stats.byDepartment.map((dept: any) => (
                                <button
                                    key={dept.department}
                                    onClick={() => setDeptFilter(deptFilter === dept.department ? '' : dept.department)}
                                    className={`p-3 rounded-xl border text-center transition-all ${deptFilter === dept.department
                                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <p className="text-xl font-black text-gray-900">{dept.count}</p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-1">{dept.department}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* FILTERS */}
                <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-gray-400" />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                    >
                        <option value="">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Checked In">Checked In</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                    </select>
                    {(deptFilter || statusFilter) && (
                        <button
                            onClick={() => { setDeptFilter(''); setStatusFilter(''); }}
                            className="text-xs font-medium text-blue-600 hover:underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {/* APPOINTMENTS TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900">Today&apos;s Appointments</h3>
                        <span className="text-xs text-gray-400">{appointments.length} records</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Time', 'Patient', 'Age/Gender', 'Department', 'Doctor', 'Reason', 'Status'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <>
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <tr key={`sk-${i}`} className="border-b border-gray-50">
                                                {Array.from({ length: 7 }).map((_, c) => (
                                                    <td key={c} className="px-4 py-3.5">
                                                        <Skeleton width={c === 1 ? '70%' : '60%'} height="0.625rem" />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </>
                                ) : appointments.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-16">
                                            <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-400 text-sm font-medium">No appointments found</p>
                                        </td>
                                    </tr>
                                ) : appointments.map((appt: any) => (
                                    <tr key={appt.appointment_id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                            {new Date(appt.appointment_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div>
                                                <span className="font-medium text-gray-900">{appt.patient_name}</span>
                                                <span className="block text-[10px] font-mono text-gray-400">{appt.patient_id}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {appt.age || '-'} / {appt.gender || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{appt.department || 'General'}</td>
                                        <td className="px-4 py-3 text-gray-500">{appt.doctor_name || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">{appt.reason_for_visit || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusColor(appt.status)}`}>
                                                {appt.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* QUICK LINKS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link href="/reception/register"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-300 transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-xl"><UserPlus className="h-5 w-5 text-blue-500" /></div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Register Patient</h4>
                                <p className="text-xs text-gray-400">New OPD registration</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                    </Link>
                    <Link href="/reception/triage"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-violet-300 transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-50 rounded-xl"><Activity className="h-5 w-5 text-violet-500" /></div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">AI Triage</h4>
                                <p className="text-xs text-gray-400">Smart intake & routing</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500" />
                    </Link>
                    <Link href="/doctor/dashboard"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-300 transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-50 rounded-xl"><Stethoscope className="h-5 w-5 text-teal-500" /></div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Doctor Console</h4>
                                <p className="text-xs text-gray-400">Clinical workspace</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500" />
                    </Link>
                </div>
            </div>
        </AppShell>
    );
}
