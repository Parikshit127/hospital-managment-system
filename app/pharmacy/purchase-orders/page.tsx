'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Truck, Plus, CheckCircle, PackageOpen, X, Search, AlertTriangle, ListChecks } from 'lucide-react';
import { getPurchaseOrders, receivePurchaseOrder, createPurchaseOrder, getSuppliers, getInventory } from '@/app/actions/pharmacy-actions';

type PoItem = { medicine_id: number; name: string; quantity: number; unit_price: number; gst_rate: number };

export default function PurchaseOrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state for receiving items
    const [receiveModal, setReceiveModal] = useState<any>(null);
    const [receiveData, setReceiveData] = useState<any[]>([]);

    // Create PO modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [medicines, setMedicines] = useState<any[]>([]);
    const [poForm, setPoForm] = useState({ supplier_id: '', notes: '' });
    const [poItems, setPoItems] = useState<PoItem[]>([]);
    const [medicineSearch, setMedicineSearch] = useState('');
    const [showMedDropdown, setShowMedDropdown] = useState(false);
    const [creating, setCreating] = useState(false);

    // Bulk select mode
    const [showBulkSelect, setShowBulkSelect] = useState(false);
    const [bulkSearch, setBulkSearch] = useState('');
    const [bulkFilter, setBulkFilter] = useState<'all' | 'low'>('all');
    const [selectedMedIds, setSelectedMedIds] = useState<Set<number>>(new Set());

    const loadOrders = async () => {
        setRefreshing(true);
        const res = await getPurchaseOrders();
        if (res.success) setOrders(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadOrders(); }, []);

    const openCreateModal = async () => {
        setShowCreateModal(true);
        setPoForm({ supplier_id: '', notes: '' });
        setPoItems([]);
        setMedicineSearch('');
        setShowBulkSelect(false);
        setBulkSearch('');
        setBulkFilter('all');
        setSelectedMedIds(new Set());
        const [sRes, mRes] = await Promise.all([getSuppliers(), getInventory()]);
        if (sRes.success) setSuppliers(sRes.data || []);
        if (mRes.success) setMedicines(mRes.data || []);
    };

    // ── Single medicine search add ──────────────────────────────────────
    const addMedicineToOrder = (med: any) => {
        if (poItems.find(i => i.medicine_id === med.medicine_id)) return;
        setPoItems(prev => [...prev, {
            medicine_id: med.medicine_id,
            name: med.brand_name || med.medicine?.brand_name,
            quantity: 1,
            unit_price: Number(med.price_per_unit || med.medicine?.price_per_unit || 0),
            gst_rate: Number(med.gst_percent || med.medicine?.gst_percent || 0),
        }]);
        setMedicineSearch('');
        setShowMedDropdown(false);
    };

    // ── Bulk select helpers ─────────────────────────────────────────────
    const bulkMeds = useMemo(() => {
        let list = medicines.map((m: any) => {
            const totalStock = m.batches
                ? m.batches.reduce((s: number, b: any) => s + b.current_stock, 0)
                : Number(m.current_stock || 0);
            const threshold = Number(m.min_threshold || m.medicine?.min_threshold || 10);
            return { ...m, totalStock, threshold, isLow: totalStock <= threshold };
        });
        if (bulkFilter === 'low') list = list.filter(m => m.isLow);
        if (bulkSearch) {
            const q = bulkSearch.toLowerCase();
            list = list.filter(m =>
                (m.brand_name || m.medicine?.brand_name || '').toLowerCase().includes(q) ||
                (m.generic_name || m.medicine?.generic_name || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [medicines, bulkFilter, bulkSearch]);

    const toggleBulkSelect = (medId: number) => {
        setSelectedMedIds(prev => {
            const next = new Set(prev);
            next.has(medId) ? next.delete(medId) : next.add(medId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedMedIds.size === bulkMeds.length) {
            setSelectedMedIds(new Set());
        } else {
            setSelectedMedIds(new Set(bulkMeds.map((m: any) => m.medicine_id)));
        }
    };

    const applyBulkSelection = () => {
        const toAdd = medicines
            .filter((m: any) => selectedMedIds.has(m.medicine_id) && !poItems.find(i => i.medicine_id === m.medicine_id))
            .map((m: any) => ({
                medicine_id: m.medicine_id,
                name: m.brand_name || m.medicine?.brand_name || '',
                quantity: 1,
                unit_price: Number(m.price_per_unit || m.medicine?.price_per_unit || 0),
                gst_rate: Number(m.gst_percent || m.medicine?.gst_percent || 0),
            }));
        setPoItems(prev => [...prev, ...toAdd]);
        setShowBulkSelect(false);
        setSelectedMedIds(new Set());
    };

    const addAllLowStock = () => {
        const lowMeds = medicines.filter((m: any) => {
            const totalStock = m.batches
                ? m.batches.reduce((s: number, b: any) => s + b.current_stock, 0)
                : Number(m.current_stock || 0);
            const threshold = Number(m.min_threshold || m.medicine?.min_threshold || 10);
            return totalStock <= threshold && !poItems.find(i => i.medicine_id === m.medicine_id);
        });
        if (lowMeds.length === 0) { alert('No low-stock medicines to add.'); return; }
        setPoItems(prev => [
            ...prev,
            ...lowMeds.map((m: any) => ({
                medicine_id: m.medicine_id,
                name: m.brand_name || m.medicine?.brand_name || '',
                quantity: 1,
                unit_price: Number(m.price_per_unit || m.medicine?.price_per_unit || 0),
                gst_rate: Number(m.gst_percent || m.medicine?.gst_percent || 0),
            })),
        ]);
    };

    // ── Item table helpers ──────────────────────────────────────────────
    const updateItem = (idx: number, field: string, value: any) => {
        setPoItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: Number(value) }; return u; });
    };
    const removeItem = (idx: number) => setPoItems(prev => prev.filter((_, i) => i !== idx));

    const handleCreatePO = async () => {
        if (!poForm.supplier_id || poItems.length === 0) return alert('Select supplier and add at least one item.');
        setCreating(true);
        const res = await createPurchaseOrder(
            Number(poForm.supplier_id),
            poItems.map(i => ({ medicine_id: i.medicine_id, quantity: i.quantity, unit_price: i.unit_price, gst_rate: i.gst_rate })),
            { notes: poForm.notes || undefined }
        );
        setCreating(false);
        if (res.success) { setShowCreateModal(false); loadOrders(); }
        else alert(res.error || 'Failed to create PO');
    };

    const handleOpenReceive = (po: any) => {
        setReceiveModal(po);
        setReceiveData(po.items.map((it: any) => ({
            itemId: it.id,
            medicine: it.medicine.brand_name,
            ordered: it.quantity_ordered,
            qtyReceived: it.quantity_ordered - it.quantity_received,
            batch_no: '',
            expiry: ''
        })));
    };

    const handleReceiveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        for (const item of receiveData) {
            if (!item.batch_no || !item.expiry) return alert('Batch and Expiry are required for all received items.');
        }
        const res = await receivePurchaseOrder(receiveModal.id, receiveData);
        if (res.success) { setReceiveModal(null); loadOrders(); }
        else alert('Failed to receive items.');
    };

    const filteredMeds = medicines.filter((m: any) =>
        (m.brand_name || m.medicine?.brand_name || '').toLowerCase().includes(medicineSearch.toLowerCase()) &&
        !poItems.find(i => i.medicine_id === m.medicine_id)
    ).slice(0, 15);

    const poTotal = poItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const lowStockCount = medicines.filter((m: any) => {
        const totalStock = m.batches ? m.batches.reduce((s: number, b: any) => s + b.current_stock, 0) : Number(m.current_stock || 0);
        return totalStock <= Number(m.min_threshold || m.medicine?.min_threshold || 10);
    }).length;

    return (
        <AppShell
            pageTitle="Purchase Orders"
            pageIcon={<PackageOpen className="h-5 w-5" />}
            onRefresh={loadOrders}
            refreshing={refreshing}
            headerActions={
                <button onClick={openCreateModal} className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-sm">
                    <Plus className="h-4 w-4" /> Create PO
                </button>
            }
        >
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">PO Number</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Supplier</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Total Amount</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 right-align">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {orders.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-16 text-center text-gray-400 text-sm">No purchase orders yet</td></tr>
                            ) : orders.map((po) => (
                                <tr key={po.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4"><span className="font-mono font-bold text-gray-900 bg-gray-100 rounded px-2 py-1">{po.po_number}</span></td>
                                    <td className="px-6 py-4 text-gray-800 font-medium">{po.supplier?.name || `Vendor #${po.supplier_id}`}</td>
                                    <td className="px-6 py-4 font-black text-gray-900">₹{Number(po.total_amount).toLocaleString('en-IN')}</td>
                                    <td className="px-6 py-4 text-xs text-gray-500">{new Date(po.created_at).toLocaleDateString('en-GB')}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${po.status === 'Draft' ? 'bg-gray-100 text-gray-700' : po.status === 'Sent' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {po.status !== 'Received' ? (
                                            <button onClick={() => handleOpenReceive(po)} className="text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-bold text-xs inline-flex items-center gap-1">
                                                <Truck className="h-3 w-3" /> Receive Stock
                                            </button>
                                        ) : (
                                            <span className="text-gray-400 font-bold text-xs flex items-center justify-end gap-1"><CheckCircle className="h-3 w-3" /> Fully Received</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Receive Modal ── */}
            {receiveModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleReceiveSubmit} className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-900">Receive Stock: {receiveModal.po_number}</h3>
                                <p className="text-xs text-gray-500">Supplier: {receiveModal.supplier?.name}</p>
                            </div>
                            <button type="button" onClick={() => setReceiveModal(null)} className="text-gray-400 hover:text-gray-900 text-xl font-bold">&times;</button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {receiveData.map((item, idx) => (
                                <div key={item.itemId} className="p-4 border border-teal-100 bg-orange-50/30 rounded-xl grid grid-cols-12 gap-4 items-center">
                                    <div className="col-span-12 md:col-span-3">
                                        <p className="font-bold text-sm text-gray-900">{item.medicine}</p>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Ordered: {item.ordered}</p>
                                    </div>
                                    <div className="col-span-6 md:col-span-3">
                                        <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Qty Receiving</label>
                                        <input type="number" required value={item.qtyReceived} onChange={e => { const nd = [...receiveData]; nd[idx].qtyReceived = Number(e.target.value); setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white" />
                                    </div>
                                    <div className="col-span-6 md:col-span-3">
                                        <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Batch No</label>
                                        <input type="text" required value={item.batch_no} onChange={e => { const nd = [...receiveData]; nd[idx].batch_no = e.target.value; setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white" />
                                    </div>
                                    <div className="col-span-12 md:col-span-3">
                                        <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Expiry Date</label>
                                        <input type="date" required value={item.expiry} onChange={e => { const nd = [...receiveData]; nd[idx].expiry = e.target.value; setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t bg-white flex justify-end gap-3">
                            <button type="button" onClick={() => setReceiveModal(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Save into Inventory</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Create PO Modal ── */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">Create Purchase Order</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-900"><X className="h-5 w-5" /></button>
                        </div>

                        <div className="p-5 overflow-y-auto flex-1 space-y-4">
                            {/* Supplier */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Supplier *</label>
                                <select value={poForm.supplier_id} onChange={e => setPoForm({ ...poForm, supplier_id: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm">
                                    <option value="">Select supplier...</option>
                                    {suppliers.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name || s.vendor_name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Add medicines — 3 ways */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Add Medicines</label>
                                    <div className="flex items-center gap-2">
                                        {/* Quick: add all low stock */}
                                        {lowStockCount > 0 && (
                                            <button type="button" onClick={addAllLowStock}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100 transition-colors">
                                                <AlertTriangle className="h-3 w-3" /> Add All Low Stock ({lowStockCount})
                                            </button>
                                        )}
                                        {/* Bulk select from full list */}
                                        <button type="button" onClick={() => setShowBulkSelect(true)}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors">
                                            <ListChecks className="h-3 w-3" /> Select from List
                                        </button>
                                    </div>
                                </div>

                                {/* Single search */}
                                <div className="relative">
                                    <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2 gap-2">
                                        <Search className="h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Search & add one medicine..."
                                            value={medicineSearch}
                                            onChange={e => { setMedicineSearch(e.target.value); setShowMedDropdown(true); }}
                                            onFocus={() => setShowMedDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowMedDropdown(false), 200)}
                                            className="flex-1 text-sm outline-none"
                                        />
                                    </div>
                                    {showMedDropdown && medicineSearch.length > 0 && (
                                        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                                            {filteredMeds.length === 0 ? (
                                                <div className="px-3 py-2 text-xs text-gray-400">No medicines found</div>
                                            ) : filteredMeds.map((m: any) => (
                                                <div key={m.medicine_id} onMouseDown={() => addMedicineToOrder(m)}
                                                    className="px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer flex justify-between">
                                                    <span>{m.brand_name || m.medicine?.brand_name}</span>
                                                    <span className="text-gray-400 text-xs">₹{Number(m.price_per_unit || m.medicine?.price_per_unit || 0).toLocaleString('en-IN')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Items Table */}
                            {poItems.length > 0 && (
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Medicine</th>
                                                <th className="px-3 py-2 text-center">Qty</th>
                                                <th className="px-3 py-2 text-center">Price (₹)</th>
                                                <th className="px-3 py-2 text-center">GST %</th>
                                                <th className="px-3 py-2 text-center">Total</th>
                                                <th className="px-3 py-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {poItems.map((item, idx) => (
                                                <tr key={item.medicine_id}>
                                                    <td className="px-3 py-2 font-medium text-gray-800">{item.name}</td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" min="1" value={item.quantity}
                                                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                                            className="w-16 text-center border border-gray-200 rounded p-1 text-sm" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" min="0" value={item.unit_price}
                                                            onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                                                            className="w-24 text-center border border-gray-200 rounded p-1 text-sm" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" min="0" max="100" value={item.gst_rate}
                                                            onChange={e => updateItem(idx, 'gst_rate', e.target.value)}
                                                            className="w-16 text-center border border-gray-200 rounded p-1 text-sm" />
                                                    </td>
                                                    <td className="px-3 py-2 text-center font-semibold">
                                                        ₹{(item.quantity * item.unit_price).toLocaleString('en-IN')}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50">
                                            <tr>
                                                <td colSpan={4} className="px-3 py-2 text-right font-bold text-gray-700 text-sm">Total:</td>
                                                <td className="px-3 py-2 text-center font-black text-gray-900">₹{poTotal.toLocaleString('en-IN')}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Notes */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notes (optional)</label>
                                <textarea value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })}
                                    rows={2} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm resize-none"
                                    placeholder="Any instructions for this order..." />
                            </div>
                        </div>

                        <div className="p-4 border-t bg-white flex justify-between items-center">
                            <span className="text-xs text-gray-400">{poItems.length} item{poItems.length !== 1 ? 's' : ''} added</span>
                            <div className="flex gap-3">
                                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                                <button onClick={handleCreatePO} disabled={creating || !poForm.supplier_id || poItems.length === 0}
                                    className="px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center gap-2">
                                    {creating ? 'Creating...' : <><Plus className="h-4 w-4" /> Create PO</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk Select Modal ── */}
            {showBulkSelect && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-900">Select Medicines</h3>
                                <p className="text-xs text-gray-500 mt-0.5">{selectedMedIds.size} selected</p>
                            </div>
                            <button onClick={() => setShowBulkSelect(false)} className="text-gray-400 hover:text-gray-900"><X className="h-5 w-5" /></button>
                        </div>

                        {/* Search + filter */}
                        <div className="p-4 border-b flex items-center gap-3">
                            <div className="flex items-center flex-1 border border-gray-200 rounded-lg px-3 py-2 gap-2">
                                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                                <input type="text" placeholder="Search medicine..." value={bulkSearch}
                                    onChange={e => setBulkSearch(e.target.value)}
                                    className="flex-1 text-sm outline-none" />
                            </div>
                            <div className="flex gap-1">
                                {(['all', 'low'] as const).map(f => (
                                    <button key={f} onClick={() => setBulkFilter(f)}
                                        className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${bulkFilter === f ? (f === 'low' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-teal-50 border-teal-300 text-teal-700') : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                        {f === 'all' ? 'All' : `⚠ Low Stock`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Select All row */}
                        <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-3">
                            <input type="checkbox"
                                checked={bulkMeds.length > 0 && selectedMedIds.size === bulkMeds.length}
                                onChange={toggleSelectAll}
                                className="h-4 w-4 rounded border-gray-300 text-teal-600" />
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Select All ({bulkMeds.length})
                            </span>
                        </div>

                        {/* Medicine list */}
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                            {bulkMeds.length === 0 ? (
                                <div className="px-4 py-12 text-center text-sm text-gray-400">No medicines found</div>
                            ) : bulkMeds.map((m: any) => {
                                const alreadyInPO = poItems.some(i => i.medicine_id === m.medicine_id);
                                return (
                                    <label key={m.medicine_id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${alreadyInPO ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                        <input type="checkbox"
                                            checked={selectedMedIds.has(m.medicine_id)}
                                            disabled={alreadyInPO}
                                            onChange={() => !alreadyInPO && toggleBulkSelect(m.medicine_id)}
                                            className="h-4 w-4 rounded border-gray-300 text-teal-600 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm text-gray-900 truncate">
                                                    {m.brand_name || m.medicine?.brand_name}
                                                </span>
                                                {m.isLow && (
                                                    <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold rounded">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Low
                                                    </span>
                                                )}
                                                {alreadyInPO && (
                                                    <span className="shrink-0 text-[10px] text-gray-400 font-bold">Already added</span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-400">{m.generic_name || m.medicine?.generic_name || ''}</span>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-bold text-gray-700">Stock: {m.totalStock}</p>
                                            <p className="text-xs text-gray-400">₹{Number(m.price_per_unit || m.medicine?.price_per_unit || 0).toLocaleString('en-IN')}</p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="p-4 border-t bg-white flex justify-between items-center">
                            <span className="text-sm text-gray-500">{selectedMedIds.size} medicine{selectedMedIds.size !== 1 ? 's' : ''} selected</span>
                            <div className="flex gap-3">
                                <button onClick={() => setShowBulkSelect(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                                <button onClick={applyBulkSelection} disabled={selectedMedIds.size === 0}
                                    className="px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-40 flex items-center gap-2">
                                    <ListChecks className="h-4 w-4" /> Add {selectedMedIds.size > 0 ? selectedMedIds.size : ''} to PO
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}

