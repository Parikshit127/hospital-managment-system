'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Stethoscope, Clock, Activity, CheckCircle2, Loader2,
    Users, Phone, Eye, Filter,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { getOPDDashboardStats, getTodaysAppointments } from '@/app/actions/opd-actions';
import { checkInPatient } from '@/app/actions/reception-actions';

type Appointment = {
    id: string;
    appointment_id: string;
    patient_id: string;
    patient_name: string;
    age?: number | null;
    gender?: string | null;
    phone?: string | null;
    department?: string | null;
    doctor_name?: string | null;
    status: string;
    reason_for_visit?: string | null;
    appointment_date: string;
};

type Stats = {
    totalToday: number;
    pending: number;
    inProgress: number;
    completed: number;
    byDepartment: { department: string; count: number }[];
};

const STATUS_FILTERS = ['All', 'Waiting', 'In Progress', 'Completed'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getStatusBadge(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'in progress') return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (s === 'completed') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (s === 'cancelled' || s === 'no show') return 'bg-red-50 text-red-700 border border-red-200';
    // pending / scheduled / checked in
    return 'bg-amber-50 text-amber-700 border border-amber-200';
}

const statusToApiParam: Record<StatusFilter, string | undefined> = {
    'All': undefined,
    'Waiting': 'Pending',
    'In Progress': 'In Progress',
    'Completed': 'Completed',
};

export default function OPDPatientsPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [checkingIn, setCheckingIn] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, apptRes] = await Promise.all([
                getOPDDashboardStats(),
                getTodaysAppointments({
                    status: statusToApiParam[statusFilter],
                    department: departmentFilter || undefined,
                }),
            ]);
            if (statsRes.success && statsRes.data) setStats(statsRes.data as Stats);
            if (apptRes.success) setAppointments((apptRes.data || []) as Appointment[]);
        } catch (err) {
            console.error('OPD load error:', err);
        }
        setLoading(false);
    }, [statusFilter, departmentFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCheckIn = async (appointmentId: string) => {
        setCheckingIn(appointmentId);
        try {
            const res = await checkInPatient(appointmentId);
            if (res.success) await loadData();
        } catch (err) {
            console.error('Check-in error:', err);
        }
        setCheckingIn(null);
    };

    const isCheckInEligible = (status: string) =>
        ['pending', 'scheduled'].includes(status?.toLowerCase());

    const headerActions = (
        <Link
            href="/reception/appointments"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
        >
            <Stethoscope className="h-3.5 w-3.5" /> New Appointment
        </Link>
    );

    return (
        <AppShell
            pageTitle="OPD Patients"
            pageIcon={<Stethoscope className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">

                {/* PAGE HEADER */}
                <div>
                    <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Stethoscope className="h-5 w-5 text-emerald-500" />
                        OPD Patients
                    </h1>
                    <p className="text-xs text-gray-400 mt-0.5">Today&apos;s outpatient appointments</p>
                </div>

                {/* KPI CARDS */}
                {loading && !stats ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse h-20" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white border-l-4 border-l-emerald-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Today</span>
                                <div className="p-1.5 bg-emerald-50 rounded-lg">
                                    <Users className="h-3.5 w-3.5 text-emerald-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.totalToday ?? 0}</p>
                        </div>

                        <div className="bg-white border-l-4 border-l-amber-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Waiting</span>
                                <div className="p-1.5 bg-amber-50 rounded-lg">
                                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.pending ?? 0}</p>
                        </div>

                        <div className="bg-white border-l-4 border-l-blue-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">In Progress</span>
                                <div className="p-1.5 bg-blue-50 rounded-lg">
                                    <Activity className="h-3.5 w-3.5 text-blue-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.inProgress ?? 0}</p>
                        </div>

                        <div className="bg-white border-l-4 border-l-green-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Completed</span>
                                <div className="p-1.5 bg-green-50 rounded-lg">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.completed ?? 0}</p>
                        </div>
                    </div>
                )}

                {/* FILTER BAR */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Status filter pills */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {STATUS_FILTERS.map(f => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    statusFilter === f
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Department dropdown */}
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={departmentFilter}
                            onChange={e => setDepartmentFilter(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-700 focus:outline-none focus:border-emerald-500"
                        >
                            <option value="">All Departments</option>
                            {stats?.byDepartment.map(d => (
                                <option key={d.department} value={d.department}>
                                    {d.department} ({d.count})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* APPOINTMENTS TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50/60">
                                    {[
                                        'Patient Name', 'UHID', 'Age / Gender', 'Phone',
                                        'Doctor', 'Department', 'Time', 'Status', 'Actions',
                                    ].map(h => (
                                        <th
                                            key={h}
                                            className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={`skel-${i}`}>
                                            {Array.from({ length: 9 }).map((_, c) => (
                                                <td key={c} className="px-4 py-3.5">
                                                    <div className="h-2.5 bg-gray-100 rounded animate-pulse" style={{ width: c === 0 ? '70%' : c === 8 ? '4rem' : '55%' }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : appointments.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-16">
                                            <Stethoscope className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                                            <p className="text-sm font-medium text-gray-400">No appointments found</p>
                                            <p className="text-xs text-gray-300 mt-1">Try adjusting your filters</p>
                                        </td>
                                    </tr>
                                ) : (
                                    appointments.map(appt => (
                                        <tr key={appt.id} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                                                {appt.patient_name}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-mono font-bold text-emerald-600">
                                                    {appt.appointment_id}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {appt.age ?? '-'} / {appt.gender ?? '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {appt.phone ? (
                                                    <span className="flex items-center gap-1">
                                                        <Phone className="h-3 w-3 flex-shrink-0" />
                                                        {appt.phone}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                {appt.doctor_name ?? '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {appt.department ?? '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                                {formatTime(appt.appointment_date)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${getStatusBadge(appt.status)}`}>
                                                    {appt.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {isCheckInEligible(appt.status) && (
                                                        <button
                                                            onClick={() => handleCheckIn(appt.id)}
                                                            disabled={checkingIn === appt.id}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            {checkingIn === appt.id ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="h-3 w-3" />
                                                            )}
                                                            Check In
                                                        </button>
                                                    )}
                                                    <Link
                                                        href={`/reception/patient/${appt.patient_id}`}
                                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-emerald-600 transition-colors"
                                                        title="View patient"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
