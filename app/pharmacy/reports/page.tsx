'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    BarChart3, TrendingUp, AlertTriangle, IndianRupee, Package,
    ArrowUpRight, ArrowDownRight, Pill, Clock, RotateCcw, Bed, UserRound, Store, Search
} from 'lucide-react';
import { getPharmacyAnalytics, getPharmacyRevenueReport, getExpiringBatches, getLowStockAlerts, getInventoryMovements, getNarcoticRegister } from '@/app/actions/pharmacy-actions';
import { SkeletonCard } from '@/app/components/ui/Skeleton';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';
type Channel = 'all' | 'counter' | 'opd' | 'ipd';

function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangeForPreset(preset: Preset, from: string, to: string): { from: string; to: string } {
    const now = new Date();
    const today = fmt(now);
    if (preset === 'today') return { from: today, to: today };
    if (preset === '7d') return { from: fmt(new Date(now.getTime() - 6 * 86400000)), to: today };
    if (preset === '30d') return { from: fmt(new Date(now.getTime() - 29 * 86400000)), to: today };
    if (preset === 'month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    return { from, to }; // custom
}

export default function PharmacyReportsPage() {
    const [data, setData] = useState<any>(null);
    const [rev, setRev] = useState<any>(null);
    const [doctorOptions, setDoctorOptions] = useState<string[]>([]);
    const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
    const [lowStock, setLowStock] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'expiry' | 'stock' | 'movements' | 'narcotics'>('overview');
    const [movements, setMovements] = useState<any[]>([]);
    const [movementFilter, setMovementFilter] = useState('');
    const [narcotics, setNarcotics] = useState<any[]>([]);

    // Filters
    const [preset, setPreset] = useState<Preset>('30d');
    const [customFrom, setCustomFrom] = useState(fmt(new Date(Date.now() - 29 * 86400000)));
    const [customTo, setCustomTo] = useState(fmt(new Date()));
    const [channel, setChannel] = useState<Channel>('all');
    const [doctor, setDoctor] = useState('');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');

    const dateRange = useMemo(() => rangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

    // debounce medicine search
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const loadStatic = async () => {
        const [analytics, expiring, low] = await Promise.all([
            getPharmacyAnalytics(),
            getExpiringBatches(90),
            getLowStockAlerts(),
        ]);
        if (analytics.success) setData(analytics.data);
        if (expiring.success) setExpiringBatches(expiring.data);
        if (low.success) setLowStock(low.data);
    };

    const loadRevenue = async () => {
        setRefreshing(true);
        const res = await getPharmacyRevenueReport({
            from: dateRange.from, to: dateRange.to,
            channel, doctor: doctor || undefined, search: search || undefined,
        });
        if (res.success && res.data) {
            const d = res.data;
            setRev(d);
            // capture full doctor list only when unfiltered (so dropdown stays stable)
            if (!doctor && channel === 'all' && !search) {
                setDoctorOptions((d.byDoctor || []).map((x: any) => x.name).filter((n: string) => n && n !== 'Unassigned'));
            }
        }
        setRefreshing(false);
    };

    const loadData = async () => { await Promise.all([loadStatic(), loadRevenue()]); };

    const loadMovements = async (type?: string) => {
        const res = await getInventoryMovements({ movement_type: type || undefined, limit: 200 });
        if (res.success) setMovements(res.data || []);
    };

    const loadNarcotics = async () => {
        const res = await getNarcoticRegister();
        if (res.success) setNarcotics(res.data || []);
    };

    useEffect(() => {
        if (activeTab === 'movements') loadMovements(movementFilter);
        if (activeTab === 'narcotics') loadNarcotics();
    }, [activeTab, movementFilter]);

    useEffect(() => { loadStatic(); }, []);
    // reload revenue whenever filters change
    useEffect(() => { loadRevenue(); }, [dateRange.from, dateRange.to, channel, doctor, search]);

    function getExpiryBadge(expiry: Date) {
        const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { label: 'EXPIRED', cls: 'bg-red-500 text-white' };
        if (days <= 30) return { label: `${days}d`, cls: 'bg-red-100 text-red-700 border border-red-200' };
        if (days <= 60) return { label: `${days}d`, cls: 'bg-amber-100 text-amber-700 border border-amber-200' };
        return { label: `${days}d`, cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' };
    }

    const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

    const CHANNEL_META: Record<'counter' | 'opd' | 'ipd', { label: string; bar: string; chip: string; icon: any }> = {
        counter: { label: 'Counter', bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', icon: Store },
        opd: { label: 'OPD', bar: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700', icon: UserRound },
        ipd: { label: 'IPD', bar: 'bg-violet-500', chip: 'bg-violet-100 text-violet-700', icon: Bed },
    };

    return (
        <AppShell pageTitle="Pharmacy Analytics" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadData} refreshing={refreshing}>
            {/* ===== Filter Bar ===== */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['month', 'This Month'], ['custom', 'Custom']] as [Preset, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setPreset(id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${preset === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {preset === 'custom' && (
                    <div className="flex items-center gap-2">
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
                        <span className="text-gray-400 text-xs">→</span>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
                    </div>
                )}

                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['all', 'All'], ['ipd', 'IPD'], ['opd', 'OPD'], ['counter', 'Counter']] as [Channel, string][]).map(([id, label]) => (
                        <button key={id} onClick={() => setChannel(id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${channel === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search medicine…"
                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44" />
                </div>

                <select value={doctor} onChange={e => setDoctor(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg max-w-[180px]">
                    <option value="">All Doctors</option>
                    {doctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>

                {refreshing && <span className="text-[10px] text-gray-400 font-medium ml-auto">Updating…</span>}
            </div>

            {!rev ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : (
                <>
                    {/* ===== Segmented KPI cards ===== */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <IndianRupee className="h-4 w-4 text-emerald-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total Revenue</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.totalRevenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.totalBills} bills</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Bed className="h-4 w-4 text-violet-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">IPD Pharmacy</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.byChannel.ipd.revenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.byChannel.ipd.pct}% · {rev.byChannel.ipd.billCount} bills</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <UserRound className="h-4 w-4 text-blue-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">OPD Pharmacy</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.byChannel.opd.revenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.byChannel.opd.pct}% · {rev.byChannel.opd.billCount} bills</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Store className="h-4 w-4 text-teal-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Counter Sales</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(rev.byChannel.counter.revenue)}</p>
                            <p className="text-xs text-gray-400 mt-1">{rev.byChannel.counter.pct}% · {rev.byChannel.counter.billCount} bills</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp className="h-4 w-4 text-violet-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Gross Margin</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{rev.grossMarginPct}%</p>
                            <p className="text-xs text-gray-400 mt-1">COGS {inr(rev.cogs)}</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Expiry Write-off</span>
                            </div>
                            <p className="text-2xl font-black text-red-600">{inr(data?.expiryWriteOffValue || 0)}</p>
                            <p className="text-xs text-gray-400 mt-1">{data?.expiredCount || 0} expired batches</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <RotateCcw className="h-4 w-4 text-blue-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Returns (30d)</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{data?.totalReturns30d || 0}</p>
                            <p className="text-xs text-gray-400 mt-1">{data?.patientReturnsCount || 0} patient, {data?.expiryWriteOffsCount || 0} expiry</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Package className="h-4 w-4 text-amber-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Stock Value</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{inr(data?.totalStockValue || 0)}</p>
                            <p className="text-xs text-gray-400 mt-1">{(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)} alerts</p>
                        </div>
                    </div>

                    {/* Tab navigation */}
                    <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl border border-gray-200 w-fit">
                        {[
                            { id: 'overview', label: 'Revenue & Movers' },
                            { id: 'expiry', label: `Expiry Alerts (${(data?.expiring30Count || 0) + (data?.expiring60Count || 0) + (data?.expiring90Count || 0) + (data?.expiredCount || 0)})` },
                            { id: 'stock', label: `Stock Alerts (${(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)})` },
                            { id: 'movements', label: 'Movement Ledger' },
                            { id: 'narcotics', label: 'Controlled Drugs' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Channel breakdown table */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4">Revenue by Channel</h3>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            {['Channel', 'Bills', 'Items', 'Revenue', '% Share'].map((h, i) => (
                                                <th key={i} className={`pb-2 text-[10px] font-black text-gray-400 uppercase tracking-wider ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(['ipd', 'opd', 'counter'] as const).map(ch => {
                                            const c = rev.byChannel[ch];
                                            const meta = CHANNEL_META[ch];
                                            const Icon = meta.icon;
                                            return (
                                                <tr key={ch}>
                                                    <td className="py-3">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold ${meta.chip}`}>
                                                            <Icon className="h-3.5 w-3.5" />{meta.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-right text-sm font-bold text-gray-700">{c.billCount}</td>
                                                    <td className="py-3 text-right text-sm text-gray-500">{c.itemCount}</td>
                                                    <td className="py-3 text-right text-sm font-black text-gray-900">{inr(c.revenue)}</td>
                                                    <td className="py-3 text-right text-sm font-bold text-emerald-600">{c.pct}%</td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="border-t-2 border-gray-100">
                                            <td className="py-3 text-sm font-black text-gray-900">Total</td>
                                            <td className="py-3 text-right text-sm font-black text-gray-900">{rev.totalBills}</td>
                                            <td className="py-3 text-right text-sm text-gray-500">
                                                {rev.byChannel.ipd.itemCount + rev.byChannel.opd.itemCount + rev.byChannel.counter.itemCount}
                                            </td>
                                            <td className="py-3 text-right text-sm font-black text-gray-900">{inr(rev.totalRevenue)}</td>
                                            <td className="py-3 text-right text-sm font-black text-gray-900">100%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Bills list */}
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                    <h3 className="text-sm font-black text-gray-700">Bills ({rev.bills?.length || 0})</h3>
                                    <span className="text-[10px] text-gray-400 font-medium">Newest first · max 500</span>
                                </div>
                                <div className="max-h-[420px] overflow-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                            <tr>
                                                {['Bill No', 'Patient', 'Channel', 'Doctor', 'Date', 'Items', 'Revenue'].map((h, i) => (
                                                    <th key={i} className={`px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider ${i >= 5 ? 'text-right' : ''}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {(!rev.bills || rev.bills.length === 0) ? (
                                                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No bills in this period</td></tr>
                                            ) : rev.bills.map((b: any, i: number) => {
                                                const meta = CHANNEL_META[b.channel as 'counter' | 'opd' | 'ipd'];
                                                const Icon = meta.icon;
                                                return (
                                                    <tr key={i} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-2.5"><span className="font-mono text-xs text-gray-600">{b.billNo}</span></td>
                                                        <td className="px-4 py-2.5 text-sm font-bold text-gray-700">{b.patient}</td>
                                                        <td className="px-4 py-2.5">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${meta.chip}`}>
                                                                <Icon className="h-3 w-3" />{meta.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-xs text-gray-500">{b.doctor}</td>
                                                        <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(b.date).toLocaleDateString('en-IN')}</td>
                                                        <td className="px-4 py-2.5 text-right text-sm text-gray-500">{b.items}</td>
                                                        <td className="px-4 py-2.5 text-right text-sm font-black text-gray-900">{inr(b.revenue)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Stacked daily revenue */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-black text-gray-700">Daily Revenue by Channel</h3>
                                        <div className="flex gap-3">
                                            {(['ipd', 'opd', 'counter'] as const).map(ch => (
                                                <span key={ch} className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                                    <span className={`h-2.5 w-2.5 rounded-sm ${CHANNEL_META[ch].bar}`} />{CHANNEL_META[ch].label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-1.5 h-48">
                                        {rev.revenueByDay?.map((day: any, i: number) => {
                                            const maxRev = Math.max(...rev.revenueByDay.map((d: any) => d.revenue), 1);
                                            const h = (v: number) => `${(v / maxRev) * 100}%`;
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                                    <div className="w-full flex flex-col justify-end h-full rounded-t-md overflow-hidden" title={`${day.date}: ${inr(day.revenue)}`}>
                                                        <div className="w-full bg-violet-500" style={{ height: h(day.ipd) }} />
                                                        <div className="w-full bg-blue-500" style={{ height: h(day.opd) }} />
                                                        <div className="w-full bg-emerald-500" style={{ height: h(day.counter) }} />
                                                    </div>
                                                    {rev.revenueByDay.length <= 31 && (
                                                        <span className="text-[8px] text-gray-400 font-medium whitespace-nowrap rotate-0">{day.date.split(' ')[0]}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Top movers */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                    <h3 className="text-sm font-black text-gray-700 mb-4">Top 10 Movers (by revenue)</h3>
                                    {rev.topMovers?.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-sm">No sales data</div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {rev.topMovers?.map((item: any, i: number) => {
                                                const maxRev = rev.topMovers[0]?.revenue || 1;
                                                const pct = (item.revenue / maxRev) * 100;
                                                return (
                                                    <div key={i}>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-sm text-gray-700 font-medium flex items-center gap-2">
                                                                <span className="text-xs text-gray-400 w-4 text-right">{i + 1}.</span>
                                                                <span className="truncate max-w-[160px]">{item.name}</span>
                                                            </span>
                                                            <span className="text-xs font-bold text-emerald-600">{item.qty} units · {inr(item.revenue)}</span>
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

                            {/* Revenue by doctor */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                                <h3 className="text-sm font-black text-gray-700 mb-4">Revenue by Prescribing Doctor</h3>
                                {rev.byDoctor?.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-sm">No data</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                        {rev.byDoctor?.map((d: any, i: number) => {
                                            const maxRev = rev.byDoctor[0]?.revenue || 1;
                                            const pct = (d.revenue / maxRev) * 100;
                                            return (
                                                <div key={i}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-sm text-gray-700 font-medium truncate max-w-[200px]">{d.name}</span>
                                                        <span className="text-xs font-bold text-gray-600">{inr(d.revenue)}</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                        <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-violet-600" style={{ width: `${pct}%` }} />
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
                                                <td className="px-5 py-3 text-sm font-bold text-red-600">{inr(atRisk)}</td>
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

                    {/* Movement Ledger Tab */}
                    {activeTab === 'movements' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="p-4 border-b border-gray-200 flex gap-2 flex-wrap items-center">
                                <span className="text-xs font-black text-gray-400 uppercase">Filter:</span>
                                {['', 'GRN_RECEIPT', 'DISPENSE', 'PATIENT_RETURN', 'SUPPLIER_RETURN', 'EXPIRY_WRITEOFF', 'ADJUSTMENT'].map(t => (
                                    <button key={t} onClick={() => setMovementFilter(t)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${movementFilter === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                        {t || 'All'}
                                    </button>
                                ))}
                            </div>
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Date</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Medicine</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Batch</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Type</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">In</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Out</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Cost</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {movements.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-8 text-gray-400">No movements found</td></tr>
                                    ) : movements.map((m: any) => {
                                        const typeColors: Record<string, string> = {
                                            GRN_RECEIPT: 'bg-emerald-100 text-emerald-700',
                                            DISPENSE: 'bg-blue-100 text-blue-700',
                                            PATIENT_RETURN: 'bg-purple-100 text-purple-700',
                                            SUPPLIER_RETURN: 'bg-orange-100 text-orange-700',
                                            EXPIRY_WRITEOFF: 'bg-red-100 text-red-700',
                                            ADJUSTMENT: 'bg-amber-100 text-amber-700',
                                        };
                                        return (
                                            <tr key={m.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-gray-500">{new Date(m.created_at).toLocaleDateString('en-IN')} {new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="px-4 py-2 font-bold text-gray-900">{m.medicine?.brand_name}</td>
                                                <td className="px-4 py-2 font-mono text-gray-500">{m.batch?.batch_no || '—'}</td>
                                                <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${typeColors[m.movement_type] || 'bg-gray-100 text-gray-600'}`}>{m.movement_type}</span></td>
                                                <td className="px-4 py-2 text-right font-bold text-emerald-600">{m.quantity_in > 0 ? `+${m.quantity_in}` : ''}</td>
                                                <td className="px-4 py-2 text-right font-bold text-red-600">{m.quantity_out > 0 ? `-${m.quantity_out}` : ''}</td>
                                                <td className="px-4 py-2 text-right text-gray-500">{m.unit_cost ? `₹${Number(m.unit_cost).toFixed(2)}` : '—'}</td>
                                                <td className="px-4 py-2 text-right font-black text-gray-900">{m.balance_after}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Controlled Drug Register Tab */}
                    {activeTab === 'narcotics' && (
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Date</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Drug</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Batch</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Source</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Patient</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Prescriber</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">In</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Out</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Balance</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase">Witness</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {narcotics.length === 0 ? (
                                        <tr><td colSpan={10} className="text-center py-8 text-gray-400">No controlled drug entries</td></tr>
                                    ) : narcotics.map((n: any) => (
                                        <tr key={n.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-gray-500">{new Date(n.created_at).toLocaleDateString('en-IN')}</td>
                                            <td className="px-4 py-2 font-bold text-gray-900">{n.drug_name}</td>
                                            <td className="px-4 py-2 font-mono text-gray-500">{n.batch_no || '—'}</td>
                                            <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600">{n.source_type || n.transaction_type}</span></td>
                                            <td className="px-4 py-2 text-gray-600">{n.patient_name || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600">{n.prescriber_name || '—'}</td>
                                            <td className="px-4 py-2 text-right font-bold text-emerald-600">{n.quantity_in > 0 ? `+${n.quantity_in}` : ''}</td>
                                            <td className="px-4 py-2 text-right font-bold text-red-600">{n.quantity_out > 0 ? `-${n.quantity_out}` : ''}</td>
                                            <td className="px-4 py-2 text-right font-black text-gray-900">{n.balance}</td>
                                            <td className="px-4 py-2 text-gray-500">{n.witness_name || '—'}</td>
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
