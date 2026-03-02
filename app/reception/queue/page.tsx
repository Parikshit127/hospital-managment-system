'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    ListOrdered, Loader2, Play, SkipForward, ArrowUpDown,
    User, Clock, RefreshCw
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    getAllDoctorQueues, checkInPatient, callNextPatient, skipPatient
} from '@/app/actions/reception-actions';

export default function QueueManagementPage() {
    const [queues, setQueues] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getAllDoctorQueues();
        if (res.success) setQueues(res.data || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleCallNext = async (doctorId: string) => {
        await callNextPatient(doctorId);
        loadData();
    };

    const handleSkip = async (appointmentId: string) => {
        await skipPatient(appointmentId);
        loadData();
    };

    const totalWaiting = queues.reduce((sum, q) => sum + q.waiting.length, 0);
    const totalInProgress = queues.filter(q => q.current).length;

    return (
        <AppShell pageTitle="Queue Management" pageIcon={<ListOrdered className="h-5 w-5" />}
            onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                            {totalWaiting > 0 ? `~${Math.round((totalWaiting / Math.max(queues.length, 1)) * 15)}m` : '0m'}
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
                        {queues.map((queue: any) => (
                            <div key={queue.doctorId} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                {/* Doctor Header */}
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900">{queue.doctorName}</h3>
                                        <p className="text-[10px] text-gray-400">{queue.department || 'General'}</p>
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
                                        queue.waiting.map((patient: any, idx: number) => (
                                            <div key={patient.appointmentId} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-7 h-7 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center">
                                                        <span className="text-xs font-black text-amber-600">{patient.token || idx + 1}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{patient.patientName}</p>
                                                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                            <Clock className="h-2.5 w-2.5" />
                                                            ~{(idx + 1) * 15} min wait
                                                        </p>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleSkip(patient.appointmentId)}
                                                    className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors" title="Skip to end">
                                                    <SkipForward className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Scheduled (not checked in) */}
                                {queue.scheduled.length > 0 && (
                                    <div className="px-4 pb-4">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Scheduled (Not Checked In)</p>
                                        {queue.scheduled.map((patient: any) => (
                                            <div key={patient.appointmentId} className="flex items-center justify-between p-2 text-gray-400">
                                                <span className="text-xs">{patient.patientName}</span>
                                                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Scheduled</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
