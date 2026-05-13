'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
    Package, Plus, X, Loader2, ToggleLeft, ToggleRight, Trash2,
} from 'lucide-react';
import {
    getBillingOrderSets,
    createBillingOrderSet,
} from '@/app/actions/finance-actions';

interface OrderItem {
    name: string;
    quantity: number;
    unit_price: number;
}

interface OrderSet {
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    items: OrderItem[];
    total_amount: number;
    is_active: boolean;
    created_at: string;
}

const CATEGORIES = ['Health Check', 'Minor Procedure', 'Delivery', 'Package', 'Other'];

export default function BillingOrderSetsPage() {
    const [sets, setSets] = useState<OrderSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<OrderItem[]>([{ name: '', quantity: 1, unit_price: 0 }]);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3500);
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getBillingOrderSets();
        if (res.success) setSets(res.data as OrderSet[]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const totalAmount = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

    const addRow = () => setItems(prev => [...prev, { name: '', quantity: 1, unit_price: 0 }]);

    const removeRow = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const updateRow = (idx: number, field: keyof OrderItem, value: string | number) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
    };

    const resetForm = () => {
        setName(''); setCategory(''); setDescription('');
        setItems([{ name: '', quantity: 1, unit_price: 0 }]);
    };

    const handleCreate = async () => {
        if (!name.trim()) return showToast('error', 'Name is required');
        if (items.some(it => !it.name.trim())) return showToast('error', 'All items need a name');
        setSaving(true);
        const res = await createBillingOrderSet({
            name: name.trim(),
            category: category || undefined,
            description: description || undefined,
            items,
            total_amount: totalAmount,
        });
        setSaving(false);
        if (res.success) {
            showToast('success', 'Order set created');
            setModalOpen(false);
            resetForm();
            loadData();
        } else {
            showToast('error', res.error || 'Failed to create');
        }
    };

    return (
        <AdminPage
            pageTitle="Billing Order Sets"
            pageIcon={<Package className="w-5 h-5 text-blue-600" />}
            headerActions={
                <button
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    New Order Set
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
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Items</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Total Amount</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                            ) : sets.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No order sets yet.</td></tr>
                            ) : sets.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{s.category || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{Array.isArray(s.items) ? s.items.length : 0}</td>
                                    <td className="px-4 py-3 text-gray-900 font-medium">₹{s.total_amount.toLocaleString()}</td>
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
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">New Order Set</h2>
                            <button onClick={() => { setModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                    <input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="e.g. Full Body Checkup"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <select
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Select category</option>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={2}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    placeholder="Optional description"
                                />
                            </div>

                            {/* Items */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700">Items</label>
                                    <button onClick={addRow} className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Add Row
                                    </button>
                                </div>
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-gray-600 font-medium">Item Name</th>
                                                <th className="px-3 py-2 text-left text-gray-600 font-medium w-20">Qty</th>
                                                <th className="px-3 py-2 text-left text-gray-600 font-medium w-28">Unit Price</th>
                                                <th className="px-3 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {items.map((it, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            value={it.name}
                                                            onChange={e => updateRow(idx, 'name', e.target.value)}
                                                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                                            placeholder="Item name"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={it.quantity}
                                                            onChange={e => updateRow(idx, 'quantity', Number(e.target.value))}
                                                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={it.unit_price}
                                                            onChange={e => updateRow(idx, 'unit_price', Number(e.target.value))}
                                                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button onClick={() => removeRow(idx)} className="text-gray-400 hover:text-red-500">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-2 text-right text-sm font-medium text-gray-700">
                                    Total: <span className="text-blue-700">₹{totalAmount.toLocaleString()}</span>
                                </div>
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
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create Order Set
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminPage>
    );
}
