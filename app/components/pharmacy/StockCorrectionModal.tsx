'use client';

/**
 * Search a medicine, see its batches, and correct them in place — quantity
 * (Adjust Stock, which writes a stock_adjustments audit row) or batch details
 * (expiry / rack / MRP / cost).
 *
 * This lives in its own component because the pharmacy team works in the
 * Dispensing screen, not the Stock screen: previously Dispensing could only ADD
 * a new batch, so a wrong quantity had to be corrected from another module.
 * Both screens now mount this same modal.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { X, Search, Loader2, PackageSearch, Pencil, Scale } from 'lucide-react';
import { getInventoryPage, adjustStock, updateBatchDetails } from '@/app/actions/pharmacy-actions';

type BatchRow = any;

const inputCls =
    'w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-bold text-gray-900 placeholder:text-gray-400';
const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1';

export function StockCorrectionModal({
    open,
    onClose,
    onChanged,
}: {
    open: boolean;
    onClose: () => void;
    /** Called after a successful save so the parent can refresh its own stock view. */
    onChanged?: () => void;
}) {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<BatchRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [adjustRow, setAdjustRow] = useState<BatchRow | null>(null);
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [saving, setSaving] = useState(false);

    const [editRow, setEditRow] = useState<BatchRow | null>(null);
    const [editForm, setEditForm] = useState({ batch_no: '', expiry: '', rack: '', mrp: '', cost_price: '' });

    const load = useCallback(async (search: string) => {
        setLoading(true);
        setError(null);
        try {
            const res: any = await getInventoryPage({ search, limit: 50 });
            if (res?.success) setRows(res.data ?? []);
            else setError(res?.error || 'Failed to load stock');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search — this list is the whole medicine master, so firing on
    // every keystroke is too expensive.
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => load(query), 350);
        return () => clearTimeout(t);
    }, [open, query, load]);

    // Don't keep a stale medicine list (or a half-filled form) from last time.
    useEffect(() => {
        if (open) return;
        setQuery('');
        setRows([]);
        setAdjustRow(null);
        setEditRow(null);
        setNotice(null);
        setError(null);
    }, [open]);

    function openEdit(row: BatchRow) {
        setAdjustRow(null);
        setEditRow(row);
        setEditForm({
            batch_no: row.batch_no ?? '',
            expiry: row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 10) : '',
            rack: row.rack_location || '',
            mrp: row.mrp != null ? String(row.mrp) : '',
            cost_price: row.cost_price != null ? String(row.cost_price) : '',
        });
    }

    async function handleAdjust(e: React.FormEvent) {
        e.preventDefault();
        if (!adjustRow) return;
        const qty = Number(adjustQty);
        if (!qty || !adjustReason.trim()) {
            setError('Enter a non-zero quantity and a reason.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res: any = await adjustStock({
                medicine_id: adjustRow.medicine_id,
                batch_id: adjustRow.id,
                adjustment_qty: qty,
                reason: adjustReason.trim(),
            });
            if (res?.success) {
                setNotice(`Stock updated for ${adjustRow.medicine?.brand_name ?? 'medicine'} (${adjustRow.batch_no}).`);
                setAdjustRow(null);
                setAdjustQty('');
                setAdjustReason('');
                await load(query);
                onChanged?.();
            } else setError(res?.error || 'Failed to adjust stock');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleEdit(e: React.FormEvent) {
        e.preventDefault();
        if (!editRow) return;
        setSaving(true);
        setError(null);
        try {
            const res: any = await updateBatchDetails({
                batch_id: editRow.id,
                batch_no: editForm.batch_no,
                expiry_date: editForm.expiry ? new Date(editForm.expiry) : undefined,
                rack_location: editForm.rack,
                mrp: editForm.mrp ? Number(editForm.mrp) : undefined,
                cost_price: editForm.cost_price ? Number(editForm.cost_price) : undefined,
            });
            if (res?.success) {
                setNotice(`Batch details updated for ${editRow.medicine?.brand_name ?? 'medicine'}.`);
                setEditRow(null);
                await load(query);
                onChanged?.();
            } else setError(res?.error || 'Failed to update batch');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Edit / Correct Stock</h3>
                        <p className="text-[11px] text-gray-500">
                            Fix a wrong quantity or batch detail without leaving dispensing.
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close">
                        <X className="h-5 w-5 text-gray-400 hover:text-gray-700 transition-colors" />
                    </button>
                </div>

                <div className="px-6 pt-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search medicine by name or batch no…"
                            className={`${inputCls} pl-10`}
                        />
                    </div>
                    {error && (
                        <p className="mt-3 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
                    )}
                    {notice && !error && (
                        <p className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>
                    )}
                </div>

                {/* Adjust form */}
                {adjustRow && (
                    <form onSubmit={handleAdjust} className="mx-6 mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                        <p className="text-xs font-black text-orange-800">
                            Adjust stock — {adjustRow.medicine?.brand_name} · batch {adjustRow.batch_no} · current {adjustRow.current_stock}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className={labelCls}>Adjustment Qty (+ add / − deduct)</label>
                                <input value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                                    type="number" placeholder="e.g. -5" className={inputCls} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Reason (required)</label>
                                <input value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                                    placeholder="e.g. physical count correction" className={inputCls} />
                            </div>
                        </div>
                        <p className="text-[11px] text-orange-700 font-medium">
                            New stock will be {adjustRow.current_stock + (Number(adjustQty) || 0)}. This is recorded in the stock adjustment audit.
                        </p>
                        <div className="flex gap-2">
                            <button type="submit" disabled={saving}
                                className="px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-orange-700">
                                {saving ? 'Saving…' : 'Save Adjustment'}
                            </button>
                            <button type="button" onClick={() => setAdjustRow(null)}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {/* Edit batch form */}
                {editRow && (
                    <form onSubmit={handleEdit} className="mx-6 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                        <p className="text-xs font-black text-blue-800">
                            Edit batch — {editRow.medicine?.brand_name}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <label className={labelCls}>Batch No</label>
                                <input value={editForm.batch_no} onChange={e => setEditForm({ ...editForm, batch_no: e.target.value })} className={inputCls} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Expiry Date</label>
                                <input type="date" value={editForm.expiry} onChange={e => setEditForm({ ...editForm, expiry: e.target.value })} className={inputCls} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Rack Location</label>
                                <input value={editForm.rack} onChange={e => setEditForm({ ...editForm, rack: e.target.value })} className={inputCls} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>MRP (₹)</label>
                                <input type="number" step="0.01" value={editForm.mrp} onChange={e => setEditForm({ ...editForm, mrp: e.target.value })} className={inputCls} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelCls}>Cost Price (₹)</label>
                                <input type="number" step="0.01" value={editForm.cost_price} onChange={e => setEditForm({ ...editForm, cost_price: e.target.value })} className={inputCls} />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" disabled={saving}
                                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-blue-700">
                                {saving ? 'Saving…' : 'Save Batch Details'}
                            </button>
                            <button type="button" onClick={() => setEditRow(null)}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {/* Batch list */}
                <div className="flex-1 overflow-auto px-6 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading stock…
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                            <PackageSearch className="h-6 w-6" />
                            <p className="text-sm font-medium">
                                {query ? 'No medicine matches that search.' : 'Search for a medicine to correct its stock.'}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-50 border-b text-left">
                                    <th className="px-3 py-2 font-bold text-gray-500 uppercase text-[10px]">Medicine</th>
                                    <th className="px-3 py-2 font-bold text-gray-500 uppercase text-[10px]">Batch</th>
                                    <th className="px-3 py-2 font-bold text-gray-500 uppercase text-[10px]">Stock</th>
                                    <th className="px-3 py-2 font-bold text-gray-500 uppercase text-[10px]">Expiry</th>
                                    <th className="px-3 py-2 font-bold text-gray-500 uppercase text-[10px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((r: BatchRow) => {
                                    // Rows without a batch are medicines that have never had stock
                                    // received — there is nothing to correct yet.
                                    const hasBatch = Boolean(r.id && r.batch_no);
                                    return (
                                        <tr key={`${r.medicine_id}-${r.id ?? 'none'}`} className="hover:bg-gray-50">
                                            <td className="px-3 py-2.5 font-bold text-gray-800">{r.medicine?.brand_name ?? '—'}</td>
                                            <td className="px-3 py-2.5 font-mono text-gray-600">{r.batch_no || '—'}</td>
                                            <td className="px-3 py-2.5 font-bold text-gray-900">{hasBatch ? r.current_stock : 'Out of Stock'}</td>
                                            <td className="px-3 py-2.5 text-gray-500">
                                                {r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('en-IN') : '—'}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {hasBatch ? (
                                                    <div className="flex gap-1.5">
                                                        <button onClick={() => { setEditRow(null); setAdjustRow(r); setAdjustQty(''); setAdjustReason(''); }}
                                                            title="Adjust Stock"
                                                            className="px-2 py-1 border border-orange-200 text-orange-700 bg-orange-50 rounded-lg font-bold hover:bg-orange-100 flex items-center gap-1">
                                                            <Scale className="h-3 w-3" /> Adjust
                                                        </button>
                                                        <button onClick={() => openEdit(r)}
                                                            title="Edit Batch"
                                                            className="px-2 py-1 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-1">
                                                            <Pencil className="h-3 w-3" /> Edit
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">Use Add Stock</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
