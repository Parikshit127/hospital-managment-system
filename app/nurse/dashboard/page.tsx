'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    LayoutDashboard, ClipboardList, CheckCircle2, Users, Pill,
    Activity, Heart, ArrowRight, Clock, AlertTriangle, Loader2
} from 'lucide-react';
import { getNurseDashboard } from '@/app/actions/nurse-actions';
import Link from 'next/link';

export default function NurseDashboardPage() {
    const [nurseId, setNurseId] = useState('');
    const [nurseName, setNurseName] = useState('Nurse');
    const [stats, setStats] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/session');
                if (res.ok) {
                    const data = await res.json();
                    setNurseId(data.id || '');
                    setNurseName(data.name || data.username || 'Nurse');
                }
            } catch (e) {
                console.error('Failed to fetch session', e);
            }
        }
        fetchSession();
    }, []);

    const loadDashboard = useCallback(async () => {
        if (!nurseId) return;
        setRefreshing(true);
        try {
            const res = await getNurseDashboard(nurseId);
            if (res.success) {
                setStats(res.data);
            }
        } catch (e) {
            console.error('Failed to load dashboard', e);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [nurseId]);

    useEffect(() => {
        if (nurseId) loadDashboard();
    }, [nurseId, loadDashboard]);

    // Auto-refresh every 60s
    useEffect(() => {
        if (!nurseId) return;
        const interval = setInterval(loadDashboard, 60000);
        return () => clearInterval(interval);
    }, [nurseId, loadDashboard]);

    const kpis = [
        {
            label: 'Pending Tasks',
            value: stats?.pendingTasks ?? 0,
            icon: ClipboardList,
            color: 'text-amber-500',
            bg: 'bg-amber-50',
            link: '/nurse/tasks',
        },
        {
            label: 'Completed Today',
            value: stats?.completedTasks ?? 0,
            icon: CheckCircle2,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50',
            link: '/nurse/tasks',
        },
        {
            label: 'Admitted Patients',
            value: stats?.totalAdmitted ?? 0,
            icon: Users,
            color: 'text-blue-500',
            bg: 'bg-blue-50',
            link: '/nurse/patients',
        },
        {
            label: 'Pending Medications',
            value: stats?.pendingMeds ?? 0,
            icon: Pill,
            color: 'text-rose-500',
            bg: 'bg-rose-50',
            link: '/nurse/medications',
        },
    ];

    const quickLinks = [
        { label: 'Record Vitals', icon: Heart, href: '/nurse/vitals', color: 'text-rose-500', bg: 'bg-rose-50' },
        { label: 'Nursing Tasks', icon: ClipboardList, href: '/nurse/tasks', color: 'text-amber-500', bg: 'bg-amber-50' },
        { label: 'Medications', icon: Pill, href: '/nurse/medications', color: 'text-violet-500', bg: 'bg-violet-50' },
        { label: 'My Patients', icon: Users, href: '/nurse/patients', color: 'text-blue-500', bg: 'bg-blue-50' },
        { label: 'Shift Handover', icon: ArrowRight, href: '/nurse/handover', color: 'text-teal-500', bg: 'bg-teal-50' },
        { label: 'Patient Vitals', icon: Activity, href: '/nurse/vitals', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    ];

    return (
        <AppShell
            pageTitle="Nurse Dashboard"
            pageIcon={<LayoutDashboard className="h-5 w-5" />}
            onRefresh={loadDashboard}
            refreshing={refreshing}
        >
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                </div>
            ) : (
                <>
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl p-6 mb-6 text-white shadow-lg shadow-teal-500/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-bold tracking-[0.15em] text-white/60 mb-1">Welcome back</p>
                                <h2 className="text-2xl font-black">{nurseName}</h2>
                                <p className="text-sm text-white/80 mt-1">
                                    {stats?.pendingTasks ?? 0} tasks pending today &middot; {stats?.pendingMeds ?? 0} medications to administer
                                </p>
                            </div>
                            <div className="hidden md:flex items-center gap-2">
                                <Clock className="h-5 w-5 text-white/60" />
                                <span className="text-sm font-bold text-white/80">
                                    {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {kpis.map((kpi, index) => {
                            const Icon = kpi.icon;
                            return (
                                <Link
                                    href={kpi.link}
                                    key={index}
                                    className="bg-white border hover:border-teal-500 transition-colors border-gray-200 shadow-sm rounded-2xl p-5 flex items-center justify-between"
                                >
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

                    {/* Quick Links + Alerts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Quick Links */}
                        <div className="lg:col-span-2 bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Activity className="h-4 w-4 text-teal-500" /> Quick Actions
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {quickLinks.map((link, index) => {
                                    const Icon = link.icon;
                                    return (
                                        <Link
                                            key={index}
                                            href={link.href}
                                            className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
                                        >
                                            <div className={`p-2 rounded-lg ${link.bg} mb-2`}>
                                                <Icon className={`h-5 w-5 ${link.color}`} />
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">{link.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Alerts Panel */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" /> Alerts
                            </h3>
                            <div className="space-y-3">
                                {(stats?.pendingMeds ?? 0) > 0 && (
                                    <Link
                                        href="/nurse/medications"
                                        className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl hover:border-rose-300 transition-colors"
                                    >
                                        <Pill className="h-5 w-5 text-rose-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-rose-700">Pending Medications</p>
                                            <p className="text-[10px] text-rose-500">{stats.pendingMeds} medication(s) due today</p>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-rose-400 shrink-0" />
                                    </Link>
                                )}
                                {(stats?.pendingTasks ?? 0) > 0 && (
                                    <Link
                                        href="/nurse/tasks"
                                        className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl hover:border-amber-300 transition-colors"
                                    >
                                        <ClipboardList className="h-5 w-5 text-amber-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-amber-700">Pending Tasks</p>
                                            <p className="text-[10px] text-amber-500">{stats.pendingTasks} task(s) awaiting completion</p>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-amber-400 shrink-0" />
                                    </Link>
                                )}
                                {(stats?.pendingMeds ?? 0) === 0 && (stats?.pendingTasks ?? 0) === 0 && (
                                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                        <CheckCircle2 className="h-10 w-10 text-emerald-300 mb-3" />
                                        <p className="text-sm font-bold text-gray-500">All Caught Up</p>
                                        <p className="text-[10px] text-gray-400 mt-1">No pending alerts at this time.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </AppShell>
    );
}
