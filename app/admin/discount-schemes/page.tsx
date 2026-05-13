'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    Scissors, Plus, X, Loader2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
    getDiscountSchemes,
    createDiscountScheme,
} from '@/app/actions/finance-actions';

interface DiscountScheme {
    id: string;
    name: string;
    scheme_type: string;
    value: number;
    applicable_to: string[] | null;
    valid_from: string | null;
    valid_to: string | null;
    requires_otp: boolean;
    is_active: boolean;
    created_at: string;
}

const APPLICABLE_OPTIONS = ['OPD', 'IPD', 'Pharmacy', 'Lab'];

export default function DiscountSchemesPage() {
    const [schemes, setSchemes] = useState<DiscountScheme[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [schemeType, setSchemeType] = useState<'Percentage' | 'Flat'>('Percentage');
    const [value, setValue] = useState('');
    const [applicableTo, setApplicableTo] = useState<string[]>([]);
    const [validFrom, setValidFrom] = useState('');
    const [validTo, setValidTo] = useState('');
    const [requiresOtp, setRequiresOtp] = useState(false);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3500);
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getDiscountSchemes();
        if (res.success) setSchemes(res.data as DiscountScheme[]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const resetForm = () => {
        setName(''); setSchemeType('Percentage'); setValue('');
        setApplicableTo([]); setValidFrom(''); setValidTo('');
        setRequiresOtp(false);
    };

    const toggleApplicable = (opt: string) => {
        setApplicableTo(prev =>
            prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
        );
    };

    const handleCreate = async () => {
        if (!name.trim()) return showToast('error', 'Name is required');
        if (!value || isNaN(Number(value))) return showToast('error', 'Valid value is required');
        setSaving(true);
        const res = await createDiscountScheme({
            name: name.trim(),
            scheme_type: schemeType,
            value: Number(value),
            applicable_to: applicableTo.length > 0 ? applicableTo : undefined,
            valid_from: validFrom || undefined,
            valid_to: validTo || undefined,
            requires_otp: requiresOtp,
        });
        setSaving(false);
        if (res.success) {
            showToast('success', 'Discount scheme created');
            setModalOpen(false);
            resetForm();
            loadData();
        } else {
            showToast('error', res.error || 'Failed to create');
        }
    };

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <AdminPage
            pageTitle="Discount Schemes"
            pageIcon={<Scissors className="w-5 h-5 text-purple-600" />}
            headerActions={
                <button
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    New Scheme
                </button>
            }
            onRefresh={loadData}
            refreshing={loading}
        >
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Value</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Applicable To</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Valid Period</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">OTP Required</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                            ) : schemes.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No discount schemes yet.</td></tr>
                            ) : schemes.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.scheme_type === 'Percentage' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {s.scheme_type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-900 font-medium">
                                        {s.scheme_type === 'Percentage' ? `${s.value}%` : `₹${s.value.toLocaleString()}`}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {Array.isArray(s.applicable_to) && s.applicable_to.length > 0
                                            ? s.applicable_to.join(', ')
                                            : 'All'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">
                                        {formatDate(s.valid_from)} – {formatDate(s.valid_to)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {s.requires_otp
                                            ? <span className="text-amber-600 font-medium text-xs">Yes</span>
                                            : <span className="text-gray-400 text-xs">No</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {s.is_active
                                            ? <span className="flex items-center gap-1 text-green-600"><ToggleRight className="w-4 h-4" /> Active</span>
                                            : <span className="flex items-center gap-1 text-gray-400"><ToggleLeft className="w-4 h-4" /> Inactive</span>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">New Discount Scheme</h2>
                            <button onClick={() => { setModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    placeholder="e.g. Senior Citizen Discount"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                                    <select
                                        value={schemeType}
                                        onChange={e => setSchemeType(e.target.value as 'Percentage' | 'Flat')}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    >
                                        <option value="Percentage">Percentage</option>
                                        <option value="Flat">Flat</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Value * {schemeType === 'Percentage' ? '(%)' : '(₹)'}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={value}
                                        onChange={e => setValue(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Applicable To</label>
                                <div className="flex flex-wrap gap-2">
                                    {APPLICABLE_OPTIONS.map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => toggleApplicable(opt)}
                                            className={`px-3 py-1 rounded-full text-sm border transition-colors ${applicableTo.includes(opt)
                                                ? 'bg-purple-600 text-white border-purple-600'
                                                : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                                                }`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Leave empty to apply to all</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                                    <input
                                        type="date"
                                        value={validFrom}
                                        onChange={e => setValidFrom(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
                                    <input
                                        type="date"
                                        value={validTo}
                                        onChange={e => setValidTo(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setRequiresOtp(!requiresOtp)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${requiresOtp ? 'bg-purple-600' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requiresOtp ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <label className="text-sm text-gray-700">Requires OTP Approval</label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => { setModalOpen(false); resetForm(); }}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create Scheme
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
