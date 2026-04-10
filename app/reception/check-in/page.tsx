'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Search, CheckCircle2, Clock, User, Loader2, RefreshCw,
    AlertTriangle, QrCode, Phone
} from 'lucide-react';
import { getTodayCheckInList, checkInPatient } from '@/app/actions/reception-actions';

type Appointment = {
    appointment_id: string;
    patient_id: string;
    doctor_name: string | null;
    department: string | null;
    status: string;
    queue_token: number | null;
    checked_in_at: string | null;
    appointment_date: string;
    reason_for_visit: string | null;
    patient: { full_name: string; phone: string | null; age: string | null; gender: string | null } | null;
};

const STATUS_COLOR: Record<string, string> = {
    Pending: 'bg-gray-100 text-gray-600',
    Confirmed: 'bg-blue-100 text-blue-700',
    'Checked In': 'bg-teal-100 text-teal-700',
    'In Progress': 'bg-violet-100 text-violet-700',
    Completed: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-red-100 text-red-600',
};

export default function CheckInPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [checkingIn, setCheckingIn] = useState<string | null>(null);
    const [lastToken, setLastToken] = useState<{ name: string; token: number; wait: number } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTodayCheckInList();
        if (res.success) setAppointments(res.data as Appointment[]);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh every 20s
    useEffect(() => {
        const t = setInterval(load, 20000);
        return () => clearInterval(t);
    }, [load]);

    async function handleCheckIn(appt: Appointment) {
        setCheckingIn(appt.appointment_id);
        const res = await checkInPatient(appt.appointment_id);
        if (res.success && res.data) {
            const d = res.data as { tokenNumber: number; position: number; estimatedWait: number };
            setLastToken({
                name: appt.patient?.full_name ?? 'Patient',
                token: d.tokenNumber,
                wait: d.estimatedWait,
            });
            await load();
        }
        setCheckingIn(null);
    }

    const filtered = appointments.filter(a => {
        const q = search.toLowerCase();
        return (
            a.patient?.full_name?.toLowerCase().includes(q) ||
            a.patient_id?.toLowerCase().includes(q) ||
            a.patient?.phone?.includes(q) ||
            a.doctor_name?.toLowerCase().includes(q)
        );
    });

    const checkedInCount = appointments.filter(a => ['Checked In', 'In Progress'].includes(a.status)).length;
    const pendingCount = appointments.filter(a => ['Pending', 'Confirmed'].includes(a.status)).length;

    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Check-in Desk</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Today's appointments — manage patient check-in</p>
                    </div>
                    <button
                        onClick={load}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
                    >
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
                        <p className="text-2xl font-black text-gray-900">{appointments.length}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Total Today</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
                        <p className="text-2xl font-black text-teal-700">{checkedInCount}</p>
                        <p className="text-xs font-bold text-teal-500 uppercase tracking-wider mt-1">Checked In</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                        <p className="text-2xl font-black text-amber-700">{pendingCount}</p>
                        <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mt-1">Awaiting Check-in</p>
                    </div>
                </div>

                {/* Token success banner */}
                {lastToken && (
                    <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                            <div>
                                <p className="font-black text-emerald-800">{lastToken.name} checked in</p>
                                <p className="text-sm text-emerald-600">
                                    Token <span className="font-black">#{lastToken.token}</span> · Est. wait: ~{lastToken.wait} min
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setLastToken(null)} className="text-emerald-400 hover:text-emerald-600 text-lg font-bold">×</button>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, patient ID, phone, or doctor..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                    />
                </div>

                {/* Appointments table */}
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="font-bold">Loading appointments...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-400">
                        <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-bold">No appointments found</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map(appt => {
                            const canCheckIn = ['Pending', 'Confirmed'].includes(appt.status);
                            const isChecking = checkingIn === appt.appointment_id;
                            const checkedInTime = appt.checked_in_at
                                ? new Date(appt.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                                : null;

                            return (
                                <div
                                    key={appt.appointment_id}
                                    className={`bg-white border rounded-xl p-4 flex items-center justify-between gap-4 transition-all ${
                                        appt.status === 'Checked In' ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <User className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-black text-gray-900 text-sm">{appt.patient?.full_name}</p>
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${STATUS_COLOR[appt.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {appt.status}
                                                </span>
                                                {appt.queue_token && (
                                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                                                        Token #{appt.queue_token}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <QrCode className="h-3 w-3" /> {appt.patient_id}
                                                </span>
                                                {appt.patient?.phone && (
                                                    <span className="flex items-center gap-1">
                                                        <Phone className="h-3 w-3" /> {appt.patient.phone}
                                                    </span>
                                                )}
                                                {appt.doctor_name && (
                                                    <span>Dr. {appt.doctor_name}</span>
                                                )}
                                                {checkedInTime && (
                                                    <span className="flex items-center gap-1 text-teal-600">
                                                        <Clock className="h-3 w-3" /> In at {checkedInTime}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {canCheckIn && (
                                        <button
                                            onClick={() => handleCheckIn(appt)}
                                            disabled={isChecking}
                                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 flex-shrink-0"
                                        >
                                            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                            Check In
                                        </button>
                                    )}
                                    {!canCheckIn && appt.status === 'Checked In' && (
                                        <span className="text-xs font-bold text-teal-600 flex-shrink-0 flex items-center gap-1">
                                            <CheckCircle2 className="h-4 w-4" /> Done
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
