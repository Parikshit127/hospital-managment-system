'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    MonitorPlay, User, Clock, Volume2, VolumeX, Maximize, Minimize, Wifi, WifiOff
} from 'lucide-react';
import { getWaitingRoomDisplay } from '@/app/actions/reception-actions';
import { useRealtimeSubscription, formatWaitTime } from '@/app/lib/realtime';

type WaitingPatient = {
    name: string;
    token: number;
    position: number;
};

type DoctorQueueDisplay = {
    doctorName: string;
    doctorId: string;
    currentPatient: { name: string; token: number } | null;
    waiting: WaitingPatient[];
};

/** Mask patient name for privacy: "Rahul Kumar" → "Rahul K." */
function maskName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] || 'Patient';
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Announce token via Speech Synthesis API */
function announceToken(token: number, doctorName: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const text = `Token number ${token}, please proceed to Doctor ${doctorName}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

export default function TokenDisplayPage() {
    const [queues, setQueues] = useState<DoctorQueueDisplay[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const prevCurrentRef = useRef<Record<string, number>>({});
    const containerRef = useRef<HTMLDivElement>(null);

    const loadData = useCallback(async () => {
        const res = await getWaitingRoomDisplay();
        if (res.success && res.data) {
            const newQueues = res.data as DoctorQueueDisplay[];

            // Detect new "current" tokens for audio announcement
            if (audioEnabled) {
                for (const q of newQueues) {
                    if (q.currentPatient) {
                        const prevToken = prevCurrentRef.current[q.doctorId];
                        if (prevToken !== q.currentPatient.token) {
                            announceToken(q.currentPatient.token, q.doctorName);
                        }
                    }
                }
            }

            // Update previous tokens
            const newPrev: Record<string, number> = {};
            for (const q of newQueues) {
                if (q.currentPatient) newPrev[q.doctorId] = q.currentPatient.token;
            }
            prevCurrentRef.current = newPrev;

            setQueues(newQueues);
        }
    }, [audioEnabled]);

    // Realtime subscription (falls back to 10s polling)
    const { isRealtime } = useRealtimeSubscription('appointments', loadData, 10000);

    // Initial load
    useEffect(() => { loadData(); }, [loadData]);

    // Clock update
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fullscreen detection
    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            containerRef.current.requestFullscreen();
        }
    };

    const totalWaiting = queues.reduce((sum, q) => sum + q.waiting.length, 0);

    return (
        <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl shadow-lg shadow-teal-500/20">
                        <MonitorPlay className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">OPD Queue Display</h1>
                        <p className="text-slate-400 text-sm">
                            {totalWaiting} patient{totalWaiting !== 1 ? 's' : ''} waiting
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Audio toggle */}
                    <button
                        onClick={() => setAudioEnabled(!audioEnabled)}
                        className={`p-2.5 rounded-xl border transition-all ${
                            audioEnabled
                                ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                                : 'bg-slate-700/50 border-slate-600 text-slate-500'
                        }`}
                        title={audioEnabled ? 'Mute announcements' : 'Enable audio announcements'}
                    >
                        {audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    </button>

                    {/* Fullscreen toggle */}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-400 hover:text-white transition-all"
                        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    >
                        {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                    </button>

                    {/* Clock */}
                    <div className="text-right">
                        <p className="text-3xl font-black text-teal-400 tabular-nums">
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                        <p className="text-slate-400 text-sm">
                            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
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
                    {queues.map((queue) => (
                        <div key={queue.doctorId} className="bg-slate-800/50 border border-slate-700/50 rounded-3xl overflow-hidden backdrop-blur-sm">
                            {/* Doctor Name */}
                            <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
                                <h2 className="text-lg font-bold text-white">{queue.doctorName}</h2>
                                <p className="text-xs text-slate-400">
                                    OPD Consultation · {queue.waiting.length} waiting
                                </p>
                            </div>

                            {/* Current Token - BIG, Token-First */}
                            <div className="p-6">
                                {queue.currentPatient ? (
                                    <div className="text-center mb-6">
                                        <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-widest mb-2">Now Serving</p>
                                        <div className="inline-flex items-center justify-center w-28 h-28 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/30 mb-3">
                                            <span className="text-5xl font-black">{queue.currentPatient.token}</span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-300 flex items-center justify-center gap-2">
                                            <User className="h-3.5 w-3.5 text-teal-400" />
                                            {maskName(queue.currentPatient.name)}
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

                                {/* Waiting List — Token-first, masked names */}
                                {queue.waiting.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                                            Up Next ({queue.waiting.length} waiting)
                                        </p>
                                        <div className="space-y-2">
                                            {queue.waiting.slice(0, 5).map((w) => (
                                                <div key={w.token} className="flex items-center justify-between px-3 py-2.5 bg-slate-700/30 rounded-xl">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center justify-center">
                                                            <span className="text-sm font-black text-amber-400">{w.token}</span>
                                                        </div>
                                                        <span className="text-sm text-slate-300">{maskName(w.name)}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                        <Clock className="h-2.5 w-2.5" />
                                                        {formatWaitTime(w.position * 15)}
                                                    </span>
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
                    <p className="text-xs text-slate-500">
                        {isRealtime ? 'Real-time updates active' : 'Auto-refreshing every 10 seconds'}
                    </p>
                    <div className="flex items-center gap-3">
                        {audioEnabled && (
                            <span className="text-xs text-teal-500 flex items-center gap-1">
                                <Volume2 className="h-3 w-3" /> Audio On
                            </span>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            {isRealtime ? (
                                <><Wifi className="h-3 w-3 text-emerald-400" /> <span className="text-emerald-400">Live</span></>
                            ) : (
                                <><WifiOff className="h-3 w-3" /> Polling</>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
