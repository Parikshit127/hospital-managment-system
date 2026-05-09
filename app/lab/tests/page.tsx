'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    FlaskConical, Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight,
    Loader2, X, Check, AlertTriangle, FileText
} from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import {
    getTestCatalog, addTestTocatalog, updateTestInCatalog,
    deleteTestFromCatalog, toggleTestAvailability
} from '@/app/actions/lab-actions';

type LabTest = {
    id: number;
    test_name: string;
    price: number;
    category: string | null;
    sample_type: string | null;
    unit: string | null;
    normal_range_min: number | null;
    normal_range_max: number | null;
    tax_rate: number | null;
    is_available: boolean;
    requires_prescription: boolean;
};

const EMPTY_FORM = {
    test_name: '', price: '', category: '', sample_type: '',
    unit: '', normal_range_min: '', normal_range_max: '',
    tax_rate: '0', requires_prescription: false,
};

const CATEGORIES = ['Haematology', 'Biochemistry', 'Microbiology', 'Serology', 'Urine', 'Radiology', 'Pathology', 'Other'];
const SAMPLE_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'Swab', 'Serum', 'Plasma', 'CSF', 'Other'];

export default function TestCatalogPage() {
    const toast = useToast();
    const [tests, setTests] = useState<LabTest[]>([]);
    const [filtered, setFiltered] = useState<LabTest[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);

    const load = async () => {
        setLoading(true);
        const res = await getTestCatalog();
        if (res.success) { setTests(res.data); setFiltered(res.data); }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        let result = tests;
        if (search) result = result.filter(t => t.test_name.toLowerCase().includes(search.toLowerCase()) || t.category?.toLowerCase().includes(search.toLowerCase()));
        if (categoryFilter !== 'All') result = result.filter(t => t.category === categoryFilter);
        setFiltered(result);
    }, [search, categoryFilter, tests]);

    const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); };
    const openEdit = (t: LabTest) => {
        setEditingId(t.id);
        setForm({
            test_name: t.test_name, price: String(t.price),
            category: t.category || '', sample_type: t.sample_type || '',
            unit: t.unit || '', normal_range_min: t.normal_range_min != null ? String(t.normal_range_min) : '',
            normal_range_max: t.normal_range_max != null ? String(t.normal_range_max) : '',
            tax_rate: String(t.tax_rate ?? 0), requires_prescription: t.requires_prescription,
        });
        setModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.test_name.trim() || !form.price) { toast.error('Test name and price are required'); return; }
        setSaving(true);
        const payload = {
            test_name: form.test_name.trim(),
            price: parseFloat(form.price),
            category: form.category || undefined,
            sample_type: form.sample_type || undefined,
            unit: form.unit || undefined,
            normal_range_min: form.normal_range_min ? parseFloat(form.normal_range_min) : undefined,
            normal_range_max: form.normal_range_max ? parseFloat(form.normal_range_max) : undefined,
            tax_rate: parseFloat(form.tax_rate) || 0,
            requires_prescription: form.requires_prescription,
        };
        const res = editingId
            ? await updateTestInCatalog(editingId, payload)
            : await addTestTocatalog(payload);
        setSaving(false);
        if (res.success) {
            toast.success(editingId ? 'Test updated' : 'Test added');
            setModalOpen(false);
            load();
        } else {
            toast.error(res.error || 'Failed to save');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this test from catalog?')) return;
        setDeletingId(id);
        const res = await deleteTestFromCatalog(id);
        setDeletingId(null);
        if (res.success) { toast.success('Test deleted'); load(); }
        else toast.error('Failed to delete');
    };

    const handleToggle = async (id: number, current: boolean) => {
        await toggleTestAvailability(id, !current);
        setTests(prev => prev.map(t => t.id === id ? { ...t, is_available: !current } : t));
    };

    const categories = ['All', ...Array.from(new Set(tests.map(t => t.category).filter(Boolean) as string[]))];

    return (
        <AppShell
            pageTitle="Test Catalog & Panels"
            pageIcon={<FlaskConical className="h-5 w-5" />}
            onRefresh={load}
            refreshing={loading}
            headerActions={
                <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm">
                    <Plus className="h-4 w-4" /> Add Test
                </button>
            }
        >
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text" placeholder="Search tests..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {categories.map(cat => (
                        <button key={cat} onClick={() => setCategoryFilter(cat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${categoryFilter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                    { label: 'Total Tests', value: tests.length, color: 'text-gray-900' },
                    { label: 'Available', value: tests.filter(t => t.is_available).length, color: 'text-green-600' },
                    { label: 'Unavailable', value: tests.filter(t => !t.is_available).length, color: 'text-red-500' },
                    { label: 'Rx Required', value: tests.filter(t => t.requires_prescription).length, color: 'text-amber-600' },
                ].map(s => (
                    <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                        <p className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <FlaskConical className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">No tests found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Test Name</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Sample</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Normal Range</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Flags</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map(test => (
                                    <tr key={test.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3.5 font-semibold text-gray-900">{test.test_name}</td>
                                        <td className="px-5 py-3.5 text-gray-500 text-xs">{test.category || '—'}</td>
                                        <td className="px-5 py-3.5 text-gray-500 text-xs">{test.sample_type || '—'}</td>
                                        <td className="px-5 py-3.5 font-bold text-gray-800">₹{test.price.toLocaleString('en-IN')}</td>
                                        <td className="px-5 py-3.5 text-xs text-gray-500">
                                            {test.normal_range_min != null && test.normal_range_max != null
                                                ? `${test.normal_range_min}–${test.normal_range_max} ${test.unit || ''}`
                                                : '—'}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex gap-1.5 flex-wrap">
                                                {test.requires_prescription && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md flex items-center gap-1">
                                                        <FileText className="h-2.5 w-2.5" /> Rx
                                                    </span>
                                                )}
                                                {(test.tax_rate ?? 0) > 0 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-md">
                                                        GST {test.tax_rate}%
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <button onClick={() => handleToggle(test.id, test.is_available)} className="flex items-center gap-1.5 text-xs font-medium">
                                                {test.is_available
                                                    ? <><ToggleRight className="h-5 w-5 text-green-500" /><span className="text-green-600">Active</span></>
                                                    : <><ToggleLeft className="h-5 w-5 text-gray-400" /><span className="text-gray-400">Off</span></>}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button onClick={() => openEdit(test)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => handleDelete(test.id)} disabled={deletingId === test.id} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                                                    {deletingId === test.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-900">{editingId ? 'Edit Test' : 'Add New Test'}</h3>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Test Name *</label>
                                    <input required value={form.test_name} onChange={e => setForm({ ...form, test_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Price (₹) *</label>
                                    <input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tax Rate (%)</label>
                                    <input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
                                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                        <option value="">Select...</option>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Sample Type</label>
                                    <select value={form.sample_type} onChange={e => setForm({ ...form, sample_type: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                        <option value="">Select...</option>
                                        {SAMPLE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Unit (e.g. mg/dL)</label>
                                    <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Normal Range Min</label>
                                    <input type="number" step="any" value={form.normal_range_min} onChange={e => setForm({ ...form, normal_range_min: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Normal Range Max</label>
                                    <input type="number" step="any" value={form.normal_range_max} onChange={e => setForm({ ...form, normal_range_max: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                            </div>

                            {/* Prescription Required Toggle */}
                            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-800">Prescription Required</p>
                                        <p className="text-xs text-amber-600">Blocks billing if no prescription uploaded</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setForm({ ...form, requires_prescription: !form.requires_prescription })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.requires_prescription ? 'bg-amber-500' : 'bg-gray-300'}`}>
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.requires_prescription ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
                                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    {editingId ? 'Update' : 'Add Test'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
