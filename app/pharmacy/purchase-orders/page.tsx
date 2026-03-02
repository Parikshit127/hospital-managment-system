'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Truck, Plus, CheckCircle, PackageOpen } from 'lucide-react';
import { getPurchaseOrders, receivePurchaseOrder } from '@/app/actions/pharmacy-actions';

export default function PurchaseOrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state for receiving items
    const [receiveModal, setReceiveModal] = useState<any>(null); // holds the PO object
    const [receiveData, setReceiveData] = useState<any[]>([]);

    const loadOrders = async () => {
        setRefreshing(true);
        const res = await getPurchaseOrders();
        if (res.success) setOrders(res.data);
        setRefreshing(false);
    };

    useEffect(() => { loadOrders(); }, []);

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
        // Validation
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
        <AppShell
            pageTitle="Purchase Orders"
            pageIcon={<PackageOpen className="h-5 w-5" />}
            onRefresh={loadOrders}
            refreshing={refreshing}
            headerActions={
                <button className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-sm">
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
                                    <td className="px-6 py-4 text-xs text-gray-500">{new Date(po.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${po.status === 'Draft' ? 'bg-gray-100 text-gray-700' : po.status === 'Sent' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {po.status !== 'Received' ? (
                                            <button onClick={() => handleOpenReceive(po)} className="text-teal-600 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 inline-flex">
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

            {/* Receive Modal */}
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
                                <div key={item.itemId} className="p-4 border border-teal-100 bg-teal-50/30 rounded-xl grid grid-cols-12 gap-4 items-center">
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
                                        <input type="date" required value={item.expiry} onChange={(e) => { const nd = [...receiveData]; nd[idx].expiry = e.target.value; setReceiveData(nd); }} className="w-full p-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t bg-white flex justify-end gap-3 shrinkage-0">
                            <button type="button" onClick={() => setReceiveModal(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Save into Inventory</button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}
