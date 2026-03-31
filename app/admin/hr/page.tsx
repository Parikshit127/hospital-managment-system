'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Briefcase, LayoutDashboard, Settings2, Users, FileText, BarChart3,
    Loader2, Stethoscope,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { getHRDashboard } from '@/app/actions/hr-actions';

const TABS = [
    { key: 'dashboard', label: 'Personnel Analytics', icon: LayoutDashboard },
];

export default function AdminHRHub() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getHRDashboard();
            if (res.success) setStats(res.data);
        } catch (err) {
            console.error('HR load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const maxDeptCount = stats?.departmentBreakdown?.length
        ? Math.max(...stats.departmentBreakdown.map((d: any) => d.count))
        : 1;

    return (
        <ModuleHubLayout
            moduleKey="hr"
            moduleTitle="HR Module"
            moduleDescription="Hospital staff analytics, directory & personnel management"
            moduleIcon={<Briefcase className="h-5 w-5" />}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={activeTab === 'dashboard' ? loadData : undefined}
            refreshing={loading}
        >
            {activeTab === 'dashboard' && (
                <div className="space-y-8">
                    {loading && !stats ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                        </div>
                    ) : (
                        <>
                            {/* TOTAL STRENGTH & DYNAMIC ROLE GRID */}
                            <div className="space-y-6">
                                <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-[2.5rem] p-10 text-white shadow-xl shadow-teal-100 flex flex-col md:flex-row items-center justify-between gap-8">
                                    <div className="space-y-2">
                                        <h2 className="text-xl font-bold opacity-80">Total Hospital Strength</h2>
                                        <p className="text-7xl font-black tracking-tighter">
                                            {stats?.totalStrength ?? 0}
                                            <span className="text-xl font-bold opacity-60 ml-3 tracking-normal">Personnel</span>
                                        </p>
                                    </div>
                                    <div className="hidden lg:block p-6 bg-white/10 rounded-full backdrop-blur-md">
                                        <Users className="h-16 w-16 text-white" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {stats?.roleBreakdown?.map((rb: any) => (
                                        <div key={rb.role} className="bg-white border border-gray-100 shadow-sm rounded-3xl p-6 flex items-center justify-between group hover:border-teal-200 transition-all">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{rb.role}</p>
                                                <p className="text-2xl font-black text-gray-900 group-hover:text-teal-600 transition-colors">{rb.count}</p>
                                            </div>
                                            <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-teal-50 transition-colors">
                                                {rb.role.toLowerCase().includes('doctor') ? <Stethoscope className="h-5 w-5 text-blue-500" /> : 
                                                 rb.role.toLowerCase().includes('reception') ? <Users className="h-5 w-5 text-emerald-500" /> :
                                                 rb.role.toLowerCase().includes('finance') ? <BarChart3 className="h-5 w-5 text-orange-500" /> :
                                                 <Briefcase className="h-5 w-5 text-gray-400" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-8">
                                {/* STAFF DIRECTORY */}
                                <div className="bg-white border border-gray-100 shadow-sm rounded-[2.5rem] overflow-hidden">
                                    <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/20">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-teal-600 text-white rounded-2xl shadow-lg shadow-teal-100"><Users className="h-5 w-5" /></div>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-900">Hospital Personnel Directory</h3>
                                                <p className="text-xs text-gray-400 font-medium">Complete list of active staff and their system roles</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-gray-50 bg-gray-50/30">
                                                    <th className="py-4 px-8 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Personnel Name</th>
                                                    <th className="py-4 px-8 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Username / Code</th>
                                                    <th className="py-4 px-8 text-[10px] font-bold text-gray-400 uppercase tracking-widest">System Role</th>
                                                    <th className="py-4 px-8 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contact</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {stats?.staffList?.map((emp: any) => (
                                                    <tr key={emp.id} className="group hover:bg-teal-50/30 transition-colors">
                                                        <td className="py-5 px-8">
                                                            <p className="text-sm font-bold text-gray-900 group-hover:text-teal-600 transition-colors uppercase">{emp.name}</p>
                                                        </td>
                                                        <td className="py-5 px-8">
                                                            <p className="text-[10px] font-mono font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-md inline-block">{emp.code}</p>
                                                        </td>
                                                        <td className="py-5 px-8">
                                                            <span className="px-3 py-1 bg-teal-50 text-teal-700 text-[10px] font-black uppercase rounded-full border border-teal-100">
                                                                {emp.role}
                                                            </span>
                                                        </td>
                                                        <td className="py-5 px-8">
                                                            <div className="space-y-0.5">
                                                                <p className="text-xs font-medium text-gray-700">{emp.phone || 'No Phone'}</p>
                                                                <p className="text-[10px] text-gray-400 font-mono italic">{emp.email || '-'}</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!stats?.staffList || stats.staffList.length === 0) && (
                                                    <tr>
                                                        <td colSpan={4} className="py-20 text-center text-gray-400 font-medium italic">
                                                            No active personnel records found in the database.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </ModuleHubLayout>
    );
}
