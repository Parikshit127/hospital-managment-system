'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    LineChart, Users, Bed, FlaskConical, DollarSign, Activity,
    TrendingUp, TrendingDown, Clock, AlertTriangle,
    Loader2, Target, CheckCircle2, XCircle,
    ArrowUpRight, ArrowDownRight, Timer, FileWarning,
    IndianRupee, ClipboardList, Hourglass, BarChart3
} from 'lucide-react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    getDashboardStats, getBedOccupancy, getRevenueBreakdown,
    getPatientFlow, getInventoryAlerts
} from '@/app/actions/admin-actions';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'custom';
type SLAStatus = 'met' | 'warning' | 'breached';

interface KPICard {
    id: string;
    module: string;
    moduleColor: string;
    moduleBg: string;
    icon: React.ReactNode;
    label: string;
    value: string | number;
    unit?: string;
    target?: string;
    sla: SLAStatus;
    trend: 'up' | 'down' | 'flat';
    trendValue?: string;
    subtitle?: string;
}

interface SLABreachEntry {
    id: string;
    timestamp: string;
    kpiName: string;
    target: string;
    actual: string;
    department: string;
    status: 'breached' | 'warning' | 'resolved';
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getSlaColor(status: SLAStatus) {
    switch (status) {
        case 'met': return 'bg-emerald-500';
        case 'warning': return 'bg-amber-500';
        case 'breached': return 'bg-red-500';
    }
}

function getSlaLabel(status: SLAStatus) {
    switch (status) {
        case 'met': return 'SLA Met';
        case 'warning': return 'Warning';
        case 'breached': return 'Breached';
    }
}

function getSlaTextColor(status: SLAStatus) {
    switch (status) {
        case 'met': return 'text-emerald-600';
        case 'warning': return 'text-amber-600';
        case 'breached': return 'text-red-600';
    }
}

function getSlaRowBg(status: string) {
    switch (status) {
        case 'breached': return 'bg-red-50/60';
        case 'warning': return 'bg-amber-50/60';
        case 'resolved': return 'bg-emerald-50/40';
        default: return '';
    }
}

function formatCurrency(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString('en-IN');
}

// ──────────────────────────────────────────────
// Placeholder SLA breach log data
// ──────────────────────────────────────────────

const SAMPLE_SLA_BREACHES: SLABreachEntry[] = [
    {
        id: '1',
        timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
        kpiName: 'Average Wait Time',
        target: '<20 min',
        actual: '34 min',
        department: 'OPD - General',
        status: 'breached',
    },
    {
        id: '2',
        timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
        kpiName: 'Lab TAT Compliance',
        target: '>90%',
        actual: '82%',
        department: 'Pathology',
        status: 'warning',
    },
    {
        id: '3',
        timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
        kpiName: 'Discharge TAT',
        target: '<4 hours',
        actual: '5.2 hours',
        department: 'IPD - Ward B',
        status: 'breached',
    },
    {
        id: '4',
        timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
        kpiName: 'Critical Value Notification',
        target: '<5 min',
        actual: '8 min',
        department: 'Lab - Biochemistry',
        status: 'breached',
    },
    {
        id: '5',
        timestamp: new Date(Date.now() - 8 * 3600000).toISOString(),
        kpiName: 'Collection Rate',
        target: '>90%',
        actual: '87%',
        department: 'Finance',
        status: 'warning',
    },
    {
        id: '6',
        timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
        kpiName: 'Bed Occupancy',
        target: '75-85%',
        actual: '93%',
        department: 'IPD - ICU',
        status: 'resolved',
    },
];

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export default function AnalyticsSLAPage() {
    const [stats, setStats] = useState<any>(null);
    const [bedData, setBedData] = useState<any>(null);
    const [revenue, setRevenue] = useState<any>(null);
    const [patientFlow, setPatientFlow] = useState<any[]>([]);
    const [inventoryAlerts, setInventoryAlerts] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRange>('today');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [s, b, r, pf, inv] = await Promise.all([
                getDashboardStats(),
                getBedOccupancy(),
                getRevenueBreakdown(),
                getPatientFlow(),
                getInventoryAlerts(),
            ]);
            if (s.success) setStats(s.data);
            if (b.success) setBedData(b.data);
            if (r.success) setRevenue(r.data);
            if (pf.success) setPatientFlow(pf.data || []);
            if (inv.success) setInventoryAlerts(inv.data);
        } catch (err) {
            console.error('Analytics load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ──────────────────────────────────────────────
    // Derive KPI cards from loaded data
    // ──────────────────────────────────────────────

    const occupancyRate = bedData?.occupancyRate ?? 0;
    const pendingLabOrders = stats?.pendingLabOrders ?? 0;
    const totalRevenueValue = revenue?.totalRevenue ?? stats?.totalRevenue ?? 0;

    // Compute simulated KPI values for display
    // (In production these would come from real SLA tracking APIs)
    const avgWaitTime = 18;
    const noShowRate = 7;
    const avgLOS = 4.2;
    const dischargeTAT = 3.5;
    const labTATCompliance = 92;
    const criticalNotifTime = 3;
    const collectionRate = 91;
    const outstandingAR = 245000;

    const kpiCards: KPICard[] = [
        // OPD KPIs
        {
            id: 'opd-wait',
            module: 'OPD',
            moduleColor: 'text-teal-500',
            moduleBg: 'bg-teal-500/8',
            icon: <Clock className="h-4 w-4 text-teal-500" />,
            label: 'Avg Wait Time',
            value: avgWaitTime,
            unit: 'min',
            target: 'Target: <20 min',
            sla: avgWaitTime <= 15 ? 'met' : avgWaitTime <= 20 ? 'warning' : 'breached',
            trend: 'down',
            trendValue: '-2 min',
        },
        {
            id: 'opd-patients',
            module: 'OPD',
            moduleColor: 'text-teal-500',
            moduleBg: 'bg-teal-500/8',
            icon: <Users className="h-4 w-4 text-teal-500" />,
            label: 'Patients Today',
            value: stats?.totalPatientsToday ?? 0,
            target: `Total: ${stats?.totalPatientsAll ?? 0}`,
            sla: 'met',
            trend: 'up',
            trendValue: `+${stats?.appointmentsToday ?? 0} appts`,
        },
        {
            id: 'opd-noshow',
            module: 'OPD',
            moduleColor: 'text-teal-500',
            moduleBg: 'bg-teal-500/8',
            icon: <XCircle className="h-4 w-4 text-teal-500" />,
            label: 'No-Show Rate',
            value: noShowRate,
            unit: '%',
            target: 'Target: <10%',
            sla: noShowRate < 10 ? 'met' : noShowRate <= 15 ? 'warning' : 'breached',
            trend: 'down',
            trendValue: '-1.2%',
        },
        // IPD KPIs
        {
            id: 'ipd-occupancy',
            module: 'IPD',
            moduleColor: 'text-violet-500',
            moduleBg: 'bg-violet-500/8',
            icon: <Bed className="h-4 w-4 text-violet-500" />,
            label: 'Bed Occupancy',
            value: occupancyRate,
            unit: '%',
            target: 'Target: 75-85%',
            sla: occupancyRate >= 75 && occupancyRate <= 85 ? 'met'
                : occupancyRate > 95 ? 'breached'
                : occupancyRate > 85 ? 'warning'
                : 'warning',
            trend: occupancyRate > 80 ? 'up' : 'down',
            trendValue: `${bedData?.occupied ?? 0}/${bedData?.total ?? 0} beds`,
        },
        {
            id: 'ipd-los',
            module: 'IPD',
            moduleColor: 'text-violet-500',
            moduleBg: 'bg-violet-500/8',
            icon: <Hourglass className="h-4 w-4 text-violet-500" />,
            label: 'Avg Length of Stay',
            value: avgLOS,
            unit: 'days',
            target: 'Target: varies',
            sla: avgLOS <= 5 ? 'met' : avgLOS <= 7 ? 'warning' : 'breached',
            trend: 'down',
            trendValue: '-0.3 days',
        },
        {
            id: 'ipd-discharge',
            module: 'IPD',
            moduleColor: 'text-violet-500',
            moduleBg: 'bg-violet-500/8',
            icon: <Timer className="h-4 w-4 text-violet-500" />,
            label: 'Discharge TAT',
            value: dischargeTAT,
            unit: 'hrs',
            target: 'Target: <4 hrs',
            sla: dischargeTAT < 4 ? 'met' : dischargeTAT <= 5 ? 'warning' : 'breached',
            trend: 'down',
            trendValue: '-0.5 hrs',
        },
        // Lab KPIs
        {
            id: 'lab-tat',
            module: 'Lab',
            moduleColor: 'text-amber-500',
            moduleBg: 'bg-amber-500/8',
            icon: <CheckCircle2 className="h-4 w-4 text-amber-500" />,
            label: 'TAT Compliance',
            value: labTATCompliance,
            unit: '%',
            target: 'Target: >90%',
            sla: labTATCompliance >= 90 ? 'met' : labTATCompliance >= 80 ? 'warning' : 'breached',
            trend: 'up',
            trendValue: '+3%',
        },
        {
            id: 'lab-pending',
            module: 'Lab',
            moduleColor: 'text-amber-500',
            moduleBg: 'bg-amber-500/8',
            icon: <ClipboardList className="h-4 w-4 text-amber-500" />,
            label: 'Pending Reports',
            value: pendingLabOrders,
            target: 'Target: <10',
            sla: pendingLabOrders < 10 ? 'met' : pendingLabOrders <= 20 ? 'warning' : 'breached',
            trend: pendingLabOrders > 10 ? 'up' : 'down',
            trendValue: `${stats?.completedLabToday ?? 0} done today`,
        },
        {
            id: 'lab-critical',
            module: 'Lab',
            moduleColor: 'text-amber-500',
            moduleBg: 'bg-amber-500/8',
            icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
            label: 'Critical Notif Time',
            value: criticalNotifTime,
            unit: 'min',
            target: 'Target: <5 min',
            sla: criticalNotifTime < 5 ? 'met' : criticalNotifTime <= 7 ? 'warning' : 'breached',
            trend: 'down',
            trendValue: '-1 min',
        },
        // Finance KPIs
        {
            id: 'fin-collection',
            module: 'Finance',
            moduleColor: 'text-emerald-500',
            moduleBg: 'bg-emerald-500/8',
            icon: <Target className="h-4 w-4 text-emerald-500" />,
            label: 'Collection Rate',
            value: collectionRate,
            unit: '%',
            target: 'Target: >90%',
            sla: collectionRate >= 90 ? 'met' : collectionRate >= 80 ? 'warning' : 'breached',
            trend: 'up',
            trendValue: '+2.1%',
        },
        {
            id: 'fin-ar',
            module: 'Finance',
            moduleColor: 'text-emerald-500',
            moduleBg: 'bg-emerald-500/8',
            icon: <FileWarning className="h-4 w-4 text-emerald-500" />,
            label: 'Outstanding AR',
            value: `${formatCurrency(outstandingAR)}`,
            target: '0-30d: 60% | 30-60d: 25% | 60+d: 15%',
            sla: outstandingAR < 200000 ? 'met' : outstandingAR < 500000 ? 'warning' : 'breached',
            trend: 'down',
            trendValue: '-12K',
            subtitle: 'Aging breakdown',
        },
        {
            id: 'fin-revenue',
            module: 'Finance',
            moduleColor: 'text-emerald-500',
            moduleBg: 'bg-emerald-500/8',
            icon: <IndianRupee className="h-4 w-4 text-emerald-500" />,
            label: 'Revenue Today',
            value: `${formatCurrency(totalRevenueValue)}`,
            target: 'Collected payments',
            sla: 'met',
            trend: 'up',
            trendValue: '+8.3%',
        },
    ];

    // ──────────────────────────────────────────────
    // Chart data
    // ──────────────────────────────────────────────

    const dailyTrend = revenue?.dailyTrend ?? [];
    const deptBreakdown = revenue?.byDepartment ?? [];

    // ──────────────────────────────────────────────
    // Render
    // ──────────────────────────────────────────────

    const timeRanges: { key: TimeRange; label: string }[] = [
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'quarter', label: 'This Quarter' },
        { key: 'custom', label: 'Custom' },
    ];

    const headerActions = (
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {timeRanges.map(tr => (
                <button
                    key={tr.key}
                    onClick={() => setTimeRange(tr.key)}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                        timeRange === tr.key
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {tr.label}
                </button>
            ))}
        </div>
    );

    return (
        <AdminPage
            pageTitle="Analytics & SLA Monitoring"
            pageIcon={<LineChart className="h-5 w-5" />}
            headerActions={headerActions}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-8">
                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
                            <p className="text-gray-400 font-bold text-sm">Loading analytics data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ═══════════════════════════════════════════
                            SLA SUMMARY BAR
                        ═══════════════════════════════════════════ */}
                        <div className="flex items-center gap-6 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-gray-400" />
                                <span className="text-xs font-black text-gray-500 uppercase tracking-wider">SLA Overview</span>
                            </div>
                            <div className="flex items-center gap-4 ml-auto">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                    <span className="text-xs font-bold text-gray-600">
                                        {kpiCards.filter(k => k.sla === 'met').length} Met
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                    <span className="text-xs font-bold text-gray-600">
                                        {kpiCards.filter(k => k.sla === 'warning').length} Warning
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                                    <span className="text-xs font-bold text-gray-600">
                                        {kpiCards.filter(k => k.sla === 'breached').length} Breached
                                    </span>
                                </div>
                            </div>
                            {/* Mini progress bar */}
                            <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-700"
                                    style={{ width: `${(kpiCards.filter(k => k.sla === 'met').length / kpiCards.length) * 100}%` }}
                                />
                                <div
                                    className="h-full bg-amber-500 transition-all duration-700"
                                    style={{ width: `${(kpiCards.filter(k => k.sla === 'warning').length / kpiCards.length) * 100}%` }}
                                />
                                <div
                                    className="h-full bg-red-500 transition-all duration-700"
                                    style={{ width: `${(kpiCards.filter(k => k.sla === 'breached').length / kpiCards.length) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════
                            KPI CARDS GRID (3 columns x 4 rows)
                        ═══════════════════════════════════════════ */}
                        <div>
                            {/* Module group headers + cards */}
                            {(['OPD', 'IPD', 'Lab', 'Finance'] as const).map(mod => {
                                const modCards = kpiCards.filter(k => k.module === mod);
                                const modColor = modCards[0]?.moduleColor ?? 'text-gray-500';
                                return (
                                    <div key={mod} className="mb-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${modColor}`}>
                                                {mod} KPIs
                                            </span>
                                            <div className="flex-1 h-px bg-gray-200" />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {modCards.map(card => (
                                                <div
                                                    key={card.id}
                                                    className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all overflow-hidden"
                                                >
                                                    {/* Subtle gradient glow */}
                                                    <div className={`absolute top-0 right-0 w-28 h-28 ${card.moduleBg} rounded-full blur-3xl opacity-60 group-hover:opacity-100 transition-all`} />

                                                    {/* Header row */}
                                                    <div className="relative flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`p-1.5 rounded-lg ${card.moduleBg}`}>
                                                                {card.icon}
                                                            </div>
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                                                                {card.label}
                                                            </span>
                                                        </div>
                                                        {/* SLA dot */}
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={`h-2.5 w-2.5 rounded-full ${getSlaColor(card.sla)}`} />
                                                            <span className={`text-[9px] font-bold uppercase tracking-wide ${getSlaTextColor(card.sla)}`}>
                                                                {getSlaLabel(card.sla)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Value */}
                                                    <div className="relative flex items-baseline gap-1.5 mb-1">
                                                        <span className="text-3xl font-black text-gray-900 tracking-tight">
                                                            {card.id === 'fin-revenue' || card.id === 'fin-ar' ? (
                                                                <span className="flex items-baseline gap-0.5">
                                                                    <span className="text-lg text-gray-400">&#8377;</span>
                                                                    {card.value}
                                                                </span>
                                                            ) : (
                                                                card.value
                                                            )}
                                                        </span>
                                                        {card.unit && (
                                                            <span className="text-sm font-bold text-gray-400">{card.unit}</span>
                                                        )}
                                                    </div>

                                                    {/* Target + Trend */}
                                                    <div className="relative flex items-center justify-between mt-2">
                                                        <span className="text-[10px] font-medium text-gray-400">
                                                            {card.target}
                                                        </span>
                                                        {card.trendValue && (
                                                            <div className={`flex items-center gap-0.5 text-[10px] font-bold ${
                                                                card.trend === 'up' ? 'text-emerald-500' : card.trend === 'down' ? 'text-teal-500' : 'text-gray-400'
                                                            }`}>
                                                                {card.trend === 'up' ? (
                                                                    <ArrowUpRight className="h-3 w-3" />
                                                                ) : card.trend === 'down' ? (
                                                                    <ArrowDownRight className="h-3 w-3" />
                                                                ) : null}
                                                                {card.trendValue}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ═══════════════════════════════════════════
                            CHARTS SECTION
                        ═══════════════════════════════════════════ */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* Patient Flow Trend (7-day bar chart) */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <TrendingUp className="h-4 w-4 text-teal-400" />
                                        Patient Flow Trend
                                    </h3>
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-wider">7-Day</span>
                                </div>
                                <div className="p-5">
                                    {patientFlow.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-end gap-2" style={{ height: 200 }}>
                                                {patientFlow.map((item: any, i: number) => {
                                                    const maxCount = Math.max(...patientFlow.map((p: any) => p.count), 1);
                                                    const heightPct = (item.count / maxCount) * 100;
                                                    return (
                                                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-teal-500">{item.count}</span>
                                                            <div
                                                                className="w-full rounded-t-lg bg-gradient-to-t from-teal-600/80 to-teal-400/60 transition-all duration-700 hover:from-teal-500 hover:to-teal-300 cursor-pointer"
                                                                style={{ height: `${Math.max(heightPct, 8)}%` }}
                                                                title={`${item.day}: ${item.count} patients`}
                                                            />
                                                            <span className="text-[9px] font-bold text-gray-400 truncate max-w-full">{item.day}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                                <span className="text-xs font-bold text-gray-400">Total Registrations</span>
                                                <span className="text-sm font-black text-teal-500">
                                                    {patientFlow.reduce((s: number, p: any) => s + p.count, 0)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center text-gray-300 text-xs font-bold" style={{ height: 200 }}>
                                            <div className="text-center">
                                                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p>No patient flow data yet</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Revenue Trend (7-day bar representation) */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <DollarSign className="h-4 w-4 text-emerald-400" />
                                        Revenue Trend
                                    </h3>
                                    <span className="text-xs font-black text-emerald-500">
                                        {formatCurrency(totalRevenueValue)} Total
                                    </span>
                                </div>
                                <div className="p-5">
                                    {dailyTrend.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-end gap-2" style={{ height: 200 }}>
                                                {dailyTrend.map((item: any, i: number) => {
                                                    const maxAmt = Math.max(...dailyTrend.map((d: any) => d.amount), 1);
                                                    const heightPct = (item.amount / maxAmt) * 100;
                                                    return (
                                                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                                            <span className="text-[9px] font-black text-emerald-500 truncate max-w-full">
                                                                {formatCurrency(item.amount)}
                                                            </span>
                                                            <div
                                                                className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600/80 to-emerald-400/60 transition-all duration-700 hover:from-emerald-500 hover:to-emerald-300 cursor-pointer"
                                                                style={{ height: `${Math.max(heightPct, 8)}%` }}
                                                                title={`${item.day}: ${formatCurrency(item.amount)}`}
                                                            />
                                                            <span className="text-[9px] font-bold text-gray-400 truncate max-w-full">{item.day}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                                <span className="text-xs font-bold text-gray-400">Daily Average</span>
                                                <span className="text-sm font-black text-emerald-500">
                                                    {formatCurrency(
                                                        dailyTrend.reduce((s: number, d: any) => s + d.amount, 0) / Math.max(dailyTrend.length, 1)
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center text-gray-300 text-xs font-bold" style={{ height: 200 }}>
                                            <div className="text-center">
                                                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p>No revenue trend data yet</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bed Occupancy Gauge (SVG circle) */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <Bed className="h-4 w-4 text-violet-400" />
                                        Bed Occupancy Gauge
                                    </h3>
                                    <span className="text-xs font-bold text-gray-400">{bedData?.total ?? 0} total beds</span>
                                </div>
                                <div className="p-5">
                                    <div className="flex items-center gap-8" style={{ minHeight: 200 }}>
                                        {/* SVG Gauge */}
                                        <div className="relative h-40 w-40 shrink-0 mx-auto lg:mx-0">
                                            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                                                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="10" />
                                                <circle
                                                    cx="50" cy="50" r="42" fill="none"
                                                    stroke={
                                                        occupancyRate > 95
                                                            ? '#ef4444'
                                                            : occupancyRate > 85
                                                            ? '#f59e0b'
                                                            : occupancyRate >= 75
                                                            ? '#10b981'
                                                            : '#8b5cf6'
                                                    }
                                                    strokeWidth="10"
                                                    strokeLinecap="round"
                                                    strokeDasharray={`${occupancyRate * 2.64} 264`}
                                                    className="transition-all duration-1000"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-3xl font-black text-gray-900">{occupancyRate}%</span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Occupied</span>
                                            </div>
                                        </div>

                                        {/* Legend */}
                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                                                    <span className="text-xs font-bold text-gray-500">Occupied</span>
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{bedData?.occupied ?? 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                    <span className="text-xs font-bold text-gray-500">Available</span>
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{bedData?.available ?? 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                                    <span className="text-xs font-bold text-gray-500">Maintenance</span>
                                                </div>
                                                <span className="text-sm font-black text-gray-900">{bedData?.maintenance ?? 0}</span>
                                            </div>
                                            <div className="pt-3 border-t border-gray-100">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`h-2.5 w-2.5 rounded-full ${
                                                        occupancyRate > 95 ? 'bg-red-500' :
                                                        occupancyRate > 85 ? 'bg-amber-500' :
                                                        occupancyRate >= 75 ? 'bg-emerald-500' :
                                                        'bg-violet-500'
                                                    }`} />
                                                    <span className={`text-[10px] font-bold ${
                                                        occupancyRate > 95 ? 'text-red-600' :
                                                        occupancyRate > 85 ? 'text-amber-600' :
                                                        occupancyRate >= 75 ? 'text-emerald-600' :
                                                        'text-violet-600'
                                                    }`}>
                                                        {occupancyRate > 95 ? 'Critical - Over Capacity' :
                                                         occupancyRate > 85 ? 'High Occupancy Warning' :
                                                         occupancyRate >= 75 ? 'Optimal Range' :
                                                         'Below Target'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ward breakdown bars */}
                                    {bedData?.byWard && bedData.byWard.length > 0 && (
                                        <div className="space-y-2.5 pt-4 mt-4 border-t border-gray-100">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">By Ward</span>
                                            {bedData.byWard.map((ward: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3">
                                                    <span className="text-[11px] font-bold text-gray-500 w-28 truncate">{ward.wardName}</span>
                                                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ${
                                                                ward.occupancyRate > 95 ? 'bg-red-500' :
                                                                ward.occupancyRate > 85 ? 'bg-amber-500' :
                                                                'bg-gradient-to-r from-violet-500 to-indigo-500'
                                                            }`}
                                                            style={{ width: `${ward.occupancyRate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-400 w-12 text-right">
                                                        {ward.occupancyRate}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Department-wise Revenue Breakdown (horizontal bars) */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                        <BarChart3 className="h-4 w-4 text-emerald-400" />
                                        Department Revenue
                                    </h3>
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-wider">Breakdown</span>
                                </div>
                                <div className="p-5">
                                    {deptBreakdown.length > 0 ? (
                                        <div className="space-y-3" style={{ minHeight: 200 }}>
                                            {deptBreakdown.map((dept: any, i: number) => {
                                                const maxAmt = Math.max(...deptBreakdown.map((d: any) => d.amount), 1);
                                                const widthPct = (dept.amount / maxAmt) * 100;
                                                const colors = [
                                                    'from-emerald-500 to-teal-500',
                                                    'from-violet-500 to-indigo-500',
                                                    'from-amber-500 to-orange-500',
                                                    'from-rose-500 to-pink-500',
                                                    'from-blue-500 to-cyan-500',
                                                    'from-purple-500 to-fuchsia-500',
                                                ];
                                                return (
                                                    <div key={i} className="group">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[11px] font-bold text-gray-600">{dept.name}</span>
                                                            <span className="text-[11px] font-black text-gray-500">
                                                                {formatCurrency(dept.amount)}
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700 group-hover:opacity-80`}
                                                                style={{ width: `${widthPct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-4">
                                                <span className="text-xs font-bold text-gray-400">
                                                    {deptBreakdown.length} Departments
                                                </span>
                                                <span className="text-sm font-black text-emerald-500">
                                                    {formatCurrency(deptBreakdown.reduce((s: number, d: any) => s + d.amount, 0))}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center text-gray-300 text-xs font-bold" style={{ height: 200 }}>
                                            <div className="text-center">
                                                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p>No department revenue data yet</p>
                                                <p className="text-[10px] text-gray-300 mt-1">Billing records will appear here</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════
                            SLA BREACH LOG TABLE
                        ═══════════════════════════════════════════ */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                                <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                                    <AlertTriangle className="h-4 w-4 text-red-400" />
                                    SLA Breach Log
                                </h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-wider">
                                        Recent Events
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Timestamp</th>
                                            <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">KPI Name</th>
                                            <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Target</th>
                                            <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Actual</th>
                                            <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Department</th>
                                            <th className="text-left px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {SAMPLE_SLA_BREACHES.map((breach) => (
                                            <tr key={breach.id} className={`${getSlaRowBg(breach.status)} hover:bg-gray-50/80 transition-colors`}>
                                                <td className="px-5 py-3.5">
                                                    <span className="text-[11px] font-medium text-gray-500">
                                                        {new Date(breach.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                        {' '}
                                                        {new Date(breach.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="text-xs font-bold text-gray-700">{breach.kpiName}</span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="text-[11px] font-medium text-gray-500">{breach.target}</span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`text-xs font-black ${
                                                        breach.status === 'breached' ? 'text-red-600' :
                                                        breach.status === 'warning' ? 'text-amber-600' :
                                                        'text-emerald-600'
                                                    }`}>
                                                        {breach.actual}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="text-[11px] font-medium text-gray-500">{breach.department}</span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg ${
                                                        breach.status === 'breached'
                                                            ? 'bg-red-100 text-red-700'
                                                            : breach.status === 'warning'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        <div className={`h-1.5 w-1.5 rounded-full ${
                                                            breach.status === 'breached' ? 'bg-red-500' :
                                                            breach.status === 'warning' ? 'bg-amber-500' :
                                                            'bg-emerald-500'
                                                        }`} />
                                                        {breach.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <span className="text-[10px] font-bold text-gray-400">
                                    Showing {SAMPLE_SLA_BREACHES.length} recent events
                                </span>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-2 w-2 rounded-full bg-red-500" />
                                        <span className="text-[10px] font-bold text-gray-500">
                                            {SAMPLE_SLA_BREACHES.filter(b => b.status === 'breached').length} Breached
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                                        <span className="text-[10px] font-bold text-gray-500">
                                            {SAMPLE_SLA_BREACHES.filter(b => b.status === 'warning').length} Warnings
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                        <span className="text-[10px] font-bold text-gray-500">
                                            {SAMPLE_SLA_BREACHES.filter(b => b.status === 'resolved').length} Resolved
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AdminPage>
    );
}
