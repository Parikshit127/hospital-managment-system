'use client';

import { useState, useEffect } from 'react';
import { getWaitingRoomDisplay } from '@/app/actions/reception-actions';
import { Users, Stethoscope, Clock, HeartPulse } from 'lucide-react';

interface DoctorQueue {
    doctorName: string;
    doctorId: string;
    currentPatient: { name: string; token: number } | null;
    waiting: Array<{ name: string; token: number; position: number }>;
}

export default function WaitingRoomDisplay() {
    const [queues, setQueues] = useState<DoctorQueue[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        loadQueues();
        const queueInterval = setInterval(loadQueues, 30000); // Refresh every 30s
        const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => {
            clearInterval(queueInterval);
            clearInterval(clockInterval);
        };
    }, []);

    async function loadQueues() {
        const result = await getWaitingRoomDisplay();
        if (result.success && result.data) {
            setQueues(result.data);
        }
    }

    const totalWaiting = queues.reduce((sum, q) => sum + q.waiting.length, 0);

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0f172a] to-[#0a0e1a] text-white p-6 lg:p-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-3 rounded-2xl">
                        <HeartPulse className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">OPD Queue Display</h1>
                        <p className="text-sm text-gray-400 mt-0.5">
                            {totalWaiting} patient{totalWaiting !== 1 ? 's' : ''} waiting
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-4xl font-bold tabular-nums text-white/90">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-sm text-gray-400">
                        {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Queue Grid */}
            {queues.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
                    <Users className="h-16 w-16 mb-4 text-gray-700" />
                    <p className="text-xl font-semibold">No active queues</p>
                    <p className="text-sm text-gray-600 mt-1">Patients will appear here when checked in</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {queues.map((q) => (
                        <div
                            key={q.doctorId}
                            className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden"
                        >
                            {/* Doctor Header */}
                            <div className="px-6 py-4 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border-b border-white/5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-teal-500/20 p-2 rounded-xl">
                                            <Stethoscope className="h-5 w-5 text-teal-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white">Dr. {q.doctorName}</p>
                                            <p className="text-xs text-gray-400">{q.waiting.length} waiting</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Current Patient — NOW SERVING */}
                            {q.currentPatient ? (
                                <div className="px-6 py-5 bg-emerald-500/5 border-b border-white/5">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Now Serving</p>
                                    <div className="flex items-center justify-between">
                                        <p className="text-lg font-bold text-white">{q.currentPatient.name}</p>
                                        <span className="text-3xl font-black text-emerald-400 tabular-nums">
                                            #{q.currentPatient.token}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="px-6 py-5 border-b border-white/5">
                                    <p className="text-sm text-gray-500 italic">No patient currently being served</p>
                                </div>
                            )}

                            {/* Waiting List */}
                            <div className="px-6 py-4">
                                {q.waiting.length === 0 ? (
                                    <p className="text-sm text-gray-600 text-center py-4">Queue empty</p>
                                ) : (
                                    <div className="space-y-2">
                                        {q.waiting.slice(0, 8).map((w) => (
                                            <div
                                                key={w.token}
                                                className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition ${
                                                    w.position === 1
                                                        ? 'bg-amber-500/10 border border-amber-500/20'
                                                        : 'bg-white/[0.02]'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-xl font-black tabular-nums ${
                                                        w.position === 1 ? 'text-amber-400' : 'text-gray-500'
                                                    }`}>
                                                        #{w.token}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-300">{w.name}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                    <Clock className="h-3 w-3" />
                                                    ~{w.position * 15} min
                                                </div>
                                            </div>
                                        ))}
                                        {q.waiting.length > 8 && (
                                            <p className="text-center text-xs text-gray-600 py-2">
                                                +{q.waiting.length - 8} more patients
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className="mt-10 text-center text-xs text-gray-700">
                Auto-refreshes every 30 seconds
            </div>
        </div>
    );
}
