'use client';

import React from 'react';
import { Calendar, Pill, FileText, ChevronRight, Heart, Activity, Wind, Thermometer, CreditCard, FlaskConical, RefreshCw } from 'lucide-react';
import { usePatientDashboard } from '@/app/lib/hooks/usePatientData';
import { usePullToRefresh } from '@/app/lib/hooks/usePullToRefresh';
import Link from 'next/link';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function daysUntil(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
}

export default function PatientDashboard() {
    const { data, error, isLoading, isValidating, refresh } = usePatientDashboard();
    const { refreshing } = usePullToRefresh(refresh);

    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-64 bg-gray-200 rounded-lg" />
                    <div className="h-32 bg-gray-200 rounded-2xl" />
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    if (!data?.patient) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="p-10 text-center space-y-4">
                    <p className="text-red-500 font-bold">Failed to load patient data.</p>
                    {error && <p className="text-sm text-gray-500">{error}</p>}
                    <a href="/patient/login" className="inline-block text-sm font-bold text-emerald-600 hover:underline"
                       onClick={() => { document.cookie = 'patient_session=; Max-Age=0; path=/'; }}>
                        Back to Login
                    </a>
                </div>
            </div>
        );
    }

    const firstName = data.patient.full_name?.split(' ')[0] || data.patient.full_name;
    const nextAppt = data.upcomingAppointments?.[0];
    const vitals = data.latestVitals;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Pull-to-refresh indicator */}
            {refreshing && (
                <div className="flex justify-center py-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                </div>
            )}
            {/* Greeting + Refresh */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-gray-900">{getGreeting()}, {firstName}</h1>
                    <p className="text-gray-500 font-medium mt-1">Patient ID: {data.patient.patient_id}</p>
                </div>
                <button onClick={refresh} disabled={isValidating} className="min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition disabled:opacity-50" aria-label="Refresh dashboard">
                    <RefreshCw className={`h-5 w-5 ${isValidating ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </div>

            {/* Next Appointment Hero */}
            {nextAppt ? (
                <Link href="/patient/appointments" className="block bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <div className="absolute -right-8 -bottom-8 h-32 w-32 bg-white/10 rounded-full group-hover:scale-110 transition-transform" />
                    <div className="relative z-10">
                        <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mb-2">Next Appointment</p>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-black">Dr. {nextAppt.doctor_name || nextAppt.doctor_id}</h3>
                                <p className="text-emerald-100 font-medium mt-1">{nextAppt.department || 'General'}</p>
                            </div>
                            <div className="sm:text-right">
                                <p className="text-lg font-black">{new Date(nextAppt.appointment_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                <p className="text-emerald-200 font-bold text-sm">{daysUntil(nextAppt.appointment_date)}</p>
                            </div>
                        </div>
                    </div>
                </Link>
            ) : (
                <Link href="/patient/appointments/book" className="block bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-emerald-300 hover:bg-emerald-50/30 transition group">
                    <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3 group-hover:text-emerald-400 transition-colors" />
                    <p className="text-lg font-black text-gray-800">No upcoming appointments</p>
                    <p className="text-sm text-gray-500 mt-1">Book a visit with your doctor</p>
                </Link>
            )}

            {/* Pending Actions */}
            {(data.pendingLabCount > 0 || data.unpaidInvoiceCount > 0) && (
                <div className="flex gap-3 flex-wrap">
                    {data.pendingLabCount > 0 && (
                        <Link href="/patient/labs" className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-100 transition">
                            <FlaskConical className="h-4 w-4" />
                            {data.pendingLabCount} pending lab result{data.pendingLabCount > 1 ? 's' : ''}
                        </Link>
                    )}
                    {data.unpaidInvoiceCount > 0 && (
                        <Link href="/patient/payments" className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-100 transition">
                            <CreditCard className="h-4 w-4" />
                            {data.unpaidInvoiceCount} unpaid invoice{data.unpaidInvoiceCount > 1 ? 's' : ''}
                        </Link>
                    )}
                </div>
            )}

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href="/patient/appointments/book" className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <Calendar className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">Book Appointment</h3>
                    <p className="text-indigo-100 text-xs font-medium">Schedule a visit</p>
                </Link>
                <Link href="/patient/records" className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <FileText className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">Medical Records</h3>
                    <p className="text-emerald-100 text-xs font-medium">View lab results & reports</p>
                </Link>
                <Link href="/patient/prescriptions" className="bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow relative overflow-hidden group">
                    <Pill className="absolute right-[-10px] bottom-[-10px] h-20 w-20 text-white/10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-base font-black mb-0.5">My Prescriptions</h3>
                    <p className="text-purple-100 text-xs font-medium">Active medications</p>
                </Link>
            </div>

            {/* Health Snapshot */}
            {vitals && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Heart className="h-5 w-5 text-rose-500" /> Health Snapshot</h3>
                        <p className="text-xs text-gray-400 font-medium">Last recorded: {new Date(vitals.recorded_at).toLocaleDateString()}</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                            <Heart className="h-4 w-4 text-rose-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-rose-900">{vitals.blood_pressure || '--'}</p>
                            <p className="text-[10px] font-bold text-rose-400 uppercase">BP</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-3 text-center">
                            <Activity className="h-4 w-4 text-orange-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-orange-900">{vitals.heart_rate || '--'}</p>
                            <p className="text-[10px] font-bold text-orange-400 uppercase">HR (BPM)</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 text-center">
                            <Thermometer className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-amber-900">{vitals.temperature || '--'}</p>
                            <p className="text-[10px] font-bold text-amber-400 uppercase">Temp (°F)</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <Wind className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-blue-900">{vitals.oxygen_saturation || '--'}</p>
                            <p className="text-[10px] font-bold text-blue-400 uppercase">SpO2 (%)</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Two columns: Upcoming + Prescriptions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-500" /> Upcoming Visits</h3>
                        <Link href="/patient/appointments" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center">View All <ChevronRight className="h-3 w-3" /></Link>
                    </div>
                    <div className="space-y-3">
                        {data.upcomingAppointments?.length > 0 ? data.upcomingAppointments.map((app: any) => (
                            <div key={app.id || app.appointment_id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{new Date(app.appointment_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                    <p className="text-xs text-indigo-600 font-bold mt-0.5">Dr. {app.doctor_name || app.doctor_id} &middot; {app.department || 'General'}</p>
                                </div>
                                <span className="text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-200">
                                    {new Date(app.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-gray-400 text-sm font-medium">No upcoming appointments.</div>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Pill className="h-5 w-5 text-purple-500" /> Recent Prescriptions</h3>
                        <Link href="/patient/prescriptions" className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center">View All <ChevronRight className="h-3 w-3" /></Link>
                    </div>
                    <div className="space-y-3">
                        {data.activePrescriptions?.length > 0 ? data.activePrescriptions.map((rx: any) => (
                            <div key={rx.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-purple-200 transition-colors">
                                <p className="text-xs font-bold text-gray-500 mb-1">{new Date(rx.created_at).toLocaleDateString()}</p>
                                <p className="text-sm font-bold text-gray-900">
                                    {rx.items?.map((item: any) => item.medicine_name).join(', ') || 'Medication order'}
                                </p>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-gray-400 text-sm font-medium">No recent prescriptions.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
