'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Activity, LayoutGrid, Users2 } from 'lucide-react';
import { getIPDCensus } from '@/app/actions/ipd-actions';

export default function CensusPage() {
    const [stats, setStats] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        setRefreshing(true);
        const res = await getIPDCensus();
        if (res.success) setStats(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    const totalOverall = stats.reduce((acc, w) => acc + w.total, 0);
    const occupiedOverall = stats.reduce((acc, w) => acc + w.occupied, 0);
    const overallRate = totalOverall > 0 ? Math.round((occupiedOverall / totalOverall) * 100) : 0;

    return (
        <AppShell
            pageTitle="IPD Bed Census"
            pageIcon={<LayoutGrid className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white border hover:border-teal-500 transition-colors border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">Overall Occupancy</p>
                        <p className="text-3xl font-black text-gray-900">{overallRate}%</p>
                    </div>
                    <div className="p-4 rounded-xl bg-teal-50">
                        <Activity className="h-6 w-6 text-teal-600" />
                    </div>
                </div>
                <div className="bg-white border hover:border-emerald-500 transition-colors border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">Total Patients Admitted</p>
                        <p className="text-3xl font-black text-gray-900">{occupiedOverall}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50">
                        <Users2 className="h-6 w-6 text-emerald-600" />
                    </div>
                </div>
                <div className="bg-white border hover:border-indigo-500 transition-colors border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">Total Beds Configured</p>
                        <p className="text-3xl font-black text-gray-900">{totalOverall}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-indigo-50">
                        <LayoutGrid className="h-6 w-6 text-indigo-600" />
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                    <h3 className="font-bold text-gray-900">Ward Utilization Details</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-left">Ward Name</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-center">Total Beds</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-center">Occupied</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-center">Available</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-right">Occupancy Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {stats.map((w, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-bold text-gray-900">{w.ward_name}</td>
                                    <td className="px-6 py-4 text-center font-medium text-gray-600">{w.total}</td>
                                    <td className="px-6 py-4 text-center font-black text-rose-600">{w.occupied}</td>
                                    <td className="px-6 py-4 text-center font-bold text-emerald-600">{w.available}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <span className="font-bold text-gray-700">{w.occupancy_rate}%</span>
                                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${w.occupancy_rate > 90 ? 'bg-red-500' : w.occupancy_rate > 70 ? 'bg-amber-500' : 'bg-teal-500'}`}
                                                    style={{ width: `${w.occupancy_rate}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
