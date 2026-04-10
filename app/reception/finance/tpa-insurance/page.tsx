'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit2, ToggleLeft, ToggleRight, Loader2, X, Save, Shield } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getAllTpaProviders, createTpaProvider, updateTpaProvider } from '@/app/actions/patient-type-actions';

type TpaProvider = {
    id: number;
    provider_name: string;
    provider_code: string;
    tpa_type: string | null;
    contact_person: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    pre_auth_required: boolean;
    claim_submission_mode: string;
    default_discount_percentage: string | number;
    payment_terms_days: number;
    is_active: boolean;
};

const EMPTY_FORM = {
    provider_name: '',
    provider_code: '',
    tpa_type: 'tpa',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    pre_auth_required: true,
    claim_submission_mode: 'online',
    default_discount_percentage: 0,
    payment_terms_days: 45,
};

export default function TpaInsurancePage() {
    const [providers, setProviders] = useState<TpaProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { load(); }, []);

    async function load() {
        setIsLoading(true);
        const r = await getAllTpaProviders();
        if (r.success) setProviders(r.data as TpaProvider[]);
        setIsLoading(false);
    }

    function openCreate() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError('');
        setShowModal(true);
    }

    function openEdit(p: TpaProvider) {
        setEditingId(p.id);
        setForm({
            provider_name: p.provider_name,
            provider_code: p.provider_code,
            tpa_type: p.tpa_type || 'tpa',
            contact_person: p.contact_person || '',
            contact_phone: p.contact_phone || '',
            contact_email: p.contact_email || '',
            pre_auth_required: p.pre_auth_required,
            claim_submission_mode: p.claim_submission_mode,
            default_discount_percentage: Number(p.default_discount_percentage),
            payment_terms_days: p.payment_terms_days,
        });
        setError('');
        setShowModal(true);
    }

    async function handleSave() {
        if (!form.provider_name || !form.provider_code) {
            setError('Provider name and code are required');
            return;
        }
        setIsSaving(true);
        setError('');
        const r = editingId
            ? await updateTpaProvider(editingId, form)
            : await createTpaProvider(form);
        if (r.success) {
            setShowModal(false);
            await load();
        } else {
            setError(r.error || 'Failed to save');
        }
        setIsSaving(false);
    }

    async function toggleActive(p: TpaProvider) {
        await updateTpaProvider(p.id, { is_active: !p.is_active });
        await load();
    }

    const inputClass = "w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all";
    const labelClass = "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]";

    return (
        <AppShell pageTitle="TPA / Insurance Masters" pageIcon={<FileText className="h-5 w-5" />}>
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">TPA / Insurance Companies</h2>
                        <p className="text-gray-500 text-sm mt-0.5">Manage TPA and insurance provider agreements</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-all"
                    >
                        <Plus className="h-4 w-4" /> Add Provider
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : providers.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No TPA / Insurance providers yet</p>
                        <button onClick={openCreate} className="mt-4 text-sm font-bold text-amber-600 hover:underline">
                            Add your first provider
                        </button>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {['Provider', 'Code', 'Type', 'Pre-Auth', 'Claim Mode', 'Discount', 'Terms', 'Status', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {providers.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-gray-900">{p.provider_name}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.provider_code}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 capitalize">
                                                {p.tpa_type?.replace('_', ' ') || 'TPA'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {p.pre_auth_required
                                                ? <span className="flex items-center gap-1 text-xs font-bold text-red-600"><Shield className="h-3 w-3" />Required</span>
                                                : <span className="text-xs text-gray-400">Not required</span>}
                                        </td>
                                        <td className="px-4 py-3 capitalize text-gray-600 text-xs">{p.claim_submission_mode}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                {Number(p.default_discount_percentage)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{p.payment_terms_days}d</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => toggleActive(p)}>
                                                {p.is_active
                                                    ? <ToggleRight className="h-5 w-5 text-teal-500" />
                                                    : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-all">
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
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
                            <h3 className="font-black text-gray-900">{editingId ? 'Edit Provider' : 'Add TPA / Insurance'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1">
                                    <label className={labelClass}>Provider Name *</label>
                                    <input className={inputClass} value={form.provider_name} onChange={e => setForm(f => ({ ...f, provider_name: e.target.value }))} placeholder="Star Health Insurance" />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Provider Code *</label>
                                    <input className={inputClass} value={form.provider_code} onChange={e => setForm(f => ({ ...f, provider_code: e.target.value.toUpperCase() }))} placeholder="STAR" />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Type</label>
                                    <select className={inputClass} value={form.tpa_type} onChange={e => setForm(f => ({ ...f, tpa_type: e.target.value }))}>
                                        <option value="tpa">TPA</option>
                                        <option value="insurance_direct">Insurance Direct</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Claim Submission</label>
                                    <select className={inputClass} value={form.claim_submission_mode} onChange={e => setForm(f => ({ ...f, claim_submission_mode: e.target.value }))}>
                                        <option value="online">Online</option>
                                        <option value="manual">Manual</option>
                                        <option value="mixed">Mixed</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Pre-Auth Required</label>
                                    <select className={inputClass} value={form.pre_auth_required ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, pre_auth_required: e.target.value === 'yes' }))}>
                                        <option value="yes">Yes</option>
                                        <option value="no">No</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Default Discount %</label>
                                    <input type="number" min="0" max="100" step="0.5" className={inputClass} value={form.default_discount_percentage} onChange={e => setForm(f => ({ ...f, default_discount_percentage: parseFloat(e.target.value) || 0 }))} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelClass}>Payment Terms (days)</label>
                                    <input type="number" className={inputClass} value={form.payment_terms_days} onChange={e => setForm(f => ({ ...f, payment_terms_days: parseInt(e.target.value) || 45 }))} />
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
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50">
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
