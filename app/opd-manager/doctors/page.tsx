'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Stethoscope, Loader2, Users, Search, ArrowUpDown,
    CheckCircle2, CalendarCheck, TrendingUp, TrendingDown
} from 'lucide-react';
import { getDoctorUtilization } from '@/app/actions/opd-manager-actions';

export default function OPDManagerDoctorsPage() {
    const [doctors, setDoctors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'utilizationPct' | 'doctorName' | 'totalAppointments'>('utilizationPct');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const loadData = useCallback(async () => {
        setRefreshing(true);
        const res = await getDoctorUtilization();
        if (res.success) setDoctors(res.data || []);
        setRefreshing(false);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const toggleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const filtered = doctors
        .filter((doc) =>
            doc.doctorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.specialty.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (typeof aVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

    // Summary stats
    const avgUtilization = doctors.length > 0
        ? Math.round(doctors.reduce((s, d) => s + d.utilizationPct, 0) / doctors.length)
        : 0;
    const totalAppts = doctors.reduce((s, d) => s + d.totalAppointments, 0);
    const totalCompleted = doctors.reduce((s, d) => s + d.completedAppointments, 0);

    if (loading) {
        return (
            <AppShell pageTitle="Doctor Availability" pageIcon={<Stethoscope className="h-5 w-5" />}>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="ml-3 text-gray-500 font-medium">Loading doctors...</span>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle="Doctor Availability"
            pageIcon={<Stethoscope className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Doctors</span>
                    <p className="text-2xl font-black text-gray-900 mt-1">{doctors.length}</p>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Utilization</span>
                    <p className={`text-2xl font-black mt-1 ${
                        avgUtilization >= 70 ? 'text-emerald-600' :
                        avgUtilization >= 40 ? 'text-amber-600' :
                        'text-red-600'
                    }`}>{avgUtilization}%</p>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Appointments</span>
                    <p className="text-2xl font-black text-indigo-600 mt-1">{totalAppts}</p>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed</span>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{totalCompleted}</p>
                </div>
            </div>

            {/* Search and Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 bg-gray-50 border-b border-gray-100">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            type="text"
                            placeholder="Search by doctor name or specialty..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 text-sm font-medium outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Doctor Cards (Grid) */}
                <div className="p-4">
                    {filtered.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filtered.map((doc) => {
                                const isHigh = doc.utilizationPct >= 70;
                                const isMid = doc.utilizationPct >= 40 && doc.utilizationPct < 70;
                                const isLow = doc.utilizationPct < 40;
                                return (
                                    <div
                                        key={doc.doctorId}
                                        className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-teal-300 hover:shadow-md transition-all"
                                    >
                                        {/* Doctor Info */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                    isHigh ? 'bg-emerald-50' : isMid ? 'bg-amber-50' : 'bg-red-50'
                                                }`}>
                                                    <Stethoscope className={`h-5 w-5 ${
                                                        isHigh ? 'text-emerald-600' : isMid ? 'text-amber-600' : 'text-red-500'
                                                    }`} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{doc.doctorName}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">{doc.specialty}</p>
                                                </div>
                                            </div>
                                            {isHigh && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                                            {isLow && <TrendingDown className="h-4 w-4 text-red-400" />}
                                        </div>

                                        {/* Utilization Bar */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Utilization</span>
                                                <span className={`text-sm font-black ${
                                                    isHigh ? 'text-emerald-600' : isMid ? 'text-amber-600' : 'text-red-600'
                                                }`}>{doc.utilizationPct}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                                                <div
                                                    className={`h-2.5 rounded-full transition-all duration-700 ${
                                                        isHigh ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                                                        isMid ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                        'bg-gradient-to-r from-red-300 to-red-500'
                                                    }`}
                                                    style={{ width: `${Math.min(doc.utilizationPct, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Stats Row */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                                <p className="text-lg font-black text-gray-900">{doc.totalAppointments}</p>
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Booked</p>
                                            </div>
                                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                                <p className="text-lg font-black text-emerald-600">{doc.completedAppointments}</p>
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Done</p>
                                            </div>
                                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                                <p className="text-lg font-black text-blue-600">{doc.totalSlots}</p>
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Slots</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-16 text-gray-400">
                            <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                            <p className="font-medium">No doctors found</p>
                            <p className="text-sm text-gray-300 mt-1">Try adjusting your search term</p>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
