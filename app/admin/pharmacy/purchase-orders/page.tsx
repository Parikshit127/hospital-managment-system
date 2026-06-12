'use client';

import React, { useEffect, useState } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { Truck, Plus, CheckCircle, PackageOpen, Trash2, Loader2 } from 'lucide-react';
import { getPurchaseOrders, receivePurchaseOrder, getSuppliers, createPurchaseOrder } from '@/app/actions/pharmacy-actions';
import { listMedicines } from '@/app/actions/medicine-master-actions';

export default function PurchaseOrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const [receiveModal, setReceiveModal] = useState<any>(null);
    const [receiveData, setReceiveData] = useState<any[]>([]);

    // Create PO modal state
    const [createOpen, setCreateOpen] = useState(false);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [medicines, setMedicines] = useState<any[]>([]);
    const [createSupplierId, setCreateSupplierId] = useState<number | ''>('');
    const [createItems, setCreateItems] = useState<{ medicine_id: number | ''; quantity: number; unit_price: number }[]>([
        { medicine_id: '', quantity: 1, unit_price: 0 },
    ]);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [createError, setCreateError] = useState<string>('');

    const loadOrders = async () => {
        setRefreshing(true);
        const res = await getPurchaseOrders();
        if (res.success) setOrders(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadOrders(); }, []);

    // Load suppliers + medicines when create modal is opened (once-only)
    const openCreateModal = async () => {
        setCreateError('');
        setCreateOpen(true);
        // Fetch in parallel; cache after first load
        if (suppliers.length === 0) {
            const sRes = await getSuppliers();
            if (sRes.success) setSuppliers(sRes.data || []);
        }
        if (medicines.length === 0) {
            const mRes = await listMedicines({ page: 1, limit: 500 });
            if (mRes.success) setMedicines(mRes.data?.medicines || []);
        }
    };

    const resetCreateForm = () => {
        setCreateSupplierId('');
        setCreateItems([{ medicine_id: '', quantity: 1, unit_price: 0 }]);
        setCreateError('');
        setCreateSubmitting(false);
    };

    const closeCreateModal = () => {
        setCreateOpen(false);
        resetCreateForm();
    };

    const handleCreateRowChange = (idx: number, field: 'medicine_id' | 'quantity' | 'unit_price', value: any) => {
        setCreateItems(prev => prev.map((row, i) => {
            if (i !== idx) return row;
            if (field === 'medicine_id') {
                const med = medicines.find(m => m.id === Number(value));
                return {
                    medicine_id: value === '' ? '' : Number(value),
                    quantity: row.quantity,
                    unit_price: med?.price_per_unit ? Number(med.price_per_unit) : row.unit_price,
                };
            }
            return { ...row, [field]: Number(value) || 0 };
        }));
    };

    const addItemRow = () => {
        setCreateItems(prev => [...prev, { medicine_id: '', quantity: 1, unit_price: 0 }]);
    };

    const removeItemRow = (idx: number) => {
        setCreateItems(prev => prev.filter((_, i) => i !== idx));
    };

    const createTotal = createItems.reduce((sum, r) => sum + ((typeof r.medicine_id === 'number' ? r.quantity * r.unit_price : 0)), 0);

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError('');
        if (!createSupplierId) { setCreateError('Pick a supplier.'); return; }
        const valid = createItems.filter(r => typeof r.medicine_id === 'number' && r.quantity > 0 && r.unit_price > 0);
        if (valid.length === 0) { setCreateError('Add at least one valid line: pick medicine, qty > 0, rate > 0.'); return; }

        setCreateSubmitting(true);
        const res = await createPurchaseOrder(
            Number(createSupplierId),
            valid.map(r => ({ medicine_id: Number(r.medicine_id), quantity: r.quantity, unit_price: r.unit_price })),
        );
        setCreateSubmitting(false);
        if (res.success) {
            closeCreateModal();
            loadOrders();
        } else {
            setCreateError(res.error || 'Failed to create PO.');
        }
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
        if (res.success) {
            setReceiveModal(null);
            loadOrders();
        } else {
            alert('Failed to receive items.');
        }
    };

    return (
        <AdminPage
            pageTitle="Purchase Orders"
            pageIcon={<PackageOpen className="h-5 w-5" />}
            onRefresh={loadOrders}
            refreshing={refreshing}
            headerActions={
                <button
                    type="button"
                    onClick={openCreateModal}
                    className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-sm hover:shadow-md transition-shadow"
                >
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
                            {orders.map((po) => (
                                <tr key={po.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-mono font-bold text-gray-900 bg-gray-100 rounded px-2 m-4 inline-flex items-center mt-3">{po.po_number}</td>
                                    <td className="px-6 py-4 text-gray-800 font-medium">{po.supplier?.name || `Vendor #${po.supplier_id}`}</td>
                                    <td className="px-6 py-4 font-black text-gray-900">₹{po.total_amount}</td>
                                    <td className="px-6 py-4 text-xs text-gray-500">{new Date(po.created_at).toLocaleDateString('en-GB')}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${po.status === 'Draft' ? 'bg-gray-100 text-gray-700' : po.status === 'Sent' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {po.status !== 'Received' ? (
                                            <button onClick={() => handleOpenReceive(po)} className="text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 inline-flex">
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

            {/* Create PO Modal */}
            {createOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleCreateSubmit} className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-900">Create Purchase Order</h3>
                                <p className="text-xs text-gray-500">Pick a supplier, add medicines with qty & rate, submit. Status starts as Draft.</p>
                            </div>
                            <button type="button" onClick={closeCreateModal} className="text-gray-400 hover:text-gray-900 font-bold text-xl">&times;</button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {/* Supplier */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Supplier *</label>
                                <select
                                    value={createSupplierId}
                                    onChange={(e) => setCreateSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-full md:w-1/2 p-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                                    required
                                >
                                    <option value="">— Select supplier —</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}{s.contact_person ? ` · ${s.contact_person}` : ''}</option>
                                    ))}
                                </select>
                                {suppliers.length === 0 && (
                                    <p className="text-[11px] text-amber-600 mt-1">No suppliers yet. Add suppliers under /admin/pharmacy/suppliers first.</p>
                                )}
                            </div>

                            {/* Items */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] uppercase font-bold text-gray-500">Line Items *</label>
                                    <button type="button" onClick={addItemRow} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                                        <Plus className="h-3 w-3" /> Add row
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {createItems.map((row, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-lg">
                                            <div className="col-span-12 md:col-span-6">
                                                <select
                                                    value={row.medicine_id}
                                                    onChange={(e) => handleCreateRowChange(idx, 'medicine_id', e.target.value)}
                                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                >
                                                    <option value="">— Pick medicine —</option>
                                                    {medicines.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.brand_name}{m.generic_name ? ` (${m.generic_name})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-4 md:col-span-2">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={row.quantity}
                                                    onChange={(e) => handleCreateRowChange(idx, 'quantity', e.target.value)}
                                                    placeholder="Qty"
                                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                />
                                            </div>
                                            <div className="col-span-6 md:col-span-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    value={row.unit_price}
                                                    onChange={(e) => handleCreateRowChange(idx, 'unit_price', e.target.value)}
                                                    placeholder="Rate"
                                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                                                />
                                            </div>
                                            <div className="col-span-2 md:col-span-1 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => removeItemRow(idx)}
                                                    disabled={createItems.length === 1}
                                                    className="text-rose-500 hover:text-rose-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    title="Remove row"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Total */}
                            <div className="flex justify-end pt-2 border-t">
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Estimated Total</p>
                                    <p className="text-xl font-black text-emerald-700">₹{createTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            {createError && (
                                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{createError}</div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-white flex justify-end gap-3">
                            <button type="button" onClick={closeCreateModal} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                            <button
                                type="submit"
                                disabled={createSubmitting}
                                className="px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:shadow-md text-white font-bold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                {createSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {createSubmitting ? 'Creating...' : 'Create PO'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {receiveModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleReceiveSubmit} className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrinkage-0">
                            <div>
                                <h3 className="font-bold text-gray-900">Receive Stock: {receiveModal.po_number}</h3>
                                <p className="text-xs text-gray-500">Supplier: {receiveModal.supplier?.name}</p>
                            </div>
                            <button type="button" onClick={() => setReceiveModal(null)} className="text-gray-400 hover:text-gray-900 font-bold text-xl">&times;</button>
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
                                        <input type="number" required value={item.qtyReceived} onChange={(e) => { const nd = [...receiveData]; nd[idx].qtyReceived = Number(e.target.value); setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white" />
                                    </div>
                                    <div className="col-span-6 md:col-span-3">
                                        <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Batch No</label>
                                        <input type="text" required value={item.batch_no} onChange={(e) => { const nd = [...receiveData]; nd[idx].batch_no = e.target.value; setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white" />
                                    </div>
                                    <div className="col-span-12 md:col-span-3">
                                        <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Expiry Date</label>
                                        <DateField required value={item.expiry} onChange={(e) => { const nd = [...receiveData]; nd[idx].expiry = e.target.value; setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t bg-white flex justify-end gap-3 shrinkage-0">
                            <button type="button" onClick={() => setReceiveModal(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-orange-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Save into Inventory</button>
                        </div>
                    </form>
                </div>
            )}
        </AdminPage>
    );
}
