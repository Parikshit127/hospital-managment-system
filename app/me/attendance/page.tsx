'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2, X, Send } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import {
    getMyAttendance, requestRegularization, cancelMyRegularization,
} from '@/app/actions/hr-self-service-actions';
import { fmtIstTime, fmtIstDate } from '@/app/lib/ist';
import { currentMonthKey, istTodayKey, addDaysKey, istHHmm } from '@/app/lib/hr/hr-dates';
import {
    Card, StatTile, StatusPill, CELL_STYLES, inputCls, labelCls, primaryBtn, ghostBtn,
    fmtHours, monthLabel, shiftMonth,
} from '@/app/components/hr/HrBits';

type View = NonNullable<Extract<Awaited<ReturnType<typeof getMyAttendance>>, { success: true }>['data']>;
type Day = View['days'][number];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MyAttendancePage() {
    const toast = useToast();
    const [month, setMonth] = useState(currentMonthKey());
    const [view, setView] = useState<View | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Day | null>(null);
    const [form, setForm] = useState({ inTime: '', outTime: '', status: '' as '' | 'Present' | 'Half-Day', reason: '' });
    const [submitting, setSubmitting] = useState(false);

    const today = istTodayKey();

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getMyAttendance(month);
        if (res.success && res.data) setView(res.data);
        else toast.error(('error' in res && res.error) || 'Could not load attendance');
        setLoading(false);
    }, [month, toast]);

    useEffect(() => { load(); }, [load]);

    const pendingByDate = useMemo(() => {
        const m = new Map<string, number>();
        view?.regularizations.forEach(r => { if (r.status === 'Pending') m.set(r.date, r.id); });
        return m;
    }, [view]);

    const openDay = (d: Day) => {
        if (d.status === 'N/A') return;
        setSelected(d);
        setForm({ inTime: istHHmm(d.check_in), outTime: istHHmm(d.check_out), status: '', reason: '' });
    };

    const windowDays = view?.policy.regularizationWindowDays ?? 7;
    const canRequest = (d: Day) =>
        d.date <= today && d.date >= addDaysKey(today, -windowDays) && d.status !== 'N/A' && d.status !== 'Upcoming'
        && d.status !== 'Holiday' && d.status !== 'Week-Off' && !pendingByDate.has(d.date);

    const submit = async () => {
        if (!selected) return;
        setSubmitting(true);
        const res = await requestRegularization({
            date: selected.date,
            inTime: form.inTime || undefined,
            outTime: form.outTime || undefined,
            status: form.status || undefined,
            reason: form.reason,
        });
        setSubmitting(false);
        if (res.success) {
            toast.success('Request sent to HR for approval');
            setSelected(null);
            load();
        } else {
            toast.error(('error' in res && res.error) || 'Could not submit');
        }
    };

    const cancel = async (id: number) => {
        const res = await cancelMyRegularization(id);
        if (res.success) { toast.success('Request cancelled'); load(); }
        else toast.error(('error' in res && res.error) || 'Could not cancel');
    };

    // Pad the grid so day 1 lands under its weekday.
    const lead = view ? new Date(`${view.days[0].date}T00:00:00Z`).getUTCDay() : 0;
    const s = view?.summary;

    return (
        <AppShell pageTitle="My Attendance" pageIcon={<CalendarCheck className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
            <div className="space-y-5 max-w-6xl">
                <div className="flex items-center gap-3">
                    <button onClick={() => setMonth(shiftMonth(month, -1))} className={ghostBtn} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                    <h2 className="text-lg font-black text-gray-900 min-w-44 text-center">{monthLabel(month)}</h2>
                    <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonthKey()} className={ghostBtn} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
                    {month !== currentMonthKey() && <button onClick={() => setMonth(currentMonthKey())} className={ghostBtn}>This month</button>}
                </div>

                {s && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        <StatTile label="Present" value={s.present} tone="text-emerald-600" />
                        <StatTile label="Half days" value={s.halfDay} tone="text-yellow-600" />
                        <StatTile label="Absent" value={s.absent} tone="text-red-600" />
                        <StatTile label="Leave" value={s.leave} tone="text-blue-600" />
                        <StatTile label="Late marks" value={s.lateCount} tone="text-orange-600" />
                        <StatTile label="Hours" value={fmtHours(s.totalHours)} />
                        <StatTile label="Payable days" value={s.payableDays} hint="incl. holidays & week-offs" />
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                    <Card className="xl:col-span-2 p-4">
                        {loading && !view ? (
                            <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                        ) : view && (
                            <>
                                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                                    {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-bold text-gray-400 uppercase">{w}</div>)}
                                </div>
                                <div className="grid grid-cols-7 gap-1.5">
                                    {Array.from({ length: lead }).map((_, i) => <div key={`pad-${i}`} />)}
                                    {view.days.map(d => (
                                        <button
                                            key={d.date}
                                            onClick={() => openDay(d)}
                                            className={`relative min-h-[68px] p-1.5 rounded-lg border text-left transition-shadow hover:shadow-md ${CELL_STYLES[d.status] ?? ''} ${d.date === today ? 'ring-2 ring-orange-400' : ''}`}
                                        >
                                            <span className="text-xs font-black">{Number(d.date.slice(8))}</span>
                                            <span className="block text-[9px] font-bold uppercase leading-tight mt-0.5 truncate">
                                                {d.holiday && d.status === 'Holiday' ? d.holiday : d.status === 'Upcoming' || d.status === 'N/A' ? '' : d.status}
                                            </span>
                                            {d.check_in && (
                                                <span className="block text-[9px] opacity-80 leading-tight">
                                                    {fmtIstTime(d.check_in)}{d.check_out ? `–${fmtIstTime(d.check_out)}` : ''}
                                                </span>
                                            )}
                                            {d.late_minutes > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-orange-500" title={`${d.late_minutes} min late`} />}
                                            {pendingByDate.has(d.date) && <span className="absolute bottom-1 right-1 text-[8px] font-black text-yellow-700">REQ</span>}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
                                    {['Present', 'Half-Day', 'Absent', 'Leave', 'Holiday', 'Week-Off'].map(k => (
                                        <span key={k} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded border ${CELL_STYLES[k]}`} />{k}</span>
                                    ))}
                                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> Late</span>
                                </div>
                            </>
                        )}
                    </Card>

                    <div className="space-y-5">
                        {selected && (
                            <Card className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900">{fmtIstDate(selected.date + 'T00:00:00Z')}</h3>
                                        <div className="mt-1 flex items-center gap-2"><StatusPill status={selected.status} />{selected.computed && <span className="text-[10px] text-gray-400">no punch recorded</span>}</div>
                                    </div>
                                    <button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Close"><X className="h-4 w-4 text-gray-400" /></button>
                                </div>
                                <dl className="grid grid-cols-3 gap-2 text-xs mb-4">
                                    <div><dt className="text-gray-400 font-semibold">In</dt><dd className="font-bold text-gray-800">{fmtIstTime(selected.check_in)}</dd></div>
                                    <div><dt className="text-gray-400 font-semibold">Out</dt><dd className="font-bold text-gray-800">{fmtIstTime(selected.check_out)}</dd></div>
                                    <div><dt className="text-gray-400 font-semibold">Hours</dt><dd className="font-bold text-gray-800">{fmtHours(selected.total_hours)}</dd></div>
                                </dl>

                                {canRequest(selected) ? (
                                    <div className="space-y-3 pt-3 border-t border-gray-100">
                                        <p className="text-xs font-bold text-gray-700">Request a correction</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className={labelCls}>Correct in</label><input type="time" className={inputCls} value={form.inTime} onChange={e => setForm({ ...form, inTime: e.target.value })} /></div>
                                            <div><label className={labelCls}>Correct out</label><input type="time" className={inputCls} value={form.outTime} onChange={e => setForm({ ...form, outTime: e.target.value })} /></div>
                                        </div>
                                        <div>
                                            <label className={labelCls}>Mark as</label>
                                            <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                                                <option value="">Decide from times</option>
                                                <option value="Present">Present (full day)</option>
                                                <option value="Half-Day">Half day</option>
                                            </select>
                                        </div>
                                        <div><label className={labelCls}>Reason *</label><textarea rows={2} className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Forgot to punch out, on duty at camp" /></div>
                                        <button onClick={submit} disabled={submitting || form.reason.trim().length < 5} className={`${primaryBtn} w-full`}>
                                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to HR
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-gray-400 pt-3 border-t border-gray-100">
                                        {pendingByDate.has(selected.date) ? 'A correction request for this day is already pending.'
                                            : `Corrections can be requested for working days in the last ${windowDays} days.`}
                                    </p>
                                )}
                            </Card>
                        )}

                        <Card className="p-5">
                            <h3 className="text-sm font-black text-gray-900 mb-3">Correction requests</h3>
                            {!view || view.regularizations.length === 0 ? (
                                <p className="text-sm text-gray-400">None this month.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {view.regularizations.map(r => (
                                        <li key={r.id} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-gray-800">{fmtIstDate(r.date + 'T00:00:00Z')}</span>
                                                <StatusPill status={r.status} />
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>
                                            {r.reviewNote && <p className="text-xs text-gray-400 italic">HR: {r.reviewNote}</p>}
                                            {r.status === 'Pending' && <button onClick={() => cancel(r.id)} className="mt-1 text-[11px] font-bold text-red-600 hover:underline">Cancel request</button>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
