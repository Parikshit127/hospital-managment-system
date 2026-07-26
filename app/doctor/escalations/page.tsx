'use client';

/**
 * Deteriorating patients waiting on a doctor.
 *
 * The nurse's half of this already worked — the score was calculated and the
 * ward was told. What was missing was the reply. Acknowledging here records who
 * answered and when, and turns each instruction into a nursing task, so the
 * nurse gets an answer rather than an alert that vanishes.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { getOpenEscalations, acknowledgeEscalation } from '@/app/actions/escalation-actions';

type Row = Record<string, any>;

export default function EscalationsPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        const res = await getOpenEscalations();
        if (res.success) setRows((res.data as Row[]) ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
        // A deteriorating patient should not need a page refresh to appear.
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [load]);

    const acknowledge = async (id: string) => {
        setBusy(id);
        const res = await acknowledgeEscalation(id, notes[id] || '');
        setBusy(null);
        setMsg(res.success
            ? { text: `Acknowledged. ${(res.data as any)?.tasksCreated ?? 0} task(s) raised for the ward.` }
            : { text: (res as any).error || 'Failed', bad: true });
        if (res.success) { setNotes({ ...notes, [id]: '' }); load(); }
        setTimeout(() => setMsg(null), 6000);
    };

    return (
        <AppShell>
            <div className="space-y-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Activity className="h-5 w-5 text-red-600" /> Escalations
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Patients whose observations have deteriorated and who are waiting on a reply.
                        Say what the ward should do — each line becomes a nursing task.
                    </p>
                </div>

                {msg && (
                    <div className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad
                        ? 'border border-amber-200 bg-amber-50 text-amber-800'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                        {msg.text}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-red-500" /></div>
                ) : rows.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
                        <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-gray-600">Nothing outstanding</p>
                        <p className="text-xs text-gray-400 mt-1">No patient is waiting on a response.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rows.map(r => (
                            <div key={r.id}
                                className={`rounded-2xl border bg-white p-4 space-y-3 ${r.overdue
                                    ? 'border-red-300 shadow-sm shadow-red-500/10' : 'border-gray-200'}`}>
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">
                                            {r.patientName}
                                            <span className="ml-2 text-[11px] font-medium text-gray-400">
                                                {[r.wardName, r.bedId].filter(Boolean).join(' · ')}
                                            </span>
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide border ${r.band === 'emergency'
                                                ? 'bg-red-100 text-red-700 border-red-200'
                                                : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                                NEWS {r.news_score} · {r.band}
                                            </span>
                                            <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> waiting {r.minutesWaiting} min
                                            </span>
                                            {r.overdue && (
                                                <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                                    <AlertTriangle className="h-3 w-3" /> past the deadline
                                                </span>
                                            )}
                                            {r.escalation_level > 0 && (
                                                <span className="rounded-full border border-red-300 bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                                    chased ×{r.escalation_level}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <textarea
                                    value={notes[r.id] || ''}
                                    onChange={e => setNotes({ ...notes, [r.id]: e.target.value })}
                                    rows={3}
                                    placeholder={'What should the ward do? One instruction per line, e.g.\nStart oxygen 4L via face mask\nRepeat observations in 30 minutes\nCall me if respiratory rate goes above 28'}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-red-400" />

                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[10px] text-gray-400">
                                        Each line becomes a nursing task the ward can see and close.
                                    </p>
                                    <button onClick={() => acknowledge(r.id)}
                                        disabled={busy === r.id}
                                        className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
                                        {busy === r.id ? 'Sending…' : 'Acknowledge & instruct'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
