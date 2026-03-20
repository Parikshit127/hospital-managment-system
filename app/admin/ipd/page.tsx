'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Bed, LayoutDashboard, Settings2, Activity, Users, ChevronRight,
    Loader2, Filter, Heart, ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import { ModuleHubLayout } from '../components/ModuleHubLayout';
import { getIPDStats, getWardsWithBeds, getIPDAdmissions } from '@/app/actions/ipd-actions';

const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminIPDHub() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [stats, setStats] = useState<any>(null);
    const [wards, setWards] = useState<any[]>([]);
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [admissionFilter, setAdmissionFilter] = useState<'Admitted' | 'Discharged'>('Admitted');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, wardsRes, admRes] = await Promise.all([
                getIPDStats(),
                getWardsWithBeds(),
                getIPDAdmissions(admissionFilter),
            ]);
            if (statsRes.success) setStats(statsRes.data);
            if (wardsRes.success) setWards(wardsRes.data || []);
            if (admRes.success) setAdmissions(admRes.data || []);
        } catch (err) {
            console.error('IPD load error:', err);
        }
        setLoading(false);
    }, [admissionFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            'Admitted': 'bg-blue-50 text-blue-700 border border-blue-200',
            'Discharged': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            'Transferred': 'bg-amber-50 text-amber-700 border border-amber-200',
        };
        return map[status] || 'bg-gray-100 text-gray-500';
    };

    return (
        <ModuleHubLayout
            moduleKey="ipd"
            moduleTitle="IPD Module"
            moduleDescription="Inpatient department operations & configuration"
            moduleIcon={<Bed className="h-5 w-5" />}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={activeTab === 'dashboard' ? loadData : undefined}
            refreshing={loading}
        >
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {/* KPI ROW */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Admitted</span>
                                <div className="p-1.5 bg-blue-50 rounded-lg"><Users className="h-3.5 w-3.5 text-blue-500" /></div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{stats?.totalAdmitted || 0}</p>
                            <p className="text-xs text-gray-400 mt-1">Current inpatients</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Available Beds</span>
                                <div className="p-1.5 bg-emerald-50 rounded-lg"><Bed className="h-3.5 w-3.5 text-emerald-500" /></div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{stats?.availableBeds || 0}</p>
                            <p className="text-xs text-gray-400 mt-1">of {stats?.totalBeds || 0} total</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Occupancy Rate</span>
                                <div className="p-1.5 bg-amber-50 rounded-lg"><Activity className="h-3.5 w-3.5 text-amber-500" /></div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{stats?.occupancyRate || 0}%</p>
                            <p className="text-xs text-gray-400 mt-1">Bed utilization</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Discharged</span>
                                <div className="p-1.5 bg-violet-50 rounded-lg"><Heart className="h-3.5 w-3.5 text-violet-500" /></div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{stats?.totalDischarged || 0}</p>
                            <p className="text-xs text-gray-400 mt-1">Total discharged</p>
                        </div>
                    </div>

                    {/* WARD OVERVIEW */}
                    {wards.length > 0 && (
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-gray-900 mb-4">Ward Overview</h3>
                            <div className="space-y-3">
                                {wards.map((ward: any) => {
                                    const occupancyPct = ward.totalBeds > 0
                                        ? Math.round((ward.occupied / ward.totalBeds) * 100)
                                        : 0;
                                    const barColor = occupancyPct >= 90
                                        ? 'bg-rose-500'
                                        : occupancyPct >= 70
                                            ? 'bg-amber-500'
                                            : 'bg-emerald-500';

                                    return (
                                        <div key={ward.ward_id} className="flex items-center gap-4">
                                            <div className="w-36 shrink-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{ward.ward_name}</p>
                                                <p className="text-[10px] text-gray-400">{ward.ward_type || 'General'}</p>
                                            </div>
                                            <div className="flex-1">
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${barColor}`}
                                                        style={{ width: `${occupancyPct}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 w-28">
                                                <span className="text-xs font-bold text-gray-700">{ward.occupied}/{ward.totalBeds}</span>
                                                <span className="text-[10px] text-gray-400 ml-1">({occupancyPct}%)</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* FILTERS */}
                    <div className="flex items-center gap-3">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={admissionFilter}
                            onChange={e => setAdmissionFilter(e.target.value as 'Admitted' | 'Discharged')}
                            className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                        >
                            <option value="Admitted">Admitted</option>
                            <option value="Discharged">Discharged</option>
                        </select>
                    </div>

                    {/* ADMISSIONS TABLE */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900">
                                {admissionFilter === 'Admitted' ? 'Current Admissions' : 'Discharged Patients'}
                            </h3>
                            <span className="text-xs text-gray-400">{admissions.length} records</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        {['Patient', 'Ward / Bed', 'Diagnosis', 'Doctor', 'Days', 'Status'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr><td colSpan={6} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                                    ) : admissions.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-16">
                                            <Bed className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-400 text-sm font-medium">No admissions found</p>
                                        </td></tr>
                                    ) : admissions.map((adm: any) => (
                                        <tr key={adm.admission_id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="font-medium text-gray-900">{adm.patient?.full_name || 'Unknown'}</span>
                                                <span className="block text-[10px] font-mono text-gray-400">{adm.patient?.patient_id || adm.patient_id}</span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {adm.wardName || 'N/A'}
                                                <span className="block text-[10px] text-gray-400">{adm.bed_id || '-'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">{adm.diagnosis || '-'}</td>
                                            <td className="px-4 py-3 text-gray-500">{adm.doctor_name || '-'}</td>
                                            <td className="px-4 py-3 text-gray-700 font-semibold">{adm.daysAdmitted || 0}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusColor(adm.status)}`}>
                                                    {adm.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* QUICK LINKS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Link href="/ipd/bed-matrix"
                            className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-blue-300 transition-all flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-xl"><Bed className="h-5 w-5 text-blue-500" /></div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900">Bed Matrix</h4>
                                    <p className="text-xs text-gray-400">Visual bed management</p>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                        </Link>
                        <Link href="/ipd/nursing-station"
                            className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-violet-300 transition-all flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-violet-50 rounded-xl"><Heart className="h-5 w-5 text-violet-500" /></div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900">Nursing Station</h4>
                                    <p className="text-xs text-gray-400">Tasks & patient care</p>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-500" />
                        </Link>
                        <Link href="/ipd/ward-rounds"
                            className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-300 transition-all flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-teal-50 rounded-xl"><ClipboardList className="h-5 w-5 text-teal-500" /></div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900">Ward Rounds</h4>
                                    <p className="text-xs text-gray-400">Doctor rounds & notes</p>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500" />
                        </Link>
                    </div>
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-4">
                    <Link
                        href="/admin/ipd-setup"
                        className="group bg-white border border-gray-200 shadow-sm rounded-2xl p-6 flex items-center justify-between hover:border-blue-300 transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 rounded-xl">
                                <Bed className="h-6 w-6 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Ward & Bed Management</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Configure wards, beds, departments & IPD inventory</p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </Link>
                </div>
            )}
        </ModuleHubLayout>
    );
}
