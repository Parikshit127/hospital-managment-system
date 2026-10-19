'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    LayoutDashboard, Users, UserPlus, CalendarCheck, ClipboardList, Loader2, AlertCircle,
    Briefcase, FileClock, RefreshCw, CalendarRange,
} from 'lucide-react';
import { getHRDashboard, syncEmployeesFromUsers } from '@/app/actions/hr-actions';
import { useToast } from '@/app/components/ui/Toast';
import { Card, StatTile } from '@/app/components/hr/HrBits';
import { fmtIstDate } from '@/app/lib/ist';

type Dash = NonNullable<Extract<Awaited<ReturnType<typeof getHRDashboard>>, { success: true }>['data']>;

function Bars({ title, items, icon }: { title: string; items: { label: string; count: number }[]; icon: React.ReactNode }) {
    const max = Math.max(...items.map(i => i.count), 1);
    return (
        <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">{icon}<h2 className="text-lg font-black text-gray-900">{title}</h2></div>
            {items.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-gray-400"><Users className="h-9 w-9 mb-2" /><p className="text-sm font-medium">No data yet</p></div>
            ) : (
                <div className="space-y-3">
                    {items.map(i => (
                        <div key={i.label} className="flex items-center gap-4">
                            <div className="w-32 sm:w-44 text-sm font-semibold text-gray-700 truncate">{i.label}</div>
                            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max((i.count / max) * 100, 8)}%` }}>
                                    <span className="text-[10px] font-bold text-white">{i.count}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

export default function HRDashboard() {
    const toast = useToast();
    const [data, setData] = useState<Dash | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await getHRDashboard();
            if (res.success && res.data) setData(res.data as Dash);
            else setError(true);
        } catch { setError(true); }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const sync = async () => {
        setSyncing(true);
        const res: any = await syncEmployeesFromUsers();
        setSyncing(false);
        if (res.success) { toast.success(`Created ${res.created} employee profile(s)`); loadData(); }
        else toast.error(res.error || 'Sync failed');
    };

    if (loading && !data) {
        return (
            <AppShell pageTitle="HR Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading HR Dashboard...</span>
                </div>
            </AppShell>
        );
    }

    if (error || !data) {
        return (
            <AppShell pageTitle="HR Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />}>
                <div className="flex flex-col items-center justify-center py-20">
                    <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                    <p className="text-gray-600 font-bold text-lg">Failed to load dashboard data</p>
                    <button onClick={loadData} className="mt-4 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-shadow">Retry</button>
                </div>
            </AppShell>
        );
    }

    const t = data.today;
    const attention = [
        { label: 'Leave requests to review', value: data.pendingLeave, href: '/hr/leave', icon: ClipboardList },
        { label: 'Attendance corrections to review', value: data.pendingRegularizations, href: '/hr/regularizations', icon: FileClock },
    ].filter(a => a.value > 0);

    return (
        <AppShell pageTitle="HR Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
            <div className="space-y-6">
                <div>
                    <div className="flex items-baseline gap-3 mb-2">
                        <h2 className="text-sm font-black text-gray-900">Today · {fmtIstDate(t.date + 'T00:00:00Z')}</h2>
                        {t.holiday && <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{t.holiday}</span>}
                        {t.isOffDay && !t.holiday && <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Weekly off</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <StatTile label="Total staff" value={data.totalStrength} />
                        <StatTile label="Present" value={t.present} tone="text-emerald-600" />
                        <StatTile label="Half day" value={t.halfDay} tone="text-yellow-600" />
                        <StatTile label="On leave" value={t.onLeave} tone="text-blue-600" />
                        <StatTile label="Late today" value={t.late} tone="text-orange-600" />
                        <StatTile label="Not punched in" value={t.notPunched} tone={t.notPunched ? 'text-red-600' : 'text-gray-900'} />
                    </div>
                </div>

                {(attention.length > 0 || data.usersWithoutProfile > 0) && (
                    <Card className="p-5 border-orange-200 bg-orange-50/40">
                        <h3 className="text-sm font-black text-gray-900 mb-3">Needs your attention</h3>
                        <div className="flex flex-wrap gap-3">
                            {attention.map(a => (
                                <Link key={a.href} href={a.href} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                                    <a.icon className="h-4 w-4 text-orange-600" />
                                    <span className="text-sm font-semibold text-gray-700">{a.label}</span>
                                    <span className="text-lg font-black text-orange-600">{a.value}</span>
                                </Link>
                            ))}
                            {data.usersWithoutProfile > 0 && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
                                    <Users className="h-4 w-4 text-orange-600" />
                                    <span className="text-sm font-semibold text-gray-700">{data.usersWithoutProfile} login(s) have no employee profile</span>
                                    <button onClick={sync} disabled={syncing} className="px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1">
                                        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Create profiles
                                    </button>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { href: '/hr/employees/new', icon: UserPlus, label: 'Add Employee' },
                        { href: '/hr/attendance', icon: CalendarCheck, label: 'Daily Attendance' },
                        { href: '/hr/attendance/monthly', icon: CalendarRange, label: 'Monthly Sheet' },
                        { href: '/hr/leave', icon: ClipboardList, label: 'Leave Requests' },
                    ].map(q => (
                        <Link key={q.href} href={q.href} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl p-4 flex items-center gap-3 hover:shadow-lg hover:shadow-teal-500/20 transition-all">
                            <q.icon className="h-5 w-5" /> {q.label}
                        </Link>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <Bars title="By role" icon={<Briefcase className="h-5 w-5 text-orange-600" />} items={data.roleBreakdown.map(r => ({ label: r.role, count: r.count }))} />
                    <Bars title="By department" icon={<Users className="h-5 w-5 text-orange-600" />} items={data.departmentBreakdown.map(d => ({ label: d.department, count: d.count }))} />
                </div>
            </div>
        </AppShell>
    );
}
