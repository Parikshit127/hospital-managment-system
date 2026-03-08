'use client';

import { useState, useEffect } from 'react';
import {
    BarChart3, Users, Bed, FlaskConical, Pill, DollarSign, Activity,
    TrendingUp, Clock, AlertTriangle, Shield,
    Loader2, ChevronRight,
    Stethoscope, FileText, Package, ArrowUpRight,
    Zap, Settings, UserPlus, X, Power, Building2
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    getDashboardStats, getBedOccupancy, getRevenueBreakdown,
    getRecentActivity, getPatientFlow, getInventoryAlerts,
    getStaffStats, getUsersList, getOrganizationSettings,
    updateOrganizationSettings, addUser
} from '@/app/actions/admin-actions';

const DOCTOR_SPECIALTIES = [
    'General Medicine',
    'Cardiology',
    'Orthopedics',
    'Pediatrics',
    'Neurology',
    'ENT',
    'Dermatology',
    'Pulmonology',
] as const;

type FeatureToggleKey = 'enable_ai_triage' | 'enable_whatsapp' | 'enable_razorpay';

const roleLabelMap: Record<string, string> = {
    admin: 'Administrator',
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    lab_technician: 'Lab Technician',
    pharmacist: 'Pharmacist',
    finance: 'Finance',
    ipd_manager: 'IPD Manager',
    nurse: 'Nurse',
    opd_manager: 'OPD Manager',
    hr: 'HR Manager',
};

