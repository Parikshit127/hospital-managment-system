'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { MoveRight, Search, Bed } from 'lucide-react';
import { getIPDAdmissions, getAllBeds, transferPatient } from '@/app/actions/ipd-actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/components/ui/Toast';

export default function TransferPage() {
    const toast = useToast();
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [beds, setBeds] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedAd, setSelectedAd] = useState<any>(null);
    const [newBedId, setNewBedId] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setRefreshing(true);
        const [admRes, bedRes] = await Promise.all([
            getIPDAdmissions('Admitted'),
            getAllBeds()
        ]);
        if (admRes.success) setAdmissions(admRes.data);
        if (bedRes.success) setBeds(bedRes.data.filter((b: any) => b.status === 'Available'));
        setRefreshing(false);
    };

    useEffect(() => { loadData(); }, []);

    const filteredAds = admissions.filter(a =>
        a.patient?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.bed_id?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const res = await transferPatient({
            admission_id: selectedAd.admission_id,
            to_bed_id: newBedId,
            reason: transferReason
        });
        if (res.success) {
            setModalOpen(false);
            setTransferReason('');
            setNewBedId('');
            loadData();
        } else toast.error(res.error || 'Transfer failed');
        setSaving(false);
    };

    return (
        <AppShell
            pageTitle="Inter-Ward Patient Transfer"
            pageIcon={<MoveRight className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text" placeholder="Search admitted patient or bed..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Patient</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Current Ward</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Current Bed</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Admitted</th>
                                <th className="px-6 py-4 right-align">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredAds.map(a => (
                                <tr key={a.admission_id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-bold text-gray-900">{a.patient?.full_name}</td>
                                    <td className="px-6 py-4 text-gray-600">{a.wardName}</td>
                                    <td className="px-6 py-4"><span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-bold uppercase">{a.bed_id}</span></td>
                                    <td className="px-6 py-4 text-gray-500">{new Date(a.admission_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => { setSelectedAd(a); setModalOpen(true); }} className="text-teal-600 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition-colors">
                                            <MoveRight className="h-3 w-3" /> Initiate Transfer
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleTransfer} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2"><MoveRight className="h-5 w-5 text-indigo-600" /> Transfer Protocol</h3>
                            <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg block">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Transferring Patient</p>
                                <p className="font-black text-gray-900">{selectedAd?.patient?.full_name}</p>
                                <p className="text-xs text-gray-600 mt-1">From: <span className="font-bold text-indigo-700">{selectedAd?.wardName} ({selectedAd?.bed_id})</span></p>
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Select Destination Bed *</label>
                                <select required value={newBedId} onChange={e => setNewBedId(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500/20 text-sm font-medium outline-none">
                                    <option value="">-- Assign new bed --</option>
                                    {beds.map(b => (
                                        <option key={b.bed_id} value={b.bed_id}>{b.wards?.ward_name} - {b.bed_id} ({b.wards?.ward_type})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Clinical Reason *</label>
                                <textarea required value={transferReason} onChange={e => setTransferReason(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl min-h-[80px] text-sm focus:ring-2 focus:ring-teal-500/20 outline-none" placeholder="ICU step-down, patient request, clinical change..." />
                            </div>

                            <button disabled={saving} type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold p-3 rounded-xl shadow-md transition-all">Submit Transfer</button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
