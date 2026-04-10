'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    UserX, Loader2, RefreshCw, Clock, Phone, User,
    AlertTriangle, CheckCircle2, BarChart3
} from 'lucide-react';
import {
    getTodayPendingNoShows,
    getNoShowReport,
    markNoShow,
} from '@/app/actions/opd-manager-actions';

type PendingAppt = {
    appointment_id: string;
    patient_id: string;
    doctor_name: string | null;
    department: string | null;
    appointment_date: string;
    reason_for_visit: string | null;
    patient: { full_name: string; phone: string | null } | null;
};

type NoShowRecord = {
    appointmentId: string;
    patientName: string;
    patientId: string;
    doctorName: string | null;
    department: string | null;
    date: string;
    reason: string;
};

export default function NoShowsPage() {
    const [pending, setPending] = useState<PendingAppt[]>([]);
    const [history, setHistory] = useState<NoShowRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [marking, setMarking] = useState<string | null>(null);
    const [tab, setTab] = useState<'pending' | 'history'>('pending');

    const load = useCallback(async () => {
        setLoading(true);
        const [pendRes, histRes] = await Promise.all([
            getTodayPendingNoShows(),
            getNoShowReport(7),
        ]);
        if (pendRes.success) setPending(pendRes.data as PendingAppt[]);
        if (histRes.success) setHistory(histRes.data as NoShowRecord[]);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleMarkNoShow(appointmentId: string) {
        setMarking(appointmentId);
        await markNoShow(appointmentId);
        await load();
        setMarking(null);
    }

    const noShowRate = history.length > 0
        ? Math.round((history.filter(h => h.reason === 'No Show').length / Math.max(history.length, 1)) * 100)
        : 0;

    return (
        <AppShell pageTitle="No-Show Management" pageIcon={<UserX className="h-5 w-5" />}>
            <div className="space-y-6">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending Today</p>
                        <p className="text-3xl font-black text-amber-600 mt-2">{pending.length}</p>
                        <p className="text-xs text-gray-400 mt-1">scheduled but not checked in</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cancellations (7d)</p>
                        <p className="text-3xl font-black text-red-600 mt-2">{history.length}</p>
                        <p className="text-xs text-gray-400 mt-1">cancelled in last 7 days</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">No-Show Rate</p>
                        <p className={`text-3xl font-black mt-2 ${noShowRate > 20 ? 'text-red-600' : noShowRate > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {noShowRate}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">of cancellations were no-shows</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-gray-200">
                    {(['pending', 'history'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-2.5 text-sm font-bold capitalize transition-all border-b-2 -mb-px ${
                                tab === t
                                    ? 'border-teal-500 text-teal-600'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {t === 'pending' ? `Pending Today (${pending.length})` : `Cancellation History (${history.length})`}
                        </button>
                    ))}
                    <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-600 pb-2">
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="font-bold">Loading...</span>
                    </div>
                ) : tab === 'pending' ? (
                    pending.length === 0 ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-12 text-center">
                            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
                            <p className="font-bold text-emerald-700">All scheduled patients have checked in</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pending.map(appt => {
                                const apptTime = new Date(appt.appointment_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                                const minsOverdue = Math.floor((Date.now() - new Date(appt.appointment_date).getTime()) / 60000);
                                return (
                                    <div key={appt.appointment_id} className="bg-white border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                                <User className="h-5 w-5 text-amber-600" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-gray-900 text-sm">{appt.patient?.full_name}</p>
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                                        {minsOverdue}m overdue
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" /> {apptTime}
                                                    </span>
                                                    {appt.patient?.phone && (
                                                        <span className="flex items-center gap-1">
                                                            <Phone className="h-3 w-3" /> {appt.patient.phone}
                                                        </span>
                                                    )}
                                                    {appt.doctor_name && <span>Dr. {appt.doctor_name}</span>}
                                                    {appt.department && <span>{appt.department}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleMarkNoShow(appt.appointment_id)}
                                            disabled={marking === appt.appointment_id}
                                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 flex-shrink-0"
                                        >
                                            {marking === appt.appointment_id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <UserX className="h-3.5 w-3.5" />}
                                            Mark No-Show
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    history.length === 0 ? (
                        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-400">
                            <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="font-bold">No cancellations in the last 7 days</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map(record => (
                                <div key={record.appointmentId} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                            record.reason === 'No Show' ? 'bg-red-100' : 'bg-gray-100'
                                        }`}>
                                            {record.reason === 'No Show'
                                                ? <UserX className="h-4 w-4 text-red-500" />
                                                : <AlertTriangle className="h-4 w-4 text-gray-400" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">{record.patientName}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(record.date).toLocaleDateString('en-IN')}
                                                {record.doctorName && ` · Dr. ${record.doctorName}`}
                                                {record.department && ` · ${record.department}`}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${
                                        record.reason === 'No Show'
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {record.reason}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </AppShell>
    );
}
