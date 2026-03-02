'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Clock, Loader2, CheckCircle2, XCircle, Users, Calendar
} from 'lucide-react';
import { getAttendanceForDate, recordAttendance } from '@/app/actions/hr-actions';

export default function HRAttendancePage() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await getAttendanceForDate(date);
            if (res.success) setRecords(res.data || []);
        } catch (e) { console.error(e); }
        finally { setRefreshing(false); setLoading(false); }
    }, [date]);

    useEffect(() => { setLoading(true); loadData(); }, [loadData]);

    const handleMark = async (employeeId: number, status: string) => {
        setSaving(employeeId);
        try {
            await recordAttendance({ employeeId, date, status });
            await loadData();
        } catch (e) { console.error(e); }
        finally { setSaving(null); }
    };

    const handleTimeUpdate = async (employeeId: number, field: 'checkIn' | 'checkOut', value: string) => {
        const record = records.find(r => r.employee.id === employeeId);
        const currentStatus = record?.attendance?.status || 'Present';
        const data: any = { employeeId, date, status: currentStatus };
        if (field === 'checkIn') {
            data.checkIn = value;
            data.checkOut = record?.attendance?.check_out ? new Date(record.attendance.check_out).toTimeString().slice(0, 5) : undefined;
        } else {
            data.checkIn = record?.attendance?.check_in ? new Date(record.attendance.check_in).toTimeString().slice(0, 5) : undefined;
            data.checkOut = value;
        }
        setSaving(employeeId);
        try {
            await recordAttendance(data);
            await loadData();
        } catch (e) { console.error(e); }
        finally { setSaving(null); }
    };

    const handleBulkPresent = async () => {
        setSaving(-1);
        for (const r of records) {
            if (!r.attendance) {
                await recordAttendance({ employeeId: r.employee.id, date, status: 'Present' });
            }
        }
        await loadData();
        setSaving(null);
    };

    const presentCount = records.filter(r => r.attendance?.status === 'Present').length;
    const absentCount = records.filter(r => r.attendance?.status === 'Absent').length;
    const leaveCount = records.filter(r => r.attendance?.status === 'Leave').length;
    const unmarked = records.filter(r => !r.attendance).length;

    return (
        <AppShell pageTitle="Attendance" pageIcon={<Clock className="h-5 w-5" />}
            onRefresh={loadData} refreshing={refreshing}>
            <div className="space-y-4">
                {/* Controls */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                    </div>
                    {unmarked > 0 && (
                        <button onClick={handleBulkPresent} disabled={saving === -1}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all disabled:opacity-50">
                            {saving === -1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Mark All Present ({unmarked})
                        </button>
                    )}
                </div>

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total</span>
                        <p className="text-2xl font-black text-gray-900 mt-1">{records.length}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Present</span>
                        <p className="text-2xl font-black text-emerald-600 mt-1">{presentCount}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Absent</span>
                        <p className="text-2xl font-black text-red-600 mt-1">{absentCount}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">On Leave</span>
                        <p className="text-2xl font-black text-blue-600 mt-1">{leaveCount}</p>
                    </div>
                </div>

                {/* Attendance Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Designation</th>
                                    <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                                    <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Check In</th>
                                    <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Check Out</th>
                                    <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="px-4 py-12 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                                    </td></tr>
                                ) : records.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                        <Users className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <p className="font-medium">No active employees found</p>
                                    </td></tr>
                                ) : records.map((r: any) => {
                                    const emp = r.employee;
                                    const att = r.attendance;
                                    const status = att?.status || '';
                                    const isLoading = saving === emp.id;
                                    return (
                                        <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-900">{emp.name}</p>
                                                <p className="text-[10px] text-gray-400">{emp.employee_code}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">{emp.designation}</td>
                                            <td className="px-4 py-3 text-center">
                                                {status ? (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        status === 'Present' ? 'bg-green-100 text-green-700' :
                                                        status === 'Absent' ? 'bg-red-100 text-red-700' :
                                                        status === 'Half-Day' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>{status}</span>
                                                ) : (
                                                    <span className="text-[10px] text-gray-300 font-bold">UNMARKED</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <input type="time"
                                                    defaultValue={att?.check_in ? new Date(att.check_in).toTimeString().slice(0, 5) : ''}
                                                    onBlur={e => e.target.value && handleTimeUpdate(emp.id, 'checkIn', e.target.value)}
                                                    className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-24 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <input type="time"
                                                    defaultValue={att?.check_out ? new Date(att.check_out).toTimeString().slice(0, 5) : ''}
                                                    onBlur={e => e.target.value && handleTimeUpdate(emp.id, 'checkOut', e.target.value)}
                                                    className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-24 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    {isLoading ? (
                                                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                                    ) : (
                                                        <>
                                                            {['Present', 'Absent', 'Half-Day', 'Leave'].map(s => (
                                                                <button key={s} onClick={() => handleMark(emp.id, s)}
                                                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                                                        status === s
                                                                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                                                                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                                                    }`}>
                                                                    {s === 'Present' ? 'P' : s === 'Absent' ? 'A' : s === 'Half-Day' ? 'H' : 'L'}
                                                                </button>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
