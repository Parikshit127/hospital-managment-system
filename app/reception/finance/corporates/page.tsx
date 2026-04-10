'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Plus, Edit2, ToggleLeft, ToggleRight, Loader2, X, Save } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getAllCorporateMasters, createCorporateMaster, updateCorporateMaster } from '@/app/actions/patient-type-actions';

type Corporate = {
    id: string;
    company_name: string;
    company_code: string;
    contact_person: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    credit_limit: string | number;
    discount_percentage: string | number;
    payment_terms_days: number;
    contract_start: string | Date | null;
    contract_end: string | Date | null;
    is_active: boolean;
};

const EMPTY_FORM = {
    company_name: '',
    company_code: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    credit_limit: 0,
    discount_percentage: 0,
    payment_terms_days: 30,
    contract_start: '',
    contract_end: '',
};

export default function CorporatesPage() {
    const [corporates, setCorporates] = useState<Corporate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { load(); }, []);

    async function load() {
        setIsLoading(true);
        const r = await getAllCorporateMasters();
        if (r.success) setCorporates(r.data as Corporate[]);
        setIsLoading(false);
    }

    function openCreate() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError('');
        setShowModal(true);
    }

    function openEdit(c: Corporate) {
        setEditingId(c.id);
        setForm({
            company_name: c.company_name,
            company_code: c.company_code,
            contact_person: c.contact_person || '',
            contact_phone: c.contact_phone || '',
            contact_email: c.contact_email || '',
            credit_limit: Number(c.credit_limit),
            discount_percentage: Number(c.discount_percentage),
            payment_terms_days: c.payment_terms_days,
            contract_start: c.contract_start ? new Date(c.contract_start).toISOString().split('T')[0] : '',
            contract_end: c.contract_end ? new Date(c.contract_end).toISOString().split('T')[0] : '',
        });
        setError('');
        setShowModal(true);
    }

    async function handleSave() {
        if (!form.company_name || !form.company_code) {
            setError('Company name and code are required');
            return;
        }
        setIsSaving(true);
        setError('');
        const r = editingId
            ? await updateCorporateMaster(editingId, form)
            : await createCorporateMaster(form);
        if (r.success) {
            setShowModal(false);
            await load();
        } else {
            setError(r.error || 'Failed to save');
        }
        setIsSaving(false);
    }

    async function toggleActive(c: Corporate) {
        await updateCorporateMaster(c.id, { is_active: !c.is_active });
        await load();
    }

    const inputClass = "w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all";
    const labelClass = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]";

    return (
        <AppShell pageTitle="Corporate Masters" pageIcon={<Building2 className="h-5 w-5" />}>
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">Corporate Companies</h2>
                        <p className="text-gray-500 text-sm mt-0.5">Manage corporate billing agreements</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all"
                    >
                        <Plus className="h-4 w-4" /> Add Corporate
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : corporates.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                        <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No corporate companies yet</p>
                        <button onClick={openCreate} className="mt-4 text-sm font-bold text-blue-600 hover:underline">
                            Add your first corporate
                        </button>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {['Company', 'Code', 'Contact', 'Credit Limit', 'Discount', 'Terms', 'Status', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {corporates.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-gray-900">{c.company_name}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.company_code}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {c.contact_person || '—'}
                                            {c.contact_phone && <span className="block text-xs text-gray-400">{c.contact_phone}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">₹{Number(c.credit_limit).toLocaleString('en-IN')}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                {Number(c.discount_percentage)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{c.payment_terms_days}d</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => toggleActive(c)}>
                                                {c.is_active
                                                    ? <ToggleRight className="h-5 w-5 text-teal-500" />
                                                    : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all">
                                                <Edit2 className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h3 className="font-black text-gray-900">{editingId ? 'Edit Corporate' : 'Add Corporate'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1">
                                    <label className={labelClass}>Company Name *</label>
                                    <input className={inputClass} value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Tata Consultancy Services" />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Company Code *</label>
                                    <input className={inputClass} value={form.company_code} onChange={e => setForm(f => ({ ...f, company_code: e.target.value.toUpperCase() }))} placeholder="TCS" />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Payment Terms (days)</label>
                                    <input type="number" className={inputClass} value={form.payment_terms_days} onChange={e => setForm(f => ({ ...f, payment_terms_days: parseInt(e.target.value) || 30 }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Credit Limit (₹)</label>
                                    <input type="number" className={inputClass} value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Discount %</label>
                                    <input type="number" min="0" max="100" step="0.5" className={inputClass} value={form.discount_percentage} onChange={e => setForm(f => ({ ...f, discount_percentage: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Contact Person</label>
                                    <input className={inputClass} value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Contact Phone</label>
                                    <input className={inputClass} value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className={labelClass}>Contact Email</label>
                                    <input type="email" className={inputClass} value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Contract Start</label>
                                    <input type="date" className={inputClass} value={form.contract_start} onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Contract End</label>
                                    <input type="date" className={inputClass} value={form.contract_end} onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {editingId ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
