'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity, Clock, CheckCircle2, AlertTriangle, Search, Filter } from 'lucide-react';
import { getLabDashboardStats } from '@/app/actions/lab-actions';
import { usePathname } from 'next/navigation';

export default function LabDashboardPage() {
    const [stats, setStats] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadStats = async () => {
        setRefreshing(true);
        const res = await getLabDashboardStats();
        if (res.success) {
            setStats(res.data);
        }
        setRefreshing(false);
    };

    useEffect(() => {
        loadStats();
    }, []);

    const kpis = [
        { label: 'Pending Samples', value: stats?.pendingCount || 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
        { label: 'Processing', value: stats?.processingCount || 0, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
        { label: 'Completed Today', value: stats?.completedToday || 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { label: 'Critical Alerts', value: stats?.criticalCount || 0, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    ];

    return (
        <AppShell
            pageTitle="Lab Technician Dashboard"
            pageIcon={<Activity className="h-5 w-5" />}
            onRefresh={loadStats}
            refreshing={refreshing}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {kpis.map((kpi, index) => {
                    const Icon = kpi.icon;
                    return (
                        <div key={index} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">{kpi.label}</p>
                                <p className="text-3xl font-black text-gray-900">{kpi.value}</p>
                            </div>
                            <div className={`p-3 rounded-xl ${kpi.bg}`}>
                                <Icon className={`h-6 w-6 ${kpi.color}`} />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* TAT Card */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-4">Turnaround Time (TAT)</h3>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-4 bg-teal-50 rounded-xl">
                            <Clock className="h-8 w-8 text-teal-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Average TAT (Today)</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-gray-900">{stats?.avgTAT || 0}</span>
                                <span className="text-sm text-gray-500 font-medium">minutes</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">
                        Measured from sample collection to result verification for completed orders today.
                    </p>
                </div>

                {/* Quick Actions */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <a href="/lab/worklist" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
                            <Search className="h-6 w-6 text-gray-600 mb-2" />
                            <span className="text-xs font-bold text-gray-700">Scan Barcode</span>
                        </a>
                        <a href="/lab/reports" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
                            <Filter className="h-6 w-6 text-gray-600 mb-2" />
                            <span className="text-xs font-bold text-gray-700">Generate Report</span>
                        </a>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
