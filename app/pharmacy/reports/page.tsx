'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    BarChart3, TrendingUp, AlertTriangle, IndianRupee, Package,
    ArrowUpRight, ArrowDownRight, Pill, Clock, RotateCcw
} from 'lucide-react';
import { getPharmacyAnalytics, getExpiringBatches, getLowStockAlerts } from '@/app/actions/pharmacy-actions';
import { SkeletonCard } from '@/app/components/ui/Skeleton';

export default function PharmacyReportsPage() {
    const [data, setData] = useState<any>(null);
    const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
    const [lowStock, setLowStock] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'expiry' | 'stock'>('overview');

    const loadData = async () => {
        setRefreshing(true);
        const [analytics, expiring, low] = await Promise.all([
            getPharmacyAnalytics(),
            getExpiringBatches(90),
            getLowStockAlerts(),
        ]);
        if (analytics.success) setData(analytics.data);
        if (expiring.success) setExpiringBatches(expiring.data);
        if (low.success) setLowStock(low.data);
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    function getExpiryBadge(expiry: Date) {
        const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { label: 'EXPIRED', cls: 'bg-red-500 text-white' };
        if (days <= 30) return { label: `${days}d`, cls: 'bg-red-100 text-red-700 border border-red-200' };
        if (days <= 60) return { label: `${days}d`, cls: 'bg-amber-100 text-amber-700 border border-amber-200' };
        return { label: `${days}d`, cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' };
    }

    return (
        <AppShell pageTitle="Pharmacy Analytics" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadData} refreshing={refreshing}>
            {!data ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : (
                <>
                    {/* Summary KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <IndianRupee className="h-4 w-4 text-emerald-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">30-Day Revenue</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">₹{Math.round(data.revenue30d).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-400 mt-1">Avg ₹{Math.round(data.avgDailyRevenue).toLocaleString('en-IN')}/day</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp className="h-4 w-4 text-violet-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Gross Margin</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{data.grossMarginPct}%</p>
                            <p className="text-xs text-gray-400 mt-1">{data.ordersCompleted30d} orders completed</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Expiry Write-off</span>
                            </div>
                            <p className="text-2xl font-black text-red-600">₹{Math.round(data.expiryWriteOffValue).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-400 mt-1">{data.expiredCount} expired batches</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <RotateCcw className="h-4 w-4 text-blue-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Returns (30d)</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{data.totalReturns30d}</p>
                            <p className="text-xs text-gray-400 mt-1">{data.patientReturnsCount} patient, {data.expiryWriteOffsCount} expiry</p>
                        </div>
                    </div>

                    {/* Tab navigation */}
                    <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl border border-gray-200 w-fit">
                        {[
                            { id: 'overview', label: 'Revenue & Movers' },
                            { id: 'expiry', label: `Expiry Alerts (${data.expiring30Count + data.expiring60Count + data.expiring90Count + data.expiredCount})` },
                            { id: 'stock', label: `Stock Alerts (${data.lowStockCount + data.outOfStockCount})` },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Revenue by Day */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4">Daily Revenue (7 Days)</h3>
                                <div className="flex items-end gap-3 h-48">
                                    {data.revenueByDay?.map((day: any, i: number) => {
                                        const maxRev = Math.max(...data.revenueByDay.map((d: any) => d.revenue), 1);
                                        const height = Math.max((day.revenue / maxRev) * 100, 3);
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-500">₹{Math.round(day.revenue).toLocaleString('en-IN')}</span>
                                                <div className="w-full rounded-t-lg bg-gradient-to-t from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 transition-all cursor-default" style={{ height: `${height}%` }} />
                                                <span className="text-[10px] text-gray-400 font-medium">{day.date}</span>
                                                <span className="text-[9px] text-gray-300 font-medium">{day.orders} orders</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Top Movers */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4">Top 10 Movers (30 Days)</h3>
                                {data.topMovers?.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400 text-sm">No sales data</div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {data.topMovers?.map((item: any, i: number) => {
                                            const maxQty = data.topMovers[0]?.qty || 1;
                                            const pct = (item.qty / maxQty) * 100;
                                            return (
                                                <div key={i}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-sm text-gray-700 font-medium flex items-center gap-2">
                                                            <span className="text-xs text-gray-400 w-4 text-right">{i + 1}.</span>
                                                            <span className="truncate max-w-[180px]">{item.name}</span>
                                                        </span>
                                                        <span className="text-xs font-bold text-emerald-600">
                                                            {item.qty} units · ₹{Math.round(item.revenue).toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5 ml-6">
                                                        <div className="h-1.5 rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'expiry' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        {['Medicine', 'Batch', 'Stock', 'Expiry', 'Days Left', 'Value at Risk'].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {expiringBatches.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No expiring batches within 90 days</td></tr>
                                    ) : expiringBatches.map((batch: any, i: number) => {
                                        const badge = getExpiryBadge(batch.expiry_date);
                                        const price = Number(batch.medicine?.selling_price) || Number(batch.medicine?.price_per_unit) || 0;
                                        const atRisk = price * batch.current_stock;
                                        return (
                                            <tr key={i} className="hover:bg-gray-50/50">
                                                <td className="px-5 py-3 text-sm font-bold text-gray-700">{batch.medicine?.brand_name}</td>
                                                <td className="px-5 py-3"><span className="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{batch.batch_no}</span></td>
                                                <td className="px-5 py-3 text-sm font-bold text-gray-700">{batch.current_stock}</td>
                                                <td className="px-5 py-3 text-xs text-gray-500">{new Date(batch.expiry_date).toLocaleDateString('en-IN')}</td>
                                                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>{badge.label}</span></td>
                                                <td className="px-5 py-3 text-sm font-bold text-red-600">₹{Math.round(atRisk).toLocaleString('en-IN')}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'stock' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        {['Medicine', 'Current Stock', 'Min Threshold', 'Status'].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {lowStock.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">All medicines are well-stocked</td></tr>
                                    ) : lowStock.map((med: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-50/50">
                                            <td className="px-5 py-3">
                                                <span className="text-sm font-bold text-gray-700">{med.brand_name}</span>
                                                {med.generic_name && <span className="block text-[10px] text-gray-400">{med.generic_name}</span>}
                                            </td>
                                            <td className="px-5 py-3 text-sm font-black text-gray-700">{med.total_stock}</td>
                                            <td className="px-5 py-3 text-sm text-gray-500">{med.min_threshold}</td>
                                            <td className="px-5 py-3">
                                                {med.total_stock === 0 ? (
                                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">OUT OF STOCK</span>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">LOW STOCK</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </AppShell>
    );
}
