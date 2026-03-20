'use client';

import { useState, useEffect } from 'react';
import {
    BarChart3, Users, Bed, FlaskConical, Pill, DollarSign, Activity,
    TrendingUp, Clock, AlertTriangle, Shield,
    Loader2, ChevronRight,
    Stethoscope, FileText, Package, ArrowUpRight,
    Zap, Settings, UserPlus, X, Power, Building2,
    CheckCircle2, XCircle, RefreshCw, LayoutGrid
} from 'lucide-react';
import Link from 'next/link';
import {
    getDashboardStats, getBedOccupancy, getRevenueBreakdown,
    getRecentActivity, getPatientFlow, getInventoryAlerts,
    getStaffStats, getUsersList, getOrganizationSettings,
    updateOrganizationSettings, addUser
} from '@/app/actions/admin-actions';
import { getPatientQueue } from '@/app/actions/doctor-actions';
import { getAllModuleStatuses, toggleModule } from '@/app/actions/module-config-actions';

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

const MODULE_META: Record<string, { label: string; icon: any; href: string; color: string }> = {
    opd: { label: 'OPD', icon: Stethoscope, href: '/admin/opd', color: 'text-teal-500' },
    ipd: { label: 'IPD', icon: Bed, href: '/admin/ipd', color: 'text-violet-500' },
    lab: { label: 'Lab', icon: FlaskConical, href: '/admin/lab', color: 'text-amber-500' },
    pharmacy: { label: 'Pharmacy', icon: Pill, href: '/admin/pharmacy', color: 'text-cyan-500' },
    finance: { label: 'Finance', icon: DollarSign, href: '/admin/finance', color: 'text-emerald-500' },
    hr: { label: 'HR', icon: Users, href: '/admin/hr', color: 'text-blue-500' },
    insurance: { label: 'Insurance', icon: Shield, href: '/insurance', color: 'text-indigo-500' },
    patient_portal: { label: 'Portal', icon: Activity, href: '/patient', color: 'text-rose-500' },
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
    const [moduleStatuses, setModuleStatuses] = useState<Record<string, boolean>>({});
    const [togglingModule, setTogglingModule] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [featureSaving, setFeatureSaving] = useState<FeatureToggleKey | null>(null);
    const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
    const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
    const [doctorQueue, setDoctorQueue] = useState<any[]>([]);
    const [loadingQueue, setLoadingQueue] = useState(false);
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

    const handleDoctorClick = async (doctor: any) => {
        setSelectedDoctor(doctor);
        setLoadingQueue(true);
        const res = await getPatientQueue({ view: 'my', doctor_id: doctor.id });
        if (res.success) {
            setDoctorQueue(res.data);
        } else {
            setDoctorQueue([]);
        }
        setLoadingQueue(false);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, b, r, a, pf, inv, staff, doctors, settings, modules] = await Promise.all([
                getDashboardStats(),
                getBedOccupancy(),
                getRevenueBreakdown(),
                getRecentActivity(15),
                getPatientFlow(),
                getInventoryAlerts(),
                getStaffStats(),
                getUsersList({ role: 'doctor', is_active: true, page: 1, limit: 5 }),
                getOrganizationSettings(),
                getAllModuleStatuses(),
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
            if (modules.success) setModuleStatuses(modules.data || {});
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
            'LOGIN': 'text-blue-500 bg-blue-500/10',
            'CREATE_PATIENT': 'text-emerald-500 bg-emerald-500/10',
            'AI_TRIAGE': 'text-violet-500 bg-violet-500/10',
            'ORDER_LAB': 'text-amber-500 bg-amber-500/10',
            'PRESCRIBE': 'text-teal-500 bg-teal-500/10',
            'DISCHARGE_PATIENT': 'text-rose-500 bg-rose-500/10',
            'PROCESS_DISCHARGE': 'text-rose-500 bg-rose-500/10',
        };
        return colors[action] || 'text-slate-500 bg-slate-500/10';
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

    const handleModuleToggle = async (moduleKey: string) => {
        setTogglingModule(moduleKey);
        try {
            const res = await toggleModule(moduleKey, !moduleStatuses[moduleKey]);
            if (res.success) {
                setModuleStatuses(prev => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
            }
        } catch (err) {
            console.error('Module toggle error:', err);
        }
        setTogglingModule(null);
    };

    const resetDoctorForm = () => {
        setDoctorForm({ name: '', username: '', password: '', specialty: '', email: '', phone: '' });
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
        const result = await addUser({ ...doctorForm, role: 'doctor' });
        setDoctorSubmitting(false);
        if (!result.success) {
            setDoctorError(result.error || 'Failed to add doctor');
            return;
        }
        setShowAddDoctorModal(false);
        resetDoctorForm();
        await loadData();
    };

    // SLA indicator: green if within target, amber if close, red if breached
    const getSlaIndicator = (value: number, target: number, type: 'lower_better' | 'higher_better' = 'lower_better') => {
        const ratio = type === 'lower_better' ? value / target : target / value;
        if (ratio <= 0.8) return 'bg-emerald-500';
        if (ratio <= 1.0) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    const enabledModuleCount = Object.values(moduleStatuses).filter(Boolean).length;
    const totalModules = Object.keys(MODULE_META).length;

    return (
        <div className="space-y-6">
            {loading ? (
                <div className="flex items-center justify-center py-32">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--admin-primary)' }} />
                        <p className="text-sm font-bold" style={{ color: 'var(--admin-text-muted)' }}>Loading dashboard...</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* HEADER */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-black" style={{ color: 'var(--admin-text)' }}>Dashboard</h1>
                            <p className="text-xs font-medium mt-1" style={{ color: 'var(--admin-text-muted)' }}>
                                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                {' · '}
                                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { resetDoctorForm(); setShowAddDoctorModal(true); }}
                                className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
                                style={{ background: `linear-gradient(135deg, var(--admin-primary), var(--admin-secondary))` }}
                            >
                                <UserPlus className="h-3.5 w-3.5" /> Add Doctor
                            </button>
                            <button
                                onClick={loadData}
                                className="p-2 rounded-xl border transition-all hover:opacity-80"
                                style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text-muted)' }}
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* MODULE HEALTH STRIP */}
                    <div className="rounded-2xl border p-4" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <LayoutGrid className="h-4 w-4" style={{ color: 'var(--admin-primary)' }} />
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--admin-text)' }}>
                                    Module Health
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--admin-primary-light)', color: 'var(--admin-primary)' }}>
                                    {enabledModuleCount}/{totalModules} Active
                                </span>
                            </div>
                            <Link href="/admin/settings" className="text-[10px] font-bold flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--admin-primary)' }}>
                                Manage <ChevronRight className="h-3 w-3" />
                            </Link>
                        </div>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                            {Object.entries(MODULE_META).map(([key, meta]) => {
                                const isEnabled = moduleStatuses[key] !== false;
                                const isToggling = togglingModule === key;
                                const Icon = meta.icon;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => handleModuleToggle(key)}
                                        disabled={isToggling}
                                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all hover:shadow-sm"
                                        style={{
                                            borderColor: isEnabled ? 'var(--admin-primary)' : 'var(--admin-border)',
                                            background: isEnabled ? 'var(--admin-primary-light)' : 'transparent',
                                            opacity: isToggling ? 0.6 : 1,
                                        }}
                                    >
                                        {isToggling ? (
                                            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--admin-text-muted)' }} />
                                        ) : (
                                            <Icon className={`h-4 w-4 ${meta.color}`} />
                                        )}
                                        <span className="text-[10px] font-bold" style={{ color: 'var(--admin-text)' }}>{meta.label}</span>
                                        {isEnabled ? (
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                            <XCircle className="h-3 w-3 text-gray-400" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* KPI CARDS ROW */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Today's Patients */}
                        <div className="group relative rounded-2xl p-5 border transition-all overflow-hidden hover:shadow-md"
                            style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-30 transition-all" style={{ background: 'var(--admin-primary)' }} />
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'var(--admin-text-muted)' }}>Patients Today</span>
                                <div className="p-1.5 rounded-lg" style={{ background: 'var(--admin-primary-light)' }}>
                                    <Users className="h-3.5 w-3.5" style={{ color: 'var(--admin-primary)' }} />
                                </div>
                            </div>
                            <p className="text-3xl font-black tracking-tight" style={{ color: 'var(--admin-text)' }}>{stats?.totalPatientsToday || 0}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <div className={`h-2 w-2 rounded-full ${getSlaIndicator(stats?.totalPatientsToday || 0, 50, 'higher_better')}`} />
                                <span className="text-xs font-bold" style={{ color: 'var(--admin-primary)' }}>
                                    <ArrowUpRight className="h-3 w-3 inline" /> Total: {stats?.totalPatientsAll || 0}
                                </span>
                            </div>
                        </div>

                        {/* Active Admissions */}
                        <div className="group relative rounded-2xl p-5 border transition-all overflow-hidden hover:shadow-md"
                            style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl" />
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'var(--admin-text-muted)' }}>IPD Admissions</span>
                                <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                    <Bed className="h-3.5 w-3.5 text-violet-500" />
                                </div>
                            </div>
                            <p className="text-3xl font-black tracking-tight" style={{ color: 'var(--admin-text)' }}>{stats?.activeAdmissions || 0}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <div className={`h-2 w-2 rounded-full ${(bedData?.occupancyRate || 0) > 85 ? 'bg-rose-500' : (bedData?.occupancyRate || 0) > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <span className="text-xs font-bold text-violet-500">
                                    <Activity className="h-3 w-3 inline" /> {bedData?.occupancyRate || 0}% Bed Occupancy
                                </span>
                            </div>
                        </div>

                        {/* Pending Lab */}
                        <div className="group relative rounded-2xl p-5 border transition-all overflow-hidden hover:shadow-md"
                            style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'var(--admin-text-muted)' }}>Lab Queue</span>
                                <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                    <FlaskConical className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                            </div>
                            <p className="text-3xl font-black tracking-tight" style={{ color: 'var(--admin-text)' }}>{stats?.pendingLabOrders || 0}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <div className={`h-2 w-2 rounded-full ${(stats?.pendingLabOrders || 0) > 20 ? 'bg-rose-500' : (stats?.pendingLabOrders || 0) > 10 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <span className="text-xs font-bold text-emerald-500">
                                    <TrendingUp className="h-3 w-3 inline" /> {stats?.completedLabToday || 0} done today
                                </span>
                            </div>
                        </div>

                        {/* Revenue */}
                        <div className="group relative rounded-2xl p-5 border transition-all overflow-hidden hover:shadow-md"
                            style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'var(--admin-text-muted)' }}>Revenue</span>
                                <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                                </div>
                            </div>
                            <p className="text-3xl font-black tracking-tight" style={{ color: 'var(--admin-text)' }}>
                                ₹{((stats?.totalRevenue || 0) / 1000).toFixed(1)}K
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                <span className="text-xs font-bold text-emerald-500">
                                    <TrendingUp className="h-3 w-3 inline" /> Collected
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* MAIN GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* BED OCCUPANCY */}
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <Bed className="h-4 w-4 text-violet-500" />
                                    Bed Occupancy
                                </h3>
                                <span className="text-xs font-bold" style={{ color: 'var(--admin-text-muted)' }}>{bedData?.total || 0} beds</span>
                            </div>
                            <div className="p-5 space-y-4">
                                <div className="flex items-center gap-6">
                                    <div className="relative h-28 w-28 shrink-0">
                                        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                                            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(128,128,128,0.1)" strokeWidth="8" />
                                            <circle
                                                cx="50" cy="50" r="42" fill="none"
                                                stroke="var(--admin-primary)"
                                                strokeWidth="8"
                                                strokeLinecap="round"
                                                strokeDasharray={`${(bedData?.occupancyRate || 0) * 2.64} 264`}
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-2xl font-black" style={{ color: 'var(--admin-text)' }}>{bedData?.occupancyRate || 0}%</span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>Occupied</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3 flex-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--admin-primary)' }} />
                                                <span className="text-xs font-bold" style={{ color: 'var(--admin-text-muted)' }}>Occupied</span>
                                            </div>
                                            <span className="text-sm font-black" style={{ color: 'var(--admin-text)' }}>{bedData?.occupied || 0}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                <span className="text-xs font-bold" style={{ color: 'var(--admin-text-muted)' }}>Available</span>
                                            </div>
                                            <span className="text-sm font-black" style={{ color: 'var(--admin-text)' }}>{bedData?.available || 0}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                                <span className="text-xs font-bold" style={{ color: 'var(--admin-text-muted)' }}>Maintenance</span>
                                            </div>
                                            <span className="text-sm font-black" style={{ color: 'var(--admin-text)' }}>{bedData?.maintenance || 0}</span>
                                        </div>
                                    </div>
                                </div>
                                {bedData?.byWard && bedData.byWard.length > 0 && (
                                    <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: 'var(--admin-border)' }}>
                                        {bedData.byWard.map((ward: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <span className="text-xs font-bold w-24 truncate" style={{ color: 'var(--admin-text-muted)' }}>{ward.wardName}</span>
                                                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--admin-border)' }}>
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${ward.occupancyRate}%`, background: 'var(--admin-primary)' }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-black w-10 text-right" style={{ color: 'var(--admin-text-muted)' }}>{ward.occupancyRate}%</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* PATIENT FLOW */}
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <TrendingUp className="h-4 w-4" style={{ color: 'var(--admin-primary)' }} />
                                    Patient Flow (7 Days)
                                </h3>
                            </div>
                            <div className="p-5">
                                {patientFlow.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="flex items-end gap-2 h-36">
                                            {patientFlow.map((item: any, i: number) => {
                                                const maxCount = Math.max(...patientFlow.map((p: any) => p.count), 1);
                                                const heightPct = (item.count / maxCount) * 100;
                                                return (
                                                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                                        <span className="text-[10px] font-black" style={{ color: 'var(--admin-primary)' }}>{item.count}</span>
                                                        <div className="w-full rounded-t-lg transition-all duration-700 hover:opacity-80"
                                                            style={{ height: `${Math.max(heightPct, 8)}%`, background: `linear-gradient(to top, var(--admin-primary), var(--admin-secondary))` }}
                                                        />
                                                        <span className="text-[9px] font-bold truncate max-w-full" style={{ color: 'var(--admin-text-muted)' }}>{item.day}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--admin-border)' }}>
                                            <span className="text-xs font-bold" style={{ color: 'var(--admin-text-muted)' }}>Total Registrations</span>
                                            <span className="text-sm font-black" style={{ color: 'var(--admin-primary)' }}>
                                                {patientFlow.reduce((s: number, p: any) => s + p.count, 0)}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-36 flex items-center justify-center text-xs font-bold" style={{ color: 'var(--admin-text-muted)' }}>
                                        No patient flow data yet
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* INVENTORY ALERTS */}
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <Package className="h-4 w-4 text-amber-500" />
                                    Inventory Alerts
                                </h3>
                                <Link href="/pharmacy/billing" className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--admin-primary)' }}>
                                    Pharmacy <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>
                            <div className="p-5 space-y-3 max-h-[320px] overflow-auto">
                                {inventoryAlerts?.lowStock?.length > 0 && (
                                    <>
                                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                            <AlertTriangle className="h-3 w-3" /> Low Stock
                                        </p>
                                        {inventoryAlerts.lowStock.map((item: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                                <div>
                                                    <span className="text-xs font-bold block" style={{ color: 'var(--admin-text)' }}>{item.medicine}</span>
                                                    <span className="text-[10px] font-mono" style={{ color: 'var(--admin-text-muted)' }}>{item.batchNo}</span>
                                                </div>
                                                <span className="text-xs font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md">
                                                    {item.stock} left
                                                </span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {inventoryAlerts?.expiringSoon?.length > 0 && (
                                    <>
                                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.15em] flex items-center gap-1.5 mt-4">
                                            <Clock className="h-3 w-3" /> Expiring Soon
                                        </p>
                                        {inventoryAlerts.expiringSoon.map((item: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                                                <div>
                                                    <span className="text-xs font-bold block" style={{ color: 'var(--admin-text)' }}>{item.medicine}</span>
                                                    <span className="text-[10px] font-mono" style={{ color: 'var(--admin-text-muted)' }}>{item.batchNo}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-amber-500">
                                                    {new Date(item.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {(!inventoryAlerts?.lowStock?.length && !inventoryAlerts?.expiringSoon?.length) && (
                                    <div className="py-8 flex flex-col items-center" style={{ color: 'var(--admin-text-muted)' }}>
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
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                                    Revenue Breakdown
                                </h3>
                                <span className="text-xs font-black text-emerald-500">
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
                                                    <span className="text-xs font-bold w-28 truncate" style={{ color: 'var(--admin-text-muted)' }}>{dept.name}</span>
                                                    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--admin-border)' }}>
                                                        <div
                                                            className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`}
                                                            style={{ width: `${widthPct}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-black w-16 text-right" style={{ color: 'var(--admin-text-muted)' }}>₹{dept.amount.toLocaleString()}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="py-8 flex flex-col items-center" style={{ color: 'var(--admin-text-muted)' }}>
                                        <BarChart3 className="h-8 w-8 mb-2" />
                                        <span className="text-xs font-bold">No revenue data yet</span>
                                        <span className="text-[10px] mt-1">Billing records will appear here</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* AUDIT TRAIL */}
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <Shield className="h-4 w-4 text-blue-500" />
                                    Audit Trail
                                </h3>
                                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>Live Feed</span>
                            </div>
                            <div className="max-h-[320px] overflow-auto">
                                {activity.length > 0 ? (
                                    <div className="divide-y" style={{ borderColor: 'var(--admin-border)' }}>
                                        {activity.map((log: any, i: number) => (
                                            <div key={i} className="px-5 py-3.5 flex items-center gap-3 transition-colors hover:opacity-80">
                                                <div className={`p-1.5 rounded-lg ${getActionColor(log.action)}`}>
                                                    {getActionIcon(log.action)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black" style={{ color: 'var(--admin-text)' }}>{log.action.replace(/_/g, ' ')}</span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--admin-border)', color: 'var(--admin-text-muted)' }}>{log.module}</span>
                                                    </div>
                                                    <p className="text-[10px] font-medium truncate" style={{ color: 'var(--admin-text-muted)' }}>
                                                        {log.username && `by ${log.username}`}
                                                        {log.entity_id && ` · ${log.entity_type}: ${log.entity_id.slice(0, 12)}...`}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-medium shrink-0" style={{ color: 'var(--admin-text-muted)' }}>
                                                    {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 flex flex-col items-center" style={{ color: 'var(--admin-text-muted)' }}>
                                        <Shield className="h-8 w-8 mb-2" />
                                        <span className="text-xs font-bold">No activity logged yet</span>
                                        <span className="text-[10px] mt-1">Actions across modules will appear here</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ADMIN CONTROL CENTER */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                        {/* FEATURE TOGGLES */}
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <Settings className="h-4 w-4 text-indigo-500" />
                                    Feature Controls
                                </h3>
                                <Link href="/admin/settings" className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--admin-primary)' }}>
                                    Settings <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>
                            <div className="p-5 space-y-3">
                                {[
                                    { key: 'enable_ai_triage' as FeatureToggleKey, label: 'AI Triage', description: 'Smart intake and routing in reception flow' },
                                    { key: 'enable_whatsapp' as FeatureToggleKey, label: 'WhatsApp Alerts', description: 'Send reminders and payment nudges to patients' },
                                    { key: 'enable_razorpay' as FeatureToggleKey, label: 'Online Payments', description: 'Collect invoice payments using Razorpay' },
                                ].map(toggle => {
                                    const isEnabled = Boolean(orgSettings?.[toggle.key]);
                                    const isSaving = featureSaving === toggle.key;
                                    return (
                                        <button
                                            key={toggle.key}
                                            onClick={() => handleFeatureToggle(toggle.key)}
                                            disabled={isSaving}
                                            className="w-full p-3 rounded-xl border text-left transition-all"
                                            style={{
                                                borderColor: isEnabled ? 'var(--admin-primary)' : 'var(--admin-border)',
                                                background: isEnabled ? 'var(--admin-primary-light)' : 'transparent',
                                                opacity: isSaving ? 0.7 : 1,
                                            }}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-xs font-black" style={{ color: 'var(--admin-text)' }}>{toggle.label}</p>
                                                    <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>{toggle.description}</p>
                                                </div>
                                                <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-md ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                                                    {isEnabled ? 'On' : 'Off'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--admin-text-muted)' }}>
                                                    {isSaving ? 'Updating...' : 'Click to toggle'}
                                                </span>
                                                {isSaving ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--admin-primary)' }} />
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
                        <div id="doctor-command" className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <Stethoscope className="h-4 w-4 text-violet-500" />
                                    Doctor Command
                                </h3>
                                <span className="text-xs font-black text-violet-500">
                                    {staffStats?.doctors || 0} Doctors
                                </span>
                            </div>
                            <div className="p-5 space-y-3">
                                {doctorList.length > 0 ? (
                                    doctorList.map((doctor: any) => (
                                        <button key={doctor.id} onClick={() => handleDoctorClick(doctor)} className="w-full text-left p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 transition-colors">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-black" style={{ color: 'var(--admin-text)' }}>{doctor.name || doctor.username}</p>
                                                    <p className="text-[10px] font-medium" style={{ color: 'var(--admin-text-muted)' }}>
                                                        {doctor.specialty || 'General Practice'}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-mono" style={{ color: 'var(--admin-text-muted)' }}>@{doctor.username}</span>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="py-8 flex flex-col items-center" style={{ color: 'var(--admin-text-muted)' }}>
                                        <Stethoscope className="h-8 w-8 mb-2" />
                                        <span className="text-xs font-bold">No doctors added yet</span>
                                        <span className="text-[10px] mt-1">Create your first doctor account</span>
                                    </div>
                                )}
                                <div className="pt-3 border-t flex gap-2" style={{ borderColor: 'var(--admin-border)' }}>
                                    <button
                                        onClick={() => { resetDoctorForm(); setShowAddDoctorModal(true); }}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
                                        style={{ background: `linear-gradient(135deg, var(--admin-primary), var(--admin-secondary))` }}
                                    >
                                        <UserPlus className="h-3.5 w-3.5" /> Add Doctor
                                    </button>
                                    <Link href="/admin/staff" className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border text-xs font-bold rounded-xl transition-all hover:opacity-80"
                                        style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)' }}>
                                        Manage Staff
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* OPERATIONS HUB */}
                        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                                <h3 className="font-black flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
                                    <Building2 className="h-4 w-4" style={{ color: 'var(--admin-primary)' }} />
                                    Operations Hub
                                </h3>
                                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>Quick Access</span>
                            </div>
                            <div className="p-5 space-y-2.5">
                                {[
                                    { href: '/admin/staff', title: 'Staff & Access', subtitle: 'Create users, assign roles, reset credentials' },
                                    { href: '/admin/departments', title: 'Departments', subtitle: 'Manage departments and consultation masters' },
                                    { href: '/admin/roles', title: 'Roles & Permissions', subtitle: 'Configure granular access control' },
                                    { href: '/admin/settings', title: 'Tenant Settings', subtitle: 'Configure integrations and hospital defaults' },
                                    { href: '/admin/analytics', title: 'Analytics & SLA', subtitle: 'Monitor KPIs and performance targets' },
                                    { href: '/admin/audit', title: 'Audit Trail', subtitle: 'Review activity logs and compliance events' },
                                ].map(item => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className="block p-3 rounded-xl border transition-all hover:shadow-sm"
                                        style={{ borderColor: 'var(--admin-border)' }}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-black" style={{ color: 'var(--admin-text)' }}>{item.title}</p>
                                                <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>{item.subtitle}</p>
                                            </div>
                                            <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--admin-text-muted)' }} />
                                        </div>
                                    </Link>
                                ))}
                                {staffStats?.byRole?.length > 0 && (
                                    <div className="pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--admin-border)' }}>
                                        {staffStats.byRole.map((entry: any) => (
                                            <span key={entry.role} className="text-[10px] font-black px-2 py-1 rounded-md"
                                                style={{ background: 'var(--admin-border)', color: 'var(--admin-text-muted)' }}>
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
                        {[
                            { href: '/reception/triage', icon: Zap, title: 'AI Triage Intake', subtitle: 'Smart patient intake & routing', color: 'text-teal-500', bg: 'bg-teal-500/10' },
                            { href: '/ipd', icon: Bed, title: 'IPD Management', subtitle: 'Beds, admissions & care', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                            { href: '/finance/dashboard', icon: DollarSign, title: 'Finance & Billing', subtitle: 'Invoices, payments & revenue', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { href: '/lab/technician', icon: FlaskConical, title: 'Lab Worklist', subtitle: 'Test orders & result upload', color: 'text-amber-500', bg: 'bg-amber-500/10' },
                            { href: '/pharmacy/billing', icon: Pill, title: 'Pharmacy', subtitle: 'Inventory & dispensing', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
                            { href: '/insurance', icon: Shield, title: 'Insurance & TPA', subtitle: 'Claims & policy management', color: 'text-blue-500', bg: 'bg-blue-500/10' },
                            { href: '/discharge/admin', icon: FileText, title: 'Discharge Hub', subtitle: 'Summary & clearance', color: 'text-rose-500', bg: 'bg-rose-500/10' },
                            { href: '/admin/mfa-setup', icon: Shield, title: 'MFA Setup', subtitle: 'Two-factor authentication', color: 'text-purple-500', bg: 'bg-purple-500/10' },
                        ].map(item => {
                            const Icon = item.icon;
                            return (
                                <Link key={item.href} href={item.href}
                                    className="group rounded-2xl p-5 border transition-all flex flex-col gap-3 hover:shadow-md"
                                    style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                                    <div className={`p-2 ${item.bg} rounded-xl w-fit group-hover:scale-110 transition-transform`}>
                                        <Icon className={`h-5 w-5 ${item.color}`} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black" style={{ color: 'var(--admin-text)' }}>{item.title}</h4>
                                        <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>{item.subtitle}</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* ADD DOCTOR MODAL */}
                    {showAddDoctorModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddDoctorModal(false); resetDoctorForm(); }} />
                            <div className="relative rounded-2xl shadow-xl border w-full max-w-lg max-h-[90vh] overflow-y-auto"
                                style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                                <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 rounded-t-2xl"
                                    style={{ borderColor: 'var(--admin-border)', background: 'var(--admin-surface)' }}>
                                    <h2 className="text-base font-bold" style={{ color: 'var(--admin-text)' }}>Quick Add Doctor</h2>
                                    <button
                                        onClick={() => { setShowAddDoctorModal(false); resetDoctorForm(); }}
                                        className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                                        style={{ color: 'var(--admin-text-muted)' }}
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
                                        <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>Doctor Name *</label>
                                        <input type="text" value={doctorForm.name}
                                            onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                            placeholder="Dr. John Smith"
                                            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-1"
                                            style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)', background: 'var(--admin-bg)' }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>Username *</label>
                                            <input type="text" value={doctorForm.username}
                                                onChange={e => setDoctorForm({ ...doctorForm, username: e.target.value })}
                                                placeholder="doc_new"
                                                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-1"
                                                style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)', background: 'var(--admin-bg)' }}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>Temporary Password *</label>
                                            <input type="password" value={doctorForm.password}
                                                onChange={e => setDoctorForm({ ...doctorForm, password: e.target.value })}
                                                placeholder="Min 6 characters"
                                                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-1"
                                                style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)', background: 'var(--admin-bg)' }}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>Specialty</label>
                                            <select value={doctorForm.specialty}
                                                onChange={e => setDoctorForm({ ...doctorForm, specialty: e.target.value })}
                                                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none"
                                                style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)', background: 'var(--admin-bg)' }}
                                            >
                                                <option value="">Select Specialty</option>
                                                {DOCTOR_SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>Phone</label>
                                            <input type="tel" value={doctorForm.phone}
                                                onChange={e => setDoctorForm({ ...doctorForm, phone: e.target.value })}
                                                placeholder="+91 98765 43210"
                                                className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-1"
                                                style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)', background: 'var(--admin-bg)' }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>Email</label>
                                        <input type="email" value={doctorForm.email}
                                            onChange={e => setDoctorForm({ ...doctorForm, email: e.target.value })}
                                            placeholder="doctor@hospital.com"
                                            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-1"
                                            style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)', background: 'var(--admin-bg)' }}
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 pt-2">
                                        <button onClick={() => { setShowAddDoctorModal(false); resetDoctorForm(); }}
                                            className="px-4 py-2.5 border text-xs font-bold rounded-xl transition-all hover:opacity-80"
                                            style={{ borderColor: 'var(--admin-border)', color: 'var(--admin-text)' }}>
                                            Cancel
                                        </button>
                                        <button onClick={handleAddDoctor} disabled={doctorSubmitting}
                                            className="flex items-center gap-2 px-4 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                                            style={{ background: `linear-gradient(135deg, var(--admin-primary), var(--admin-secondary))` }}>
                                            {doctorSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                                            Add Doctor
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DOCTOR QUEUE SIDE PANEL */}
                    {selectedDoctor && (
                        <div className="fixed inset-0 z-[100] flex justify-end">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDoctor(null)} />
                            <div className="relative w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
                                style={{ background: 'var(--admin-surface)' }}>
                                <div className="flex items-center justify-between px-6 py-4 border-b"
                                    style={{ borderColor: 'var(--admin-border)', background: 'var(--admin-primary-light)' }}>
                                    <div>
                                        <h2 className="text-base font-bold" style={{ color: 'var(--admin-text)' }}>Active Station: {selectedDoctor.name || selectedDoctor.username}</h2>
                                        <p className="text-[10px] font-medium" style={{ color: 'var(--admin-text-muted)' }}>{selectedDoctor.specialty || 'General Practice'}</p>
                                    </div>
                                    <button onClick={() => setSelectedDoctor(null)}
                                        className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                                        style={{ color: 'var(--admin-text-muted)' }}>
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--admin-bg)' }}>
                                    <h3 className="text-xs font-black uppercase tracking-wider mb-4" style={{ color: 'var(--admin-text-muted)' }}>Current Patient Queue</h3>
                                    {loadingQueue ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--admin-primary)' }} />
                                        </div>
                                    ) : doctorQueue.length > 0 ? (
                                        <div className="space-y-3">
                                            {doctorQueue.map((patient: any) => (
                                                <div key={patient.internal_id} className="p-4 border rounded-xl shadow-sm"
                                                    style={{ background: 'var(--admin-surface)', borderColor: 'var(--admin-border)' }}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <h4 className="text-sm font-bold" style={{ color: 'var(--admin-text)' }}>{patient.full_name || 'Unknown Patient'}</h4>
                                                            <p className="text-[10px] font-mono" style={{ color: 'var(--admin-text-muted)' }}>{patient.digital_id}</p>
                                                        </div>
                                                        <span className="text-[10px] font-black px-2 py-1 bg-amber-100 text-amber-700 rounded-md">
                                                            {patient.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-4 text-[10px] font-medium" style={{ color: 'var(--admin-text-muted)' }}>
                                                        <span>{new Date(patient.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {patient.age && <span>Age: {patient.age}</span>}
                                                        {patient.gender && <span>{patient.gender}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12" style={{ color: 'var(--admin-text-muted)' }}>
                                            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-xs font-bold">No patients in queue</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
