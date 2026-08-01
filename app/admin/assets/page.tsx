'use client';

/**
 * Asset Register — IT assets, housekeeping and reception items.
 *
 * Distinct from Pharmacy/Lab "Inventory", which tracks consumable stock. This
 * tracks things the hospital owns: laptops, printers, wheelchairs, furniture —
 * where they are, who has them, warranty and maintenance.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Package, Plus, Search, Download, Loader2, AlertTriangle, X, ArrowLeftRight, Wrench, History, BarChart3 } from 'lucide-react';
import {
    listAssets, listAssetCategories, addAsset, moveAsset, logMaintenance, retireAsset, getAssetHistory,
    getAssetDepreciationReport,
} from '@/app/actions/asset-register-actions';
import { exportAssetRegister, exportAssetDepreciationReport } from '@/app/actions/report-export-actions';
import MasterImportButton from '@/app/components/master/MasterImportButton';

const money = (n: any) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** How urgent the next service is. "soon" = within the next 14 days. */
const SERVICE_SOON_DAYS = 14;
function serviceDue(a: any): 'overdue' | 'soon' | 'ok' | null {
    if (!a.next_maintenance_date || a.status !== 'Active') return null;
    const due = new Date(a.next_maintenance_date).getTime();
    const now = Date.now();
    if (due < now) return 'overdue';
    if (due - now <= SERVICE_SOON_DAYS * 86400000) return 'soon';
    return 'ok';
}
const d = (v: any) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const input = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400/20 bg-white';
const label = 'block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1';

const EMPTY_FORM = {
    asset_name: '', category_id: '', location: '', department: '',
    acquisition_date: '', acquisition_cost: '', serial_number: '',
    manufacturer: '', model_number: '', invoice_number: '', warranty_expiry: '',
};

