'use client';

import React, { useState, useEffect } from 'react';
import {
    BarChart3, Users, Bed, FlaskConical, Pill, DollarSign, Activity,
    TrendingUp, TrendingDown, Clock, AlertTriangle, Shield, LogOut,
    RefreshCw, Loader2, Building2, ChevronRight, Bell, Search,
    Stethoscope, FileText, Package, ArrowUpRight, ArrowDownRight,
    HeartPulse, Zap, Eye, Calendar
} from 'lucide-react';
import Link from 'next/link';
import {
    getDashboardStats, getBedOccupancy, getRevenueBreakdown,
    getRecentActivity, getPatientFlow, getInventoryAlerts
} from '@/app/actions/admin-actions';

export default function AdminDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [bedData, setBedData] = useState<any>(null);
    const [revenue, setRevenue] = useState<any>(null);
    const [activity, setActivity] = useState<any[]>([]);
    const [patientFlow, setPatientFlow] = useState<any[]>([]);
    const [inventoryAlerts, setInventoryAlerts] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, b, r, a, pf, inv] = await Promise.all([
                getDashboardStats(),
                getBedOccupancy(),
                getRevenueBreakdown(),
                getRecentActivity(15),
                getPatientFlow(),
                getInventoryAlerts()
            ]);
            if (s.success) setStats(s.data);
            if (b.success) setBedData(b.data);
            if (r.success) setRevenue(r.data);
            if (a.success) setActivity(a.data || []);
            if (pf.success) setPatientFlow(pf.data || []);
            if (inv.success) setInventoryAlerts(inv.data);
        } catch (err) {
            console.error('Dashboard load error:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const getActionColor = (action: string) => {
        const colors: Record<string, string> = {
            'LOGIN': 'text-blue-500 bg-blue-50',
            'CREATE_PATIENT': 'text-emerald-500 bg-emerald-50',
            'AI_TRIAGE': 'text-violet-500 bg-violet-50',
            'ORDER_LAB': 'text-amber-500 bg-amber-50',
            'PRESCRIBE': 'text-teal-500 bg-teal-50',
            'DISCHARGE_PATIENT': 'text-rose-500 bg-rose-50',
            'PROCESS_DISCHARGE': 'text-rose-500 bg-rose-50',
        };
        return colors[action] || 'text-slate-500 bg-slate-50';
    };

    const getActionIcon = (action: string) => {
        const icons: Record<string, any> = {
            'LOGIN': Shield,
            'CREATE_PATIENT': Users,
            'AI_TRIAGE': Zap,
            'ORDER_LAB': FlaskConical,
            'PRESCRIBE': Pill,
            'DISCHARGE_PATIENT': LogOut,
            'PROCESS_DISCHARGE': FileText,
        };
        const Icon = icons[action] || Activity;
        return <Icon className="h-3.5 w-3.5" />;
    };

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans">
            {/* HEADER */}
            <header className="bg-[#0F1425]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-xl blur-md opacity-50" />
                            <div className="relative bg-gradient-to-br from-teal-400 to-emerald-600 p-2 rounded-xl shadow-lg shadow-teal-500/20">
                                <HeartPulse className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                                Avani Hospital OS
                            </h1>
                            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-[0.2em]">
                                Command Center
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-xs text-white/40 font-medium">
                            <Clock className="h-3.5 w-3.5" />
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            <span className="text-white/20">|</span>
                            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </div>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white transition-all"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <Link href="/login" className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-all">
                            <LogOut className="h-3.5 w-3.5" /> Logout
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
                {/* PAGE TITLE */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">
                            Intelligence Dashboard
                        </h2>
                        <p className="text-white/40 mt-1 font-medium">
                            Real-time hospital operations & analytics overview
                        </p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        <Link href="/reception/triage" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
                            <Users className="h-3.5 w-3.5" /> Reception
                        </Link>
                        <Link href="/doctor/dashboard" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
                            <Stethoscope className="h-3.5 w-3.5" /> Doctor
                        </Link>
                        <Link href="/lab/technician" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
                            <FlaskConical className="h-3.5 w-3.5" /> Lab
                        </Link>
                        <Link href="/pharmacy/billing" className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
                            <Pill className="h-3.5 w-3.5" /> Pharmacy
                        </Link>
                        <Link href="/ipd" className="px-4 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs font-bold text-violet-400 hover:bg-violet-500/20 transition-all flex items-center gap-2">
                            <Bed className="h-3.5 w-3.5" /> IPD
                        </Link>
                        <Link href="/finance/dashboard" className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                            <DollarSign className="h-3.5 w-3.5" /> Finance
                        </Link>
                        <Link href="/insurance" className="px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-2">
                            <Shield className="h-3.5 w-3.5" /> Insurance
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
                            <p className="text-white/30 font-bold text-sm">Loading intelligence data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI CARDS ROW */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Today's Patients */}
                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-teal-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Patients Today</span>
                                    <div className="p-1.5 bg-teal-500/10 rounded-lg">
                                        <Users className="h-3.5 w-3.5 text-teal-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">{stats?.totalPatientsToday || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                                    <ArrowUpRight className="h-3 w-3" />
                                    Total: {stats?.totalPatientsAll || 0}
                                </div>
                            </div>

                            {/* Active Admissions */}
                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-violet-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl group-hover:bg-violet-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">IPD Admissions</span>
                                    <div className="p-1.5 bg-violet-500/10 rounded-lg">
                                        <Bed className="h-3.5 w-3.5 text-violet-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">{stats?.activeAdmissions || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-violet-400">
                                    <Activity className="h-3 w-3" />
                                    Active In-Patients
                                </div>
                            </div>

                            {/* Pending Lab */}
                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-amber-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Lab Queue</span>
                                    <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                        <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">{stats?.pendingLabOrders || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                                    <TrendingUp className="h-3 w-3" />
                                    {stats?.completedLabToday || 0} done today
                                </div>
                            </div>

                            {/* Revenue */}
                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Revenue</span>
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                        <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">
                                    ₹{((stats?.totalRevenue || 0) / 1000).toFixed(1)}K
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                                    <TrendingUp className="h-3 w-3" />
                                    Collected
                                </div>
                            </div>
                        </div>

                        {/* MAIN GRID */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* BED OCCUPANCY */}
                            <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                        <Bed className="h-4 w-4 text-violet-400" />
                                        Bed Occupancy
                                    </h3>
                                    <span className="text-xs font-bold text-white/30">{bedData?.total || 0} beds</span>
                                </div>
                                <div className="p-5 space-y-4">
                                    {/* Occupancy ring */}
                                    <div className="flex items-center gap-6">
                                        <div className="relative h-28 w-28 shrink-0">
                                            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                                                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                                <circle
                                                    cx="50" cy="50" r="42" fill="none"
                                                    stroke="url(#occupancyGradient)"
                                                    strokeWidth="8"
                                                    strokeLinecap="round"
                                                    strokeDasharray={`${(bedData?.occupancyRate || 0) * 2.64} 264`}
                                                />
                                                <defs>
                                                    <linearGradient id="occupancyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#8B5CF6" />
                                                        <stop offset="100%" stopColor="#6366F1" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-2xl font-black text-white">{bedData?.occupancyRate || 0}%</span>
                                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider">Occupied</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                                                    <span className="text-xs font-bold text-white/50">Occupied</span>
                                                </div>
                                                <span className="text-sm font-black text-white">{bedData?.occupied || 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                                    <span className="text-xs font-bold text-white/50">Available</span>
                                                </div>
                                                <span className="text-sm font-black text-white">{bedData?.available || 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                                    <span className="text-xs font-bold text-white/50">Maintenance</span>
                                                </div>
                                                <span className="text-sm font-black text-white">{bedData?.maintenance || 0}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ward breakdown */}
                                    {bedData?.byWard && bedData.byWard.length > 0 && (
                                        <div className="space-y-2.5 pt-2 border-t border-white/5">
                                            {bedData.byWard.map((ward: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-white/40 w-24 truncate">{ward.wardName}</span>
                                                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700"
                                                            style={{ width: `${ward.occupancyRate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-black text-white/30 w-10 text-right">{ward.occupancyRate}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* PATIENT FLOW */}
                            <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                        <TrendingUp className="h-4 w-4 text-teal-400" />
                                        Patient Flow (7 Days)
                                    </h3>
                                </div>
                                <div className="p-5">
                                    {patientFlow.length > 0 ? (
                                        <div className="space-y-4">
                                            {/* Simple bar chart */}
                                            <div className="flex items-end gap-2 h-36">
                                                {patientFlow.map((item: any, i: number) => {
                                                    const maxCount = Math.max(...patientFlow.map((p: any) => p.count), 1);
                                                    const heightPct = (item.count / maxCount) * 100;
                                                    return (
                                                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-teal-400">{item.count}</span>
                                                            <div className="w-full rounded-t-lg bg-gradient-to-t from-teal-600/80 to-teal-400/60 transition-all duration-700 hover:from-teal-500 hover:to-teal-300"
                                                                style={{ height: `${Math.max(heightPct, 8)}%` }}
                                                            />
                                                            <span className="text-[9px] font-bold text-white/30 truncate max-w-full">{item.day}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                <span className="text-xs font-bold text-white/30">Total Registrations</span>
                                                <span className="text-sm font-black text-teal-400">
                                                    {patientFlow.reduce((s: number, p: any) => s + p.count, 0)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-36 flex items-center justify-center text-white/20 text-xs font-bold">
                                            No patient flow data yet
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* INVENTORY ALERTS */}
                            <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                        <Package className="h-4 w-4 text-amber-400" />
                                        Inventory Alerts
                                    </h3>
                                    <Link href="/pharmacy/billing" className="text-[10px] font-black text-teal-400 uppercase tracking-wider hover:text-teal-300 flex items-center gap-1">
                                        Pharmacy <ChevronRight className="h-3 w-3" />
                                    </Link>
                                </div>
                                <div className="p-5 space-y-3 max-h-[320px] overflow-auto">
                                    {inventoryAlerts?.lowStock?.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                                <AlertTriangle className="h-3 w-3" /> Low Stock
                                            </p>
                                            {inventoryAlerts.lowStock.map((item: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                                    <div>
                                                        <span className="text-xs font-bold text-white/80 block">{item.medicine}</span>
                                                        <span className="text-[10px] text-white/30 font-mono">{item.batchNo}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                                                        {item.stock} left
                                                    </span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {inventoryAlerts?.expiringSoon?.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em] flex items-center gap-1.5 mt-4">
                                                <Clock className="h-3 w-3" /> Expiring Soon
                                            </p>
                                            {inventoryAlerts.expiringSoon.map((item: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                                                    <div>
                                                        <span className="text-xs font-bold text-white/80 block">{item.medicine}</span>
                                                        <span className="text-[10px] text-white/30 font-mono">{item.batchNo}</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-amber-400">
                                                        {new Date(item.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {(!inventoryAlerts?.lowStock?.length && !inventoryAlerts?.expiringSoon?.length) && (
                                        <div className="py-8 flex flex-col items-center text-white/20">
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
                            <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                        <BarChart3 className="h-4 w-4 text-emerald-400" />
                                        Revenue Breakdown
                                    </h3>
                                    <span className="text-xs font-black text-emerald-400">
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
                                                        <span className="text-xs font-bold text-white/40 w-28 truncate">{dept.name}</span>
                                                        <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`}
                                                                style={{ width: `${widthPct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-black text-white/60 w-16 text-right">₹{dept.amount.toLocaleString()}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="py-8 flex flex-col items-center text-white/20">
                                            <BarChart3 className="h-8 w-8 mb-2" />
                                            <span className="text-xs font-bold">No revenue data yet</span>
                                            <span className="text-[10px] text-white/15 mt-1">Billing records will appear here</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RECENT ACTIVITY / AUDIT LOG */}
                            <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                        <Shield className="h-4 w-4 text-blue-400" />
                                        Audit Trail
                                    </h3>
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-wider">Live Feed</span>
                                </div>
                                <div className="max-h-[320px] overflow-auto">
                                    {activity.length > 0 ? (
                                        <div className="divide-y divide-white/5">
                                            {activity.map((log: any, i: number) => (
                                                <div key={i} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                                                    <div className={`p-1.5 rounded-lg ${getActionColor(log.action)}`}>
                                                        {getActionIcon(log.action)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-white/70">{log.action.replace(/_/g, ' ')}</span>
                                                            <span className="text-[10px] font-bold text-white/20 bg-white/5 px-1.5 py-0.5 rounded">{log.module}</span>
                                                        </div>
                                                        <p className="text-[10px] text-white/30 font-medium truncate">
                                                            {log.username && `by ${log.username}`}
                                                            {log.entity_id && ` · ${log.entity_type}: ${log.entity_id.slice(0, 12)}...`}
                                                        </p>
                                                    </div>
                                                    <span className="text-[10px] text-white/20 font-medium shrink-0">
                                                        {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-12 flex flex-col items-center text-white/20">
                                            <Shield className="h-8 w-8 mb-2" />
                                            <span className="text-xs font-bold">No activity logged yet</span>
                                            <span className="text-[10px] text-white/15 mt-1">Actions across modules will appear here</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* QUICK ACTIONS ROW */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/reception/triage"
                                className="group bg-gradient-to-br from-teal-500/10 to-teal-600/5 border border-teal-500/20 rounded-2xl p-5 hover:border-teal-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-teal-500/10 rounded-xl w-fit group-hover:bg-teal-500/20 transition-all">
                                    <Zap className="h-5 w-5 text-teal-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">AI Triage Intake</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Smart patient intake & routing</p>
                                </div>
                            </Link>
                            <Link href="/doctor/dashboard"
                                className="group bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-2xl p-5 hover:border-violet-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-violet-500/10 rounded-xl w-fit group-hover:bg-violet-500/20 transition-all">
                                    <Stethoscope className="h-5 w-5 text-violet-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Doctor Console</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Patient queue & AI co-pilot</p>
                                </div>
                            </Link>
                            <Link href="/ipd"
                                className="group bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/20 rounded-2xl p-5 hover:border-indigo-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-indigo-500/10 rounded-xl w-fit group-hover:bg-indigo-500/20 transition-all">
                                    <Bed className="h-5 w-5 text-indigo-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">IPD Management</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Beds, admissions & care</p>
                                </div>
                            </Link>
                            <Link href="/finance/dashboard"
                                className="group bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-5 hover:border-emerald-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-emerald-500/10 rounded-xl w-fit group-hover:bg-emerald-500/20 transition-all">
                                    <DollarSign className="h-5 w-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Finance & Billing</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Invoices, payments & revenue</p>
                                </div>
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link href="/lab/technician"
                                className="group bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-5 hover:border-amber-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-amber-500/10 rounded-xl w-fit group-hover:bg-amber-500/20 transition-all">
                                    <FlaskConical className="h-5 w-5 text-amber-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Lab Worklist</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Test orders & result upload</p>
                                </div>
                            </Link>
                            <Link href="/pharmacy/billing"
                                className="group bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-2xl p-5 hover:border-cyan-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-cyan-500/10 rounded-xl w-fit group-hover:bg-cyan-500/20 transition-all">
                                    <Pill className="h-5 w-5 text-cyan-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Pharmacy</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Inventory & dispensing</p>
                                </div>
                            </Link>
                            <Link href="/insurance"
                                className="group bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl p-5 hover:border-blue-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-blue-500/10 rounded-xl w-fit group-hover:bg-blue-500/20 transition-all">
                                    <Shield className="h-5 w-5 text-blue-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Insurance & TPA</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Claims & policy management</p>
                                </div>
                            </Link>
                            <Link href="/discharge/admin"
                                className="group bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 rounded-2xl p-5 hover:border-rose-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-rose-500/10 rounded-xl w-fit group-hover:bg-rose-500/20 transition-all">
                                    <FileText className="h-5 w-5 text-rose-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Discharge Hub</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Summary & clearance</p>
                                </div>
                            </Link>
                            <Link href="/admin/audit"
                                className="group bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/20 rounded-2xl p-5 hover:border-amber-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-amber-500/10 rounded-xl w-fit group-hover:bg-amber-500/20 transition-all">
                                    <Shield className="h-5 w-5 text-amber-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Audit Trail</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">System activity log</p>
                                </div>
                            </Link>
                            <Link href="/ipd/bed-matrix"
                                className="group bg-gradient-to-br from-violet-500/10 to-indigo-600/5 border border-violet-500/20 rounded-2xl p-5 hover:border-violet-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-violet-500/10 rounded-xl w-fit group-hover:bg-violet-500/20 transition-all">
                                    <Activity className="h-5 w-5 text-violet-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">Bed Matrix</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Real-time bed status</p>
                                </div>
                            </Link>
                            <Link href="/admin/mfa-setup"
                                className="group bg-gradient-to-br from-purple-500/10 to-violet-600/5 border border-purple-500/20 rounded-2xl p-5 hover:border-purple-400/40 transition-all flex flex-col gap-3"
                            >
                                <div className="p-2 bg-purple-500/10 rounded-xl w-fit group-hover:bg-purple-500/20 transition-all">
                                    <Shield className="h-5 w-5 text-purple-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white/90">MFA Setup</h4>
                                    <p className="text-[10px] text-white/30 font-medium mt-0.5">Two-factor authentication</p>
                                </div>
                            </Link>
                        </div>
                    </>
                )}
            </main>

            {/* FOOTER */}
            <footer className="mt-8 border-t border-white/5 py-6 px-6">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider">
                        Avani Hospital OS · Intelligence Platform · v2.0
                    </p>
                    <p className="text-[10px] font-medium text-white/15">
                        ⚕️ HIPAA-compliant · Audit-logged · AI-assisted
                    </p>
                </div>
            </footer>
        </div>
    );
}
