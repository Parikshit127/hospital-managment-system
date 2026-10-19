'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    Home, LogIn, LogOut, Loader2, MapPin, Clock, CalendarDays, Sun, Users, AlertCircle, ChevronRight,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getMyWorkspace, punch } from '@/app/actions/hr-self-service-actions';
import { fmtIstTime, fmtIstDate, IST } from '@/app/lib/ist';
import { Card, StatTile, StatusPill, fmtDuration, fmtHours, monthLabel } from '@/app/components/hr/HrBits';

type Workspace = Extract<Awaited<ReturnType<typeof getMyWorkspace>>, { success: true }>['data'];

function greeting(date: Date) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hour12: false }).format(date));
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function MyWorkspacePage() {
    const toast = useToast();
    const [ws, setWs] = useState<Workspace | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [punching, setPunching] = useState(false);
    // Offset between the server clock and this device, so the on-screen clock is the server's.
    const skew = useRef(0);
    const [now, setNow] = useState<Date>(new Date());

    const load = useCallback(async () => {
        const res = await getMyWorkspace();
        if (res.success && res.data) {
            skew.current = new Date(res.data.serverNow).getTime() - Date.now();
            setWs(res.data);
            setError('');
        } else {
            setError(('error' in res && res.error) || 'Could not load your workspace');
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date(Date.now() + skew.current)), 1000);
        return () => clearInterval(t);
    }, []);

    const getPosition = () =>
        new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('This browser cannot share location.'));
            navigator.geolocation.getCurrentPosition(resolve, err =>
                reject(new Error(err.code === err.PERMISSION_DENIED
                    ? 'Location permission denied. Allow location for this site and try again.'
                    : 'Could not get your location. Move to an open area and retry.')),
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
        });

    const doPunch = async () => {
        if (!ws) return;
        setPunching(true);
        try {
            const type = ws.punch.isIn ? 'OUT' : 'IN';
            let geo: { lat?: number; lng?: number; accuracy?: number } = {};
            if (ws.policy.requireGeo) {
                const pos = await getPosition();
                geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            }
            const res = await punch({ type, ...geo });
            if (res.success && res.data) {
                const late = res.data.lateMinutes > 0 && type === 'IN' ? ` · ${res.data.lateMinutes} min late` : '';
                toast.success(`Punched ${type === 'IN' ? 'in' : 'out'} at ${fmtIstTime(res.data.at)}${late}`);
            } else {
                toast.error(('error' in res && res.error) || 'Punch failed');
            }
            await load();
        } catch (e: any) {
            toast.error(e?.message || 'Punch failed');
        } finally {
            setPunching(false);
        }
    };

    if (loading) {
        return (
            <AppShell pageTitle="My Workspace" pageIcon={<Home className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24 text-gray-500">
                    <Loader2 className="h-7 w-7 animate-spin text-orange-500 mr-3" /> Loading your workspace…
                </div>
            </AppShell>
        );
    }
    if (error || !ws) {
        return (
            <AppShell pageTitle="My Workspace" pageIcon={<Home className="h-5 w-5" />}>
                <div className="flex flex-col items-center py-20">
                    <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
                    <p className="font-bold text-gray-700">{error || 'Something went wrong'}</p>
                    <button onClick={() => { setLoading(true); load(); }} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold">Retry</button>
                </div>
            </AppShell>
        );
    }

    const s = ws.month.summary;
    const sinceMs = ws.punch.since ? now.getTime() - new Date(ws.punch.since).getTime() : 0;
    const today = ws.today;

    return (
        <AppShell pageTitle="My Workspace" pageIcon={<Home className="h-5 w-5" />} onRefresh={load}>
            <div className="space-y-5 max-w-6xl">
                <div>
                    <h2 className="text-xl font-black text-gray-900">{greeting(now)}, {ws.employee.name.split(' ')[0]}</h2>
                    <p className="text-sm text-gray-500">
                        {ws.employee.designation}{ws.employee.department ? ` · ${ws.employee.department}` : ''} · {ws.employee.code}
                        {ws.employee.manager ? ` · Reports to ${ws.employee.manager}` : ''}
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Punch card */}
                    <Card className="lg:col-span-2 p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                            <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                    {fmtIstDate(now)} · {ws.todayShift.name} shift ({ws.todayShift.start}–{ws.todayShift.end})
                                </p>
                                <p className="text-5xl font-black text-gray-900 tabular-nums mt-1">
                                    {new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)}
                                </p>
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                    {ws.punch.isIn ? (
                                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Working · in at {fmtIstTime(ws.punch.since)} · {fmtDuration(sinceMs)}
                                        </span>
                                    ) : today && today.check_in ? (
                                        <span className="text-sm font-bold text-gray-600">
                                            Done for now · {fmtHours(today.total_hours)} logged
                                        </span>
                                    ) : (
                                        <span className="text-sm font-bold text-gray-500">Not punched in yet</span>
                                    )}
                                    {today && <StatusPill status={today.status} />}
                                    {today && today.late_minutes > 0 && (
                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                                            {today.late_minutes} min late
                                        </span>
                                    )}
                                </div>
                                {ws.policy.requireGeo && (
                                    <p className="mt-2 text-[11px] text-gray-400 flex items-center gap-1">
                                        <MapPin className="h-3 w-3" /> Your location is checked when you punch.
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={doPunch}
                                disabled={punching}
                                className={`shrink-0 flex flex-col items-center justify-center gap-1 h-32 w-32 rounded-full text-white font-black shadow-lg transition-all active:scale-95 disabled:opacity-60 ${
                                    ws.punch.isIn
                                        ? 'bg-gradient-to-br from-rose-500 to-red-600 hover:shadow-red-500/30'
                                        : 'bg-gradient-to-br from-teal-500 to-emerald-600 hover:shadow-emerald-500/30'
                                }`}
                            >
                                {punching ? <Loader2 className="h-7 w-7 animate-spin" /> : ws.punch.isIn ? <LogOut className="h-7 w-7" /> : <LogIn className="h-7 w-7" />}
                                <span className="text-sm">{punching ? 'Please wait' : ws.punch.isIn ? 'Punch Out' : 'Punch In'}</span>
                            </button>
                        </div>

                        {ws.todayEvents.length > 0 && (
                            <div className="mt-5 pt-4 border-t border-gray-100">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Today&apos;s punches</p>
                                <div className="flex flex-wrap gap-2">
                                    {ws.todayEvents.map(e => (
                                        <span key={e.id} className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                            e.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                        }`}>
                                            {e.type === 'IN' ? 'In' : 'Out'} {fmtIstTime(e.at)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Leave balances */}
                    <Card className="p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-orange-500" /> Leave balance</h3>
                            <Link href="/me/leave" className="text-xs font-bold text-orange-600 hover:underline">Apply</Link>
                        </div>
                        {ws.leaveBalances.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4">No leave types configured yet. HR can add them under HR → Settings.</p>
                        ) : (
                            <div className="space-y-3">
                                {ws.leaveBalances.map(b => (
                                    <div key={b.leaveTypeId}>
                                        <div className="flex justify-between text-xs font-bold text-gray-700">
                                            <span>{b.leaveType}</span>
                                            <span>{b.remaining} <span className="text-gray-400 font-medium">of {b.total} left</span></span>
                                        </div>
                                        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${b.total ? Math.max(0, Math.min(100, (b.remaining / b.total) * 100)) : 0}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {ws.pending.leave > 0 && <p className="mt-3 text-[11px] text-yellow-700 font-semibold">{ws.pending.leave} request(s) awaiting approval</p>}
                    </Card>
                </div>

                {/* Month summary */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-gray-900">{monthLabel(ws.month.key)}</h3>
                        <Link href="/me/attendance" className="text-xs font-bold text-orange-600 hover:underline flex items-center">View calendar <ChevronRight className="h-3 w-3" /></Link>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <StatTile label="Present" value={s.present} tone="text-emerald-600" />
                        <StatTile label="Half days" value={s.halfDay} tone="text-yellow-600" />
                        <StatTile label="Absent" value={s.absent} tone="text-red-600" />
                        <StatTile label="On leave" value={s.leave} tone="text-blue-600" />
                        <StatTile label="Late marks" value={s.lateCount} tone="text-orange-600" />
                        <StatTile label="Hours worked" value={fmtHours(s.totalHours)} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <Card className="p-5">
                        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-orange-500" /> Upcoming shifts</h3>
                        {ws.upcomingShifts.length === 0 ? (
                            <p className="text-sm text-gray-400">No shifts rostered for the next week. General hours apply ({ws.policy.workStart}–{ws.policy.workEnd}).</p>
                        ) : (
                            <ul className="space-y-2">
                                {ws.upcomingShifts.map(sh => (
                                    <li key={sh.date} className="flex justify-between text-sm">
                                        <span className="font-semibold text-gray-700">{fmtIstDate(sh.date + 'T00:00:00Z')}</span>
                                        <span className="text-gray-500">{sh.name} · {sh.start}–{sh.end}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Link href="/me/roster" className="mt-3 inline-block text-xs font-bold text-orange-600 hover:underline">Full roster</Link>
                    </Card>

                    <Card className="p-5">
                        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-3"><Sun className="h-4 w-4 text-orange-500" /> Upcoming holidays</h3>
                        {ws.upcomingHolidays.length === 0 ? (
                            <p className="text-sm text-gray-400">No holidays in the next 90 days.</p>
                        ) : (
                            <ul className="space-y-2">
                                {ws.upcomingHolidays.map(h => (
                                    <li key={h.date + h.name} className="flex justify-between text-sm">
                                        <span className="font-semibold text-gray-700">{h.name}</span>
                                        <span className="text-gray-500">{fmtIstDate(h.date + 'T00:00:00Z')}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card className="p-5">
                        <h3 className="text-sm font-black text-gray-900 mb-3">Requests</h3>
                        <ul className="space-y-2 text-sm">
                            <li className="flex justify-between"><span className="text-gray-600">Leave awaiting approval</span><span className="font-black">{ws.pending.leave}</span></li>
                            <li className="flex justify-between"><span className="text-gray-600">Attendance corrections pending</span><span className="font-black">{ws.pending.regularizations}</span></li>
                        </ul>
                        {ws.team && (
                            <Link href="/me/approvals" className="mt-4 flex items-center justify-between p-3 rounded-xl bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors">
                                <span className="flex items-center gap-2 text-sm font-bold text-orange-800"><Users className="h-4 w-4" /> Team approvals ({ws.team.reports} reports)</span>
                                <span className="text-sm font-black text-orange-700">{ws.team.pendingLeave + ws.team.pendingRegularizations}</span>
                            </Link>
                        )}
                    </Card>
                </div>
            </div>
        </AppShell>
    );
}
