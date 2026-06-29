'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Users, UserPlus, Search, Filter, Calendar, Phone,
    ChevronLeft, ChevronRight, Eye, Zap, Loader2, Activity,
    CheckCircle2, Bell, Stethoscope, Bed, IndianRupee, Receipt, Lock,
    ReceiptText, Wallet, Download, FileText, Printer, ChevronDown, X,
    ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { AppShell } from '@/app/components/layout/AppShell';
import { Skeleton, SkeletonCard } from '@/app/components/ui/Skeleton';
import {
    getRegisteredPatients, getReceptionStats, getReceptionRevenueToday,
    getExpectedArrivals, checkInPatient,
} from '@/app/actions/reception-actions';
import { finalizePatientLatestDraft } from '@/app/actions/finance-actions';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { getDoctorsForDropdown } from '@/app/actions/admin-actions';

// ─── helpers ──────────────────────────────────────────────────────────────

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

// Payment type (OPD_REG.patient_type) options for the reception filters.
const PAYMENT_TYPE_OPTIONS = [
    { value: '', label: 'All Payment Types' },
    { value: 'cash', label: 'Cash' },
    { value: 'corporate', label: 'Corporate' },
    { value: 'tpa_insurance', label: 'TPA / Insurance' },
] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReceptionDashboard() {
    const pathname = usePathname();

    // ── OPD Patients state ──
    const [patients, setPatients] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [revenue, setRevenue] = useState<{ total: number; opd: number; ipd: number; collected: number; collectedOpd: number; collectedIpd: number }>({ total: 0, opd: 0, ipd: 0, collected: 0, collectedOpd: 0, collectedIpd: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
    const [paymentType, setPaymentType] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [doctorFilter, setDoctorFilter] = useState('');
    const [doctorsList, setDoctorsList] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    // ── Expected arrivals state ──
    const [expectedArrivals, setExpectedArrivals] = useState<any[]>([]);
    const [arrivalsLoading, setArrivalsLoading] = useState(true);
    const [checkingIn, setCheckingIn] = useState<string | null>(null);

    // ── IPD state ──
    const [ipdAdmissions, setIpdAdmissions] = useState<any[]>([]);
    const [ipdLoading, setIpdLoading] = useState(false);
    const [ipdStatusFilter, setIpdStatusFilter] = useState<IPDStatusFilter>('All');
    const [ipdSearch, setIpdSearch] = useState('');
    const ipdLoaded = useRef(false);

    // ── IPD inline column filters ──
    const [ipdColFilters, setIpdColFilters] = useState<Record<string, string>>({});
    const [openColFilter, setOpenColFilter] = useState<string | null>(null);
    const colFilterRef = useRef<HTMLDivElement | null>(null);

    // Close column-filter dropdown on outside click
    useEffect(() => {
        if (!openColFilter) return;
        const handler = (e: MouseEvent) => {
            if (colFilterRef.current && !colFilterRef.current.contains(e.target as Node)) {
                setOpenColFilter(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openColFilter]);

    // ── IPD balance sort ──
    const [ipdBalanceSort, setIpdBalanceSort] = useState<'none' | 'high' | 'low'>('none');

    const setColFilter = (col: string, value: string) => {
        setIpdColFilters(prev => {
            const next = { ...prev };
            if (value) next[col] = value; else delete next[col];
            return next;
        });
    };
    const clearAllColFilters = () => { setIpdColFilters({}); setOpenColFilter(null); };
    const activeColFilterCount = Object.keys(ipdColFilters).length;

    // ── Tab ── (honours ?tab=ipd|arrivals from redirects)
    const [activeTab, setActiveTab] = useState<'opd' | 'ipd' | 'arrivals'>(() => {
        if (typeof window === 'undefined') return 'opd';
        const t = new URLSearchParams(window.location.search).get('tab');
        return t === 'ipd' || t === 'arrivals' ? t : 'opd';
    });

    // ── OPD data loading ──
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [patientsRes, statsRes, revRes] = await Promise.all([
                getRegisteredPatients({ search, department, page, limit: 25, dateRange, paymentType, fromDate, toDate, doctorId: doctorFilter || undefined }),
                getReceptionStats(),
                getReceptionRevenueToday(),
            ]);
            if (patientsRes.success) {
                setPatients(patientsRes.data || []);
                setTotalPages(patientsRes.totalPages || 0);
                setTotal(patientsRes.total || 0);
            }
            if (statsRes.success) setStats(statsRes.data);
            if (revRes.success && revRes.data) setRevenue(revRes.data);
        } catch (err) {
            console.error('Reception load error:', err);
        }
        setLoading(false);
    }, [search, department, page, dateRange, paymentType, fromDate, toDate, doctorFilter]);

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
            const admRes = await getIPDAdmissions(ipdStatusFilter === 'All' ? undefined : ipdStatusFilter);
            if (admRes.success) setIpdAdmissions(admRes.data || []);
        } catch (err) {
            console.error('IPD load error:', err);
        }
        setIpdLoading(false);
        ipdLoaded.current = true;
    }, [ipdStatusFilter]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { loadArrivals(); }, [loadArrivals]);
    useEffect(() => {
        getDoctorsForDropdown().then(res => {
            if (res.success && res.data) setDoctorsList(res.data);
        });
    }, []);

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
        if (pathname === '/reception/dashboard') {
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

    // Lock (finalize) the patient's latest draft bill straight from the list.
    const [lockingId, setLockingId] = useState<string | null>(null);
    const handleLockBill = async (patientId: string) => {
        if (!window.confirm("Lock this patient's latest draft bill? Once locked it is finalized (Draft → Final).")) return;
        setLockingId(patientId);
        try {
            const res = await finalizePatientLatestDraft(patientId);
            if (res.success) {
                toast.success(`Bill ${res.data?.invoice_number || ''} locked.`);
                loadData();
            } else {
                toast.error(res.error || 'Could not lock bill.');
            }
        } catch {
            toast.error('Could not lock bill.');
        }
        setLockingId(null);
    };

    // Export the current tab's list to an .xlsx file.
    const exportToExcel = (rows: any[], filename: string) => {
        if (!rows.length) { toast.error('Nothing to export.'); return; }
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, filename);
    };
    const handleExportOpd = () => exportToExcel(patients.map((p: any) => ({
        'Patient ID': p.patient_id,
        Name: p.full_name,
        Age: p.age ?? '',
        Gender: p.gender ?? '',
        Phone: p.phone ?? '',
        Department: p.department ?? '',
        Registered: p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : '',
        Status: p.lastAppointmentStatus ?? '',
        'Balance (₹)': Number(p.totalBalance || 0),
    })), 'opd-patients.xlsx');
    const handleExportIpd = () => exportToExcel(ipdFiltered.map((a: any) => ({
        'Admission ID': a.admission_id,
        Patient: a.patient?.full_name ?? '',
        UHID: a.patient?.patient_id ?? '',
        Doctor: a.doctor_name ?? '',
        Ward: a.wardName || a.ward?.ward_name || a.bed?.wards?.ward_name || '',
        Bed: a.bed?.bed_id ?? '',
        Diagnosis: a.diagnosis ?? '',
        Days: a.daysAdmitted ?? '',
        'Balance (₹)': Number(a.totalBalance || 0),
        Status: a.status ?? '',
    })), 'ipd-admissions.xlsx');

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

    // IPD client-side filtering (top bar search + inline column filters)
    // Helper to extract column value for a given admission row
    const getColValue = (a: any, col: string): string => {
        switch (col) {
            case 'admission_id': return a.admission_id || '';
            case 'patient_name': return a.patient?.full_name || '';
            case 'uhid': return a.patient?.patient_id || '';
            case 'doctor': return a.doctor_name || '';
            case 'ward': return (a.wardName || a.ward?.ward_name || a.bed?.wards?.ward_name || '');
            case 'diagnosis': return a.diagnosis || '';
            case 'days': return String(a.daysAdmitted ?? '');
            case 'balance': return String(a.totalBalance ?? 0);
            case 'status': return a.status || '';
            default: return '';
        }
    };

    const ipdFiltered = ipdAdmissions.filter(a => {
        // Top-bar search
        const q = ipdSearch.toLowerCase();
        const matchesSearch = !q
            || a.patient?.full_name?.toLowerCase().includes(q)
            || a.patient?.patient_id?.toLowerCase().includes(q)
            || a.patient?.phone?.toLowerCase().includes(q)
            || a.admission_id?.toLowerCase().includes(q)
            || a.doctor_name?.toLowerCase().includes(q);

        if (!matchesSearch) return false;

        // Per-column inline filters
        for (const [col, filterVal] of Object.entries(ipdColFilters)) {
            if (!filterVal) continue;
            const cellVal = getColValue(a, col).toLowerCase();
            if (!cellVal.includes(filterVal.toLowerCase())) return false;
        }
        return true;
    });

    // Apply balance sort after filtering
    if (ipdBalanceSort !== 'none') {
        ipdFiltered.sort((a, b) => {
            const ba = Number(a.totalBalance ?? 0);
            const bb = Number(b.totalBalance ?? 0);
            return ipdBalanceSort === 'high' ? bb - ba : ba - bb;
        });
    }

    // Unique values for column filter dropdowns (computed from unfiltered data)
    const getUniqueColValues = (col: string): string[] => {
        const seen = new Set<string>();
        for (const a of ipdAdmissions) {
            const v = getColValue(a, col).trim();
            if (v && v !== '—') seen.add(v);
        }
        return Array.from(seen).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    };

    // IPD KPI calculations
    const totalAdmitted = ipdAdmissions.filter(a => a.status === 'Admitted').length;

    // Revenue card follows the active tab: OPD tab → OPD revenue, IPD tab → IPD revenue,
    // Expected Today → total. Shows billed (net) with collected (paid) underneath.
    const revenueValue = activeTab === 'ipd' ? revenue.ipd : activeTab === 'opd' ? revenue.opd : revenue.total;
    const revenueCollected = activeTab === 'ipd' ? revenue.collectedIpd : activeTab === 'opd' ? revenue.collectedOpd : revenue.collected;
    const revenueLabel = activeTab === 'ipd' ? "Today's Revenue (IPD)" : activeTab === 'opd' ? "Today's Revenue (OPD)" : "Today's Revenue";
    const revenueDrill = `/finance/invoices?rev=${activeTab === 'ipd' ? 'ipd' : activeTab === 'opd' ? 'opd' : 'total'}`;

    const headerActions = (
        <div className="flex items-center gap-2">
            <Link href="/reception/register"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all">
                <UserPlus className="h-3.5 w-3.5" /> Register Patient
            </Link>
            <Link href="/reception/appointments"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                <Calendar className="h-3.5 w-3.5" /> Book Appointment
            </Link>
            <Link href="/reception/queue"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                <Activity className="h-3.5 w-3.5" /> Manage Queue
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : null}
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${loading && !stats ? 'hidden' : ''}`}>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today&apos;s Registrations</span>
                            <div className="p-1.5 bg-orange-50 rounded-lg"><UserPlus className="h-3.5 w-3.5 text-orange-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{stats?.todayRegistrations || 0}</p>
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
                    <Link href={revenueDrill}
                        className="block bg-white border border-gray-200 shadow-sm rounded-2xl p-4 hover:border-emerald-300 hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{revenueLabel}</span>
                            <div className="p-1.5 bg-emerald-50 rounded-lg"><IndianRupee className="h-3.5 w-3.5 text-emerald-500" /></div>
                        </div>
                        <p className="text-2xl font-black text-gray-900 group-hover:text-emerald-700 transition-colors">{formatMoney(revenueValue)}</p>
                        <p className="text-[10px] font-semibold text-gray-400 mt-0.5">Collected: <span className="text-emerald-600">{formatMoney(revenueCollected)}</span> · billed</p>
                    </Link>
                </div>

                {/* Compact IPD Portal Entry */}
                <Link href="/ipd"
                    className="group flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl px-4 py-2.5 shadow-sm transition-all">
                    <div className="flex items-center gap-2.5">
                        <Bed className="h-4 w-4 text-white/90" />
                        <p className="text-xs font-bold">Enter IPD Portal <span className="font-normal text-violet-200">— admissions, beds, billing &amp; more</span></p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/70 group-hover:text-white transition-colors" />
                </Link>

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
                        <select
                            value={paymentType}
                            onChange={e => { setPaymentType(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
                            title="Filter by payment type"
                        >
                            {PAYMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select
                            value={doctorFilter}
                            onChange={e => { setDoctorFilter(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
                            title="Filter by doctor"
                        >
                            <option value="">All Doctors</option>
                            {doctorsList.map((d: any) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={fromDate}
                            max={toDate || undefined}
                            onChange={e => { setFromDate(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
                            title="Registered from"
                        />
                        <input
                            type="date"
                            value={toDate}
                            min={fromDate || undefined}
                            onChange={e => { setToDate(e.target.value); setPage(1); }}
                            className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
                            title="Registered to"
                        />
                        {(fromDate || toDate || paymentType || doctorFilter) && (
                            <button
                                onClick={() => { setFromDate(''); setToDate(''); setPaymentType(''); setDoctorFilter(''); setPage(1); }}
                                className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                title="Clear date & payment filters"
                            >
                                Clear
                            </button>
                        )}
                        <button
                            onClick={handleExportOpd}
                            className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                            title="Export current list to Excel"
                        >
                            <Download className="h-4 w-4" /> Export
                        </button>
                    </div>
                </div>

                {/* OPD PATIENT TABLE */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    {['Patient ID', 'Name', 'Age / Gender', 'Phone', 'Category', 'Doctor', 'Registered', 'Balance', 'Actions'].map(h => (
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
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            <span className="inline-flex items-center gap-1.5">
                                                {patient.full_name}
                                                {patient.hasDraftBill && (
                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200" title="Has a draft bill — can be locked">
                                                        <FileText className="h-2.5 w-2.5" /> Draft
                                                    </span>
                                                )}
                                            </span>
                                        </td>
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
                                        <td className="px-4 py-3">
                                            {patient.patient_type && patient.patient_type !== 'cash' ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                                    patient.patient_type === 'tpa_insurance' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                    patient.patient_type === 'corporate' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {patient.patient_type === 'tpa_insurance' ? 'TPA' : patient.patient_type === 'corporate' ? 'Corporate' : patient.patient_type}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Cash</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{patient.doctorName || '-'}</td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">
                                            {new Date(patient.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
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
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-colors inline-flex"
                                                    title="View Full Profile"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Link>
                                                <Link
                                                    href={`/billing/new?patientId=${encodeURIComponent(patient.patient_id)}`}
                                                    className="p-1.5 hover:bg-emerald-50 rounded-lg text-gray-400 hover:text-emerald-600 transition-colors inline-flex"
                                                    title="Create Bill"
                                                >
                                                    <Receipt className="h-4 w-4" />
                                                </Link>
                                                <Link
                                                    href={`/billing/fee-receipt?patientId=${encodeURIComponent(patient.patient_id)}`}
                                                    className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors inline-flex"
                                                    title="Fee Receipt"
                                                >
                                                    <ReceiptText className="h-4 w-4" />
                                                </Link>
                                                <button
                                                    onClick={() => window.open(`/api/opd/${patient.patient_id}/registration-slip`, '_blank')}
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors inline-flex"
                                                    title="Registration Slip"
                                                >
                                                    <Printer className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleLockBill(patient.patient_id)}
                                                    disabled={lockingId === patient.patient_id}
                                                    className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors inline-flex disabled:opacity-50"
                                                    title="Lock Bill (finalize latest draft)"
                                                >
                                                    {lockingId === patient.patient_id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Lock className="h-4 w-4" />}
                                                </button>
                                            </div>
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
                {/* IPD Filter Bar — minimal: status tabs + search + clear + export */}
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
                            placeholder="Search name, UHID, phone, admission ID..."
                            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-emerald-400 placeholder-gray-400"
                        />
                    </div>

                    {activeColFilterCount > 0 && (
                        <button
                            onClick={clearAllColFilters}
                            className="flex items-center gap-1 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors"
                            title="Clear all column filters"
                        >
                            <X className="h-3 w-3" /> Clear {activeColFilterCount} filter{activeColFilterCount !== 1 ? 's' : ''}
                        </button>
                    )}

                    <button
                        onClick={handleExportIpd}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors ml-auto"
                        title="Export current list to Excel"
                    >
                        <Download className="h-3.5 w-3.5" /> Export
                    </button>
                    <span className="text-xs text-gray-400">
                        {ipdFiltered.length} record{ipdFiltered.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* IPD Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm table-fixed">
                            {/* Fixed proportional widths so all 10 columns fit the
                                viewport without horizontal scroll. Order: Admission ID,
                                Patient Name, UHID, Doctor, Ward/Bed, Diagnosis, Days,
                                Balance, Status, Actions. Sum = 100%. No whitespace/
                                comments allowed directly inside <colgroup>. */}
                            <colgroup>
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '12%' }} />
                            </colgroup>
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    {([
                                        { label: 'Admission ID', key: 'admission_id', type: 'filter' },
                                        { label: 'Patient Name', key: 'patient_name', type: 'filter' },
                                        { label: 'UHID', key: 'uhid', type: 'filter' },
                                        { label: 'Doctor', key: 'doctor', type: 'filter' },
                                        { label: 'Ward / Bed', key: 'ward', type: 'filter' },
                                        { label: 'Diagnosis', key: '', type: 'plain' },
                                        { label: 'Days', key: '', type: 'plain' },
                                        { label: 'Balance', key: 'balance', type: 'sort' },
                                        { label: 'Status', key: 'status', type: 'filter' },
                                        { label: 'Actions', key: '', type: 'plain' },
                                    ] as { label: string; key: string; type: string }[]).map(col => (
                                        <th
                                            key={col.label}
                                            className="px-2.5 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider relative"
                                        >
                                            {/* ── Filterable column header ── */}
                                            {col.type === 'filter' && col.key ? (
                                                <div className="relative" ref={openColFilter === col.key ? colFilterRef : undefined}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenColFilter(openColFilter === col.key ? null : col.key)}
                                                        className={`flex items-center gap-1 w-full group py-1 rounded transition-colors ${
                                                            ipdColFilters[col.key]
                                                                ? 'text-orange-700'
                                                                : 'text-gray-500 hover:text-gray-800'
                                                        }`}
                                                        title={`Filter by ${col.label}`}
                                                    >
                                                        <span className="truncate">{col.label}</span>
                                                        <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${
                                                            openColFilter === col.key ? 'rotate-180' : ''
                                                        } ${ipdColFilters[col.key] ? 'text-orange-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
                                                        {ipdColFilters[col.key] && (
                                                            <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-orange-500" />
                                                        )}
                                                    </button>

                                                    {openColFilter === col.key && (
                                                        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] max-w-[260px]"
                                                             onClick={e => e.stopPropagation()}>
                                                            <div className="p-2 border-b border-gray-100">
                                                                <div className="relative">
                                                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                                    <input
                                                                        type="text"
                                                                        autoFocus
                                                                        value={ipdColFilters[col.key] || ''}
                                                                        onChange={e => setColFilter(col.key, e.target.value)}
                                                                        placeholder={`Filter ${col.label.toLowerCase()}...`}
                                                                        className="w-full pl-7 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-orange-400 focus:bg-white"
                                                                    />
                                                                    {ipdColFilters[col.key] && (
                                                                        <button
                                                                            onClick={() => setColFilter(col.key, '')}
                                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="max-h-[200px] overflow-y-auto p-1">
                                                                {getUniqueColValues(col.key).length === 0 ? (
                                                                    <p className="text-[10px] text-gray-400 text-center py-3">No values</p>
                                                                ) : (
                                                                    getUniqueColValues(col.key)
                                                                        .filter(v => !ipdColFilters[col.key] || v.toLowerCase().includes((ipdColFilters[col.key] || '').toLowerCase()))
                                                                        .slice(0, 50)
                                                                        .map(val => (
                                                                            <button
                                                                                key={val}
                                                                                type="button"
                                                                                onClick={() => { setColFilter(col.key, val); setOpenColFilter(null); }}
                                                                                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors truncate ${
                                                                                    ipdColFilters[col.key] === val
                                                                                        ? 'bg-orange-50 text-orange-700 font-semibold'
                                                                                        : 'text-gray-700 hover:bg-gray-50'
                                                                                }`}
                                                                            >
                                                                                {val}
                                                                            </button>
                                                                        ))
                                                                )}
                                                            </div>
                                                            {ipdColFilters[col.key] && (
                                                                <div className="p-1.5 border-t border-gray-100">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setColFilter(col.key, ''); setOpenColFilter(null); }}
                                                                        className="w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    >
                                                                        Clear filter
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                            /* ── Sortable column header (Balance) ── */
                                            ) : col.type === 'sort' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setIpdBalanceSort(prev =>
                                                        prev === 'none' ? 'high' : prev === 'high' ? 'low' : 'none'
                                                    )}
                                                    className={`flex items-center gap-1 w-full group py-1 rounded transition-colors ${
                                                        ipdBalanceSort !== 'none'
                                                            ? 'text-orange-700'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                    }`}
                                                    title={
                                                        ipdBalanceSort === 'none' ? 'Sort by highest balance'
                                                        : ipdBalanceSort === 'high' ? 'Sort by lowest balance'
                                                        : 'Remove sort'
                                                    }
                                                >
                                                    <span className="truncate">{col.label}</span>
                                                    {ipdBalanceSort === 'none' && (
                                                        <ArrowUpDown className="h-3 w-3 flex-shrink-0 text-gray-400 group-hover:text-gray-600" />
                                                    )}
                                                    {ipdBalanceSort === 'high' && (
                                                        <ArrowDown className="h-3 w-3 flex-shrink-0 text-orange-500" />
                                                    )}
                                                    {ipdBalanceSort === 'low' && (
                                                        <ArrowUp className="h-3 w-3 flex-shrink-0 text-orange-500" />
                                                    )}
                                                </button>

                                            /* ── Plain column header (no interaction) ── */
                                            ) : (
                                                <span>{col.label}</span>
                                            )}
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
                                                    {ipdSearch || activeColFilterCount > 0 || ipdStatusFilter !== 'All'
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
                                            <td className="px-2.5 py-3 align-top">
                                                <span className="text-xs font-mono font-bold text-emerald-600 break-all">
                                                    {admission.admission_id}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <p className="font-semibold text-gray-900 text-xs break-words">
                                                    {admission.patient?.full_name || '—'}
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    {admission.patient?.age ? `${admission.patient.age}y` : ''}{' '}
                                                    {admission.patient?.gender || ''}
                                                </p>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <span className="text-xs font-mono text-gray-500 break-all">
                                                    {admission.patient?.patient_id || '—'}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <span className="text-xs text-gray-700 break-words">
                                                    {admission.doctor_name || '—'}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <p className="text-xs font-medium text-gray-800 break-words">{wardName}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Bed: {bedId}</p>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <span className="text-xs text-gray-600 truncate block">
                                                    {admission.diagnosis || '—'}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-3 align-top whitespace-nowrap">
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
                                            <td className="px-2.5 py-3 align-top whitespace-nowrap">
                                                <span className={`text-xs font-bold ${
                                                    (admission.totalBalance ?? 0) > 0
                                                        ? 'text-red-600'
                                                        : 'text-emerald-600'
                                                }`}>
                                                    {formatMoney(admission.totalBalance)}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${getIPDStatusBadge(admission.status)}`}>
                                                    {admission.status}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-3 align-top">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Link
                                                        href={`/reception/ipd/${encodeURIComponent(admission.admission_id)}`}
                                                        className="inline-flex items-center px-2.5 py-1.5 text-[10px] font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-lg hover:shadow-md transition-shadow"
                                                    >
                                                        View
                                                    </Link>
                                                    <Link
                                                        href={`/ipd/discharge-settlement/${encodeURIComponent(admission.admission_id)}`}
                                                        className="inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                                                        title="Discharge Settlement"
                                                    >
                                                        <Wallet className="h-3 w-3" /> Settle
                                                    </Link>
                                                </div>
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
