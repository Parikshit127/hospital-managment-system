'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    CalendarCheck, Loader2, Search, AlertTriangle,
    Calendar, User, Stethoscope, Building2, FileX
} from 'lucide-react';
import { getNoShowReport } from '@/app/actions/opd-manager-actions';

export default function OPDManagerAppointmentsPage() {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [daysFilter, setDaysFilter] = useState(7);
    const [searchTerm, setSearchTerm] = useState('');

    const loadData = useCallback(async () => {
        setRefreshing(true);
        const res = await getNoShowReport(daysFilter);
        if (res.success) setRecords(res.data || []);
        setRefreshing(false);
        setLoading(false);
    }, [daysFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    const filtered = records.filter((r) =>
        r.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.doctorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reason?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Group stats
    const byDepartment: Record<string, number> = {};
    for (const r of records) {
        const dept = r.department || 'Unknown';
        byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    }
    const topDepartments = Object.entries(byDepartment)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    if (loading) {
        return (
            <AppShell pageTitle="Appointments" pageIcon={<CalendarCheck className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading appointment data...</span>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle="No-Show & Cancellation Tracking"
            pageIcon={<CalendarCheck className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            {/* Summary Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Cancellations</span>
                    <p className="text-2xl font-black text-red-600 mt-1">{records.length}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Last {daysFilter} days</p>
                </div>
                {topDepartments.slice(0, 3).map(([dept, count], idx) => (
                    <div key={dept} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{dept}</span>
                        <p className="text-2xl font-black text-gray-900 mt-1">{count}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">cancellation{count !== 1 ? 's' : ''}</p>
                    </div>
                ))}
            </div>

            {/* Filter & Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 border-b border-gray-100">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            type="text"
                            placeholder="Search by patient, doctor, department, or reason..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 text-sm font-medium outline-none transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Period:</span>
                        {[7, 14, 30].map((d) => (
                            <button
                                key={d}
                                onClick={() => { setDaysFilter(d); setLoading(true); }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    daysFilter === d
                                        ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-sm'
                                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4">Department</th>
                                <th className="px-6 py-4">Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map((record: any) => (
                                <tr key={record.appointmentId} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-gray-300 group-hover:text-red-400 transition-colors" />
                                            <div>
                                                <p className="font-bold text-gray-900">
                                                    {new Date(record.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </p>
                                                <p className="text-[10px] text-gray-400">
                                                    {new Date(record.date).toLocaleDateString(undefined, { weekday: 'short' })}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                                                <User className="h-3.5 w-3.5 text-gray-400" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{record.patientName}</p>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">ID: {record.patientId}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-medium text-gray-700">{record.doctorName || 'N/A'}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                                            <Building2 className="h-3 w-3" />
                                            {record.department || 'General'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm text-gray-500 font-medium max-w-xs truncate" title={record.reason}>
                                            {record.reason}
                                        </p>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center">
                                        <FileX className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-400 font-medium">No cancellations found</p>
                                        <p className="text-gray-300 text-sm mt-1">
                                            {searchTerm ? 'Try adjusting your search term' : `No cancellations in the last ${daysFilter} days`}
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                {filtered.length > 0 && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-xs text-gray-400 font-medium">
                            Showing {filtered.length} of {records.length} record{records.length !== 1 ? 's' : ''}
                        </p>
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-xs text-gray-400 font-medium">Frequent no-shows may indicate scheduling issues</span>
                        </div>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
