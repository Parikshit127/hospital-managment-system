'use client';

import { useEffect, useState, useRef } from 'react';
import { getEnhancedPlatformAnalytics } from '@/app/actions/superadmin-actions';
import { TrendingUp, Building2, Users, IndianRupee, Activity, Loader2, ArrowUpDown } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import Link from 'next/link';

Chart.register(...registerables);

export default function SuperAdminAnalytics() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<string>('patients');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const planChartRef = useRef<HTMLCanvasElement>(null);
    const patientsChartRef = useRef<HTMLCanvasElement>(null);
    const revenueChartRef = useRef<HTMLCanvasElement>(null);
    const chartInstances = useRef<Chart[]>([]);

    useEffect(() => {
        async function load() {
            const res = await getEnhancedPlatformAnalytics();
            if (res.success) setData(res.data);
            setLoading(false);
        }
        load();
    }, []);

    useEffect(() => {
        if (!data) return;
        chartInstances.current.forEach(c => c.destroy());
        chartInstances.current = [];

        // Plan Distribution Doughnut
        if (planChartRef.current) {
            const plans = data.planDistribution;
            const labels = Object.keys(plans);
            const values = Object.values(plans) as number[];
            const colors = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b'];

            chartInstances.current.push(new Chart(planChartRef.current, {
                type: 'doughnut',
                data: {
                    labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                    datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', padding: 16 } } },
                },
            }));
        }

        // Top 10 by Patients Bar
        if (patientsChartRef.current && data.top10ByPatients.length > 0) {
            chartInstances.current.push(new Chart(patientsChartRef.current, {
                type: 'bar',
                data: {
                    labels: data.top10ByPatients.map((o: any) => o.name.length > 15 ? o.name.slice(0, 15) + '...' : o.name),
                    datasets: [{
                        label: 'Patients',
                        data: data.top10ByPatients.map((o: any) => o.count),
                        backgroundColor: 'rgba(139, 92, 246, 0.6)',
                        borderRadius: 4,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#6b7280', maxRotation: 45 }, grid: { display: false } },
                        y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    },
                },
            }));
        }

        // Top 10 by Revenue Bar
        if (revenueChartRef.current && data.top10ByRevenue.length > 0) {
            chartInstances.current.push(new Chart(revenueChartRef.current, {
                type: 'bar',
                data: {
                    labels: data.top10ByRevenue.map((o: any) => o.name.length > 15 ? o.name.slice(0, 15) + '...' : o.name),
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: data.top10ByRevenue.map((o: any) => o.revenue),
                        backgroundColor: 'rgba(16, 185, 129, 0.6)',
                        borderRadius: 4,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#6b7280', maxRotation: 45 }, grid: { display: false } },
                        y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    },
                },
            }));
        }

        return () => { chartInstances.current.forEach(c => c.destroy()); };
    }, [data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!data) {
        return <div className="text-center py-24 text-gray-500">Failed to load analytics</div>;
    }

    const sorted = [...(data.tenantComparison || [])].sort((a: any, b: any) => {
        const aVal = a[sortKey] ?? 0;
        const bVal = b[sortKey] ?? 0;
        return sortDir === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
    });

    const toggleSort = (key: string) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const kpis = [
        { label: 'Total Tenants', value: data.totalOrgs, icon: Building2, color: 'from-violet-500 to-purple-600' },
        { label: 'Active Tenants', value: data.activeOrgs, icon: Activity, color: 'from-emerald-500 to-teal-600' },
        { label: 'Total Patients', value: data.totalPatients.toLocaleString(), icon: Users, color: 'from-blue-500 to-cyan-600' },
        { label: 'Platform Revenue', value: `₹${data.totalRevenue.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'from-amber-500 to-orange-600' },
        { label: 'Total Collected', value: `₹${data.totalCollected.toLocaleString('en-IN')}`, icon: TrendingUp, color: 'from-rose-500 to-pink-600' },
    ];

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
                <p className="text-sm text-gray-400 mt-1">Global ecosystem telemetry and tenant insights</p>
            </header>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpis.map(kpi => {
                    const Icon = kpi.icon;
                    return (
                        <div key={kpi.label} className="bg-white/5 border border-white/5 rounded-2xl p-5">
                            <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${kpi.color} mb-3`}>
                                <Icon className="h-5 w-5 text-white" />
                            </div>
                            <p className="text-2xl font-bold text-white">{kpi.value}</p>
                            <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white/5 border border-white/5 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Plan Distribution</h3>
                    <div className="h-[250px]"><canvas ref={planChartRef} /></div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Top 10 by Patients</h3>
                    <div className="h-[250px]"><canvas ref={patientsChartRef} /></div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Top 10 by Revenue</h3>
                    <div className="h-[250px]"><canvas ref={revenueChartRef} /></div>
                </div>
            </div>

            {/* Tenant Comparison Table */}
            <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Tenant Comparison</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white/5 border-b border-white/5">
                            <tr className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                <th className="px-4 py-3">Organization</th>
                                <th className="px-4 py-3">Plan</th>
                                <th className="px-4 py-3">Type</th>
                                {['patients', 'users', 'invoices', 'admissions', 'branches'].map(col => (
                                    <th key={col} className="px-4 py-3 cursor-pointer hover:text-gray-300 transition" onClick={() => toggleSort(col)}>
                                        <span className="flex items-center gap-1">
                                            {col} <ArrowUpDown className="h-3 w-3" />
                                        </span>
                                    </th>
                                ))}
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {sorted.map((org: any) => (
                                <tr key={org.id} className="hover:bg-white/[0.02] transition">
                                    <td className="px-4 py-3">
                                        <Link href={`/superadmin/organizations/${org.id}`} className="hover:text-violet-400 transition">
                                            <p className="font-semibold text-white">{org.name}</p>
                                            <p className="text-[10px] text-gray-500">{org.code}</p>
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/5 text-gray-400">
                                            {org.plan}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400">{org.hospital_type || '-'}</td>
                                    <td className="px-4 py-3 text-sm font-semibold text-violet-400">{org.patients}</td>
                                    <td className="px-4 py-3 text-sm text-gray-300">{org.users}</td>
                                    <td className="px-4 py-3 text-sm text-gray-300">{org.invoices}</td>
                                    <td className="px-4 py-3 text-sm text-gray-300">{org.admissions}</td>
                                    <td className="px-4 py-3 text-sm text-gray-300">{org.branches}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            org.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${org.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                            {org.is_active ? 'Active' : 'Suspended'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
