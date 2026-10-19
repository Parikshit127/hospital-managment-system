'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, ChevronLeft, ChevronRight, Download, Loader2, ArrowLeft, Search } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getMonthlyAttendance } from '@/app/actions/hr-actions';
import { currentMonthKey } from '@/app/lib/hr/hr-dates';
import { Card, CELL_STYLES, ghostBtn, inputCls, monthLabel, shiftMonth } from '@/app/components/hr/HrBits';

type Data = NonNullable<Extract<Awaited<ReturnType<typeof getMonthlyAttendance>>, { success: true }>['data']>;

const CODE: Record<string, string> = {
    Present: 'P', 'Half-Day': 'H', Absent: 'A', Leave: 'L', Holiday: 'HD', 'Week-Off': 'WO',
    'Not Marked': '?', Upcoming: '', 'N/A': '',
};

export default function MonthlyAttendancePage() {
    const toast = useToast();
    const [month, setMonth] = useState(currentMonthKey());
    const [search, setSearch] = useState('');
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getMonthlyAttendance(month, { search: search || undefined });
        if (res.success && res.data) setData(res.data);
        else toast.error('Could not load the monthly sheet');
        setLoading(false);
    }, [month, search, toast]);

    useEffect(() => {
        const t = setTimeout(load, search ? 300 : 0); // debounce typing
        return () => clearTimeout(t);
    }, [load, search]);

    const exportCsv = () => {
        if (!data) return;
        const head = ['Code', 'Name', 'Designation', ...data.dates.map(d => d.slice(8)), 'Present', 'Half', 'Absent', 'Leave', 'Late', 'Hours', 'Payable days'];
        const lines = data.rows.map(r => [
            r.employee.employee_code, r.employee.name, r.employee.designation,
            ...r.days.map(d => CODE[d.status] ?? ''),
            r.summary.present, r.summary.halfDay, r.summary.absent, r.summary.leave, r.summary.lateCount, r.summary.totalHours, r.summary.payableDays,
        ]);
        const csv = [head, ...lines].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `attendance-${month}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <AppShell pageTitle="Monthly Attendance" pageIcon={<CalendarRange className="h-5 w-5" />} onRefresh={load} refreshing={loading}
            headerActions={
                <div className="flex items-center gap-2">
                    <Link href="/hr/attendance" className={ghostBtn}><ArrowLeft className="h-3.5 w-3.5" /> Daily view</Link>
                    <button onClick={exportCsv} disabled={!data} className={ghostBtn}><Download className="h-3.5 w-3.5" /> CSV</button>
                </div>
            }>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setMonth(shiftMonth(month, -1))} className={ghostBtn} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                    <h2 className="text-lg font-black text-gray-900 min-w-44 text-center">{monthLabel(month)}</h2>
                    <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonthKey()} className={ghostBtn} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
                    <div className="relative ml-auto">
                        <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code" className={`${inputCls} pl-9 w-60`} />
                    </div>
                </div>

                <Card className="overflow-hidden">
                    {loading && !data ? (
                        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                    ) : !data || data.rows.length === 0 ? (
                        <p className="py-16 text-center text-gray-400 text-sm">No employees found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase min-w-52">Employee</th>
                                        {data.dates.map(d => (
                                            <th key={d} className={`px-0.5 py-2 text-[10px] font-semibold w-7 text-center ${data.holidays[d] ? 'text-purple-600' : 'text-gray-400'}`} title={data.holidays[d]}>{d.slice(8)}</th>
                                        ))}
                                        {['P', 'H', 'A', 'L', 'Late', 'Payable'].map(h => (
                                            <th key={h} className="px-2 py-2 text-[10px] font-semibold text-gray-400 uppercase text-center">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.employee.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                            <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                                                <Link href={`/hr/employees/${r.employee.id}`} className="font-bold text-gray-900 hover:text-orange-600">{r.employee.name}</Link>
                                                <p className="text-[10px] text-gray-400">{r.employee.employee_code} · {r.employee.designation}</p>
                                            </td>
                                            {r.days.map(d => (
                                                <td key={d.date} className="p-0.5">
                                                    <div title={`${d.date} · ${d.status}${d.late ? ' · late' : ''}`}
                                                        className={`h-6 w-6 rounded flex items-center justify-center text-[9px] font-black border ${CELL_STYLES[d.status] ?? ''} ${d.late ? 'ring-1 ring-orange-400' : ''}`}>
                                                        {CODE[d.status]}
                                                    </div>
                                                </td>
                                            ))}
                                            <td className="px-2 text-center font-bold text-emerald-600">{r.summary.present}</td>
                                            <td className="px-2 text-center font-bold text-yellow-600">{r.summary.halfDay}</td>
                                            <td className="px-2 text-center font-bold text-red-600">{r.summary.absent}</td>
                                            <td className="px-2 text-center font-bold text-blue-600">{r.summary.leave}</td>
                                            <td className="px-2 text-center font-bold text-orange-600">{r.summary.lateCount}</td>
                                            <td className="px-2 text-center font-black text-gray-900">{r.summary.payableDays}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
                <p className="text-[11px] text-gray-400">
                    P present · H half day · A absent (also shown for working days with no record) · L leave · HD holiday · WO weekly off · ? today, not yet marked. Orange ring = late.
                </p>
            </div>
        </AppShell>
    );
}
