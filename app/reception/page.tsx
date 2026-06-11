'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Users, UserPlus, Search, Filter, Calendar, Phone, Clock,
    ChevronLeft, ChevronRight, Eye, Zap, Loader2, Activity,
    X, FileText, Thermometer, ArrowRight, AlertCircle, CheckCircle2, Bell,
    Stethoscope, Bed, Building2, CalendarCheck, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/app/components/layout/AppShell';
import { Skeleton, SkeletonCard } from '@/app/components/ui/Skeleton';
import { getRegisteredPatients, getReceptionStats, getExpectedArrivals, checkInPatient } from '@/app/actions/reception-actions';
import { getIPDAdmissions, getWardsWithBeds } from '@/app/actions/ipd-actions';

// ─── IPD helpers ────────────────────────────────────────────────────────────

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

function getIPDStatusBadge(status: string) {
    const map: Record<string, string> = {
        Admitted: 'bg-blue-50 text-blue-700 border-blue-200',
        Discharged: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Cancelled: 'bg-red-50 text-red-700 border-red-200',
    };
    return map[status] || 'bg-gray-100 text-gray-500 border-gray-200';
}

const IPD_STATUS_FILTERS = ['All', 'Admitted', 'Discharged', 'Cancelled'] as const;
type IPDStatusFilter = typeof IPD_STATUS_FILTERS[number];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReceptionDashboard() {
    const pathname = usePathname();

    // ── OPD Patients state ──
    const [patients, setPatients] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    // ── Expected arrivals state ──
    const [expectedArrivals, setExpectedArrivals] = useState<any[]>([]);
    const [arrivalsLoading, setArrivalsLoading] = useState(true);
    const [checkingIn, setCheckingIn] = useState<string | null>(null);

    // ── IPD state ──
    const [ipdAdmissions, setIpdAdmissions] = useState<any[]>([]);
    const [ipdWards, setIpdWards] = useState<any[]>([]);
    const [ipdLoading, setIpdLoading] = useState(false);
    const [ipdStatusFilter, setIpdStatusFilter] = useState<IPDStatusFilter>('All');
    const [ipdWardFilter, setIpdWardFilter] = useState('');
    const [ipdSearch, setIpdSearch] = useState('');
    const ipdLoaded = useRef(false);

    // ── Tab ──
    const [activeTab, setActiveTab] = useState<'opd' | 'ipd' | 'arrivals'>('opd');

    // ── OPD data loading ──
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
            console.error('Reception load error:', err);
        }
        setLoading(false);
    }, [search, department, page, dateRange]);

    // ── Expected arrivals loading ──
    const loadArrivals = useCallback(async () => {
        setArrivalsLoading(true);
        try {
            const res = await getExpectedArrivals();
            if (res.success) setExpectedArrivals(res.data || []);
        } catch (err) {
            console.error('Expected arrivals error:', err);
        }
        setArrivalsLoading(false);
    }, []);

    // ── IPD data loading (lazy) ──
    const loadIPDData = useCallback(async () => {
        setIpdLoading(true);
        try {
            const [admRes, wardRes] = await Promise.all([
                getIPDAdmissions(ipdStatusFilter === 'All' ? undefined : ipdStatusFilter),
                getWardsWithBeds(),
            ]);
            if (admRes.success) setIpdAdmissions(admRes.data || []);
            if (wardRes.success) setIpdWards(wardRes.data || []);
        } catch (err) {
            console.error('IPD load error:', err);
        }
        setIpdLoading(false);
        ipdLoaded.current = true;
    }, [ipdStatusFilter]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { loadArrivals(); }, [loadArrivals]);

    // Lazy-load IPD data when IPD tab is first activated or status filter changes
    useEffect(() => {
        if (activeTab === 'ipd') {
            loadIPDData();
        }
    }, [activeTab, loadIPDData]);

    // Refetch when user navigates back
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadData();
                loadArrivals();
                if (ipdLoaded.current) loadIPDData();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [loadData, loadArrivals, loadIPDData]);

    useEffect(() => {
        if (pathname === '/reception') {
            loadData();
        }
    }, [pathname, loadData]);

    const handleCheckIn = async (appointmentId: string) => {
        setCheckingIn(appointmentId);
        try {
            const res = await checkInPatient(appointmentId);
            if (res.success) {
                setExpectedArrivals(prev => prev.filter(a => a.appointment_id !== appointmentId));
                loadData();
            }
        } catch (err) {
            console.error('Check-in error:', err);
        }
        setCheckingIn(null);
    };

    // Debounced search for OPD
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

    // IPD client-side filtering
    const ipdFiltered = ipdAdmissions.filter(a => {
        const q = ipdSearch.toLowerCase();
        const matchesSearch = !q
            || a.patient?.full_name?.toLowerCase().includes(q)
            || a.patient?.patient_id?.toLowerCase().includes(q)
            || a.patient?.phone?.toLowerCase().includes(q);
        const matchesWard = !ipdWardFilter
            || (a.wardName || a.ward?.ward_name || a.bed?.wards?.ward_name || '') === ipdWardFilter;
        return matchesSearch && matchesWard;
    });

    // IPD KPI calculations
    const totalAdmitted = ipdAdmissions.filter(a => a.status === 'Admitted').length;
    const totalBeds = ipdWards.reduce((sum: number, w: any) => sum + (w.beds?.length || 0), 0);
    const availableBeds = Math.max(0, totalBeds - totalAdmitted);

    const headerActions = (
        <div className="flex items-center gap-2">
            <Link href="/reception/register"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all">
                <UserPlus className="h-3.5 w-3.5" /> Register Patient
            </Link>
            <Link href="/reception/ipd/admit"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                <Bed className="h-3.5 w-3.5" /> Admit IPD
            </Link>
            <Link href="/reception/triage"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                <Zap className="h-3.5 w-3.5" /> AI Triage
            </Link>
        </div>
    );

    return (
        <AppShell
            pageTitle="Reception"
            pageIcon={<Users className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={() => { loadData(); loadArrivals(); if (ipdLoaded.current) loadIPDData(); }}
            refreshing={loading}
        >
            <div className="space-y-6">
                {/* KPI ROW */}
                {loading && !stats ? (
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : null}
                <div className={`grid grid-cols-2 md:grid-cols-6 gap-4 ${loading && !stats ? 'hidden' : ''}`}>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today&apos;s Registrations</span>
                            <div className="p-1.5 bg-orange-50 rounded-lg"><UserPlus className="h-3.5 w-3.5 text-orange-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.todayRegistrations || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today&apos;s Appointments</span>
                            <div className="p-1.5 bg-orange-50 rounded-lg"><Calendar className="h-3.5 w-3.5 text-orange-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.todayAppointments || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pending</span>
                            <div className="p-1.5 bg-amber-50 rounded-lg"><Clock className="h-3.5 w-3.5 text-amber-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.pendingAppointments || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Completed</span>
                            <div className="p-1.5 bg-emerald-50 rounded-lg"><Activity className="h-3.5 w-3.5 text-emerald-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.completedToday || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Patients</span>
                            <div className="p-1.5 bg-violet-50 rounded-lg"><Users className="h-3.5 w-3.5 text-violet-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.totalPatients || 0}</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">IPD Admitted</span>
                            <div className="p-1.5 bg-blue-50 rounded-lg"><Bed className="h-3.5 w-3.5 text-blue-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{totalAdmitted}</p>
                    </div>
                </div>

                {/* TAB SWITCHER */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                    <button
                        onClick={() => setActiveTab('opd')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'opd' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Stethoscope className="h-3.5 w-3.5" />
                        OPD Patients
                    </button>
                    <button
                        onClick={() => setActiveTab('ipd')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'ipd' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Bed className="h-3.5 w-3.5" />
                        IPD Patients
                        {totalAdmitted > 0 && (
                            <span className="bg-blue-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                {totalAdmitted}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('arrivals')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'arrivals' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Bell className="h-3.5 w-3.5" />
                        Expected Today
                        {expectedArrivals.length > 0 && (
                            <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                {expectedArrivals.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    TAB: OPD PATIENTS
                   ═══════════════════════════════════════════════════════════ */}
                {activeTab === 'opd' && <>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search by name, patient ID, or phone..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={department}
                            onChange={e => { setDepartment(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
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
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                        </select>
                    </div>
                </div>

                {/* OPD PATIENT TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Patient ID', 'Name', 'Age / Gender', 'Phone', 'Department', 'Registered', 'Status', 'Balance', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && patients.length === 0 ? (
                                    <>
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <tr key={`skel-${i}`}>
                                                {Array.from({ length: 9 }).map((_, c) => (
                                                    <td key={c} className="px-4 py-3.5">
                                                        <Skeleton height="0.625rem" width={c === 1 ? '70%' : c === 8 ? '2rem' : '60%'} />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </>
                                ) : patients.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-16">
                                            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-400 text-sm font-medium">No patients found</p>
                                            <p className="text-gray-300 text-xs mt-1">Try adjusting your search or filters</p>
                                        </td>
                                    </tr>
                                ) : patients.map((patient: any) => (
                                    <tr key={patient.patient_id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-mono font-bold text-orange-600">{patient.patient_id}</span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{patient.full_name}</td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {patient.age || '-'} / {patient.gender || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {patient.phone ? (
                                                <span className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3" />
                                                    {patient.phone}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{patient.department || '-'}</td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {new Date(patient.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3">
                                            {patient.lastAppointmentStatus ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusColor(patient.lastAppointmentStatus)}`}>
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
                                            <Link
                                                href={`/reception/patient/${patient.patient_id}`}
                                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-colors inline-flex"
                                                title="View Full Profile"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
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
                </>}

                {/* ═══════════════════════════════════════════════════════════
                    TAB: IPD PATIENTS
                   ═══════════════════════════════════════════════════════════ */}
                {activeTab === 'ipd' && <>
                {/* IPD Filter Bar */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                        {IPD_STATUS_FILTERS.map(s => (
                            <button
                                key={s}
                                onClick={() => setIpdStatusFilter(s)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    ipdStatusFilter === s
                                        ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={ipdSearch}
                            onChange={e => setIpdSearch(e.target.value)}
                            placeholder="Search name, UHID, phone..."
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-emerald-400 placeholder-gray-400"
                        />
                    </div>

                    <select
                        value={ipdWardFilter}
                        onChange={e => setIpdWardFilter(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:border-emerald-400"
                    >
                        <option value="">All Wards</option>
                        {ipdWards.map((w: any) => (
                            <option key={w.id} value={w.ward_name}>{w.ward_name}</option>
                        ))}
                    </select>

                    <span className="text-xs text-gray-400 ml-auto">
                        {ipdFiltered.length} record{ipdFiltered.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* IPD Table */}
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
                                {ipdLoading ? (
                                    <tr>
                                        <td colSpan={10} className="text-center py-16">
                                            <Loader2 className="h-6 w-6 animate-spin text-emerald-500 mx-auto" />
                                            <p className="text-xs text-gray-400 mt-2">Loading admissions...</p>
                                        </td>
                                    </tr>
                                ) : ipdFiltered.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center py-16">
                                            <div className="flex flex-col items-center gap-2">
                                                <Bed className="h-8 w-8 text-gray-200" />
                                                <p className="text-sm font-medium text-gray-400">No admissions found</p>
                                                <p className="text-xs text-gray-300">
                                                    {ipdSearch || ipdWardFilter || ipdStatusFilter !== 'All'
                                                        ? 'Try adjusting your filters'
                                                        : 'No patients have been admitted yet'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : ipdFiltered.map((admission: any) => {
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
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${getIPDStatusBadge(admission.status)}`}>
                                                    {admission.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Link
                                                    href={`/reception/ipd/${encodeURIComponent(admission.admission_id)}`}
                                                    className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-lg hover:shadow-md transition-shadow"
                                                >
                                                    View
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                </>}

                {/* ═══════════════════════════════════════════════════════════
                    TAB: EXPECTED TODAY
                   ═══════════════════════════════════════════════════════════ */}
                {activeTab === 'arrivals' && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Expected Today — Not Yet Checked In</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Patients with appointments today who haven&apos;t arrived yet</p>
                            </div>
                            <button onClick={loadArrivals} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-colors">
                                <Activity className="h-4 w-4" />
                            </button>
                        </div>
                        {arrivalsLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                            </div>
                        ) : expectedArrivals.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                                <p className="text-sm font-medium text-gray-500">All patients checked in</p>
                                <p className="text-xs text-gray-300 mt-1">No pending arrivals for today</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {expectedArrivals.map((arrival: any) => {
                                    const isOverdue = arrival.minutes_overdue > 0;
                                    const isLate = arrival.minutes_overdue > 15;
                                    return (
                                        <div key={arrival.appointment_id} className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${isLate ? 'bg-rose-50/30' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isLate ? 'bg-rose-500' : isOverdue ? 'bg-amber-500' : 'bg-orange-500'}`} />
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{arrival.patient_name}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {arrival.doctor_name} · {arrival.department}
                                                        {arrival.reason && ` · ${arrival.reason}`}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-gray-700">
                                                        {new Date(arrival.appointment_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                    </p>
                                                    {isLate ? (
                                                        <p className="text-[10px] text-rose-600 font-semibold">{arrival.minutes_overdue}m overdue</p>
                                                    ) : isOverdue ? (
                                                        <p className="text-[10px] text-amber-600 font-semibold">{arrival.minutes_overdue}m late</p>
                                                    ) : (
                                                        <p className="text-[10px] text-orange-600 font-semibold">
                                                            in {Math.abs(arrival.minutes_overdue)}m
                                                        </p>
                                                    )}
                                                </div>
                                                {arrival.patient_phone && (
                                                    <a href={`tel:${arrival.patient_phone}`}
                                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-colors"
                                                        title="Call patient">
                                                        <Phone className="h-3.5 w-3.5" />
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => handleCheckIn(arrival.appointment_id)}
                                                    disabled={checkingIn === arrival.appointment_id}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                                                >
                                                    {checkingIn === arrival.appointment_id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="h-3 w-3" />
                                                    )}
                                                    Check In
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
