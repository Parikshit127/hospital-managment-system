'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Layers, Plus, Edit2, Trash2, Loader2, X, Check, Search, Send } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import {
    getLabPanels, createLabPanel, updateLabPanel, deleteLabPanel, orderLabPanel, getTestCatalog,
} from '@/app/actions/lab-actions';
import { searchPatients } from '@/app/actions/pill-actions';

type CatalogTest = { id: number; test_name: string; price: number; category: string | null };
type PanelTest = { id: number; test_id: number; test_name: string; sort_order: number };
type Panel = {
    id: number;
    panel_name: string;
    panel_code: string | null;
    panel_price: number;
    is_active: boolean;
    panel_tests: PanelTest[];
};

const EMPTY_FORM = { panel_name: '', panel_code: '', panel_price: '', testIds: [] as number[] };

export default function LabPanelsPage() {
    const toast = useToast();
    const [panels, setPanels] = useState<Panel[]>([]);
    const [catalog, setCatalog] = useState<CatalogTest[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);

    // Order-for-patient modal
    const [orderPanel, setOrderPanel] = useState<Panel | null>(null);
    const [patientQuery, setPatientQuery] = useState('');
    const [patientResults, setPatientResults] = useState<{ patient_id: string; full_name: string; phone: string | null }[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<{ patient_id: string; full_name: string } | null>(null);
    const [ordering, setOrdering] = useState(false);

    const load = async () => {
        setLoading(true);
        const [pRes, cRes] = await Promise.all([getLabPanels(), getTestCatalog()]);
        if (pRes.success) setPanels(pRes.data as Panel[]);
        if (cRes.success) setCatalog(cRes.data as CatalogTest[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); };
    const openEdit = (p: Panel) => {
        setEditingId(p.id);
        setForm({
            panel_name: p.panel_name,
            panel_code: p.panel_code || '',
            panel_price: String(p.panel_price),
            testIds: p.panel_tests.map(t => t.test_id),
        });
        setModalOpen(true);
    };

    const toggleTest = (id: number) => {
        setForm(f => ({ ...f, testIds: f.testIds.includes(id) ? f.testIds.filter(x => x !== id) : [...f.testIds, id] }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.panel_name.trim()) { toast.error('Panel name is required'); return; }
        if (form.testIds.length === 0) { toast.error('Select at least one test'); return; }
        setSaving(true);
        const payload = {
            panel_name: form.panel_name.trim(),
            panel_code: form.panel_code || undefined,
            panel_price: parseFloat(form.panel_price) || 0,
            testIds: form.testIds,
        };
        const res = editingId
            ? await updateLabPanel(editingId, payload)
            : await createLabPanel(payload);
        setSaving(false);
        if (res.success) {
            toast.success(editingId ? 'Panel updated' : 'Panel created');
            setModalOpen(false);
            load();
        } else {
            toast.error(res.error || 'Failed to save panel');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this panel? (Existing orders are not affected.)')) return;
        setDeletingId(id);
        const res = await deleteLabPanel(id);
        setDeletingId(null);
        if (res.success) { toast.success('Panel deleted'); load(); }
        else toast.error('Failed to delete panel');
    };

    // ---- order-for-patient ----
    const openOrder = (p: Panel) => {
        setOrderPanel(p); setPatientQuery(''); setPatientResults([]); setSelectedPatient(null);
    };
    const runPatientSearch = async (q: string) => {
        setPatientQuery(q);
        if (q.trim().length < 2) { setPatientResults([]); return; }
        const res = await searchPatients(q.trim());
        if (res.success) setPatientResults(res.data as any);
    };
    const handleOrder = async () => {
        if (!orderPanel || !selectedPatient) return;
        setOrdering(true);
        const res = await orderLabPanel({ patient_id: selectedPatient.patient_id, panel_id: orderPanel.id });
        setOrdering(false);
        if (res.success) {
            toast.success(`Ordered ${res.count} test(s) for ${selectedPatient.full_name}`);
            setOrderPanel(null);
        } else {
            toast.error(res.error || 'Failed to order panel');
        }
    };

    return (
        <AppShell
            pageTitle="Test Panels"
            pageIcon={<Layers className="h-5 w-5" />}
            onRefresh={load}
            refreshing={loading}
            headerActions={
                <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm">
                    <Plus className="h-4 w-4" /> New Panel
                </button>
            }
        >
            {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
            ) : panels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Layers className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm">No panels yet. Click "New Panel" to bundle tests (e.g. Liver Function Test).</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {panels.map(p => (
                        <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-black text-gray-900">{p.panel_name}</h3>
                                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                                        {p.panel_code ? `${p.panel_code} · ` : ''}₹{p.panel_price.toLocaleString('en-IN')} · {p.panel_tests.length} test{p.panel_tests.length === 1 ? '' : 's'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 className="h-3.5 w-3.5" /></button>
                                    <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                                        {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {p.panel_tests.map(t => (
                                    <span key={t.id} className="text-[11px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md border border-gray-200">{t.test_name}</span>
                                ))}
                            </div>
                            <button onClick={() => openOrder(p)} className="mt-4 w-full flex items-center justify-center gap-2 bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 font-bold py-2 rounded-xl text-sm transition-colors">
                                <Send className="h-4 w-4" /> Order for a patient
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Create / Edit modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-900">{editingId ? 'Edit Panel' : 'New Panel'}</h3>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Panel Name *</label>
                                    <input required value={form.panel_name} onChange={e => setForm({ ...form, panel_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Panel Code</label>
                                    <input value={form.panel_code} onChange={e => setForm({ ...form, panel_code: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Panel Price (₹)</label>
                                    <input type="number" min="0" step="0.01" value={form.panel_price} onChange={e => setForm({ ...form, panel_price: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tests in this panel * <span className="text-gray-400 normal-case font-medium">({form.testIds.length} selected)</span></label>
                                {catalog.length === 0 ? (
                                    <p className="text-xs text-gray-400">No tests in the catalog yet — add tests first on the Test Catalog page.</p>
                                ) : (
                                    <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                                        {catalog.map(t => (
                                            <label key={t.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                                                <input type="checkbox" checked={form.testIds.includes(t.id)} onChange={() => toggleTest(t.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                                                <span className="text-sm text-gray-800 flex-1">{t.test_name}</span>
                                                <span className="text-xs text-gray-400">{t.category || ''} · ₹{t.price}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
                                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    {editingId ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Order-for-patient modal */}
            {orderPanel && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-900">Order "{orderPanel.panel_name}"</h3>
                            <button onClick={() => setOrderPanel(null)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-500">Creates <b>{orderPanel.panel_tests.length}</b> lab order(s) — one per test in the panel.</p>
                            {selectedPatient ? (
                                <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-xl">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{selectedPatient.full_name}</p>
                                        <p className="text-[11px] text-gray-500">{selectedPatient.patient_id}</p>
                                    </div>
                                    <button onClick={() => setSelectedPatient(null)} className="text-xs font-semibold text-teal-700 hover:underline">Change</button>
                                </div>
                            ) : (
                                <div>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input value={patientQuery} onChange={e => runPatientSearch(e.target.value)} placeholder="Search patient by name, ID or phone..."
                                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                    </div>
                                    {patientResults.length > 0 && (
                                        <div className="mt-2 border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                            {patientResults.map(p => (
                                                <button key={p.patient_id} onClick={() => setSelectedPatient({ patient_id: p.patient_id, full_name: p.full_name })} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                                                    <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                                                    <p className="text-[11px] text-gray-500">{p.patient_id}{p.phone ? ` · ${p.phone}` : ''}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-1">
                                <button onClick={() => setOrderPanel(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
                                <button onClick={handleOrder} disabled={!selectedPatient || ordering} className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                                    {ordering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    Order Panel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
