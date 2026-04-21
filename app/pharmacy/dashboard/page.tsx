'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Activity, Clock, AlertTriangle, IndianRupee, Bell, PackageOpen,
    TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight, Package,
    Pill, BarChart3, Truck, RotateCcw, Shield
} from 'lucide-react';
import { getPharmacyAnalytics } from '@/app/actions/pharmacy-actions';
import { SkeletonCard } from '@/app/components/ui/Skeleton';
import Link from 'next/link';

export default function PharmacyDashboardPage() {
    const [data, setData] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadStats = async () => {
        setRefreshing(true);
        const res = await getPharmacyAnalytics();
        if (res.success) setData(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadStats(); }, []);

    const kpis = data ? [
        { label: 'Today Revenue', value: `₹${Number(data.todayRevenue).toLocaleString('en-IN')}`, sub: `Avg: ₹${Math.round(data.avgDailyRevenue).toLocaleString('en-IN')}/day`, icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/pharmacy/reports' },
        { label: 'Pending Orders', value: data.pendingOrders, sub: `${data.ordersCompleted30d} completed (30d)`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', link: '/pharmacy/orders' },
        { label: 'Stock Value', value: `₹${Math.round(data.totalStockValue).toLocaleString('en-IN')}`, sub: `${data.outOfStockCount} out of stock`, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', link: '/pharmacy/inventory' },
        { label: 'Gross Margin', value: `${data.grossMarginPct}%`, sub: `30-day revenue: ₹${Math.round(data.revenue30d).toLocaleString('en-IN')}`, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50', link: '/pharmacy/reports' },
    ] : [];

    return (
        <AppShell pageTitle="Pharmacy Dashboard" pageIcon={<Activity className="h-5 w-5" />} onRefresh={loadStats} refreshing={refreshing}>
            {!data ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {kpis.map((kpi, i) => {
                            const Icon = kpi.icon;
                            return (
                                <Link href={kpi.link} key={i} className="bg-white border border-gray-200 hover:border-teal-400 transition-all rounded-2xl p-5 group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                                            <Icon className={`h-5 w-5 ${kpi.color}`} />
                                        </div>
                                        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
                                    </div>
                                    <p className="text-2xl font-black text-gray-900 tracking-tight">{kpi.value}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{kpi.label}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                                </Link>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        {/* Revenue Trend */}
                        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
                            <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-teal-500" /> Revenue Trend (7 Days)
                            </h3>
                            <div className="flex items-end gap-2 h-40">
                                {data.revenueByDay?.map((day: any, i: number) => {
                                    const maxRev = Math.max(...data.revenueByDay.map((d: any) => d.revenue), 1);
                                    const height = Math.max((day.revenue / maxRev) * 100, 4);
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <span className="text-[10px] font-bold text-gray-500">₹{Math.round(day.revenue).toLocaleString('en-IN')}</span>
                                            <div className="w-full rounded-t-lg bg-gradient-to-t from-teal-500 to-emerald-400 transition-all hover:from-teal-400 hover:to-emerald-300" style={{ height: `${height}%` }} />
                                            <span className="text-[10px] text-gray-400 font-medium">{day.date}</span>
                                            <span className="text-[9px] text-gray-300">{day.orders} ord</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Expiry Alerts */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" /> Expiry Alerts
                            </h3>
                            <div className="space-y-3">
                                {data.expiredCount > 0 && (
                                    <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl">
                                        <div>
                                            <span className="text-xs font-bold text-red-700">EXPIRED</span>
                                            <p className="text-[10px] text-red-500">Write-off: ₹{Math.round(data.expiryWriteOffValue).toLocaleString('en-IN')}</p>
                                        </div>
                                        <span className="text-xl font-black text-red-700">{data.expiredCount}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                    <span className="text-xs font-bold text-amber-700">Within 30 days</span>
                                    <span className="text-xl font-black text-amber-700">{data.expiring30Count}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                                    <span className="text-xs font-bold text-yellow-700">30-60 days</span>
                                    <span className="text-xl font-black text-yellow-700">{data.expiring60Count}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                                    <span className="text-xs font-bold text-gray-600">60-90 days</span>
                                    <span className="text-xl font-black text-gray-600">{data.expiring90Count}</span>
                                </div>
                            </div>
                            <Link href="/pharmacy/returns" className="block mt-4 text-center text-xs font-bold text-teal-600 hover:text-teal-700 transition-colors">
                                Manage Expiry Write-offs →
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        {/* Top Movers */}
                        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
                            <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-500" /> Top 10 Movers (30 Days)
                            </h3>
                            {data.topMovers?.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">No sales data yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.topMovers?.map((item: any, i: number) => {
                                        const maxQty = data.topMovers[0]?.qty || 1;
                                        const pct = (item.qty / maxQty) * 100;
                                        return (
                                            <div key={i} className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-sm font-bold text-gray-700 truncate max-w-[200px]">{item.name}</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-gray-500">{item.qty} units</span>
                                                            <span className="text-xs font-bold text-emerald-600">₹{Math.round(item.revenue).toLocaleString('en-IN')}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                        <div className="h-1.5 rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Stock Health + Quick Links */}
                        <div className="space-y-6">
                            {/* Stock Health */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-blue-500" /> Stock Health
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="text-center p-3 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-2xl font-black text-red-600">{data.outOfStockCount}</p>
                                        <p className="text-[10px] font-bold text-red-500 uppercase">Out of Stock</p>
                                    </div>
                                    <div className="text-center p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                        <p className="text-2xl font-black text-amber-600">{data.lowStockCount}</p>
                                        <p className="text-[10px] font-bold text-amber-500 uppercase">Low Stock</p>
                                    </div>
                                </div>
                                {data.lowStockItems?.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                        {data.lowStockItems.slice(0, 5).map((item: any, i: number) => (
                                            <div key={i} className="flex justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                                                <span className="text-gray-600 font-medium truncate max-w-[150px]">{item.name}</span>
                                                <span className={`font-bold ${item.stock === 0 ? 'text-red-500' : 'text-amber-500'}`}>
                                                    {item.stock}/{item.threshold}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Quick Links */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4">Quick Links</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/pharmacy/billing" className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-teal-50 border border-gray-200 hover:border-teal-200 rounded-xl transition-colors">
                                        <ShoppingCart className="h-5 w-5 text-teal-600 mb-1.5" />
                                        <span className="text-[10px] font-bold text-gray-700">Billing</span>
                                    </Link>
                                    <Link href="/pharmacy/purchase-orders" className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-xl transition-colors">
                                        <Truck className="h-5 w-5 text-indigo-600 mb-1.5" />
                                        <span className="text-[10px] font-bold text-gray-700">Purchase</span>
                                    </Link>
                                    <Link href="/pharmacy/returns" className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 rounded-xl transition-colors">
                                        <RotateCcw className="h-5 w-5 text-rose-600 mb-1.5" />
                                        <span className="text-[10px] font-bold text-gray-700">Returns</span>
                                    </Link>
                                    <Link href="/pharmacy/suppliers" className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl transition-colors">
                                        <PackageOpen className="h-5 w-5 text-orange-600 mb-1.5" />
                                        <span className="text-[10px] font-bold text-gray-700">Suppliers</span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Returns Summary */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                            <RotateCcw className="h-4 w-4 text-rose-500" /> Returns & Write-offs (30 Days)
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                <p className="text-2xl font-black text-gray-700">{data.totalReturns30d}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Total Returns</p>
                            </div>
                            <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <p className="text-2xl font-black text-blue-700">{data.patientReturnsCount}</p>
                                <p className="text-[10px] font-bold text-blue-400 uppercase mt-1">Patient Returns</p>
                            </div>
                            <div className="text-center p-4 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-2xl font-black text-red-700">{data.expiryWriteOffsCount}</p>
                                <p className="text-[10px] font-bold text-red-400 uppercase mt-1">Expiry Write-offs</p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </AppShell>
    );
}
