'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, Activity, BedDouble, Calendar, UserRound, ArrowRight, ShieldAlert, CheckCircle2, ArrowLeftRight, X, Loader2, AlertTriangle, HeartPulse } from 'lucide-react';
import { NEWSScoreBadge } from '@/app/components/ipd/NEWSScoreBadge';
import { Input } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';
import { Select } from '@/app/components/ui/Select';
import Link from 'next/link';
import { getWardsWithBeds, transferPatient } from '@/app/actions/ipd-actions';
import { useRouter } from 'next/navigation';

export function AdmissionsDataGrid({ initialData, wards }: { initialData: any[], wards: any[] }) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Admitted' | 'Discharged'>('Admitted');
    const [wardFilter, setWardFilter] = useState<string>('All');
    
    // Transfer Modal State
    const [transferModal, setTransferModal] = useState<any | null>(null);
    const [transferForm, setTransferForm] = useState({ ward_id: '', bed_id: '', reason: '' });
    const [availableWards, setAvailableWards] = useState<any[]>([]);
    const [loadingWards, setLoadingWards] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [transferError, setTransferError] = useState('');
    const router = useRouter();

    const openTransferModal = async (adm: any) => {
        setTransferModal(adm);
        setTransferForm({ ward_id: '', bed_id: '', reason: '' });
        setTransferError('');
        setLoadingWards(true);
        try {
            const res = await getWardsWithBeds();
            if (res.success) {
                setAvailableWards(res.data || []);
            }
        } catch (err) {
            console.error('Failed to load wards', err);
        }
        setLoadingWards(false);
    };

    const handleTransfer = async () => {
        if (!transferForm.bed_id) {
            setTransferError('Please select a new bed');
            return;
        }
        setTransferring(true);
        try {
            const res = await transferPatient({
                admission_id: transferModal.admission_id,
                to_bed_id: transferForm.bed_id,
                reason: transferForm.reason || 'Manual assignment/transfer'
            });
            if (res.success) {
                setTransferModal(null);
                setTransferForm({ ward_id: '', bed_id: '', reason: '' });
                router.refresh();
            } else {
                setTransferError(res.error || 'Failed to transfer patient');
            }
        } catch (err: any) {
            setTransferError(err.message || 'An unexpected error occurred');
        }
        setTransferring(false);
    };

    // Derived strictly available beds for selected ward
    const currentWardBeds = useMemo(() => {
        const ward = availableWards.find(w => w.ward_id.toString() === transferForm.ward_id);
        if (!ward || !ward.beds) return [];
        return ward.beds.filter((b: any) => b.status === "Available");
    }, [availableWards, transferForm.ward_id]);
    
    // In a real app we'd fetch this from the server as we type,
    // but for high density fast-switching we'll filter client side for now.
    const filteredAdmissions = useMemo(() => {
        return initialData.filter(adm => {
            // Status match
            if (statusFilter !== 'All' && adm.status !== statusFilter) return false;
            
            // Ward match
            if (wardFilter !== 'All' && adm.ward_id !== Number(wardFilter)) return false;
            
            // Search match
            if (search) {
                const q = search.toLowerCase();
                const nameMatch = adm.patient?.full_name?.toLowerCase().includes(q);
                const idMatch = adm.admission_id.toLowerCase().includes(q) || adm.patient_id.toLowerCase().includes(q);
                const phoneMatch = adm.patient?.phone?.includes(q);
                if (!nameMatch && !idMatch && !phoneMatch) return false;
            }
            
            return true;
        });
    }, [initialData, search, statusFilter, wardFilter]);

    return (
        <div className="space-y-6">
            {/* Smart Filters Header */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                
                {/* Search */}
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input 
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        placeholder="Search by Name, IPD ID, or Mobile..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                    {/* Quick Toggles */}
                    <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                        {['All', 'Admitted', 'Discharged'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status as any)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${statusFilter === status ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>

                    {/* Ward Filter */}
                    <div className="shrink-0 w-48">
                        <select 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:border-teal-500"
                            value={wardFilter}
                            onChange={(e) => setWardFilter(e.target.value)}
                        >
                            <option value="All">All Wards / Units</option>
                            {wards.map((w: any) => (
                                <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* List View Components */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-200">
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Patient Identity</th>
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Location</th>
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Doctor</th>
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Timeline</th>
                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredAdmissions.length > 0 ? (
                                filteredAdmissions.map((adm) => (
                                    <tr key={adm.admission_id} className="hover:bg-teal-50/30 transition-colors group">
                                        {/* Identity */}
                                        <td className="px-5 py-4">
                                            <Link href={`/ipd/admission/${adm.admission_id}`}>
                                                <div className="flex items-center gap-3 group/name cursor-pointer">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold shrink-0">
                                                        {adm.patient?.full_name?.charAt(0) || 'P'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800 group-hover/name:text-teal-700 transition-colors">{adm.patient?.full_name || 'Unknown'}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono mt-0.5 max-w-[150px] truncate" title={adm.admission_id}>
                                                            {adm.admission_id}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        </td>
                                        
                                        {/* Location */}
                                        <td className="px-5 py-4">
                                            {adm.status === 'Discharged' ? (
                                                <span className="inline-flex flex-col">
                                                    <span className="text-xs font-bold text-gray-500">Discharged</span>
                                                    <span className="text-[10px] text-gray-400">Previously in {adm.ward?.ward_name || 'Unknown'}</span>
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                                        <BedDouble className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-gray-700">{adm.ward?.ward_name || 'Unassigned Ward'}</p>
                                                        <p className="text-[10px] text-indigo-500 font-bold mt-0.5">
                                                            {adm.bed ? `Bed ${adm.bed.bed_id.startsWith(adm.bed.organizationId + '-' + adm.bed.ward_id + '-') ? adm.bed.bed_id.slice((adm.bed.organizationId + '-' + adm.bed.ward_id + '-').length) : adm.bed.bed_id}` : 'No Bed Assigned'}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* Doctor */}
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <UserRound className="h-4 w-4 text-violet-500 bg-violet-50 p-0.5 rounded" />
                                                    <span className="font-bold whitespace-nowrap">{adm.doctor_name || 'Unassigned'}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Timeline */}
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                                                    <Calendar className="h-3 w-3 text-teal-500" />
                                                    <span className="text-teal-600">In: {new Date(adm.admission_date).toLocaleDateString()}</span>
                                                </div>
                                                {adm.expected_discharge_date && adm.status === 'Admitted' && (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                                        <Calendar className="h-3 w-3 text-violet-400" />
                                                        <span className={new Date(adm.expected_discharge_date) < new Date() ? 'text-red-500' : 'text-violet-500'}>
                                                            EDD: {new Date(adm.expected_discharge_date).toLocaleDateString()}
                                                            {new Date(adm.expected_discharge_date) < new Date() && ' ⚠'}
                                                        </span>
                                                    </div>
                                                )}
                                                {adm.news_score_latest != null && adm.status === 'Admitted' && (
                                                    <NEWSScoreBadge score={adm.news_score_latest} size="sm" />
                                                )}
                                                {adm.status === 'Discharged' && adm.discharge_date && (
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                                                        <CheckCircle2 className="h-3 w-3 text-rose-400" />
                                                        <span className="text-rose-500">Out: {new Date(adm.discharge_date).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Action */}
                                        <td className="px-5 py-4 text-right">
                                            {adm.status === 'Admitted' ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button 
                                                        onClick={() => openTransferModal(adm)}
                                                        className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all"
                                                        title="Assign/Change Bed"
                                                    >
                                                        <ArrowLeftRight className="h-4 w-4" />
                                                    </button>
                                                    <Link href={`/ipd/nursing-station/${adm.admission_id}`}>
                                                        <button className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all group-hover:scale-105 active:scale-95">
                                                            <Activity className="h-4 w-4" />
                                                            Nursing Action
                                                            <ArrowRight className="h-3 w-3 opacity-50" />
                                                        </button>
                                                    </Link>
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-bold">
                                                    <CheckCircle2 className="h-3 w-3" /> Discharged
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4}>
                                        <div className="py-16 flex flex-col items-center justify-center text-gray-400">
                                            <ShieldAlert className="h-10 w-10 mb-3 opacity-20" />
                                            <p className="text-sm font-bold text-gray-500">No Admissions Found</p>
                                            <p className="text-xs mt-1">Try adjusting your filters or search terms.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Transfer/Assign Bed Modal */}
            {transferModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <ArrowLeftRight className="h-5 w-5 text-indigo-500" /> 
                                {transferModal.bed_id ? 'Change Bed/Ward' : 'Assign Bed/Ward'}
                            </h3>
                            <button onClick={() => setTransferModal(null)} className="text-gray-400 hover:text-gray-900">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1">
                            <p className="text-sm font-bold text-gray-800">{transferModal.patient?.full_name}</p>
                            <p className="text-xs text-gray-500">
                                Current Location: 
                                <span className="font-bold ml-1 text-gray-700">
                                    {transferModal.ward?.ward_name ? `${transferModal.ward.ward_name} / Bed ${transferModal.bed_id}` : 'Unassigned'}
                                </span>
                            </p>
                        </div>

                        {loadingWards ? (
                            <div className="py-8 flex justify-center">
                                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Select New Ward</label>
                                    <select 
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm"
                                        value={transferForm.ward_id}
                                        onChange={(e) => {
                                            setTransferForm({ ...transferForm, ward_id: e.target.value, bed_id: '' });
                                            setTransferError('');
                                        }}
                                    >
                                        <option value="">Select Ward</option>
                                        {availableWards.map(w => (
                                            <option key={w.ward_id} value={w.ward_id}>{w.ward_name} ({w.available} free beds)</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Select New Bed</label>
                                    <select 
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm"
                                        value={transferForm.bed_id}
                                        onChange={(e) => {
                                            setTransferForm({ ...transferForm, bed_id: e.target.value });
                                            setTransferError('');
                                        }}
                                        disabled={!transferForm.ward_id || currentWardBeds.length === 0}
                                    >
                                        <option value="">
                                            {!transferForm.ward_id ? 'Select ward first' : currentWardBeds.length === 0 ? 'No beds available' : 'Select Bed'}
                                        </option>
                                        {currentWardBeds.map((b: any) => (
                                            <option key={b.bed_id} value={b.bed_id}>{b.bed_id}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Reason (Optional)</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm"
                                        placeholder="e.g. Condition upgraded, patient request..."
                                        value={transferForm.reason}
                                        onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                                    />
                                </div>

                                {transferError && (
                                    <p className="text-xs text-rose-500 font-bold">{transferError}</p>
                                )}

                                <button
                                    onClick={handleTransfer}
                                    disabled={transferring || !transferForm.bed_id}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                >
                                    {transferring && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Confirm Assignment
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
