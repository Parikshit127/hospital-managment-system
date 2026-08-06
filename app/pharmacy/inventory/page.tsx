'use client';

import React, { useEffect, useState } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import { Package, Search, Plus, X, SlidersHorizontal, Pencil } from 'lucide-react';
import { getInventoryPage, getInventoryCategories, addInventoryBatch, adjustStock, updateBatchDetails } from '@/app/actions/pharmacy-actions';
import { useDebouncedValue } from '@/app/lib/hooks/useDebouncedValue';
import { useToast } from '@/app/components/ui/Toast';

const EMPTY_SUMMARY = { totalValue: 0, lowStockCount: 0, expiringSoonCount: 0, outOfStockCount: 0 };

function formatCurrency(n: number) {
    return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function expiryClass(expiryDate: string | null) {
    if (!expiryDate) return 'text-gray-400';
    const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days <= 30) return 'text-red-600 font-bold';
    if (days <= 60) return 'text-amber-600 font-semibold';
    return 'text-gray-600';
}

export default function PharmacyInventoryPage() {
    const toast = useToast();
    const [rows, setRows] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cursor, setCursor] = useState<number | undefined>(undefined);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);

    const [searchQuery, setSearchQuery] = useState('');
    const debouncedQuery = useDebouncedValue(searchQuery, 250);
    const [categories, setCategories] = useState<string[]>([]);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
    const [expiringWithinFilter, setExpiringWithinFilter] = useState('');

    const hasFilters = !!(searchQuery || categoryFilter || stockStatusFilter !== 'all' || expiringWithinFilter);
    function clearFilters() {
        setSearchQuery(''); setCategoryFilter(''); setStockStatusFilter('all'); setExpiringWithinFilter('');
    }

    // Modal: Add Bulk Stock
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', cost_price: '', expiry: '', rack: '', hsn_sac_code: '' });

    // Modal: Adjust Stock
    const [adjustRow, setAdjustRow] = useState<any>(null);
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [adjusting, setAdjusting] = useState(false);

    const handleAdjustStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustRow) return;
        const qty = Number(adjustQty);
        if (!qty || !adjustReason.trim()) return;
        setAdjusting(true);
        try {
            const res = await adjustStock({
                medicine_id: adjustRow.medicine_id,
                batch_id: adjustRow.id,
                adjustment_qty: qty,
                reason: adjustReason.trim(),
            });
            if (res.success) {
                toast.success('Stock adjusted');
                setAdjustRow(null);
                setAdjustQty('');
                setAdjustReason('');
                loadInventory();
            } else toast.error(res.error || 'Failed to adjust stock');
        } finally {
            setAdjusting(false);
        }
    };

    // Modal: Edit Batch
    const [editRow, setEditRow] = useState<any>(null);
    const [editForm, setEditForm] = useState({ batch_no: '', expiry: '', rack: '', mrp: '', cost_price: '' });
    const [editing, setEditing] = useState(false);

    function openEditModal(row: any) {
        setEditRow(row);
        setEditForm({
            batch_no: row.batch_no,
            expiry: row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 10) : '',
            rack: row.rack_location || '',
            mrp: row.mrp != null ? String(row.mrp) : '',
            cost_price: row.cost_price != null ? String(row.cost_price) : '',
        });
    }

    const handleEditBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editRow) return;
        setEditing(true);
        try {
            const res = await updateBatchDetails({
                batch_id: editRow.id,
                batch_no: editForm.batch_no,
                expiry_date: editForm.expiry ? new Date(editForm.expiry) : undefined,
                rack_location: editForm.rack,
                mrp: editForm.mrp ? Number(editForm.mrp) : undefined,
                cost_price: editForm.cost_price ? Number(editForm.cost_price) : undefined,
            });
            if (res.success) {
                toast.success('Batch updated');
                setEditRow(null);
                loadInventory();
            } else toast.error(res.error || 'Failed to update batch');
        } finally {
            setEditing(false);
        }
    };

    const loadInventory = async (opts?: { append?: boolean }) => {
        const append = opts?.append ?? false;
        if (append) setLoadingMore(true); else setRefreshing(true);
        try {
            const res = await getInventoryPage({
                search: debouncedQuery,
                limit: 50,
                cursor: append ? cursor : undefined,
                category: categoryFilter || undefined,
                stockStatus: stockStatusFilter === 'all' ? undefined : stockStatusFilter,
                expiringWithinDays: expiringWithinFilter ? Number(expiringWithinFilter) : undefined,
                includeSummary: !append,
            });
            if (res.success) {
                setRows(prev => append ? [...prev, ...(res.data as any[])] : (res.data as any[]));
                setCursor(res.nextCursor);
                if (res.summary) setSummary(res.summary);
            } else if (!append) {
                setRows([]);
            }
        } finally {
            if (append) setLoadingMore(false); else setRefreshing(false);
        }
    };

    useEffect(() => {
        getInventoryCategories().then(res => { if (res.success) setCategories(res.data as string[]); });
    }, []);

    // Close any open modal with Escape.
    useEffect(() => {
        if (!modalOpen && !adjustRow && !editRow) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setModalOpen(false); setAdjustRow(null); setEditRow(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [modalOpen, adjustRow, editRow]);

    useEffect(() => {
        setCursor(undefined);
        loadInventory();
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [debouncedQuery, categoryFilter, stockStatusFilter, expiringWithinFilter]);

    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            brand_name: form.brand_name,
            generic_name: form.generic_name,
            batch_no: form.batch_no,
            stock: Number(form.stock),
            price: Number(form.price),
            // Inventory valuation sums cost_price — without it every manually
            // added batch values at zero on the Stock Value KPI.
            cost_price: form.cost_price ? Number(form.cost_price) : undefined,
            expiry: new Date(form.expiry),
            rack: form.rack,
            hsn_sac_code: form.hsn_sac_code || undefined,
        };
        const res = await addInventoryBatch(payload);
        if (res.success) {
            toast.success('Stock added');
            setModalOpen(false);
            loadInventory();
        } else toast.error(res.error || 'Failed to add stock');
    };

    return (
        <AppShell
            pageTitle="Pharmacy Inventory"
            pageIcon={<Package className="h-5 w-5" />}
            onRefresh={() => loadInventory()}
            refreshing={refreshing}
            headerActions={
                <button onClick={() => { setForm({ brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', cost_price: '', expiry: '', rack: '', hsn_sac_code: '' }); setModalOpen(true); }} className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm">
                    <Plus className="h-4 w-4" /> Add Bulk Stock
                </button>
            }
        >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Stock Value</p>
                    <p className="text-xl font-black text-gray-900">{formatCurrency(summary.totalValue)}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Low Stock</p>
                    <p className="text-xl font-black text-amber-600">{summary.lowStockCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Expiring Soon (30d)</p>
                    <p className="text-xl font-black text-red-600">{summary.expiringSoonCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase">Out of Stock</p>
                    <p className="text-xl font-black text-gray-600">{summary.outOfStockCount}</p>
                </div>
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3 bg-gray-50/50">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text" placeholder="Search medicines..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                    </div>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
                        <option value="">All categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={stockStatusFilter} onChange={e => setStockStatusFilter(e.target.value as any)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
                        <option value="all">All stock</option>
                        <option value="in">In stock</option>
                        <option value="low">Low stock</option>
                        <option value="out">Out of stock</option>
                    </select>
                    <select value={expiringWithinFilter} onChange={e => setExpiringWithinFilter(e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
                        <option value="">Any expiry</option>
                        <option value="30">Expiring in 30 days</option>
                        <option value="60">Expiring in 60 days</option>
                        <option value="90">Expiring in 90 days</option>
                    </select>
                    {hasFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">
                            <X className="h-3.5 w-3.5" /> Clear filters
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Medicine</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">HSN</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Pack</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch No</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Stock</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Expiry</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">MRP</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rack</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.length === 0 && !refreshing && (
                                <tr><td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-400">No medicines found.</td></tr>
                            )}
                            {rows.map((row: any) => (
                                <tr key={row.id ?? row.batch_no} className="hover:bg-gray-50/60">
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-bold text-gray-900">{row.medicine.brand_name}</p>
                                        <p className="text-xs text-gray-500">{row.medicine.generic_name || 'Generic N/A'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.medicine.category || '—'}</td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{row.medicine.hsn_sac_code || '—'}</td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{row.medicine.pack || '—'}</td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{row._catalog ? '—' : row.batch_no}</td>
                                    <td className={`px-4 py-3 text-sm text-right font-black ${row._catalog ? 'text-red-500' : row.current_stock < row.medicine.min_threshold ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {row._catalog ? 'Out of Stock' : row.current_stock}
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${expiryClass(row.expiry_date)}`}>
                                        {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('en-GB') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.mrp ? formatCurrency(row.mrp) : '—'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.rack_location || '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        {!row._catalog && (
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => { setAdjustRow(row); setAdjustQty(''); setAdjustReason(''); }}
                                                    className="p-1.5 hover:bg-amber-50 rounded-lg"
                                                    title="Adjust Stock"
                                                >
                                                    <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(row)}
                                                    className="p-1.5 hover:bg-blue-50 rounded-lg"
                                                    title="Edit Batch"
                                                >
                                                    <Pencil className="h-3.5 w-3.5 text-blue-500" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {cursor && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button onClick={() => loadInventory({ append: true })} disabled={loadingMore} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl disabled:opacity-50">
                            {loadingMore ? 'Loading...' : 'Load more'}
                        </button>
                    </div>
                )}
            </div>

            {/* Quick Add Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleSaveBatch} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between"><h3 className="font-bold">Add Generic Item & Batch</h3><button type="button" onClick={() => setModalOpen(false)}>&times;</button></div>
                        <div className="p-6 space-y-4">
                            <input required placeholder="Brand Name" className="w-full p-2 border rounded-lg text-sm" value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} />
                            <input placeholder="Generic Name" className="w-full p-2 border rounded-lg text-sm" value={form.generic_name} onChange={e => setForm({ ...form, generic_name: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input required placeholder="Batch No" className="w-full p-2 border rounded-lg text-sm" value={form.batch_no} onChange={e => setForm({ ...form, batch_no: e.target.value })} />
                                <input required type="number" placeholder="Qty" className="w-full p-2 border rounded-lg text-sm" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input required type="number" placeholder="Selling Price (MRP)" className="w-full p-2 border rounded-lg text-sm" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                                <DateField required className="w-full p-2 border rounded-lg text-sm text-gray-500" value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Cost Price (purchase)"
                                    title="Purchase cost per unit — stock value is calculated from this"
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={form.cost_price}
                                    onChange={e => setForm({ ...form, cost_price: e.target.value })}
                                />
                                <input
                                    placeholder="HSN / SAC"
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={form.hsn_sac_code}
                                    onChange={e => setForm({ ...form, hsn_sac_code: e.target.value })}
                                />
                            </div>
                            <p className="text-[11px] text-gray-400 -mt-1">
                                Cost price drives the Stock Value figure — leave it blank and this batch counts as ₹0.
                            </p>
                            <button type="submit" className="w-full bg-orange-600 text-white font-bold p-2 rounded-lg">Save Item</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Adjust Stock Modal */}
            {adjustRow && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleAdjustStock} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between">
                            <h3 className="font-bold">Adjust Stock &mdash; {adjustRow.medicine.brand_name} ({adjustRow.batch_no})</h3>
                            <button type="button" onClick={() => setAdjustRow(null)}>&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-500">Current stock: <span className="font-bold text-gray-800">{adjustRow.current_stock}</span></p>
                            <input
                                required type="number" placeholder="Adjustment (+ to add, - to deduct)"
                                className="w-full p-2 border rounded-lg text-sm"
                                value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                            />
                            <textarea
                                required placeholder="Reason (e.g. damaged, expired, count correction)"
                                className="w-full p-2 border rounded-lg text-sm" rows={3}
                                value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                            />
                            <button type="submit" disabled={adjusting} className="w-full bg-amber-600 text-white font-bold p-2 rounded-lg disabled:opacity-50">
                                {adjusting ? 'Saving...' : 'Save Adjustment'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit Batch Modal */}
            {editRow && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleEditBatch} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-gray-50 flex justify-between">
                            <h3 className="font-bold">Edit Batch &mdash; {editRow.medicine.brand_name}</h3>
                            <button type="button" onClick={() => setEditRow(null)}>&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <input required placeholder="Batch No" className="w-full p-2 border rounded-lg text-sm" value={editForm.batch_no} onChange={e => setEditForm({ ...editForm, batch_no: e.target.value })} />
                            <DateField required className="w-full p-2 border rounded-lg text-sm text-gray-500" value={editForm.expiry} onChange={e => setEditForm({ ...editForm, expiry: e.target.value })} />
                            <input placeholder="Rack Location" className="w-full p-2 border rounded-lg text-sm" value={editForm.rack} onChange={e => setEditForm({ ...editForm, rack: e.target.value })} />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" placeholder="MRP" className="w-full p-2 border rounded-lg text-sm" value={editForm.mrp} onChange={e => setEditForm({ ...editForm, mrp: e.target.value })} />
                                <input type="number" placeholder="Cost Price" className="w-full p-2 border rounded-lg text-sm" value={editForm.cost_price} onChange={e => setEditForm({ ...editForm, cost_price: e.target.value })} />
                            </div>
                            <button type="submit" disabled={editing} className="w-full bg-blue-600 text-white font-bold p-2 rounded-lg disabled:opacity-50">
                                {editing ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
