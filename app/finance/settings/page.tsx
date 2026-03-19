'use client';

import { useState, useEffect } from 'react';
import { getTaxConfigs, addTaxConfig, updateTaxConfig } from '@/app/actions/tax-actions';
import { getExpenseCategories, addExpenseCategory, updateExpenseCategory } from '@/app/actions/expense-actions';
import { Settings, Plus, Percent, FolderTree, AlertCircle, Star, Edit2, Power } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function FinanceSettingsPage() {
    const [tab, setTab] = useState<'tax' | 'categories'>('tax');
    const [taxConfigs, setTaxConfigs] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddTax, setShowAddTax] = useState(false);
    const [showAddCat, setShowAddCat] = useState(false);
    const [editTax, setEditTax] = useState<any>(null);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [taxRes, catRes] = await Promise.all([getTaxConfigs(), getExpenseCategories()]);
        if (taxRes.success) setTaxConfigs(taxRes.data);
        if (catRes.success) setCategories(catRes.data);
        setLoading(false);
    }

    return (
        <AppShell pageTitle="Finance Settings" pageIcon={<Settings className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-5xl mx-auto">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
                <button onClick={() => setTab('tax')}
                    className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition ${tab === 'tax' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Percent className="h-4 w-4" /> Tax Rates
                </button>
                <button onClick={() => setTab('categories')}
                    className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition ${tab === 'categories' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <FolderTree className="h-4 w-4" /> Expense Categories
                </button>
            </div>

            {/* Tax Rates Tab */}
            {tab === 'tax' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">Configure GST and other tax rates applied to invoices</p>
                        <button onClick={() => { setEditTax(null); setShowAddTax(true); }}
                            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                            <Plus className="h-4 w-4" /> Add Tax Rate
                        </button>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tax Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate (%)</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Applicable To</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Default</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {taxConfigs.map(tc => (
                                    <tr key={tc.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{tc.tax_name}</td>
                                        <td className="px-6 py-3 text-sm text-gray-600 font-mono">{tc.tax_code}</td>
                                        <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">{Number(tc.rate)}%</td>
                                        <td className="px-6 py-3 text-sm text-gray-600">{tc.applicable_to || 'All'}</td>
                                        <td className="px-6 py-3 text-center">
                                            {tc.is_default && <Star className="h-4 w-4 text-amber-500 mx-auto fill-amber-500" />}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => { setEditTax(tc); setShowAddTax(true); }}
                                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                {!tc.is_default && (
                                                    <button onClick={async () => { await updateTaxConfig(tc.id, { is_default: true }); loadData(); }}
                                                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Set as default">
                                                        <Star className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {taxConfigs.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                <Percent className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                <p className="font-medium">No tax rates configured</p>
                                <p className="text-sm mt-1">Add GST slabs like 5%, 12%, 18%, 28%</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                        <p className="font-medium">How tax rates work</p>
                        <p className="mt-1">The default tax rate is used for invoice PDF generation. Set applicable categories to apply different rates to specific departments (e.g., 18% for Consumables, 5% for Medicines).</p>
                    </div>
                </div>
            )}

            {/* Expense Categories Tab */}
            {tab === 'categories' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">Organize expenses into categories for better tracking</p>
                        <button onClick={() => setShowAddCat(true)}
                            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                            <Plus className="h-4 w-4" /> Add Category
                        </button>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="divide-y divide-gray-100">
                            {categories.map(cat => (
                                <div key={cat.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                                            <FolderTree className="h-4 w-4 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{cat.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Code: {cat.code}
                                                {cat.parent?.name && ` • Parent: ${cat.parent.name}`}
                                                {cat._count?.expenses > 0 && ` • ${cat._count.expenses} expense(s)`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={async () => {
                                            await updateExpenseCategory(cat.id, { is_active: !cat.is_active });
                                            loadData();
                                        }} className={`p-1.5 rounded-lg ${cat.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                            title={cat.is_active ? 'Deactivate' : 'Activate'}>
                                            <Power className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {categories.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                <FolderTree className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                <p className="font-medium">No categories yet</p>
                                <p className="text-sm mt-1">Suggested: Salaries, Utilities, Medical Supplies, Maintenance, Equipment, Insurance Premiums</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add/Edit Tax Modal */}
            {showAddTax && (
                <TaxModal
                    tax={editTax}
                    onClose={() => { setShowAddTax(false); setEditTax(null); }}
                    onSave={async (data) => {
                        let res;
                        if (editTax) {
                            res = await updateTaxConfig(editTax.id, data);
                        } else {
                            res = await addTaxConfig(data);
                        }
                        if (res.success) { setShowAddTax(false); setEditTax(null); loadData(); }
                        return res;
                    }}
                />
            )}

            {/* Add Category Modal */}
            {showAddCat && (
                <CategoryModal
                    categories={categories}
                    onClose={() => setShowAddCat(false)}
                    onSave={async (data) => {
                        const res = await addExpenseCategory(data);
                        if (res.success) { setShowAddCat(false); loadData(); }
                        return res;
                    }}
                />
            )}
        </div>
        </AppShell>
    );
}

function TaxModal({ tax, onClose, onSave }: { tax?: any; onClose: () => void; onSave: (data: any) => Promise<any> }) {
    const [form, setForm] = useState({
        tax_name: tax?.tax_name || '',
        tax_code: tax?.tax_code || '',
        rate: tax ? String(Number(tax.rate)) : '',
        is_default: tax?.is_default || false,
        applicable_to: tax?.applicable_to || '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.tax_name || !form.tax_code || !form.rate) {
            setError('Name, code, and rate are required'); return;
        }
        setSaving(true); setError('');
        const res = await onSave({
            tax_name: form.tax_name,
            tax_code: form.tax_code,
            rate: parseFloat(form.rate),
            is_default: form.is_default,
            applicable_to: form.applicable_to || undefined,
        });
        if (!res.success) setError(res.error || 'Failed to save');
        setSaving(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">{tax ? 'Edit Tax Rate' : 'Add Tax Rate'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Name *</label>
                            <input type="text" value={form.tax_name} onChange={e => setForm({ ...form, tax_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. GST 18%" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                            <input type="text" value={form.tax_code} onChange={e => setForm({ ...form, tax_code: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. GST18" disabled={!!tax} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%) *</label>
                        <input type="number" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="18" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Applicable To</label>
                        <select value={form.applicable_to} onChange={e => setForm({ ...form, applicable_to: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="">All Departments</option>
                            <option value="Consumables">Consumables</option>
                            <option value="Accommodation">Accommodation</option>
                            <option value="Housekeeping">Housekeeping</option>
                            <option value="Pharmacy">Pharmacy</option>
                            <option value="Laboratory">Laboratory</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                        <label className="text-sm text-gray-700">Set as default tax rate</label>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                            {saving ? 'Saving...' : tax ? 'Update' : 'Add Tax Rate'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function CategoryModal({ categories, onClose, onSave }: { categories: any[]; onClose: () => void; onSave: (data: any) => Promise<any> }) {
    const [form, setForm] = useState({ name: '', code: '', parent_id: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name || !form.code) { setError('Name and code are required'); return; }
        setSaving(true); setError('');
        const res = await onSave({
            name: form.name, code: form.code,
            parent_id: form.parent_id ? parseInt(form.parent_id) : undefined,
        });
        if (!res.success) setError(res.error || 'Failed to add category');
        setSaving(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Add Category</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Medical Supplies" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                        <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. MED-SUP" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                        <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="">None (Top Level)</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                            {saving ? 'Saving...' : 'Add Category'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
