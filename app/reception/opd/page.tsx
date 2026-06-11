'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Stethoscope, Clock, Activity, CheckCircle2, Loader2,
    Users, Phone, Eye, Filter, Search, ChevronLeft, ChevronRight, Printer,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { getRegisteredPatients, getReceptionStats } from '@/app/actions/reception-actions';

export default function OPDPatientsPage() {
    const [patients, setPatients] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [patientsRes, statsRes] = await Promise.all([
                getRegisteredPatients({ search, department, page, limit: 25, dateRange }),
                getReceptionStats(),
            ]);
            if (patientsRes.success) {
                setPatients(patientsRes.data || []);
                setTotalPages(patientsRes.totalPages || 0);
                setTotal(patientsRes.total || 0);
            }
            if (statsRes.success) setStats(statsRes.data);
        } catch (err) {
            console.error('OPD load error:', err);
        }
        setLoading(false);
    }, [search, department, page, dateRange]);

    useEffect(() => { loadData(); }, [loadData]);

    // Debounced search
    const [searchInput, setSearchInput] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const getStatusColor = (status: string | null) => {
        if (!status) return 'bg-gray-100 text-gray-500';
        const map: Record<string, string> = {
            'Pending': 'bg-amber-50 text-amber-700 border border-amber-200',
            'Scheduled': 'bg-blue-50 text-blue-700 border border-blue-200',
            'Checked In': 'bg-orange-50 text-orange-700 border border-orange-200',
            'In Progress': 'bg-violet-50 text-violet-700 border border-violet-200',
            'Completed': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            'Admitted': 'bg-rose-50 text-rose-700 border border-rose-200',
        };
        return map[status] || 'bg-gray-100 text-gray-500';
    };

    const headerActions = (
        <Link
            href="/reception/appointments"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
        >
            <Stethoscope className="h-3.5 w-3.5" /> New Appointment
        </Link>
    );

    return (
        <AppShell
            pageTitle="OPD Patients"
            pageIcon={<Stethoscope className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">

                {/* PAGE HEADER */}
                <div>
                    <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Stethoscope className="h-5 w-5 text-emerald-500" />
                        OPD Patients
                    </h1>
                    <p className="text-xs text-gray-400 mt-0.5">All outpatient patients</p>
                </div>

                {/* KPI CARDS */}
                {loading && !stats ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse h-20" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white border-l-4 border-l-emerald-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Patients</span>
                                <div className="p-1.5 bg-emerald-50 rounded-lg">
                                    <Users className="h-3.5 w-3.5 text-emerald-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.totalPatients ?? 0}</p>
                        </div>

                        <div className="bg-white border-l-4 border-l-amber-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Today&apos;s Registrations</span>
                                <div className="p-1.5 bg-amber-50 rounded-lg">
                                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.todayRegistrations ?? 0}</p>
                        </div>

                        <div className="bg-white border-l-4 border-l-blue-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Today&apos;s Appointments</span>
                                <div className="p-1.5 bg-blue-50 rounded-lg">
                                    <Activity className="h-3.5 w-3.5 text-blue-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.todayAppointments ?? 0}</p>
                        </div>

                        <div className="bg-white border-l-4 border-l-green-400 border border-gray-200 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Completed Today</span>
                                <div className="p-1.5 bg-green-50 rounded-lg">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{stats?.completedToday ?? 0}</p>
                        </div>
                    </div>
                )}

                {/* SEARCH & FILTERS */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search by name, patient ID, or phone..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={department}
                            onChange={e => { setDepartment(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-emerald-500"
                        >
                            <option value="">All Departments</option>
                            <option value="General Medicine">General Medicine</option>
                            <option value="Cardiology">Cardiology</option>
                            <option value="Orthopedics">Orthopedics</option>
                            <option value="Pediatrics">Pediatrics</option>
                            <option value="Neurology">Neurology</option>
                            <option value="ENT">ENT</option>
                            <option value="Dermatology">Dermatology</option>
                            <option value="Pulmonology">Pulmonology</option>
                        </select>
                        <select
                            value={dateRange}
                            onChange={e => { setDateRange(e.target.value as any); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-emerald-500"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                        </select>
                    </div>
                </div>

                {/* PATIENT TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50/60">
                                    {[
                                        'Patient ID', 'Name', 'Age / Gender', 'Phone',
                                        'Department', 'Registered', 'Status', 'Balance', 'Actions',
                                    ].map(h => (
                                        <th
                                            key={h}
                                            className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && patients.length === 0 ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <tr key={`skel-${i}`}>
                                            {Array.from({ length: 9 }).map((_, c) => (
                                                <td key={c} className="px-4 py-3.5">
                                                    <div className="h-2.5 bg-gray-100 rounded animate-pulse" style={{ width: c === 1 ? '70%' : c === 8 ? '4rem' : '55%' }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : patients.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-16">
                                            <Stethoscope className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                                            <p className="text-sm font-medium text-gray-400">No patients found</p>
                                            <p className="text-xs text-gray-300 mt-1">Try adjusting your search or filters</p>
                                        </td>
                                    </tr>
                                ) : (
                                    patients.map((patient: any) => (
                                        <tr key={patient.patient_id} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-mono font-bold text-orange-600">{patient.patient_id}</span>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                                {patient.full_name}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {patient.age ?? '-'} / {patient.gender ?? '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {patient.phone ? (
                                                    <span className="flex items-center gap-1">
                                                        <Phone className="h-3 w-3 flex-shrink-0" />
                                                        {patient.phone}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {patient.department || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                                {new Date(patient.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3">
                                                {patient.lastAppointmentStatus ? (
                                                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${getStatusColor(patient.lastAppointmentStatus)}`}>
                                                        {patient.lastAppointmentStatus}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {patient.totalBalance > 0 ? (
                                                    <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">₹ {Number(patient.totalBalance).toFixed(2)}</span>
                                                ) : (
                                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">₹ 0</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <Link
                                                        href={`/reception/patient/${patient.patient_id}`}
                                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-emerald-600 transition-colors inline-flex"
                                                        title="View Full Profile"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                    <button
                                                        onClick={() => window.open(`/api/opd/${patient.patient_id}/registration-slip`, '_blank')}
                                                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors inline-flex"
                                                        title="Print OPD registration slip"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                            <span className="text-xs text-gray-400">
                                Showing {((page - 1) * 25) + 1} - {Math.min(page * 25, total)} of {total}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4 text-gray-400" />
                                </button>
                                <span className="text-xs font-medium text-gray-500">Page {page} of {totalPages}</span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </AppShell>
    );
}
