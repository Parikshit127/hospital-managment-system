'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MonitorPlay, User, Clock, Volume2 } from 'lucide-react';
import { getWaitingRoomDisplay } from '@/app/actions/reception-actions';

export default function TokenDisplayPage() {
    const [queues, setQueues] = useState<any[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    const loadData = useCallback(async () => {
        const res = await getWaitingRoomDisplay();
        if (res.success) setQueues(res.data || []);
    }, []);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, [loadData]);

    // Clock update
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl shadow-lg shadow-teal-500/20">
                        <MonitorPlay className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">OPD Queue Display</h1>
                        <p className="text-slate-400 text-sm">Real-time token status</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-black text-teal-400 tabular-nums">
                        {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                    <p className="text-slate-400 text-sm">
                        {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Queue Cards Grid */}
            {queues.length === 0 ? (
                <div className="flex items-center justify-center h-[60vh]">
                    <div className="text-center">
                        <Clock className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                        <p className="text-xl font-bold text-slate-400">No Active Queues</p>
                        <p className="text-slate-500 text-sm mt-1">Waiting for patients to check in</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {queues.map((queue: any, idx: number) => (
                        <div key={idx} className="bg-slate-800/50 border border-slate-700/50 rounded-3xl overflow-hidden backdrop-blur-sm">
                            {/* Doctor Name */}
                            <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
                                <h2 className="text-lg font-bold text-white">{queue.doctorName}</h2>
                                <p className="text-xs text-slate-400">OPD Consultation</p>
                            </div>

                            {/* Current Token - BIG */}
                            <div className="p-6">
                                {queue.currentPatient ? (
                                    <div className="text-center mb-6">
                                        <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-widest mb-2">Now Serving</p>
                                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/30 mb-3 animate-pulse">
                                            <span className="text-4xl font-black">{queue.currentPatient.token}</span>
                                        </div>
                                        <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
                                            <User className="h-3.5 w-3.5 text-teal-400" />
                                            {queue.currentPatient.name}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="text-center mb-6 py-4">
                                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-slate-700/50 border border-slate-600 mb-3">
                                            <span className="text-2xl font-bold text-slate-500">--</span>
                                        </div>
                                        <p className="text-sm text-slate-500">No patient in progress</p>
                                    </div>
                                )}

                                {/* Waiting List */}
                                {queue.waiting.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                                            Up Next ({queue.waiting.length} waiting)
                                        </p>
                                        <div className="space-y-2">
                                            {queue.waiting.slice(0, 5).map((w: any) => (
                                                <div key={w.token} className="flex items-center justify-between px-3 py-2.5 bg-slate-700/30 rounded-xl">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center justify-center">
                                                            <span className="text-xs font-black text-amber-400">{w.token}</span>
                                                        </div>
                                                        <span className="text-sm text-slate-300">{w.name}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">#{w.position}</span>
                                                </div>
                                            ))}
                                            {queue.waiting.length > 5 && (
                                                <p className="text-center text-xs text-slate-500 py-1">
                                                    +{queue.waiting.length - 5} more
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md border-t border-slate-700/50 px-6 py-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">Auto-refreshing every 10 seconds</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                        Live
                    </div>
                </div>
            </div>
        </div>
    );
}
