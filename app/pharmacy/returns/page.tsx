'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { RotateCcw, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import { processReturn, searchMedicine } from '@/app/actions/pharmacy-actions';

export default function ReturnsPage() {
    const [returnType, setReturnType] = useState<'Patient' | 'Expired'>('Expired');
    const [medicines, setMedicines] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        medicine_id: '',
        medicine_name: '',
        batch_id: '',
        quantity: '',
        reason: ''
    });

    useEffect(() => {
        const fetchMeds = async () => {
            if (searchQuery.length > 2) {
                const res = await searchMedicine(searchQuery);
                if (res.success) setMedicines(res.data);
            } else {
                setMedicines([]);
            }
        };
        const timer = setTimeout(fetchMeds, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const res = await processReturn({
            return_type: returnType,
            medicine_id: Number(form.medicine_id),
            batch_id: form.batch_id,
            quantity: Number(form.quantity),
            reason: form.reason
        });

        if (res.success) {
            alert('Return processed successfully!');
            setForm({ medicine_id: '', medicine_name: '', batch_id: '', quantity: '', reason: '' });
            setSearchQuery('');
        } else {
            alert(res.error || 'Failed to process return');
        }
        setSaving(false);
    };

    return (
        <AppShell
            pageTitle="Pharmacy Returns & Expiry"
            pageIcon={<RotateCcw className="h-5 w-5" />}
        >
            <div className="max-w-3xl mx-auto">
                {/* Mode Switcher */}
                <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-200 mb-6 flex gap-2">
                    <button
                        onClick={() => setReturnType('Expired')}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-2 ${returnType === 'Expired' ? 'bg-red-50 text-red-700 border border-red-200' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <AlertTriangle className="h-4 w-4" /> Expired Stock / Damage
                    </button>
                    <button
                        onClick={() => setReturnType('Patient')}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-2 ${returnType === 'Patient' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <RotateCcw className="h-4 w-4" /> Patient Returns
                    </button>
                </div>

                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h2 className="font-bold text-gray-900 mb-6 text-lg">
                        {returnType === 'Expired' ? 'Write-Off Expired Inventory' : 'Add Returned Stock Back to Inventory'}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="relative">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 shadow-none">Search Medicine</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={form.medicine_name || searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setForm({ ...form, medicine_name: '', medicine_id: '' }); }}
                                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-medium"
                                    placeholder="Type to search..."
                                />
                            </div>

                            {/* Autocomplete Dropdown */}
                            {medicines.length > 0 && !form.medicine_id && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
                                    {medicines.map((m: any) => (
                                        <div
                                            key={m.id}
                                            onClick={() => { setForm({ ...form, medicine_id: m.id, medicine_name: m.brand_name }); setMedicines([]); }}
                                            className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                                        >
                                            <p className="font-bold text-sm text-gray-900">{m.brand_name}</p>
                                            <p className="text-[10px] text-gray-500">{m.generic_name}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Batch Number</label>
                                <input required value={form.batch_id} onChange={e => setForm({ ...form, batch_id: e.target.value })} className="w-full py-3 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-teal-500/20" placeholder="e.g. BATCH-A1" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Quantity</label>
                                <input required type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full py-3 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-teal-500/20" placeholder="0" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Reason / Notes</label>
                            <textarea required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full py-3 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-teal-500/20 h-24 resize-none" placeholder="Supply details about this return..." />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving || !form.medicine_id}
                                className={`flex items-center gap-2 px-6 py-3 font-bold text-white shadow-md rounded-xl transition-all disabled:opacity-50 ${returnType === 'Expired' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
                            >
                                <CheckCircle className="h-5 w-5" />
                                {returnType === 'Expired' ? 'Deduct from Inventory' : 'Add Back to Inventory'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AppShell>
    );
}
