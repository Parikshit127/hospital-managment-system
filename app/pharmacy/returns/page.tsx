'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { RotateCcw, AlertTriangle, CheckCircle, Search, FileText, IndianRupee } from 'lucide-react';
import { processReturn, searchMedicine } from '@/app/actions/pharmacy-actions';

export default function ReturnsPage() {
    const [returnType, setReturnType] = useState<'Patient' | 'Expired'>('Expired');
    const [medicines, setMedicines] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<any>(null);

    const [form, setForm] = useState({
        medicine_id: '',
        medicine_name: '',
        batch_id: '',
        quantity: '',
        reason: '',
        invoice_id: '',
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
        setResult(null);

        const res = await processReturn({
            return_type: returnType,
            medicine_id: Number(form.medicine_id),
            batch_id: form.batch_id || undefined,
            quantity: Number(form.quantity),
            reason: form.reason,
            invoice_id: form.invoice_id ? Number(form.invoice_id) : undefined,
        });

        if (res.success) {
            setResult(res);
            setForm({ medicine_id: '', medicine_name: '', batch_id: '', quantity: '', reason: '', invoice_id: '' });
            setSearchQuery('');
        } else {
            alert(res.error || 'Failed to process return');
        }
        setSaving(false);
    };

    return (
        <AppShell pageTitle="Pharmacy Returns & Expiry" pageIcon={<RotateCcw className="h-5 w-5" />}>
            <div className="max-w-3xl mx-auto">
                {/* Mode Switcher */}
                <div className="bg-white p-1.5 rounded-xl border border-gray-200 mb-6 flex gap-1.5">
                    <button
                        onClick={() => { setReturnType('Expired'); setResult(null); }}
                        className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all flex justify-center items-center gap-2 ${returnType === 'Expired' ? 'bg-red-50 text-red-700 border border-red-200' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <AlertTriangle className="h-4 w-4" /> Expired Stock / Damage
                    </button>
                    <button
                        onClick={() => { setReturnType('Patient'); setResult(null); }}
                        className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all flex justify-center items-center gap-2 ${returnType === 'Patient' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <RotateCcw className="h-4 w-4" /> Patient Returns
                    </button>
                </div>

                {/* Success Result */}
                {result && (
                    <div className={`mb-6 rounded-2xl border p-5 ${result.credit_note_id ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex items-start gap-3">
                            <CheckCircle className={`h-5 w-5 mt-0.5 ${result.credit_note_id ? 'text-emerald-600' : 'text-blue-600'}`} />
                            <div>
                                <p className="font-bold text-gray-900">Return processed successfully</p>
                                {result.refund_amount > 0 && (
                                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                                        <IndianRupee className="h-3.5 w-3.5" /> Refund value: <span className="font-bold">₹{result.refund_amount.toFixed(2)}</span>
                                    </p>
                                )}
                                {result.credit_note_id && (
                                    <p className="text-sm text-emerald-700 mt-1 flex items-center gap-1">
                                        <FileText className="h-3.5 w-3.5" /> Credit Note #{result.credit_note_id} created and linked to invoice
                                    </p>
                                )}
                                {!result.credit_note_id && returnType === 'Patient' && (
                                    <p className="text-xs text-gray-500 mt-1">No invoice linked — stock adjusted only. Provide invoice ID for credit note generation.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    <h2 className="font-bold text-gray-900 mb-1 text-lg">
                        {returnType === 'Expired' ? 'Write-Off Expired/Damaged Inventory' : 'Process Patient Return'}
                    </h2>
                    <p className="text-xs text-gray-400 mb-6">
                        {returnType === 'Expired'
                            ? 'Deducts stock and logs write-off for expiry/wastage analytics.'
                            : 'Adds stock back to inventory. Link an invoice for automatic credit note and GL reversal.'}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Medicine Search */}
                        <div className="relative">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5 ml-1">Medicine *</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={form.medicine_name || searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setForm({ ...form, medicine_name: '', medicine_id: '' }); }}
                                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
                                    placeholder="Search by medicine name..."
                                />
                            </div>
                            {medicines.length > 0 && !form.medicine_id && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
                                    {medicines.map((m: any) => (
                                        <div key={m.id}
                                            onClick={() => { setForm({ ...form, medicine_id: m.id, medicine_name: m.brand_name }); setMedicines([]); setSearchQuery(''); }}
                                            className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                                            <p className="font-bold text-sm text-gray-900">{m.brand_name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {m.generic_name && <span className="text-[10px] text-gray-500">{m.generic_name}</span>}
                                                {m.batches?.length > 0 && (
                                                    <span className="text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded font-bold border border-teal-100">
                                                        {m.batches.reduce((s: number, b: any) => s + b.current_stock, 0)} in stock
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5 ml-1">Batch Number</label>
                                <input value={form.batch_id} onChange={e => setForm({ ...form, batch_id: e.target.value })}
                                    className="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm font-mono font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none text-gray-900 placeholder:text-gray-400"
                                    placeholder="e.g. BATCH-A1" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5 ml-1">Quantity *</label>
                                <input required type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                                    className="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none text-gray-900 placeholder:text-gray-400"
                                    placeholder="0" />
                            </div>
                        </div>

                        {/* Invoice ID for patient returns */}
                        {returnType === 'Patient' && (
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5 ml-1">
                                    Invoice ID <span className="text-gray-300 font-medium normal-case">(for credit note generation)</span>
                                </label>
                                <input value={form.invoice_id} onChange={e => setForm({ ...form, invoice_id: e.target.value })}
                                    type="number"
                                    className="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm font-mono font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none text-gray-900 placeholder:text-gray-400"
                                    placeholder="Optional — enter original invoice ID for refund" />
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5 ml-1">Reason / Notes *</label>
                            <textarea required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                                className="w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none h-20 resize-none text-gray-900 placeholder:text-gray-400"
                                placeholder={returnType === 'Expired' ? 'e.g. Expired on shelf, batch not rotated' : 'e.g. Patient returned unopened strip, adverse reaction'} />
                        </div>

                        <div className="pt-3 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving || !form.medicine_id || !form.quantity}
                                className={`flex items-center gap-2 px-6 py-3 font-bold text-white rounded-xl transition-all disabled:opacity-40 shadow-lg ${
                                    returnType === 'Expired'
                                        ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 shadow-red-500/20'
                                        : 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 shadow-teal-500/20'
                                }`}
                            >
                                <CheckCircle className="h-4 w-4" />
                                {saving ? 'Processing...' : returnType === 'Expired' ? 'Write Off & Deduct Stock' : 'Process Return & Restock'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AppShell>
    );
}