export default function AssetRegisterPage() {
    const [assets, setAssets] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const [moveModal, setMoveModal] = useState<any>(null);
    const [moveForm, setMoveForm] = useState({ to_location: '', to_department: '', reason: '' });
    const [maintModal, setMaintModal] = useState<any>(null);
    const [maintForm, setMaintForm] = useState({ maintenance_type: 'Preventive', cost: '', description: '', next_maintenance_date: '' });

    const [moveError, setMoveError] = useState<string | null>(null);
    const [maintError, setMaintError] = useState<string | null>(null);
    const [historyModal, setHistoryModal] = useState<{ asset: any; events: any[] | null } | null>(null);

    const [disposeModal, setDisposeModal] = useState<any>(null);
    const [disposeReason, setDisposeReason] = useState('');
    const [disposeValue, setDisposeValue] = useState('');
    const [disposeError, setDisposeError] = useState<string | null>(null);

    const [showReports, setShowReports] = useState(false);
    const [report, setReport] = useState<{ rows: any[]; totals: any } | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const [reportExporting, setReportExporting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const res = await listAssets({
            category_id: categoryFilter || undefined,
            status: statusFilter || undefined,
        });
        if (res.success && res.data) { setAssets(res.data.assets); setSummary(res.data.summary); }
        else setError(res.error || 'Failed to load assets');
        setLoading(false);
    }, [categoryFilter, statusFilter]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        listAssetCategories().then(r => { if (r.success) setCategories(r.data); });
    }, []);

    // Free-text search is applied client-side: the register is a few hundred
    // rows at most, so a round trip per keystroke isn't worth it.
    const filtered = assets.filter(a => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [a.asset_code, a.asset_name, a.location, a.department, a.serial_number, a.manufacturer]
            .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q));
    });

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        const res = await addAsset({
            asset_name: form.asset_name,
            category_id: form.category_id,
            location: form.location,
            department: form.department,
            acquisition_date: form.acquisition_date || today(),
            acquisition_cost: Number(form.acquisition_cost || 0),
            serial_number: form.serial_number,
            manufacturer: form.manufacturer,
            model_number: form.model_number,
            invoice_number: form.invoice_number,
            warranty_expiry: form.warranty_expiry || undefined,
        });
        setSaving(false);
        if (res.success) { setShowAdd(false); setForm({ ...EMPTY_FORM }); load(); }
        else setFormError(res.error || 'Failed to add asset');
    }

    async function handleMove(e: React.FormEvent) {
        e.preventDefault();
        if (!moveModal) return;
        // Guard here as well as on the server so the message lands next to the
        // fields rather than as a banner at the top of the page.
        if (!moveForm.to_location.trim() && !moveForm.to_department.trim()) {
            setMoveError('Enter a new location or a new department.');
            return;
        }
        if (!moveForm.reason.trim()) {
            setMoveError('Enter a reason for the transfer.');
            return;
        }
        setSaving(true);
        setMoveError(null);
        const res = await moveAsset({ asset_id: moveModal.id, ...moveForm });
        setSaving(false);
        if (res.success) { setMoveModal(null); setMoveForm({ to_location: '', to_department: '', reason: '' }); load(); }
        else setMoveError(res.error || 'Transfer failed');
    }

    async function handleMaintenance(e: React.FormEvent) {
        e.preventDefault();
        if (!maintModal) return;
        if (!maintForm.description.trim()) {
            setMaintError('Describe what was done — this is the service record.');
            return;
        }
        setSaving(true);
        setMaintError(null);
        const res = await logMaintenance({
            asset_id: maintModal.id,
            maintenance_type: maintForm.maintenance_type,
            cost: Number(maintForm.cost || 0),
            description: maintForm.description,
            next_maintenance_date: maintForm.next_maintenance_date || undefined,
        });
        setSaving(false);
        if (res.success) {
            setMaintModal(null);
            setMaintForm({ maintenance_type: 'Preventive', cost: '', description: '', next_maintenance_date: '' });
            load();
        } else setMaintError(res.error || 'Could not record maintenance');
    }

    async function openHistory(a: any) {
        setHistoryModal({ asset: a, events: null });
        const res = await getAssetHistory(a.id);
        if (res.success && res.data) setHistoryModal({ asset: res.data.asset, events: res.data.events });
        else { setHistoryModal(null); setError(res.error || 'Could not load history'); }
    }

    // A browser prompt() gave no validation — pressing OK with an empty reason
    // just closed the box and silently did nothing, so it looked broken. This
    // is a real modal that keeps itself open until a reason is entered.
    async function handleRetire(e: React.FormEvent) {
        e.preventDefault();
        if (!disposeModal) return;
        if (!disposeReason.trim()) {
            setDisposeError('Enter a reason for disposing this asset.');
            return;
        }
        setSaving(true);
        setDisposeError(null);
        const res = await retireAsset({
            asset_id: disposeModal.id,
            reason: disposeReason.trim(),
            disposal_value: Number(disposeValue || 0),
        });
        setSaving(false);
        if (res.success) {
            setDisposeModal(null);
            setDisposeReason('');
            setDisposeValue('');
            load();
        } else {
            setDisposeError(res.error || 'Disposal failed');
        }
    }

    // Titled .xlsx, same presentation as the other reports.
    async function exportExcel() {
        setExporting(true);
        setError(null);
        try {
            const res = await exportAssetRegister({
                status: statusFilter || undefined,
                category_id: categoryFilter || undefined,
            });
            if (!res.success || !res.base64) {
                setError(res.error || 'Export failed');
                return;
            }
            const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
            const url = URL.createObjectURL(
                new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = res.filename || 'asset-register.xlsx';
            link.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setError(e.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    }

    async function openReports() {
        setShowReports(true);
        setReport(null);
        setReportError(null);
        const res = await getAssetDepreciationReport({ category_id: categoryFilter || undefined });
        if (res.success && res.data) setReport(res.data);
        else setReportError(res.error || 'Failed to load report');
    }

    async function exportReportExcel() {
        setReportExporting(true);
        setReportError(null);
        try {
            const res = await exportAssetDepreciationReport({ category_id: categoryFilter || undefined });
            if (!res.success || !res.base64) {
                setReportError(res.error || 'Export failed');
                return;
            }
            const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
            const url = URL.createObjectURL(
                new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = res.filename || 'asset-depreciation-report.xlsx';
            link.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setReportError(e.message || 'Export failed');
        } finally {
            setReportExporting(false);
        }
    }

    return (
        <AppShell pageTitle="Asset Register" pageIcon={<Package className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
            <div className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        ['Total Assets', summary?.count ?? 0, 'text-gray-900'],
                        ['Active', summary?.active ?? 0, 'text-emerald-600'],
                        ['Gross Value', money(summary?.gross_value ?? 0), 'text-gray-900'],
                        ['Needs Attention', summary?.attention ?? 0, 'text-amber-600'],
                    ].map(([l, v, cls]) => (
                        <div key={String(l)} className="bg-white border border-gray-200 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{l}</p>
                            <p className={`text-xl font-black mt-1 ${cls}`}>{v}</p>
                        </div>
                    ))}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search asset, code, serial, location…"
                            className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400/20" />
                    </div>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white">
                        <option value="">All categories</option>
                        {categories.map((c: any) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                    </select>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white">
                        <option value="">All statuses</option>
                        {['Active', 'Disposed'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={exportExcel} disabled={!filtered.length || exporting}
                        className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40">
                        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {exporting ? 'Preparing…' : 'Export Excel'}
                    </button>
                    <MasterImportButton type="asset_master" onImportComplete={load} />
                    <button onClick={openReports}
                        className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border border-gray-200 rounded-xl bg-white hover:bg-gray-50">
                        <BarChart3 className="h-3.5 w-3.5" /> Reports
                    </button>
                    <button onClick={() => { setShowAdd(true); setFormError(null); }}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
                        <Plus className="h-3.5 w-3.5" /> Add Asset
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs font-medium">
                        <AlertTriangle className="h-4 w-4" /> {error}
                    </div>
                )}

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                <tr>
                                    <th className="px-4 py-3">Code</th>
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3">Category</th>
                                    <th className="px-4 py-3">Location / Dept</th>
                                    <th className="px-4 py-3">Serial</th>
                                    <th className="px-4 py-3 text-right">Cost</th>
                                    <th className="px-4 py-3 text-right">Book Value</th>
                                    <th className="px-4 py-3">Warranty</th>
                                    <th className="px-4 py-3">Next Service</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && <tr><td colSpan={10} className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading…</td></tr>}
                                {!loading && filtered.length === 0 && (
                                    <tr><td colSpan={10} className="py-16 text-center text-gray-400">
                                        No assets yet. Use <span className="font-bold">Add Asset</span> to register IT equipment, housekeeping or reception items.
                                    </td></tr>
                                )}
                                {!loading && filtered.map((a: any) => {
                                    const warrantyGone = a.warranty_expiry && new Date(a.warranty_expiry) < new Date();
                                    return (
                                        <tr key={a.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-mono text-xs font-bold">{a.asset_code}</td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs font-bold text-gray-900">{a.asset_name}</div>
                                                {a.manufacturer && <div className="text-[10px] text-gray-400">{a.manufacturer} {a.model_number}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600">{a.category?.category_name ?? '—'}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600">
                                                {a.location || '—'}
                                                {a.department && <div className="text-[10px] text-gray-400">{a.department}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono text-gray-500">{a.serial_number || '—'}</td>
                                            <td className="px-4 py-3 text-xs text-right">{money(a.acquisition_cost)}</td>
                                            <td className="px-4 py-3 text-xs text-right font-bold">{money(a.book_value)}</td>
                                            <td className={`px-4 py-3 text-xs ${warrantyGone ? 'text-rose-600 font-bold' : 'text-gray-500'}`}>
                                                {a.warranty_expiry ? d(a.warranty_expiry) : '—'}
                                                {warrantyGone && <span className="block text-[10px] font-normal">expired</span>}
                                            </td>
                                            {/* Due status is the whole point of recording a next-service
                                                date — a bare date tells you nothing at a glance. */}
                                            <td className="px-4 py-3 text-xs">
                                                {a.next_maintenance_date ? (
                                                    <>
                                                        <span className={serviceDue(a) === 'overdue' ? 'text-rose-600 font-bold'
                                                            : serviceDue(a) === 'soon' ? 'text-amber-600 font-bold' : 'text-gray-500'}>
                                                            {d(a.next_maintenance_date)}
                                                        </span>
                                                        {serviceDue(a) === 'overdue' && <span className="block text-[10px] text-rose-600">overdue</span>}
                                                        {serviceDue(a) === 'soon' && <span className="block text-[10px] text-amber-600">due soon</span>}
                                                    </>
                                                ) : <span className="text-gray-300">not scheduled</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                    a.status === 'Active'
                                                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                        : 'text-gray-500 bg-gray-50 border-gray-200'
                                                }`}>{a.status}</span>
                                                {/* The disposal reason was captured and then never shown. */}
                                                {a.status === 'Disposed' && a.disposal_reason && (
                                                    <span className="block mt-1 text-[10px] text-gray-500 max-w-[160px] leading-tight">
                                                        {a.disposal_reason}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-center gap-1 mb-1">
                                                    <button onClick={() => openHistory(a)}
                                                        title="Where it has been, what was serviced, and why"
                                                        className="px-2 py-1 text-[10px] font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-1">
                                                        <History className="h-3 w-3" /> History
                                                    </button>
                                                </div>
                                                {a.status === 'Active' && (
                                                    <div className="flex justify-center gap-1">
                                                        <button onClick={() => { setMoveModal(a); setMoveForm({ to_location: a.location || '', to_department: a.department || '', reason: '' }); }}
                                                            title="Transfer" className="px-2 py-1 text-[10px] font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                                                            <ArrowLeftRight className="h-3 w-3" /> Move
                                                        </button>
                                                        <button onClick={() => setMaintModal(a)}
                                                            title="Record maintenance" className="px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 flex items-center gap-1">
                                                            <Wrench className="h-3 w-3" /> Service
                                                        </button>
                                                        <button onClick={() => { setDisposeModal(a); setDisposeReason(''); setDisposeValue(''); setDisposeError(null); }}
                                                            title="Dispose" className="px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100">
                                                            Dispose
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ADD ASSET */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <form onSubmit={handleAdd} className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-black text-gray-900">Add Asset</h3>
                            <button type="button" onClick={() => setShowAdd(false)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className={label}>Asset Name *</label>
                                <input required value={form.asset_name} onChange={e => setForm({ ...form, asset_name: e.target.value })}
                                    placeholder="e.g. Dell Latitude 5420 — Reception" className={input} />
                            </div>
                            <div>
                                <label className={label}>Category *</label>
                                <select required value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={input}>
                                    <option value="">Select category</option>
                                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={label}>Acquisition Cost (₹) *</label>
                                <input required type="number" min="0" step="0.01" value={form.acquisition_cost}
                                    onChange={e => setForm({ ...form, acquisition_cost: e.target.value })} className={input} />
                            </div>
                            <div>
                                <label className={label}>Acquisition Date *</label>
                                <input required type="date" value={form.acquisition_date} onChange={e => setForm({ ...form, acquisition_date: e.target.value })} className={input} />
                            </div>
                            <div>
                                <label className={label}>Warranty Expiry</label>
                                <input type="date" value={form.warranty_expiry} onChange={e => setForm({ ...form, warranty_expiry: e.target.value })} className={input} />
                            </div>
                            <div>
                                <label className={label}>Location</label>
                                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Reception desk" className={input} />
                            </div>
                            <div>
                                <label className={label}>Department</label>
                                <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="e.g. Front Office" className={input} />
                            </div>
                            <div>
                                <label className={label}>Serial Number</label>
                                <input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} className={input} />
                            </div>
                            <div>
                                <label className={label}>Manufacturer</label>
                                <input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className={input} />
                            </div>
                            <div>
                                <label className={label}>Model</label>
                                <input value={form.model_number} onChange={e => setForm({ ...form, model_number: e.target.value })} className={input} />
                            </div>
                            <div>
                                <label className={label}>Purchase Invoice No</label>
                                <input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} className={input} />
                            </div>
                            {formError && (
                                <p className="md:col-span-2 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{formError}</p>
                            )}
                            <p className="md:col-span-2 text-[11px] text-gray-400">
                                Asset code is generated automatically from the category (e.g. IT-0001).
                            </p>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
                            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Asset
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* TRANSFER */}
            {moveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <form onSubmit={handleMove} className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-black text-gray-900">Transfer {moveModal.asset_code}</h3>
                            <button type="button" onClick={() => setMoveModal(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <p className="text-xs text-gray-500 -mt-2">
                            Currently at <span className="font-bold">{moveModal.location || 'no location'}</span>
                            {moveModal.department ? <> · <span className="font-bold">{moveModal.department}</span></> : null}
                        </p>
                        <div><label className={label}>New Location</label>
                            <input value={moveForm.to_location} onChange={e => { setMoveForm({ ...moveForm, to_location: e.target.value }); setMoveError(null); }} className={input} /></div>
                        <div><label className={label}>New Department</label>
                            <input value={moveForm.to_department} onChange={e => { setMoveForm({ ...moveForm, to_department: e.target.value }); setMoveError(null); }} className={input} /></div>
                        <div><label className={label}>Reason *</label>
                            <input value={moveForm.reason} onChange={e => { setMoveForm({ ...moveForm, reason: e.target.value }); setMoveError(null); }}
                                placeholder="e.g. moved to the new server room" className={input} /></div>
                        {moveError && (
                            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{moveError}</p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setMoveModal(null)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl">Cancel</button>
                            <button type="submit"
                                disabled={saving || !moveForm.reason.trim() || (!moveForm.to_location.trim() && !moveForm.to_department.trim())}
                                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl disabled:opacity-50">Transfer</button>
                        </div>
                    </form>
                </div>
            )}

            {/* MAINTENANCE */}
            {maintModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <form onSubmit={handleMaintenance} className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-black text-gray-900">Record Service — {maintModal.asset_code}</h3>
                            <button type="button" onClick={() => setMaintModal(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div><label className={label}>Type</label>
                            <select value={maintForm.maintenance_type} onChange={e => setMaintForm({ ...maintForm, maintenance_type: e.target.value })} className={input}>
                                {['Preventive', 'Breakdown', 'Calibration', 'Inspection'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select></div>
                        <div><label className={label}>Cost (₹)</label>
                            <input type="number" min="0" step="0.01" value={maintForm.cost} onChange={e => setMaintForm({ ...maintForm, cost: e.target.value })} className={input} /></div>
                        <div><label className={label}>What was done? *</label>
                            <input value={maintForm.description} onChange={e => { setMaintForm({ ...maintForm, description: e.target.value }); setMaintError(null); }}
                                placeholder="e.g. replaced drum unit, cleaned rollers" className={input} /></div>
                        <div>
                            <label className={label}>Next Service Due</label>
                            {/* `min` stops the picker offering a past date; the server
                                rejects one too, since this service is recorded as today. */}
                            <input type="date" min={today()} value={maintForm.next_maintenance_date}
                                onChange={e => { setMaintForm({ ...maintForm, next_maintenance_date: e.target.value }); setMaintError(null); }}
                                className={input} />
                            <p className="text-[11px] text-gray-400 mt-1">
                                Leave blank if no follow-up is needed. Admins are reminded 14 days before it falls due.
                            </p>
                        </div>
                        {maintError && (
                            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{maintError}</p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setMaintModal(null)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl">Cancel</button>
                            <button type="submit" disabled={saving || !maintForm.description.trim()}
                                className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl disabled:opacity-50">Save</button>
                        </div>
                    </form>
                </div>
            )}

            {/* HISTORY — the audit trail for one asset. */}
            {historyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Asset History</h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    <span className="font-semibold">{historyModal.asset.asset_code}</span> · {historyModal.asset.asset_name}
                                </p>
                            </div>
                            <button onClick={() => setHistoryModal(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 overflow-auto">
                            {historyModal.events === null ? (
                                <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                                </div>
                            ) : historyModal.events.length === 0 ? (
                                <p className="text-sm text-gray-400 py-8 text-center">Nothing recorded yet.</p>
                            ) : (
                                <ol className="space-y-3">
                                    {historyModal.events.map((ev: any, i: number) => (
                                        <li key={i} className="flex gap-3">
                                            <div className="w-24 shrink-0 text-[11px] text-gray-400 pt-0.5">{d(ev.at)}</div>
                                            <div className="flex-1 border-l-2 border-gray-100 pl-3 pb-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                        ev.kind === 'Acquired' ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                                                        : ev.kind === 'Transferred' ? 'text-blue-700 bg-blue-50 border-blue-200'
                                                        : ev.kind === 'Serviced' ? 'text-amber-700 bg-amber-50 border-amber-200'
                                                        : 'text-rose-700 bg-rose-50 border-rose-200'}`}>
                                                        {ev.kind}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-800">{ev.detail}</span>
                                                    {ev.amount !== null && ev.amount > 0 && (
                                                        <span className="text-xs font-bold text-gray-500">{money(ev.amount)}</span>
                                                    )}
                                                </div>
                                                {ev.note && <p className="text-xs text-gray-600 mt-0.5">{ev.note}</p>}
                                                {ev.by && <p className="text-[10px] text-gray-400 mt-0.5">by {ev.by}</p>}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DISPOSE — reason is mandatory and the dialog stays open until given. */}
            {disposeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <form onSubmit={handleRetire} className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Dispose Asset</h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    <span className="font-semibold">{disposeModal.asset_code}</span> · {disposeModal.asset_name}
                                </p>
                            </div>
                            <button type="button" onClick={() => setDisposeModal(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>

                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                            <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-rose-800">
                                The asset is marked Disposed and drops out of the active register.
                                It stays on record with your reason against it.
                            </p>
                        </div>

                        <div>
                            <label className={label}>Disposal Value (₹)</label>
                            <input type="number" min="0" step="0.01" value={disposeValue}
                                onChange={e => setDisposeValue(e.target.value)} placeholder="0" className={input} />
                        </div>
                        <div>
                            <label className={label}>Reason *</label>
                            <input value={disposeReason} onChange={e => { setDisposeReason(e.target.value); setDisposeError(null); }}
                                placeholder="e.g. damaged beyond repair" className={input} />
                        </div>
                        {disposeError && (
                            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{disposeError}</p>
                        )}

                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setDisposeModal(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Keep Asset</button>
                            <button type="submit" disabled={saving || !disposeReason.trim()}
                                className="px-5 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Dispose Asset
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* REPORTS — category-wise depreciation / book value. */}
            {showReports && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Depreciation Report</h3>
                                <p className="text-sm text-gray-500 mt-0.5">Category-wise cost, accumulated depreciation and book value.</p>
                            </div>
                            <button onClick={() => setShowReports(false)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 overflow-auto">
                            {reportError && (
                                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs font-medium mb-4">
                                    <AlertTriangle className="h-4 w-4" /> {reportError}
                                </div>
                            )}
                            {!report && !reportError && (
                                <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
                                </div>
                            )}
                            {report && report.rows.length === 0 && (
                                <p className="text-sm text-gray-400 py-8 text-center">No assets to report on yet.</p>
                            )}
                            {report && report.rows.length > 0 && (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                        <tr>
                                            <th className="px-3 py-2">Category</th>
                                            <th className="px-3 py-2 text-right">Assets</th>
                                            <th className="px-3 py-2 text-right">Cost</th>
                                            <th className="px-3 py-2 text-right">Accum. Depreciation</th>
                                            <th className="px-3 py-2 text-right">Book Value</th>
                                            <th className="px-3 py-2 text-right">% Depreciated</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {report.rows.map((r: any) => (
                                            <tr key={r.category}>
                                                <td className="px-3 py-2 text-xs font-bold text-gray-900">{r.category}</td>
                                                <td className="px-3 py-2 text-xs text-right">{r.count}</td>
                                                <td className="px-3 py-2 text-xs text-right">{money(r.cost)}</td>
                                                <td className="px-3 py-2 text-xs text-right">{money(r.accumulated_depreciation)}</td>
                                                <td className="px-3 py-2 text-xs text-right font-bold">{money(r.book_value)}</td>
                                                <td className="px-3 py-2 text-xs text-right">{r.percent_depreciated.toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-50 font-bold">
                                            <td className="px-3 py-2 text-xs">Total</td>
                                            <td className="px-3 py-2 text-xs text-right">{report.totals.count}</td>
                                            <td className="px-3 py-2 text-xs text-right">{money(report.totals.cost)}</td>
                                            <td className="px-3 py-2 text-xs text-right">{money(report.totals.accumulated_depreciation)}</td>
                                            <td className="px-3 py-2 text-xs text-right">{money(report.totals.book_value)}</td>
                                            <td className="px-3 py-2 text-xs text-right">{report.totals.percent_depreciated.toFixed(1)}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setShowReports(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Close</button>
                            <button onClick={exportReportExcel} disabled={!report?.rows.length || reportExporting}
                                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                                {reportExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                {reportExporting ? 'Preparing…' : 'Download Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