export default function AdminDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [bedData, setBedData] = useState<any>(null);
    const [revenue, setRevenue] = useState<any>(null);
    const [activity, setActivity] = useState<any[]>([]);
    const [patientFlow, setPatientFlow] = useState<any[]>([]);
    const [inventoryAlerts, setInventoryAlerts] = useState<any>(null);
    const [staffStats, setStaffStats] = useState<any>(null);
    const [doctorList, setDoctorList] = useState<any[]>([]);
    const [orgSettings, setOrgSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [featureSaving, setFeatureSaving] = useState<FeatureToggleKey | null>(null);
    const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
    const [doctorSubmitting, setDoctorSubmitting] = useState(false);
    const [doctorError, setDoctorError] = useState('');
    const [doctorForm, setDoctorForm] = useState({
        name: '',
        username: '',
        password: '',
        specialty: '',
        email: '',
        phone: '',
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, b, r, a, pf, inv, staff, doctors, settings] = await Promise.all([
                getDashboardStats(),
                getBedOccupancy(),
                getRevenueBreakdown(),
                getRecentActivity(15),
                getPatientFlow(),
                getInventoryAlerts(),
                getStaffStats(),
                getUsersList({ role: 'doctor', is_active: true, page: 1, limit: 5 }),
                getOrganizationSettings(),
            ]);
            if (s.success) setStats(s.data);
            if (b.success) setBedData(b.data);
            if (r.success) setRevenue(r.data);
            if (a.success) setActivity(a.data || []);
            if (pf.success) setPatientFlow(pf.data || []);
            if (inv.success) setInventoryAlerts(inv.data);
            if (staff.success) setStaffStats(staff.data);
            if (doctors.success) setDoctorList(doctors.data?.users || []);
            if (settings.success) setOrgSettings(settings.data);
        } catch (err) {
            console.error('Dashboard load error:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const getActionColor = (action: string) => {
        const colors: Record<string, string> = {
            'LOGIN': 'text-blue-500 bg-blue-50',
            'CREATE_PATIENT': 'text-emerald-500 bg-emerald-50',
            'AI_TRIAGE': 'text-violet-500 bg-violet-50',
            'ORDER_LAB': 'text-amber-500 bg-amber-50',
            'PRESCRIBE': 'text-teal-500 bg-teal-50',
            'DISCHARGE_PATIENT': 'text-rose-500 bg-rose-50',
            'PROCESS_DISCHARGE': 'text-rose-500 bg-rose-50',
        };
        return colors[action] || 'text-slate-500 bg-slate-50';
    };

    const getActionIcon = (action: string) => {
        const icons: Record<string, any> = {
            'LOGIN': Shield,
            'CREATE_PATIENT': Users,
            'AI_TRIAGE': Zap,
            'ORDER_LAB': FlaskConical,
            'PRESCRIBE': Pill,
            'DISCHARGE_PATIENT': Activity,
            'PROCESS_DISCHARGE': FileText,
        };
        const Icon = icons[action] || Activity;
        return <Icon className="h-3.5 w-3.5" />;
    };

    const handleFeatureToggle = async (feature: FeatureToggleKey) => {
        if (!orgSettings) return;
        const nextValue = !orgSettings[feature];
        setFeatureSaving(feature);
        try {
            const res = await updateOrganizationSettings({ [feature]: nextValue });
            if (res.success) {
                setOrgSettings((prev: any) => ({ ...prev, [feature]: nextValue }));
            } else {
                alert(res.error || 'Unable to update feature toggle');
            }
        } catch (error) {
            console.error('Feature toggle update failed:', error);
            alert('Unable to update feature toggle right now');
        } finally {
            setFeatureSaving(null);
        }
    };

    const resetDoctorForm = () => {
        setDoctorForm({
            name: '',
            username: '',
            password: '',
            specialty: '',
            email: '',
            phone: '',
        });
        setDoctorError('');
    };

    const handleAddDoctor = async () => {
        setDoctorError('');

        if (!doctorForm.name || !doctorForm.username || !doctorForm.password) {
            setDoctorError('Name, username, and password are required');
            return;
        }

        if (doctorForm.password.length < 6) {
            setDoctorError('Password must be at least 6 characters');
            return;
        }

        setDoctorSubmitting(true);
        const result = await addUser({
            ...doctorForm,
            role: 'doctor',
        });
        setDoctorSubmitting(false);

        if (!result.success) {
            setDoctorError(result.error || 'Failed to add doctor');
            return;
        }

        setShowAddDoctorModal(false);
        resetDoctorForm();
        await loadData();
    };

    const headerActions = (
        <button
            onClick={() => {
                resetDoctorForm();
                setShowAddDoctorModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
        >
            <UserPlus className="h-3.5 w-3.5" /> Add Doctor
        </button>
    );

    return (
        <AppShell
            pageTitle="Admin Dashboard"
            pageIcon={<BarChart3 className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-8">
                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
                            <p className="text-gray-400 font-bold text-sm">Loading intelligence data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI CARDS ROW */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Today's Patients */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Patients Today</span>
                                    <div className="p-1.5 bg-teal-500/10 rounded-lg">
                                        <Users className="h-3.5 w-3.5 text-teal-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{stats?.totalPatientsToday || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                                    <ArrowUpRight className="h-3 w-3" />
                                    Total: {stats?.totalPatientsAll || 0}
                                </div>
                            </div>

                            {/* Active Admissions */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-violet-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl group-hover:bg-violet-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">IPD Admissions</span>
                                    <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                        <Bed className="h-3.5 w-3.5 text-violet-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{stats?.activeAdmissions || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-violet-400">
                                    <Activity className="h-3 w-3" />
                                    Active In-Patients
                                </div>
                            </div>

                            {/* Pending Lab */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-amber-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Lab Queue</span>
                                    <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                        <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">{stats?.pendingLabOrders || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                                    <TrendingUp className="h-3 w-3" />
                                    {stats?.completedLabToday || 0} done today
                                </div>
                            </div>

                            {/* Revenue */}
                            <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-emerald-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Revenue</span>
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                        <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-gray-900 tracking-tight">
                                    ₹{((stats?.totalRevenue || 0) / 1000).toFixed(1)}K
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                                    <TrendingUp className="h-3 w-3" />
                                    Collected
                                </div>
                            </div>
                        </div>

                        {/* MAIN GRID */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* BED OCCUPANCY */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Bed className="h-4 w-4 text-violet-400" />
                                        Bed Occupancy
                                    </h3>
                                    <span className="text-xs font-bold text-gray-400">{bedData?.total || 0} beds</span>
                                </div>
                                <div className="p-5 space-y-4">
                                    {/* Occupancy ring */}
                                    <div className="flex items-center gap-6">
                                        <div className="relative h-28 w-28 shrink-0">
                                            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                                                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="8" />
                                                <circle
                                                    cx="50" cy="50" r="42" fill="none"
                                                    stroke="url(#occupancyGradient)"
                                                    strokeWidth="8"
                                                    strokeLinecap="round"
                                                    strokeDasharray={`${(bedData?.occupancyRate || 0) * 2.64} 264`}
                                                />
                                                <defs>
                                                    <linearGradient id="occupancyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#8B5CF6" />
                                                        <stop offset="100%" stopColor="#6366F1" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-2xl font-black text-gray-900">{bedData?.occupancyRate || 0}%</span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Occupied</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                                                    <span className="text-xs font-bold text-gray-500">Occupied</span>
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{bedData?.occupied || 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                    <span className="text-xs font-bold text-gray-500">Available</span>
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{bedData?.available || 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                                    <span className="text-xs font-bold text-gray-500">Maintenance</span>
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{bedData?.maintenance || 0}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ward breakdown */}
                                    {bedData?.byWard && bedData.byWard.length > 0 && (
                                        <div className="space-y-2.5 pt-2 border-t border-gray-200">
                                            {bedData.byWard.map((ward: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-gray-500 w-24 truncate">{ward.wardName}</span>
                                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700"
                                                            style={{ width: `${ward.occupancyRate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-400 w-10 text-right">{ward.occupancyRate}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* PATIENT FLOW */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <TrendingUp className="h-4 w-4 text-teal-400" />
                                        Patient Flow (7 Days)
                                    </h3>
                                </div>
                                <div className="p-5">
                                    {patientFlow.length > 0 ? (
                                        <div className="space-y-4">
                                            {/* Simple bar chart */}
                                            <div className="flex items-end gap-2 h-36">
                                                {patientFlow.map((item: any, i: number) => {
                                                    const maxCount = Math.max(...patientFlow.map((p: any) => p.count), 1);
                                                    const heightPct = (item.count / maxCount) * 100;
                                                    return (
                                                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-teal-400">{item.count}</span>
                                                            <div className="w-full rounded-t-lg bg-gradient-to-t from-teal-600/80 to-teal-400/60 transition-all duration-700 hover:from-teal-500 hover:to-teal-300"
                                                                style={{ height: `${Math.max(heightPct, 8)}%` }}
                                                            />
                                                            <span className="text-[9px] font-bold text-gray-400 truncate max-w-full">{item.day}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                                                <span className="text-xs font-bold text-gray-400">Total Registrations</span>
                                                <span className="text-sm font-black text-teal-400">
                                                    {patientFlow.reduce((s: number, p: any) => s + p.count, 0)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-36 flex items-center justify-center text-gray-300 text-xs font-bold">
                                            No patient flow data yet
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* INVENTORY ALERTS */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Package className="h-4 w-4 text-amber-400" />
                                        Inventory Alerts
                                    </h3>
                                    <Link href="/pharmacy/billing" className="text-[10px] font-black text-teal-400 uppercase tracking-wider hover:text-teal-300 flex items-center gap-1">
                                        Pharmacy <ChevronRight className="h-3 w-3" />
                                    </Link>
                                </div>
                                <div className="p-5 space-y-3 max-h-[320px] overflow-auto">
                                    {inventoryAlerts?.lowStock?.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                                <AlertTriangle className="h-3 w-3" /> Low Stock
                                            </p>
                                            {inventoryAlerts.lowStock.map((item: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                                    <div>
                                                        <span className="text-xs font-bold text-gray-700 block">{item.medicine}</span>
                                                        <span className="text-[10px] text-gray-400 font-mono">{item.batchNo}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                                                        {item.stock} left
                                                    </span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {inventoryAlerts?.expiringSoon?.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mt-4">
                                                <Clock className="h-3 w-3" /> Expiring Soon
                                            </p>
                                            {inventoryAlerts.expiringSoon.map((item: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                                                    <div>
                                                        <span className="text-xs font-bold text-gray-700 block">{item.medicine}</span>
                                                        <span className="text-[10px] text-gray-400 font-mono">{item.batchNo}</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-amber-400">
                                                        {new Date(item.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {(!inventoryAlerts?.lowStock?.length && !inventoryAlerts?.expiringSoon?.length) && (
                                        <div className="py-8 flex flex-col items-center text-gray-300">
                                            <Package className="h-8 w-8 mb-2" />
                                            <span className="text-xs font-bold">All inventory levels OK</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM ROW */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* REVENUE BREAKDOWN */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <BarChart3 className="h-4 w-4 text-emerald-400" />
                                        Revenue Breakdown
                                    </h3>
                                    <span className="text-xs font-black text-emerald-400">
                                        ₹{((revenue?.totalRevenue || 0) / 1000).toFixed(1)}K Total
                                    </span>
                                </div>
                                <div className="p-5">
                                    {revenue?.byDepartment?.length > 0 ? (
                                        <div className="space-y-3">
                                            {revenue.byDepartment.map((dept: any, i: number) => {
                                                const maxAmt = Math.max(...revenue.byDepartment.map((d: any) => d.amount), 1);
                                                const widthPct = (dept.amount / maxAmt) * 100;
                                                const colors = [
                                                    'from-emerald-500 to-teal-500',
                                                    'from-violet-500 to-indigo-500',
                                                    'from-amber-500 to-orange-500',
                                                    'from-rose-500 to-pink-500',
                                                    'from-blue-500 to-cyan-500',
                                                ];
                                                return (
                                                    <div key={i} className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-gray-500 w-28 truncate">{dept.name}</span>
                                                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`}
                                                                style={{ width: `${widthPct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-black text-gray-500 w-16 text-right">₹{dept.amount.toLocaleString()}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="py-8 flex flex-col items-center text-gray-300">
                                            <BarChart3 className="h-8 w-8 mb-2" />
                                            <span className="text-xs font-bold">No revenue data yet</span>
                                            <span className="text-[10px] text-gray-300 mt-1">Billing records will appear here</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RECENT ACTIVITY / AUDIT LOG */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Shield className="h-4 w-4 text-blue-400" />
                                        Audit Trail
                                    </h3>
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-wider">Live Feed</span>
                                </div>
                                <div className="max-h-[320px] overflow-auto">
                                    {activity.length > 0 ? (
                                        <div className="divide-y divide-gray-100">
                                            {activity.map((log: any, i: number) => (
                                                <div key={i} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                                                    <div className={`p-1.5 rounded-lg ${getActionColor(log.action)}`}>
                                                        {getActionIcon(log.action)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-gray-700">{log.action.replace(/_/g, ' ')}</span>
                                                            <span className="text-[10px] font-bold text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded">{log.module}</span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 font-medium truncate">
                                                            {log.username && `by ${log.username}`}
                                                            {log.entity_id && ` · ${log.entity_type}: ${log.entity_id.slice(0, 12)}...`}
                                                        </p>
                                                    </div>
                                                    <span className="text-[10px] text-gray-300 font-medium shrink-0">
                                                        {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-12 flex flex-col items-center text-gray-300">
                                            <Shield className="h-8 w-8 mb-2" />
                                            <span className="text-xs font-bold">No activity logged yet</span>
                                            <span className="text-[10px] text-gray-300 mt-1">Actions across modules will appear here</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ADMIN CONTROL CENTER */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                            {/* FEATURE TOGGLES */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Settings className="h-4 w-4 text-indigo-400" />
                                        Feature Controls
                                    </h3>
                                    <Link href="/admin/settings" className="text-[10px] font-black text-teal-400 uppercase tracking-wider hover:text-teal-300 flex items-center gap-1">
                                        Settings <ChevronRight className="h-3 w-3" />
                                    </Link>
                                </div>
                                <div className="p-5 space-y-3">
                                    {[
                                        {
                                            key: 'enable_ai_triage' as FeatureToggleKey,
                                            label: 'AI Triage',
                                            description: 'Smart intake and routing in reception flow',
                                        },
                                        {
                                            key: 'enable_whatsapp' as FeatureToggleKey,
                                            label: 'WhatsApp Alerts',
                                            description: 'Send reminders and payment nudges to patients',
                                        },
                                        {
                                            key: 'enable_razorpay' as FeatureToggleKey,
                                            label: 'Online Payments',
                                            description: 'Collect invoice payments using Razorpay',
                                        },
                                    ].map(toggle => {
                                        const isEnabled = Boolean(orgSettings?.[toggle.key]);
                                        const isSaving = featureSaving === toggle.key;

                                        return (
                                            <button
                                                key={toggle.key}
                                                onClick={() => handleFeatureToggle(toggle.key)}
                                                disabled={isSaving}
                                                className={`w-full p-3 rounded-xl border text-left transition-all ${isEnabled
                                                    ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
                                                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'} ${isSaving ? 'opacity-70' : ''}`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-xs font-black text-gray-700">{toggle.label}</p>
                                                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">{toggle.description}</p>
                                                    </div>
                                                    <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-md ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                                                        {isEnabled ? 'On' : 'Off'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                                                        {isSaving ? 'Updating...' : 'Click to toggle'}
                                                    </span>
                                                    {isSaving ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-400" />
                                                    ) : (
                                                        <Power className={`h-3.5 w-3.5 ${isEnabled ? 'text-emerald-500' : 'text-gray-400'}`} />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* DOCTOR COMMAND */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Stethoscope className="h-4 w-4 text-violet-400" />
                                        Doctor Command
                                    </h3>
                                    <span className="text-xs font-black text-violet-500">
                                        {staffStats?.doctors || 0} Doctors
                                    </span>
                                </div>
                                <div className="p-5 space-y-3">
                                    {doctorList.length > 0 ? (
                                        doctorList.map((doctor: any) => (
                                            <div key={doctor.id} className="p-3 rounded-xl border border-violet-100 bg-violet-50/40">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-black text-gray-700">{doctor.name || doctor.username}</p>
                                                        <p className="text-[10px] text-gray-500 font-medium">
                                                            {doctor.specialty || 'General Practice'}
                                                        </p>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-gray-400">@{doctor.username}</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 flex flex-col items-center text-gray-300">
                                            <Stethoscope className="h-8 w-8 mb-2" />
                                            <span className="text-xs font-bold">No doctors added yet</span>
                                            <span className="text-[10px] text-gray-300 mt-1">Create your first doctor account from here</span>
                                        </div>
                                    )}
                                    <div className="pt-3 border-t border-gray-200 flex gap-2">
                                        <button
                                            onClick={() => {
                                                resetDoctorForm();
                                                setShowAddDoctorModal(true);
                                            }}
                                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" /> Add Doctor
                                        </button>
                                        <Link href="/admin/staff" className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all">
                                            Manage Staff
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {/* OPERATIONS HUB */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Building2 className="h-4 w-4 text-teal-400" />
                                        Operations Hub
                                    </h3>
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-wider">Admin Command</span>
                                </div>
                                <div className="p-5 space-y-2.5">
                                    {[
                                        { href: '/admin/staff', title: 'Staff & Access', subtitle: 'Create users, assign roles, reset credentials' },
                                        { href: '/admin/departments', title: 'Departments', subtitle: 'Manage departments and consultation masters' },
                                        { href: '/admin/settings', title: 'Tenant Settings', subtitle: 'Configure integrations and hospital defaults' },
                                        { href: '/admin/reports', title: 'Reports Hub', subtitle: 'Track finance, footfall, and operations' },
                                        { href: '/admin/audit', title: 'Audit Trail', subtitle: 'Review activity logs and compliance events' },
                                    ].map(item => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="block p-3 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 transition-all"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-black text-gray-700">{item.title}</p>
                                                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">{item.subtitle}</p>
                                                </div>
                                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                            </div>
                                        </Link>
                                    ))}
                                    {staffStats?.byRole?.length > 0 && (
                                        <div className="pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                                            {staffStats.byRole.map((entry: any) => (
                                                <span key={entry.role} className="text-[10px] font-black px-2 py-1 rounded-md bg-gray-100 text-gray-600">
                                                    {roleLabelMap[entry.role] || entry.role}: {entry.count}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* QUICK ACTIONS ROW */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/reception/triage"
                                className="group bg-gradient-to-br from-teal-500/10 to-teal-600/5 border border-teal-500/20 rounded-2xl p-5 hover:border-teal-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-teal-500/10 rounded-xl w-fit group-hover:bg-teal-500/20 transition-all">
                                    <Zap className="h-5 w-5 text-teal-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">AI Triage Intake</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Smart patient intake & routing</p>
                                </div>
                            </Link>
                            <Link href="/doctor/dashboard"
                                className="group bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-2xl p-5 hover:border-violet-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-violet-500/10 rounded-xl w-fit group-hover:bg-violet-500/20 transition-all">
                                    <Stethoscope className="h-5 w-5 text-violet-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Doctor Console</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Patient queue & AI co-pilot</p>
                                </div>
                            </Link>
                            <Link href="/ipd"
                                className="group bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/20 rounded-2xl p-5 hover:border-indigo-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-indigo-500/10 rounded-xl w-fit group-hover:bg-indigo-500/20 transition-all">
                                    <Bed className="h-5 w-5 text-indigo-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">IPD Management</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Beds, admissions & care</p>
                                </div>
                            </Link>
                            <Link href="/finance/dashboard"
                                className="group bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-5 hover:border-emerald-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-emerald-500/10 rounded-xl w-fit group-hover:bg-emerald-500/20 transition-all">
                                    <DollarSign className="h-5 w-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Finance & Billing</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Invoices, payments & revenue</p>
                                </div>
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/lab/technician"
                                className="group bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-5 hover:border-amber-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-amber-500/10 rounded-xl w-fit group-hover:bg-amber-500/20 transition-all">
                                    <FlaskConical className="h-5 w-5 text-amber-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Lab Worklist</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Test orders & result upload</p>
                                </div>
                            </Link>
                            <Link href="/pharmacy/billing"
                                className="group bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-2xl p-5 hover:border-cyan-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-cyan-500/10 rounded-xl w-fit group-hover:bg-cyan-500/20 transition-all">
                                    <Pill className="h-5 w-5 text-cyan-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Pharmacy</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Inventory & dispensing</p>
                                </div>
                            </Link>
                            <Link href="/insurance"
                                className="group bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl p-5 hover:border-blue-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-blue-500/10 rounded-xl w-fit group-hover:bg-blue-500/20 transition-all">
                                    <Shield className="h-5 w-5 text-blue-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Insurance & TPA</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Claims & policy management</p>
                                </div>
                            </Link>
                            <Link href="/discharge/admin"
                                className="group bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 rounded-2xl p-5 hover:border-rose-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-rose-500/10 rounded-xl w-fit group-hover:bg-rose-500/20 transition-all">
                                    <FileText className="h-5 w-5 text-rose-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Discharge Hub</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Summary & clearance</p>
                                </div>
                            </Link>
                            <Link href="/admin/audit"
                                className="group bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/20 rounded-2xl p-5 hover:border-amber-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-amber-500/10 rounded-xl w-fit group-hover:bg-amber-500/20 transition-all">
                                    <Shield className="h-5 w-5 text-amber-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Audit Trail</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">System activity log</p>
                                </div>
                            </Link>
                            <Link href="/ipd/bed-matrix"
                                className="group bg-gradient-to-br from-violet-500/10 to-indigo-600/5 border border-violet-500/20 rounded-2xl p-5 hover:border-violet-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-violet-500/10 rounded-xl w-fit group-hover:bg-violet-500/20 transition-all">
                                    <Activity className="h-5 w-5 text-violet-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">Bed Matrix</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Real-time bed status</p>
                                </div>
                            </Link>
                            <Link href="/admin/mfa-setup"
                                className="group bg-gradient-to-br from-purple-500/10 to-violet-600/5 border border-purple-500/20 rounded-2xl p-5 hover:border-purple-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-purple-500/10 rounded-xl w-fit group-hover:bg-purple-500/20 transition-all">
                                    <Shield className="h-5 w-5 text-purple-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-700">MFA Setup</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Two-factor authentication</p>
                                </div>
                            </Link>
                        </div>

                        {showAddDoctorModal && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddDoctorModal(false); resetDoctorForm(); }} />
                                <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                                        <h2 className="text-base font-bold text-gray-900">Quick Add Doctor</h2>
                                        <button
                                            onClick={() => { setShowAddDoctorModal(false); resetDoctorForm(); }}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        {doctorError && (
                                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                                                {doctorError}
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Doctor Name *</label>
                                            <input
                                                type="text"
                                                value={doctorForm.name}
                                                onChange={event => setDoctorForm({ ...doctorForm, name: event.target.value })}
                                                placeholder="Dr. John Smith"
                                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Username *</label>
                                                <input
                                                    type="text"
                                                    value={doctorForm.username}
                                                    onChange={event => setDoctorForm({ ...doctorForm, username: event.target.value })}
                                                    placeholder="doc_new"
                                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Temporary Password *</label>
                                                <input
                                                    type="password"
                                                    value={doctorForm.password}
                                                    onChange={event => setDoctorForm({ ...doctorForm, password: event.target.value })}
                                                    placeholder="Min 6 characters"
                                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Specialty</label>
                                                <select
                                                    value={doctorForm.specialty}
                                                    onChange={event => setDoctorForm({ ...doctorForm, specialty: event.target.value })}
                                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
                                                >
                                                    <option value="">Select Specialty</option>
                                                    {DOCTOR_SPECIALTIES.map(specialty => (
                                                        <option key={specialty} value={specialty}>{specialty}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                                                <input
                                                    type="tel"
                                                    value={doctorForm.phone}
                                                    onChange={event => setDoctorForm({ ...doctorForm, phone: event.target.value })}
                                                    placeholder="+91 98765 43210"
                                                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                                            <input
                                                type="email"
                                                value={doctorForm.email}
                                                onChange={event => setDoctorForm({ ...doctorForm, email: event.target.value })}
                                                placeholder="doctor@hospital.com"
                                                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                            />
                                        </div>

                                        <div className="flex justify-end gap-3 pt-2">
                                            <button
                                                onClick={() => { setShowAddDoctorModal(false); resetDoctorForm(); }}
                                                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleAddDoctor}
                                                disabled={doctorSubmitting}
                                                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                                            >
                                                {doctorSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                                                Add Doctor
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}
