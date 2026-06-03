'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    UserPlus, Calendar, Clock, CheckCircle2, Users, RefreshCw,
    Stethoscope, ChevronRight, Loader2, AlertCircle, Activity,
    Phone, ClipboardList, User,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    getReceptionStats,
    getAllDoctorQueues,
    getTodayCheckInList,
    checkInPatient,
} from '@/app/actions/reception-actions';

type Stats = { todayRegistrations: number; todayAppointments: number; pendingAppointments: number; completedToday: number; totalPatients: number };
type DoctorQueue = { doctorId: string; doctorName: string; department: string; current: { patientName: string; token: number | null } | null; waiting: { patientName: string; token: number | null }[]; scheduled: { patientName: string }[] };
type Appointment = { appointment_id: string; appointment_date: string; status: string; doctor_name: string | null; department: string | null; reason_for_visit: string | null; patient: { full_name: string; phone: string | null; age: number | null; gender: string | null } | null };

const STATUS_STYLE: Record<string, string> = {
    'Pending': 'bg-amber-50 text-amber-700 border border-amber-200',
    'Scheduled': 'bg-blue-50 text-blue-700 border border-blue-200',
    'Checked In': 'bg-orange-50 text-orange-700 border border-orange-200',
    'In Progress': 'bg-violet-50 text-violet-700 border border-violet-200',
    'Completed': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'Cancelled': 'bg-gray-100 text-gray-500 border border-gray-200',
};

export default function ReceptionDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [queues, setQueues] = useState<DoctorQueue[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [checkingIn, setCheckingIn] = useState<string | null>(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [statsRes, queuesRes, apptRes] = await Promise.all([
            getReceptionStats(),
            getAllDoctorQueues(),
            getTodayCheckInList(),
        ]);
        if (statsRes.success && statsRes.data) setStats(statsRes.data);
        if (queuesRes.success) setQueues((queuesRes.data as DoctorQueue[]) || []);
        if (apptRes.success) setAppointments((apptRes.data as Appointment[]) || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleCheckIn = async (appointmentId: string) => {
        setCheckingIn(appointmentId);
        const res = await checkInPatient(appointmentId);
        if (res.success) {
            setAppointments(prev => prev.map(a =>
                a.appointment_id === appointmentId ? { ...a, status: 'Checked In' } : a
            ));
            setStats(prev => prev ? { ...prev, pendingAppointments: Math.max(0, prev.pendingAppointments - 1) } : prev);
        }
        setCheckingIn(null);
    };

    const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    return (
        <AppShell pageTitle="Reception" pageIcon={<ClipboardList className="h-5 w-5" />} onRefresh={loadAll} refreshing={loading}>
            <div className="space-y-6">

                {/* KPI Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Registered Today', value: stats?.todayRegistrations ?? 0, icon: UserPlus, color: 'blue' },
                        { label: 'Appointments', value: stats?.todayAppointments ?? 0, icon: Calendar, color: 'violet' },
                        { label: 'Waiting / Pending', value: stats?.pendingAppointments ?? 0, icon: Clock, color: 'amber' },
                        { label: 'Completed', value: stats?.completedToday ?? 0, icon: CheckCircle2, color: 'emerald' },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
                                <div className={`p-1.5 rounded-lg bg-${color}-50`}>
                                    <Icon className={`h-3.5 w-3.5 text-${color}-500`} />
                                </div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{loading ? '—' : value}</p>
                        </div>
                    ))}
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Link href="/reception/register"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-50 rounded-xl"><UserPlus className="h-5 w-5 text-blue-500" /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Register Patient</p>
                                <p className="text-xs text-gray-400">New OPD registration</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </Link>

                    <Link href="/reception/appointments"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-violet-300 hover:shadow-md transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-violet-50 rounded-xl"><Calendar className="h-5 w-5 text-violet-500" /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Book Appointment</p>
                                <p className="text-xs text-gray-400">Schedule a consultation</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
                    </Link>

                    <Link href="/reception/queue"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-orange-300 hover:shadow-md transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-orange-50 rounded-xl"><Activity className="h-5 w-5 text-orange-500" /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Manage Queue</p>
                                <p className="text-xs text-gray-400">Live OPD queue view</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-orange-500 transition-colors" />
                    </Link>
                </div>

                {/* IPD Portal Entry */}
                <Link href="/ipd"
                    className="group flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl px-6 py-4 shadow-lg shadow-violet-500/20 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <ClipboardList className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold">Enter IPD Portal</p>
                            <p className="text-xs text-violet-200">Full access — admissions, beds, billing & more</p>
                        </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white transition-colors" />
                </Link>

                {/* Doctor Queues */}
                {(queues.length > 0 || loading) && (
                    <div>
                        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-gray-400" /> Live Doctor Queues
                        </h2>
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {queues.map((q) => (
                                    <div key={q.doctorId} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 space-y-3">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900 truncate">{q.doctorName}</p>
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{q.department || 'General'}</p>
                                        </div>

                                        {q.current ? (
                                            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                                                <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-1">In Progress</p>
                                                <p className="text-sm font-bold text-violet-900 truncate">{q.current.patientName}</p>
                                                {q.current.token && <p className="text-xs text-violet-500">Token #{q.current.token}</p>}
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                                                <p className="text-xs text-gray-400">No patient in progress</p>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3 text-amber-500" />
                                                <span className="font-semibold text-gray-900">{q.waiting.length}</span> waiting
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3 text-blue-400" />
                                                <span className="font-semibold text-gray-900">{q.scheduled.length}</span> scheduled
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Today's Appointments */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" /> Today&apos;s Appointments
                        </h2>
                        <span className="text-xs text-gray-400">{appointments.length} total</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    {['Time', 'Patient', 'Contact', 'Doctor / Dept', 'Reason', 'Status', 'Action'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr><td colSpan={7} className="text-center py-16">
                                        <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                                    </td></tr>
                                ) : appointments.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16">
                                        <Calendar className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                                        <p className="text-gray-400 text-sm">No appointments today</p>
                                    </td></tr>
                                ) : appointments.map((appt) => {
                                    const canCheckIn = appt.status === 'Pending' || appt.status === 'Scheduled';
                                    const isCheckingIn = checkingIn === appt.appointment_id;
                                    return (
                                        <tr key={appt.appointment_id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                                                {fmt(appt.appointment_date)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900 text-sm">{appt.patient?.full_name || '—'}</p>
                                                <p className="text-[10px] text-gray-400">{appt.patient?.age ? `${appt.patient.age}y` : ''} {appt.patient?.gender || ''}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                {appt.patient?.phone ? (
                                                    <a href={`tel:${appt.patient.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors">
                                                        <Phone className="h-3 w-3" /> {appt.patient.phone}
                                                    </a>
                                                ) : <span className="text-xs text-gray-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-medium text-gray-700">{appt.doctor_name || '—'}</p>
                                                <p className="text-[10px] text-gray-400">{appt.department || 'General'}</p>
                                            </td>
                                            <td className="px-4 py-3 max-w-[140px]">
                                                <p className="text-xs text-gray-500 truncate">{appt.reason_for_visit || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${STATUS_STYLE[appt.status] || 'bg-gray-100 text-gray-500'}`}>
                                                    {appt.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {canCheckIn ? (
                                                    <button
                                                        onClick={() => handleCheckIn(appt.appointment_id)}
                                                        disabled={!!checkingIn}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                                                    >
                                                        {isCheckingIn ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                                        Check In
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-300">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
