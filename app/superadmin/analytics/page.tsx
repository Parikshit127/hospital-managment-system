'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, BarChart3, TrendingUp, Building2, Users } from 'lucide-react';
import { getPlatformAnalytics } from '@/app/actions/superadmin-actions';

export default function SuperAdminAnalytics() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const res = await getPlatformAnalytics();
            if (res.success) setStats(res.data);
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-2xl font-black text-gray-900">Platform Analytics</h1>
                <p className="text-gray-500 font-medium mt-1">Global ecosystem telemetry and financial aggregation</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center gap-3 text-violet-600 mb-4 bg-violet-50 w-max p-2 rounded-lg">
                        <TrendingUp className="h-5 w-5" />
                        <span className="font-bold text-sm uppercase tracking-wider">Gross Platform Ledger</span>
                    </div>
                    <p className="text-3xl font-black text-gray-900 border-b border-gray-100 pb-4 mb-4">₹{stats.platformRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest text-right">Lifetime Invoice Vol.</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center gap-3 text-emerald-600 mb-4 bg-emerald-50 w-max p-2 rounded-lg">
                        <LineChart className="h-5 w-5" />
                        <span className="font-bold text-sm uppercase tracking-wider">Net Cash Collected</span>
                    </div>
                    <p className="text-3xl font-black text-gray-900 border-b border-gray-100 pb-4 mb-4">₹{stats.totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest text-right">Settled Payment Vol.</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center gap-3 text-blue-600 mb-4 bg-blue-50 w-max p-2 rounded-lg">
                        <Building2 className="h-5 w-5" />
                        <span className="font-bold text-sm uppercase tracking-wider">Tenant Count</span>
                    </div>
                    <p className="text-3xl font-black text-gray-900 border-b border-gray-100 pb-4 mb-4">{stats.orgStats.length}</p>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest text-right">Active Subscriptions</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 bg-gray-50 border-b border-gray-100">
                    <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-gray-400" /> Tenant Performance Matrix</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Organization Name</th>
                                <th className="px-6 py-4 text-center">Patient Footprint</th>
                                <th className="px-6 py-4 text-center">Active Users</th>
                                <th className="px-6 py-4 text-center">Invoices Generated</th>
                                <th className="px-6 py-4 text-center">Admissions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {stats.orgStats.map((org: any) => (
                                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-black text-indigo-700">{org.name}</td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-700">{org._count.patients}</td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-700">{org._count.users}</td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-700">{org._count.invoices}</td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-700">{org._count.admissions}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
