'use client';

import { useState, useEffect, useRef } from 'react';
import { getOrganizationUsageMetrics, getOrganizationUsageTrend } from '@/app/actions/superadmin-actions';
import { Users, FileText, Activity, Stethoscope, FlaskConical, Pill, Calendar, Shield, MapPin, IndianRupee, Loader2 } from 'lucide-react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface UsageTabProps {
    orgId: string;
}

export default function UsageTab({ orgId }: UsageTabProps) {
    const [metrics, setMetrics] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    async function loadData() {
        setLoading(true);
        const [metricsRes, trendsRes] = await Promise.all([
            getOrganizationUsageMetrics(orgId),
            getOrganizationUsageTrend(orgId, 12),
        ]);
        if (metricsRes.success) setMetrics(metricsRes.data);
        if (trendsRes.success) setTrends(trendsRes.data || []);
        setLoading(false);
    }

    useEffect(() => { loadData(); }, [orgId]);

    useEffect(() => {
        if (!chartRef.current || trends.length === 0) return;
        if (chartInstance.current) chartInstance.current.destroy();

        chartInstance.current = new Chart(chartRef.current, {
            type: 'line',
            data: {
                labels: trends.map(t => t.month),
                datasets: [
                    {
                        label: 'Patients',
                        data: trends.map(t => t.patients),
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Invoices',
                        data: trends.map(t => t.invoices),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                },
            },
        });

        return () => { chartInstance.current?.destroy(); };
    }, [trends]);

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!metrics) {
        return <div className="text-center py-16 text-gray-500">Failed to load usage data</div>;
    }

    const kpis = [
        { label: 'Total Patients', value: metrics.totalPatients, icon: Users, color: 'text-violet-400 bg-violet-500/10' },
        { label: 'Total Invoices', value: metrics.totalInvoices, icon: FileText, color: 'text-blue-400 bg-blue-500/10' },
        { label: 'Total Revenue', value: `₹${metrics.totalRevenue.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-emerald-400 bg-emerald-500/10' },
        { label: 'Active Users', value: metrics.totalUsers, icon: Activity, color: 'text-amber-400 bg-amber-500/10' },
        { label: 'Avg Daily Patients', value: metrics.avgDailyPatients, icon: Calendar, color: 'text-cyan-400 bg-cyan-500/10' },
        { label: 'Branches', value: metrics.totalBranches, icon: MapPin, color: 'text-pink-400 bg-pink-500/10' },
    ];

    const featureUsage = [
        { label: 'OPD Appointments', count: metrics.totalAppointments, icon: Stethoscope },
        { label: 'IPD Admissions', count: metrics.totalAdmissions, icon: Activity },
        { label: 'Lab Orders', count: metrics.totalLabOrders, icon: FlaskConical },
        { label: 'Pharmacy Orders', count: metrics.totalPharmacyOrders, icon: Pill },
        { label: 'Insurance Claims', count: metrics.totalInsuranceClaims, icon: Shield },
    ];

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {kpis.map(kpi => {
                    const Icon = kpi.icon;
                    return (
                        <div key={kpi.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
                            <div className={`inline-flex p-2 rounded-lg ${kpi.color} mb-2`}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <p className="text-lg font-bold text-white">{kpi.value}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Trend Chart */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Monthly Trend (Last 12 Months)</h3>
                <div className="h-[300px]">
                    <canvas ref={chartRef} />
                </div>
            </div>

            {/* Feature Usage */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Feature Usage Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {featureUsage.map(feat => {
                        const Icon = feat.icon;
                        return (
                            <div key={feat.label} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-lg">
                                <Icon className="h-5 w-5 text-gray-500" />
                                <div>
                                    <p className="text-sm font-bold text-white">{feat.count.toLocaleString()}</p>
                                    <p className="text-[10px] text-gray-500">{feat.label}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
