'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Users, Search, ClipboardEdit } from 'lucide-react';
import { getIPDAdmissions, recordWardRound } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';

export default function WardRoundsPage() {
    const toast = useToast();
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // modal
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedAd, setSelectedAd] = useState<any>(null);
    const [observations, setObservations] = useState('');
    const [planChanges, setPlanChanges] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setRefreshing(true);
        const res = await getIPDAdmissions('Admitted');
        if (res.success) setAdmissions(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    const filteredAds = admissions.filter(a =>
        a.patient?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.bed_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.doctor_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const res = await recordWardRound({
            admission_id: selectedAd.admission_id,
            observations,
            plan_changes: planChanges
        });
        if (res.success) {
            setModalOpen(false);
            setObservations('');
            setPlanChanges('');
            loadData();
        } else toast.error('Failed to record round.');
        setSaving(false);
    };

    return (
        <AppShell
            pageTitle="Clinical Ward Rounds"
            pageIcon={<Users className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text" placeholder="Search patient or doctor..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Location / Bed</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Patient</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Attending</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Days Admitted</th>
                                <th className="px-6 py-4 right-align">Rounds Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredAds.map(a => (
                                <tr key={a.admission_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-gray-600 font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded-md font-bold uppercase text-[10px] tracking-wider">{a.bed_id}</span>
                                            <span className="text-xs truncate">{a.wardName}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-black text-gray-900">{a.patient?.full_name}</td>
                                    <td className="px-6 py-4 text-gray-500">Dr. {a.doctor_name}</td>
                                    <td className="px-6 py-4 font-bold text-gray-700">{a.daysAdmitted} Days</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => { setSelectedAd(a); setModalOpen(true); }} className="text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-200 px-3 py-1.5 rounded-lg font-bold text-xs inline-flex items-center gap-2 transition-all">
                                            <ClipboardEdit className="h-4 w-4" /> Log Observation
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Ward Round Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleRecord} className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-teal-600 to-emerald-600 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2"><ClipboardEdit className="h-5 w-5" /> Clinical Round Notes</h3>
                            <button type="button" onClick={() => setModalOpen(false)} className="text-teal-100 hover:text-white transition-colors">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-4 mb-2 pb-4 border-b border-gray-100">
                                <div className="flex-1">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Patient</p>
                                    <p className="font-black text-gray-900 text-lg">{selectedAd?.patient?.full_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Location</p>
                                    <p className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">{selectedAd?.bed_id}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">SOAP: Subjective & Objective Observations</label>
                                <textarea required value={observations} onChange={e => setObservations(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 text-sm outline-none transition-colors min-h-[120px]" placeholder="Patient reports feeling..." />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">SOAP: Assessment & Plan</label>
                                <textarea required value={planChanges} onChange={e => setPlanChanges(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 text-sm outline-none transition-colors min-h-[120px]" placeholder="Continue IV antibiotics, step down to oral tomorrow..." />
                            </div>

                            <button disabled={saving} type="submit" className="w-full text-center py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50">
                                Sign & Save Round Note
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
