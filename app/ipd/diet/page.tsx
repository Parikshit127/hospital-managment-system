'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Utensils, Search, UtensilsCrossed } from 'lucide-react';
import { getIPDAdmissions, assignDietPlan } from '@/app/actions/ipd-actions';
import { useToast } from '@/app/components/ui/Toast';

export default function DietPage() {
    const toast = useToast();
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // modal
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedAd, setSelectedAd] = useState<any>(null);
    const [dietType, setDietType] = useState('NPO');
    const [instructions, setInstructions] = useState('');
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
        a.bed_id?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const res = await assignDietPlan({
            admission_id: selectedAd.admission_id,
            diet_type: dietType,
            instructions
        });
        if (res.success) {
            setModalOpen(false);
            setInstructions('');
            loadData();
        } else {
            toast.error('Failed to assign diet');
        }
        setSaving(false);
    };

    return (
        <AppShell
            pageTitle="Clinical Dietician"
            pageIcon={<Utensils className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={refreshing}
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text" placeholder="Search admitted patient..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Patient</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Location</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase">Diagnosis</th>
                                <th className="px-6 py-4 right-align">Active Diet Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredAds.map(a => (
                                <tr key={a.admission_id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-bold text-gray-900">{a.patient?.full_name}</td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold uppercase mr-2 text-[10px] border">{a.bed_id}</span>
                                        {a.wardName}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-xs truncate max-w-[200px]">{a.diagnosis}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => { setSelectedAd(a); setModalOpen(true); }} className="text-orange-600 bg-orange-50 border border-orange-100 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-bold text-xs inline-flex items-center gap-2 transition-colors">
                                            <UtensilsCrossed className="h-3 w-3" /> Update Diet Plan
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
                    <form onSubmit={handleAssign} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2"><UtensilsCrossed className="h-4 w-4 text-orange-500" /> Assign Diet Plan</h3>
                            <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Patient</p>
                                <p className="font-black text-gray-900">{selectedAd?.patient?.full_name} ({selectedAd?.bed_id})</p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Diet Classification *</label>
                                <select value={dietType} onChange={e => setDietType(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-orange-500/20 text-sm font-bold outline-none text-gray-700">
                                    <option value="NPO">NPO (Nil Per Os - Nothing by mouth)</option>
                                    <option value="Clear Liquid">Clear Liquid Diet</option>
                                    <option value="Full Liquid">Full Liquid Diet</option>
                                    <option value="Soft">Soft / Pureed Diet</option>
                                    <option value="Regular">Regular / General Diet</option>
                                    <option value="Diabetic">Diabetic / Low Carb Diet</option>
                                    <option value="Low Sodium">Low Sodium Diet</option>
                                    <option value="Renal">Renal / Kidney Diet</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Special Restrictions / Instructions</label>
                                <textarea required value={instructions} onChange={e => setInstructions(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-orange-500/20 text-sm outline-none min-h-[100px] resize-none" placeholder="Allergies, specific feeding times, tube feeding specs..." />
                            </div>

                            <button disabled={saving} type="submit" className="w-full mt-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold p-3 rounded-xl shadow-md transition-all">
                                Establish Dietary Order
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
