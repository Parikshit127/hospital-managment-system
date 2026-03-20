'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity, Clock, CheckCircle2, AlertTriangle, IndianRupee, Bell, PackageOpen } from 'lucide-react';
import { getPharmacyDashboardStats } from '@/app/actions/pharmacy-actions';
import { SkeletonCard } from '@/app/components/ui/Skeleton';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function PharmacyDashboardPage() {
    const [stats, setStats] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadStats = async () => {
        setRefreshing(true);
        const res = await getPharmacyDashboardStats();
        if (res.success) {
            setStats(res.data);
        }
        setRefreshing(false);
    };

    useEffect(() => {
        loadStats();
    }, []);

    const kpis = [
        { label: 'Pending Prescriptions', value: stats?.pendingOrders || 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', link: '/pharmacy/orders' },
        { label: 'Low Stock Alerts', value: stats?.lowStockAlerts || 0, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', link: '/pharmacy/inventory' },
        { label: 'Expiring Batches (30d)', value: stats?.expiringBatches || 0, icon: PackageOpen, color: 'text-blue-500', bg: 'bg-blue-50', link: '/pharmacy/returns' },
        { label: 'Today Revenue', value: stats?.todayRevenue ? `₹${stats.todayRevenue}` : '₹0', icon: IndianRupee, color: 'text-emerald-500', bg: 'bg-emerald-50', link: '/pharmacy/reports' },
    ];

    return (
        <AppShell
            pageTitle="Pharmacy Dashboard"
            pageIcon={<Activity className="h-5 w-5" />}
            onRefresh={loadStats}
            refreshing={refreshing}
        >
            {!stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" style={{ display: !stats ? 'none' : undefined }}>
                {kpis.map((kpi, index) => {
                    const Icon = kpi.icon;
                    return (
                        <Link href={kpi.link} key={index} className="bg-white border hover:border-teal-500 transition-colors border-gray-200 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">{kpi.label}</p>
                                <p className="text-3xl font-black text-gray-900">{kpi.value}</p>
                            </div>
                            <div className={`p-3 rounded-xl ${kpi.bg}`}>
                                <Icon className={`h-6 w-6 ${kpi.color}`} />
                            </div>
                        </Link>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Bell className="h-4 w-4 text-amber-500" /> Pending Workload</h3>
                    <p className="text-xs text-gray-500 mb-6 flex-1">
                        You have <span className="font-bold text-gray-900">{stats?.pendingOrders || 0}</span> prescriptions pending dispense. Ensuring timely dispensing improves patient satisfaction.
                    </p>
                    <Link
                        href="/pharmacy/orders"
                        className="w-full inline-flex justify-center items-center gap-2 bg-gray-50 hover:bg-teal-50 text-teal-700 border border-gray-200 hover:border-teal-200 font-bold py-3 px-4 rounded-xl transition-all"
                    >
                        Go to Process Queue
                    </Link>
                </div>
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-4">Quick Links</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Link href="/pharmacy/purchase-orders" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
                            <PackageOpen className="h-6 w-6 text-indigo-600 mb-2" />
                            <span className="text-xs font-bold text-gray-700">Receive Stock</span>
                        </Link>
                        <Link href="/pharmacy/suppliers" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
                            <Activity className="h-6 w-6 text-orange-600 mb-2" />
                            <span className="text-xs font-bold text-gray-700">Suppliers</span>
                        </Link>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
