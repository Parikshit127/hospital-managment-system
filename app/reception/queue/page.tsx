'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    ListOrdered, Loader2, Play, SkipForward,
    User, Clock, Wifi, WifiOff, AlertTriangle
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    getAllDoctorQueues, callNextPatient, skipPatient
} from '@/app/actions/reception-actions';
import { getOPDConfig } from '@/app/actions/opd-manager-actions';
import { useRealtimeSubscription, formatWaitTime } from '@/app/lib/realtime';

type QueuePatient = {
    appointmentId: string;
    patientName: string;
    patientId: string;
    token: number | null;
    status: string;
    checkedInAt: Date | null;
    reason: string | null;
    isPriority?: boolean;
};

type DoctorQueue = {
    doctorId: string;
    doctorName: string;
    department: string;
    current: QueuePatient | null;
    waiting: QueuePatient[];
    scheduled: QueuePatient[];
    avgConsultMinutes?: number;
};

export default function QueueManagementPage() {
    const [queues, setQueues] = useState<DoctorQueue[]>([]);
    const [loading, setLoading] = useState(true);
    const [slaMinutes, setSlaMinutes] = useState(30);

    const loadData = useCallback(async () => {
        const [queueRes, configRes] = await Promise.all([getAllDoctorQueues(), getOPDConfig()]);
        if (queueRes.success) setQueues(queueRes.data || []);
        if (configRes.success) setSlaMinutes(configRes.data.max_wait_minutes);
        setLoading(false);
    }, []);

    // Initial load
    useEffect(() => {
        setLoading(true);
        loadData();
    }, [loadData]);

    // Realtime subscription (falls back to 15s polling if Supabase not configured)
    const { isRealtime } = useRealtimeSubscription('appointments', loadData, 15000);

    const handleCallNext = async (doctorId: string) => {
        await callNextPatient(doctorId);
        if (!isRealtime) loadData();
    };

    const handleSkip = async (appointmentId: string) => {
        await skipPatient(appointmentId);
        if (!isRealtime) loadData();
    };

    const totalWaiting = queues.reduce((sum, q) => sum + q.waiting.length, 0);
    const totalInProgress = queues.filter(q => q.current).length;

    // Dynamic avg wait — use per-doctor avg or fallback 15m
    const avgWaitPerPatient = queues.length > 0
        ? queues.reduce((sum, q) => sum + (q.avgConsultMinutes || 15), 0) / queues.length
        : 15;

    const SLA_MINUTES = slaMinutes; // from OPDConfig

    function getActualWaitMinutes(checkedInAt: Date | null): number | null {
        if (!checkedInAt) return null;
        return Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60000);
    }

    const slaBreaches = queues.reduce((sum, q) =>
        sum + q.waiting.filter((p) => {
            const w = getActualWaitMinutes(p.checkedInAt);
            return w !== null && w > SLA_MINUTES;
        }).length, 0);

    return (
        <AppShell pageTitle="Queue Management" pageIcon={<ListOrdered className="h-5 w-5" />}
            onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Active Doctors</span>
                        <p className="text-2xl font-black text-gray-900 mt-1">{queues.length}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">In Progress</span>
                        <p className="text-2xl font-black text-violet-600 mt-1">{totalInProgress}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Waiting</span>
                        <p className="text-2xl font-black text-amber-600 mt-1">{totalWaiting}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Avg Wait</span>
                        <p className="text-2xl font-black text-gray-900 mt-1">
                            {totalWaiting > 0
                                ? formatWaitTime(Math.round((totalWaiting / Math.max(queues.length, 1)) * avgWaitPerPatient))
                                : '0m'}
                        </p>
                    </div>
                    <div className={`border shadow-sm rounded-2xl p-4 ${slaBreaches > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">SLA Breaches</span>
                        <p className={`text-2xl font-black mt-1 ${slaBreaches > 0 ? 'text-red-600' : 'text-gray-300'}`}>{slaBreaches}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Connection</span>
                        <p className="text-sm font-bold mt-2 flex items-center gap-1.5">
                            {isRealtime ? (
                                <><Wifi className="h-4 w-4 text-emerald-500" /> <span className="text-emerald-600">Live</span></>
                            ) : (
                                <><WifiOff className="h-4 w-4 text-gray-400" /> <span className="text-gray-500">Polling</span></>
                            )}
                        </p>
                    </div>
                </div>

                {/* Doctor Queues */}
                {loading && queues.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    </div>
                ) : queues.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
                        <ListOrdered className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No active queues today</p>
                        <p className="text-gray-300 text-sm mt-1">Patients will appear here once they check in</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {queues.map((queue) => {
                            const doctorAvg = queue.avgConsultMinutes || 15;

                            return (
                                <div key={queue.doctorId} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    {/* Doctor Header */}
                                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900">{queue.doctorName}</h3>
                                            <p className="text-[10px] text-gray-400">
                                                {queue.department || 'General'}
                                                {queue.avgConsultMinutes && (
                                                    <span className="ml-2 text-teal-500">~{queue.avgConsultMinutes}m/patient</span>
                                                )}
                                            </p>
                                        </div>
                                        <button onClick={() => handleCallNext(queue.doctorId)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-lg hover:shadow-md transition-all">
                                            <Play className="h-3 w-3" /> Next
                                        </button>
                                    </div>

                                    {/* Current Patient */}
                                    {queue.current && (
                                        <div className="mx-4 mt-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                                                        <User className="h-4 w-4 text-violet-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-violet-700">{queue.current.patientName}</p>
                                                        <p className="text-[10px] text-violet-500">Token #{queue.current.token}</p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">IN PROGRESS</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Waiting List */}
                                    <div className="p-4 space-y-2">
                                        {queue.waiting.length === 0 && !queue.current ? (
                                            <p className="text-center text-gray-300 text-xs py-4">No patients waiting</p>
                                        ) : (
                                            queue.waiting.map((patient, idx) => {
                                                const actualWait = getActualWaitMinutes(patient.checkedInAt);
                                                const breached = actualWait !== null && actualWait > SLA_MINUTES;
                                                return (
                                                <div key={patient.appointmentId}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                                                        breached
                                                            ? 'bg-red-50 border border-red-300'
                                                            : patient.isPriority
                                                            ? 'bg-red-50 border border-red-200'
                                                            : 'bg-gray-50 hover:bg-gray-100'
                                                    }`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                                            breached
                                                                ? 'bg-red-200 border border-red-400'
                                                                : patient.isPriority
                                                                ? 'bg-red-100 border border-red-300'
                                                                : 'bg-amber-50 border border-amber-200'
                                                        }`}>
                                                            {breached || patient.isPriority ? (
                                                                <AlertTriangle className={`h-3.5 w-3.5 ${breached ? 'text-red-600' : 'text-red-500'}`} />
                                                            ) : (
                                                                <span className="text-xs font-black text-amber-600">{patient.token || idx + 1}</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {patient.patientName}
                                                                {breached && (
                                                                    <span className="ml-1.5 text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">SLA BREACH</span>
                                                                )}
                                                                {!breached && patient.isPriority && (
                                                                    <span className="ml-1.5 text-[9px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">PRIORITY</span>
                                                                )}
                                                            </p>
                                                            <p className={`text-[10px] flex items-center gap-1 ${breached ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                                                <Clock className="h-2.5 w-2.5" />
                                                                {actualWait !== null
                                                                    ? `Waiting ${formatWaitTime(actualWait)}`
                                                                    : formatWaitTime((idx + 1) * doctorAvg)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleSkip(patient.appointmentId)}
                                                        className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors" title="Skip to end">
                                                        <SkipForward className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Scheduled (not checked in) */}
                                    {queue.scheduled.length > 0 && (
                                        <div className="px-4 pb-4">
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Scheduled (Not Checked In)</p>
                                            {queue.scheduled.map((patient) => (
                                                <div key={patient.appointmentId} className="flex items-center justify-between p-2 text-gray-400">
                                                    <span className="text-xs">{patient.patientName}</span>
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Scheduled</span>
                                                </div>
                                            ))}
                                        </div>
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
