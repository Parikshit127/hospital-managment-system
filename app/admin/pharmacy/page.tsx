'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Pill, LayoutDashboard, Settings2, Clock, AlertTriangle,
    PackageOpen, IndianRupee, Loader2, ChevronRight, Truck, Users,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { getPharmacyDashboardStats } from '@/app/actions/pharmacy-actions';

const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminPharmacyHub() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getPharmacyDashboardStats();
            if (res.success) setStats(res.data);
        } catch (err) {
            console.error('Pharmacy load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    return (
        <ModuleHubLayout
            moduleKey="pharmacy"
            moduleTitle="Pharmacy Module"
            moduleDescription="Pharmacy inventory, dispensing & procurement"
            moduleIcon={<Pill className="h-5 w-5" />}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={activeTab === 'dashboard' ? loadData : undefined}
            refreshing={loading}
        >
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {loading && !stats ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <>
                            {/* KPI ROW */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Link href="/pharmacy/orders" className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-amber-300 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Pending Prescriptions</span>
                                        <div className="p-1.5 bg-amber-50 rounded-lg"><Clock className="h-3.5 w-3.5 text-amber-500" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.pendingOrders ?? 0}</p>
                                </Link>

                                <Link href="/pharmacy/inventory" className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-red-300 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Low Stock Alerts</span>
                                        <div className="p-1.5 bg-red-50 rounded-lg"><AlertTriangle className="h-3.5 w-3.5 text-red-500" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.lowStockAlerts ?? 0}</p>
                                </Link>

                                <Link href="/pharmacy/returns" className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-300 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Expiring Batches 30d</span>
                                        <div className="p-1.5 bg-blue-50 rounded-lg"><PackageOpen className="h-3.5 w-3.5 text-blue-500" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.expiringBatches ?? 0}</p>
                                </Link>

                                <Link href="/pharmacy/reports" className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-emerald-300 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Today Revenue</span>
                                        <div className="p-1.5 bg-emerald-50 rounded-lg"><IndianRupee className="h-3.5 w-3.5 text-emerald-500" /></div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{`\u20B9${stats?.todayRevenue ?? 0}`}</p>
                                </Link>
                            </div>

                            {/* PENDING WORKLOAD */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                <h3 className="text-sm font-bold text-gray-900 mb-4">Pending Workload</h3>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-3xl font-black text-gray-900">{stats?.pendingOrders ?? 0}</p>
                                        <p className="text-xs text-gray-400 mt-1">prescriptions awaiting dispensing</p>
                                    </div>
                                    <Link
                                        href="/pharmacy/orders"
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                                    >
                                        View Queue
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </div>

                            {/* QUICK LINKS */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Links</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Link
                                        href="/pharmacy/purchase-orders"
                                        className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-4 flex items-center justify-between transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-xl">
                                                <Truck className="h-5 w-5 text-blue-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Receive Stock</h4>
                                                <p className="text-xs text-gray-400">Purchase orders & receiving</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                                    </Link>

                                    <Link
                                        href="/pharmacy/suppliers"
                                        className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-4 flex items-center justify-between transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-violet-50 rounded-xl">
                                                <Users className="h-5 w-5 text-violet-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Suppliers</h4>
                                                <p className="text-xs text-gray-400">Manage supplier directory</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500" />
                                    </Link>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-4">
                    <Link
                        href="/pharmacy/inventory"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-blue-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 rounded-xl">
                                <Pill className="h-6 w-6 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Inventory Management</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Drug catalog, stock levels, reorder points & batch tracking</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </Link>
                    <Link
                        href="/pharmacy/suppliers"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-violet-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-violet-50 rounded-xl">
                                <Users className="h-6 w-6 text-violet-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Supplier Directory</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Manage suppliers, pricing agreements & procurement</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-violet-500 transition-colors" />
                    </Link>
                </div>
            )}
        </ModuleHubLayout>
    );
}
