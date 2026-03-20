'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    FlaskConical, LayoutDashboard, Settings2, Clock, AlertTriangle,
    Loader2, ScanBarcode, FileText, ChevronRight, Beaker, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { getLabDashboardStats } from '@/app/actions/lab-actions';

const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminLabHub() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getLabDashboardStats();
            if (res.success) setStats(res.data);
        } catch (err) {
            console.error('Lab load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    return (
        <ModuleHubLayout
            moduleKey="lab"
            moduleTitle="Lab Module"
            moduleDescription="Laboratory operations, sample processing & reporting"
            moduleIcon={<FlaskConical className="h-5 w-5" />}
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
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Pending Samples</span>
                                        <div className="p-1.5 bg-amber-50 rounded-lg">
                                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.pendingCount || 0}</p>
                                    <p className="text-xs text-gray-400 mt-1">Awaiting processing</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Processing</span>
                                        <div className="p-1.5 bg-blue-50 rounded-lg">
                                            <Beaker className="h-3.5 w-3.5 text-blue-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.processingCount || 0}</p>
                                    <p className="text-xs text-gray-400 mt-1">In progress</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Completed Today</span>
                                        <div className="p-1.5 bg-emerald-50 rounded-lg">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.completedToday || 0}</p>
                                    <p className="text-xs text-gray-400 mt-1">Results uploaded</p>
                                </div>

                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Critical Alerts</span>
                                        <div className="p-1.5 bg-red-50 rounded-lg">
                                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900">{stats?.criticalCount || 0}</p>
                                    <p className="text-xs text-gray-400 mt-1">Require attention</p>
                                </div>
                            </div>

                            {/* TAT CARD */}
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                <h3 className="text-sm font-bold text-gray-900 mb-3">Average Turnaround Time</h3>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-black text-gray-900">{stats?.avgTAT || 0}</span>
                                    <span className="text-sm font-medium text-gray-400">minutes</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Based on today&apos;s completed samples</p>
                            </div>

                            {/* QUICK ACTIONS */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Actions</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Link
                                        href="/lab/worklist"
                                        className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-5 transition-all flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-xl">
                                                <ScanBarcode className="h-5 w-5 text-blue-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Scan Barcode</h4>
                                                <p className="text-xs text-gray-400">Open lab worklist</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                    </Link>

                                    <Link
                                        href="/lab/reports"
                                        className="group bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-5 transition-all flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-violet-50 rounded-xl">
                                                <FileText className="h-5 w-5 text-violet-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Generate Report</h4>
                                                <p className="text-xs text-gray-400">Lab analytics & TAT reports</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
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
                        href="/lab/tests"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-blue-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 rounded-xl">
                                <FlaskConical className="h-6 w-6 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Test Catalog & Panels</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Manage lab tests, panels, pricing & reference ranges</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </Link>
                    <Link
                        href="/lab/worklist"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-emerald-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 rounded-xl">
                                <Beaker className="h-6 w-6 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Lab Worklist & Processing</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Sample tracking, TAT configuration & quality control</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                    </Link>
                </div>
            )}
        </ModuleHubLayout>
    );
}
