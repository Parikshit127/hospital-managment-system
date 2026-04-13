'use client';

import React, { useState, useEffect } from 'react';
import {
    Bed, RefreshCw, Loader2, ArrowLeft, User, Clock, Stethoscope,
    AlertTriangle, Shield, CheckCircle, Wrench, Sparkles, Ban, Activity
} from 'lucide-react';
import Link from 'next/link';
import { getWardsWithBeds, getAllBeds, markBedAvailable } from '@/app/actions/ipd-actions';
import { AppShell } from '@/app/components/layout/AppShell';

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
    Available: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle, label: 'Available' },
    Occupied: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', icon: User, label: 'Occupied' },
    Cleaning: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Sparkles, label: 'Cleaning' },
    Reserved: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Shield, label: 'Reserved' },
    Maintenance: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: Wrench, label: 'Maintenance' },
    Isolation: { color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: AlertTriangle, label: 'Isolation' },
    Blocked: { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: Ban, label: 'Blocked' },
};

export default function BedMatrixPage() {
    const [wards, setWards] = useState<any[]>([]);
    const [beds, setBeds] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [markingAvailable, setMarkingAvailable] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleMarkAvailable = async (bedId: string) => {
        setMarkingAvailable(bedId);
        const res = await markBedAvailable(bedId);
        if (res.success) {
            showToast(`Bed ${bedId} marked as Available`);
            await loadData();
        } else {
            showToast(res.error || 'Failed to update bed', 'error');
        }
        setMarkingAvailable(null);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [wardRes, bedRes] = await Promise.all([
                getWardsWithBeds(),
                getAllBeds(),
            ]);
            if (wardRes.success) setWards(wardRes.data || []);
            if (bedRes.success) setBeds(bedRes.data || []);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('Bed matrix load error:', err);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => { loadData(); }, 30000);
        return () => clearInterval(interval);
    }, []);

    const totalBeds = beds.length;
    const occupied = beds.filter(b => b.status === 'Occupied').length;
    const available = beds.filter(b => b.status === 'Available').length;
    const cleaning = beds.filter(b => b.status === 'Cleaning').length;
    const occupancyRate = totalBeds > 0 ? ((occupied / totalBeds) * 100).toFixed(1) : '0';

    const getBedsByWard = (wardId: number) => beds.filter(b => b.ward_id === wardId);

    const getDaysStayed = (admissionDate: string) => {
        return Math.ceil((new Date().getTime() - new Date(admissionDate).getTime()) / (1000 * 60 * 60 * 24));
    };

    return (
        <AppShell
            pageTitle="Bed Matrix"
            pageIcon={<Activity className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
            headerActions={
                <span className="text-[10px] text-gray-400 font-mono">
                    Last updated: {lastRefresh.toLocaleTimeString()}
                </span>
            }
        >
            <div className="space-y-6">
                {/* TOAST */}
                {toast && (
                    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-bold text-white transition-all ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                        {toast.message}
                    </div>
                )}
                {/* SUMMARY BAR */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                        { label: 'Total Beds', value: totalBeds, color: 'from-slate-400 to-slate-500' },
                        { label: 'Occupied', value: occupied, color: 'from-rose-400 to-rose-500' },
                        { label: 'Available', value: available, color: 'from-emerald-400 to-emerald-500' },
                        { label: 'Cleaning', value: cleaning, color: 'from-amber-400 to-amber-500' },
                        { label: 'Occupancy', value: `${occupancyRate}%`, color: 'from-violet-400 to-indigo-500' },
                    ].map((stat) => (
                        <div key={stat.label} className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{stat.label}</p>
                            <p className={`text-2xl font-black mt-1 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                                {stat.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* STATUS LEGEND */}
                <div className="flex flex-wrap items-center gap-3">
                    {Object.entries(statusConfig).map(([status, cfg]) => (
                        <div key={status} className="flex items-center gap-1.5">
                            <div className={`w-3 h-3 rounded-sm ${cfg.bg} ${cfg.border} border`} />
                            <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                        </div>
                    ))}
                </div>

                {/* WARD GRIDS */}
                {loading && beds.length === 0 ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {wards.map((ward) => {
                            const wardBeds = getBedsByWard(ward.ward_id);
                            if (wardBeds.length === 0) return null;

                            return (
                                <div key={ward.ward_id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-sm font-black text-gray-900">{ward.ward_name}</h3>
                                            <p className="text-[10px] text-gray-400 font-medium">
                                                {ward.ward_type} &bull; {ward.totalBeds} beds &bull; {ward.available} free
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                {ward.available} Available
                                            </span>
                                            <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                                                {ward.occupied} Occupied
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                        {wardBeds.map((bed: any) => {
                                            const cfg = statusConfig[bed.status] || statusConfig.Available;
                                            const StatusIcon = cfg.icon;
                                            const activeAdmission = bed.admissions?.[0];
                                            const days = activeAdmission ? getDaysStayed(activeAdmission.admission_date) : 0;

                                            return (
                                                <div key={bed.bed_id}
                                                    className={`${cfg.bg} border ${cfg.border} rounded-xl p-3 transition-all hover:scale-[1.02] cursor-default`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`text-xs font-black ${cfg.color}`}>
                                                            {bed.bed_id}
                                                        </span>
                                                        <StatusIcon className={`h-3 w-3 ${cfg.color}`} />
                                                    </div>

                                                    {activeAdmission ? (
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-bold text-gray-900 truncate" title={activeAdmission.patient?.full_name}>
                                                                {activeAdmission.patient?.full_name || 'Unknown'}
                                                            </p>
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="h-2.5 w-2.5 text-gray-400" />
                                                                <span className="text-[9px] text-gray-400 font-medium">
                                                                    {days}d
                                                                </span>
                                                            </div>
                                                            {activeAdmission.doctor_name && (
                                                                <div className="flex items-center gap-1">
                                                                    <Stethoscope className="h-2.5 w-2.5 text-gray-300" />
                                                                    <span className="text-[9px] text-gray-300 font-medium truncate">
                                                                        {activeAdmission.doctor_name}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : bed.status === 'Cleaning' ? (
                                                        <div className="space-y-2 mt-1">
                                                            <p className="text-[10px] font-bold text-amber-500">Cleaning in progress</p>
                                                            <button
                                                                onClick={() => handleMarkAvailable(bed.bed_id)}
                                                                disabled={markingAvailable === bed.bed_id}
                                                                className="w-full flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-[9px] font-black py-1 px-2 rounded-lg transition-all"
                                                            >
                                                                {markingAvailable === bed.bed_id ? (
                                                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                                ) : (
                                                                    <CheckCircle className="h-2.5 w-2.5" />
                                                                )}
                                                                Mark Available
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className={`text-[10px] font-bold ${cfg.color} opacity-60`}>
                                                            {bed.status}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
