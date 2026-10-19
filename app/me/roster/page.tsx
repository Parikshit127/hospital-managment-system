'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Timer, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getMyRoster } from '@/app/actions/hr-self-service-actions';
import { fmtIstDate } from '@/app/lib/ist';
import { istTodayKey, addDaysKey } from '@/app/lib/hr/hr-dates';
import { Card, StatusPill, ghostBtn } from '@/app/components/hr/HrBits';

type Row = NonNullable<Extract<Awaited<ReturnType<typeof getMyRoster>>, { success: true }>['data']>[number];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SPAN = 14;

export default function MyRosterPage() {
    const toast = useToast();
    const today = istTodayKey();
    const [from, setFrom] = useState(today);
    const [rows, setRows] = useState<Row[] | null>(null);

    const load = useCallback(async () => {
        setRows(null);
        const res = await getMyRoster(from, SPAN);
        if (res.success && res.data) setRows(res.data);
        else { setRows([]); toast.error(('error' in res && res.error) || 'Could not load roster'); }
    }, [from, toast]);

    useEffect(() => { load(); }, [load]);

    return (
        <AppShell pageTitle="My Roster" pageIcon={<Timer className="h-5 w-5" />} onRefresh={load}>
            <div className="space-y-4 max-w-3xl">
                <div className="flex items-center gap-3">
                    <button className={ghostBtn} onClick={() => setFrom(addDaysKey(from, -SPAN))} aria-label="Earlier"><ChevronLeft className="h-4 w-4" /></button>
                    <p className="text-sm font-black text-gray-900">
                        {fmtIstDate(from + 'T00:00:00Z')} – {fmtIstDate(addDaysKey(from, SPAN - 1) + 'T00:00:00Z')}
                    </p>
                    <button className={ghostBtn} onClick={() => setFrom(addDaysKey(from, SPAN))} aria-label="Later"><ChevronRight className="h-4 w-4" /></button>
                    {from !== today && <button className={ghostBtn} onClick={() => setFrom(today)}>Today</button>}
                </div>

                <Card className="divide-y divide-gray-50">
                    {rows === null ? (
                        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                    ) : rows.map(r => (
                        <div key={r.date} className={`flex items-center justify-between gap-3 px-5 py-3 ${r.date === today ? 'bg-orange-50/60' : ''}`}>
                            <div className="w-28">
                                <p className="text-sm font-black text-gray-900">{fmtIstDate(r.date + 'T00:00:00Z')}</p>
                                <p className="text-[11px] text-gray-400 font-semibold">{WEEKDAYS[r.weekday]}{r.date === today ? ' · Today' : ''}</p>
                            </div>
                            <div className="flex-1 text-sm">
                                {r.shift ? (
                                    <span className="font-bold text-gray-800">{r.shift.name} <span className="font-medium text-gray-500">{r.shift.start}–{r.shift.end}</span></span>
                                ) : r.holiday ? (
                                    <span className="text-purple-700 font-semibold">{r.holiday}</span>
                                ) : r.weekOff ? (
                                    <span className="text-gray-400">Weekly off</span>
                                ) : (
                                    <span className="text-gray-400">General hours</span>
                                )}
                            </div>
                            <div className="flex gap-1.5">
                                {r.onLeave && <StatusPill status="Leave" />}
                                {r.holiday && <StatusPill status="Holiday" />}
                                {r.weekOff && !r.shift && <StatusPill status="Week-Off" />}
                            </div>
                        </div>
                    ))}
                </Card>
            </div>
        </AppShell>
    );
}
