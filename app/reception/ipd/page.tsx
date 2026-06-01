'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Bed, Search, Loader2, Building2, CalendarCheck, TrendingUp, Printer,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { getIPDAdmissions, getWardsWithBeds } from '@/app/actions/ipd-actions';

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatMoney(amount: number | null | undefined): string {
    if (amount == null) return '₹0';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

const STATUS_FILTERS = ['All', 'Admitted', 'Discharged', 'Cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

function getStatusBadge(status: string) {
    const map: Record<string, string> = {
        Admitted: 'bg-blue-50 text-blue-700 border-blue-200',
        Discharged: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Cancelled: 'bg-red-50 text-red-700 border-red-200',
    };
    return map[status] || 'bg-gray-100 text-gray-500 border-gray-200';
}

export default function IPDAdmissionsPage() {
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [wards, setWards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
    const [wardFilter, setWardFilter] = useState('');
    const [search, setSearch] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        const [admRes, wardRes] = await Promise.all([
            getIPDAdmissions(statusFilter === 'All' ? undefined : statusFilter),
            getWardsWithBeds(),
        ]);
        if (admRes.success) setAdmissions(admRes.data || []);
        if (wardRes.success) setWards(wardRes.data || []);
        setLoading(false);
    }, [statusFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    // Client-side search filter
    const filtered = admissions.filter(a => {
        const q = search.toLowerCase();
        const matchesSearch = !q
            || a.patient?.full_name?.toLowerCase().includes(q)
            || a.patient?.patient_id?.toLowerCase().includes(q)
            || a.patient?.phone?.toLowerCase().includes(q);
        const matchesWard = !wardFilter
            || (a.wardName || a.ward?.ward_name || a.bed?.wards?.ward_name || '') === wardFilter;
        return matchesSearch && matchesWard;
    });

    // KPI calculations
    const today = new Date().toDateString();
    const totalAdmitted = admissions.filter(a => a.status === 'Admitted').length;
    const totalBeds = wards.reduce((sum, w) => sum + (w.beds?.length || 0), 0);
    const occupiedBeds = admissions.filter(a => a.status === 'Admitted').length;
    const availableBeds = Math.max(0, totalBeds - occupiedBeds);
    const totalWards = wards.length;
    const todaysAdmissions = admissions.filter(a => {
        if (!a.admission_date) return false;
        return new Date(a.admission_date).toDateString() === today;
    }).length;

    const kpis = [
        { label: 'Total Admitted', value: totalAdmitted, icon: <Bed className="h-5 w-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Available Beds', value: availableBeds, icon: <TrendingUp className="h-5 w-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Wards', value: totalWards, icon: <Building2 className="h-5 w-5" />, color: 'text-violet-600', bg: 'bg-violet-50' },
        { label: "Today's Admissions", value: todaysAdmissions, icon: <CalendarCheck className="h-5 w-5" />, color: 'text-orange-600', bg: 'bg-orange-50' },
    ];

    const headerActions = (
        <Link
            href="/reception/ipd/admit"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-shadow"
        >
            <Bed className="h-3.5 w-3.5" />
            Admit Patient
        </Link>
    );

    return (
        <AppShell
            pageTitle="IPD Admissions"
            pageIcon={<Bed className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-6">
                {/* Subtitle */}
                <p className="text-xs text-gray-400 font-medium -mt-3 uppercase tracking-wider">
                    Inpatient department management
                </p>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {kpis.map(kpi => (
                        <div key={kpi.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex items-start gap-3">
                            <div className={`p-2 rounded-xl ${kpi.bg} ${kpi.color} shrink-0`}>
                                {kpi.icon}
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{kpi.label}</p>
                                <p className="text-2xl font-black text-gray-900 mt-0.5">{kpi.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Status filter buttons */}
                    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                        {STATUS_FILTERS.map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    statusFilter === s
                                        ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search name, UHID, phone..."
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-emerald-400 placeholder-gray-400"
                        />
                    </div>

                    {/* Ward dropdown */}
                    <select
                        value={wardFilter}
                        onChange={e => setWardFilter(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:border-emerald-400"
                    >
                        <option value="">All Wards</option>
                        {wards.map(w => (
                            <option key={w.id} value={w.ward_name}>{w.ward_name}</option>
                        ))}
                    </select>

                    <span className="text-xs text-gray-400 ml-auto">
                        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    {['Admission ID', 'Patient Name', 'UHID', 'Doctor', 'Ward / Bed', 'Diagnosis', 'Days', 'Balance', 'Status', 'Actions'].map(h => (
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
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} className="text-center py-16">
                                            <Loader2 className="h-6 w-6 animate-spin text-emerald-500 mx-auto" />
                                            <p className="text-xs text-gray-400 mt-2">Loading admissions...</p>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2">
                                                <Bed className="h-8 w-8 text-gray-200" />
                                                <p className="text-sm font-medium text-gray-400">No admissions found</p>
                                                <p className="text-xs text-gray-300">
                                                    {search || wardFilter || statusFilter !== 'All'
                                                        ? 'Try adjusting your filters'
                                                        : 'No patients have been admitted yet'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filtered.map((admission: any) => {
                                    const wardName = admission.wardName
                                        || admission.ward?.ward_name
                                        || admission.bed?.wards?.ward_name
                                        || '—';
                                    const bedId = admission.bed?.bed_id || '—';

                                    return (
                                        <tr key={admission.admission_id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="text-xs font-mono font-bold text-emerald-600">
                                                    {admission.admission_id}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900 text-xs whitespace-nowrap">
                                                    {admission.patient?.full_name || '—'}
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    {admission.patient?.age ? `${admission.patient.age}y` : ''}{' '}
                                                    {admission.patient?.gender || ''}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-mono text-gray-500">
                                                    {admission.patient?.patient_id || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs text-gray-700 whitespace-nowrap">
                                                    {admission.doctor_name || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-medium text-gray-800 whitespace-nowrap">{wardName}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Bed: {bedId}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs text-gray-600 max-w-[120px] truncate block">
                                                    {admission.diagnosis || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-900">
                                                        {admission.daysAdmitted ?? '—'}
                                                    </span>
                                                    {admission.daysAdmitted != null && (
                                                        <span className="text-[10px] text-gray-400 ml-1">day{admission.daysAdmitted !== 1 ? 's' : ''}</span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    {formatDate(admission.admission_date)}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`text-xs font-bold ${
                                                    (admission.totalBalance ?? 0) > 0
                                                        ? 'text-red-600'
                                                        : 'text-emerald-600'
                                                }`}>
                                                    {formatMoney(admission.totalBalance)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusBadge(admission.status)}`}>
                                                    {admission.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <Link
                                                        href={`/reception/ipd/${encodeURIComponent(admission.admission_id)}`}
                                                        className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-lg hover:shadow-md transition-shadow"
                                                    >
                                                        View
                                                    </Link>
                                                    <button
                                                        onClick={() => window.open(`/api/admission/${encodeURIComponent(admission.admission_id)}/admission-form`, '_blank')}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                                                        title="Print admission form"
                                                    >
                                                        <Printer className="h-3 w-3" /> Form
                                                    </button>
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
