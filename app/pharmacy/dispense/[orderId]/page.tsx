'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Pill, CheckCircle, Search, ArrowLeft, Save, AlertTriangle, SlidersHorizontal, X, Loader2 } from 'lucide-react';
import { getPharmacyOrderDetails, dispenseMedicine, checkInteractions, adjustStock } from '@/app/actions/pharmacy-actions';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DispensePage() {
    const params = useParams();
    const orderId = Number(params.orderId);
    const router = useRouter();

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [dispenseList, setDispenseList] = useState<any[]>([]);
    const [interactions, setInteractions] = useState<any>(null);

    // Stock Correction State
    const [adjustStockItem, setAdjustStockItem] = useState<any>(null);
    const [adjustStockQty, setAdjustStockQty] = useState('');
    const [adjustStockReason, setAdjustStockReason] = useState('Dispensing stock correction');
    const [adjustingStock, setAdjustingStock] = useState(false);

    const handleSaveStockAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustStockItem || adjustStockQty === '') return;
        const targetQty = Number(adjustStockQty);
        if (isNaN(targetQty) || targetQty < 0) return alert('Please enter a valid non-negative stock quantity');

        setAdjustingStock(true);
        try {
            const res = await adjustStock({
                medicine_id: adjustStockItem.medicine_id,
                batch_id: adjustStockItem.batch_id,
                target_stock_qty: targetQty,
                reason: adjustStockReason.trim() || 'Dispensing stock correction',
            });
            if (res.success) {
                setAdjustStockItem(null);
                await loadOrder();
            } else {
                alert(res.error || 'Failed to update stock');
            }
        } finally {
            setAdjustingStock(false);
        }
    };

    const loadOrder = async () => {
        setLoading(true);
        const res = await getPharmacyOrderDetails(orderId);
        if (res.success && res.data) {
            setOrder(res.data);
            // Pre-fill dispense list with asked quantities, but batch_no empty
            setDispenseList(res.data.items.map((it: any) => ({
                id: it.id,
                // Carried so handleDispense can identify the medicine. Without one of
                // these, dispenseMedicine can't resolve it and throws.
                medicine_id: it.medicine_id,
                medicine_name: it.medicine_name,
                requested_qty: it.quantity_requested || it.quantity,
                dispense_qty: it.quantity_requested || it.quantity,
                batch_no: '',
                instructions: it.instructions,
                available_batches: it.available_batches || [],
                total_stock: it.total_stock ?? 0,
            })));
        }
        setLoading(false);
    };

    useEffect(() => {
        if (orderId) loadOrder();
    }, [orderId]);

    const handleInteractionCheck = async () => {
        const drugNames = dispenseList.map(item => item.medicine_name);
        if (drugNames.length > 1) {
            const result = await checkInteractions(drugNames);
            if (result.success) setInteractions(result.data);
        }
    };

    const handleDispense = async () => {
        // Validation
        for (const item of dispenseList) {
            if (!item.batch_no) return alert('Please assign a batch number for all medicines');
        }

        setSaving(true);
        // dispenseMedicine resolves the medicine from medicine_id, falling back to
        // order_item_id — it does NOT look at medicine_name. This previously sent
        // only { medicine_name, quantity, batch_no }, so every dispense from this
        // page threw "Could not resolve medicine ID for item". Send the ids the
        // action actually reads (same contract the IP Orders screen uses).
        const toDispense = dispenseList.map(item => ({
            order_item_id: item.id,
            medicine_id: item.medicine_id,
            medicine_name: item.medicine_name,
            quantity: item.dispense_qty,
            batch_no: item.batch_no
        }));

        const res = await dispenseMedicine(orderId, toDispense);
        if (res.success) {
            router.push('/pharmacy/orders');
        } else {
            alert(res.error || 'Failed to dispense');
        }
        setSaving(false);
    };

    if (loading) return <AppShell pageTitle="Loading"><div className="p-12 text-center">Loading...</div></AppShell>;
    if (!order) return <AppShell pageTitle="Not Found"><div className="p-12 text-center text-red-500">Order not found.</div></AppShell>;

    return (
        <AppShell
            pageTitle="Dispense Medicine"
            pageIcon={<Pill className="h-5 w-5" />}
        >
            <div className="max-w-5xl mx-auto">
                <Link href="/pharmacy/orders" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 font-medium transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Queue
                </Link>

                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6">
                    <h2 className="text-xl font-black text-gray-900 mb-1">{order.patient?.full_name || 'Walk-in'}</h2>
                    <p className="text-sm font-medium text-gray-500 mb-4">Doctor: {order.doctor_id} • Ordered: {new Date(order.created_at).toLocaleString()}</p>

                    <div className="flex gap-4">
                        <button onClick={handleInteractionCheck} className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition-colors border border-indigo-200">
                            Check Drug Interactions
                        </button>
                    </div>

                    {interactions?.hasInteractions && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                            <h4 className="font-bold text-red-800 text-sm flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4" /> Warning: Potential Interactions Detected</h4>
                            <ul className="list-disc pl-5 text-xs text-red-700 space-y-1">
                                {interactions.interactions.map((ix: string, i: number) => <li key={i}>{ix}</li>)}
                            </ul>
                        </div>
                    )}
                    {interactions && !interactions.hasInteractions && (
                        <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" /> No known major interactions.
                        </div>
                    )}
                </div>

                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Prescribed Items</h3>

                    <div className="space-y-4">
                        {dispenseList.map((item, index) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center p-4 border border-gray-100 bg-gray-50 rounded-xl">
                                <div className="md:col-span-3">
                                    <p className="font-bold text-gray-900 text-sm">{item.medicine_name}</p>
                                    <p className="text-[10px] text-gray-500 font-medium">Req: {item.requested_qty} • {item.instructions}</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${item.total_stock === 0 ? 'bg-rose-100 text-rose-700' : item.total_stock <= item.requested_qty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            Stock: {item.total_stock}
                                        </span>
                                        {item.available_batches?.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const selectedBatch = item.available_batches.find((b: any) => b.batch_no === item.batch_no) || item.available_batches[0];
                                                    if (!selectedBatch) return;
                                                    setAdjustStockItem({
                                                        medicine_id: item.medicine_id,
                                                        medicine_name: item.medicine_name,
                                                        batch_id: selectedBatch.id,
                                                        batch_no: selectedBatch.batch_no,
                                                        stock_count: selectedBatch.stock,
                                                    });
                                                    setAdjustStockQty(String(selectedBatch.stock));
                                                    setAdjustStockReason('Dispensing stock correction');
                                                }}
                                                className="text-gray-400 hover:text-amber-600 p-0.5 rounded hover:bg-amber-50 transition-all"
                                                title="Correct / Edit Batch Stock"
                                            >
                                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="md:col-span-3">
                                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Batch No. *</label>
                                    {item.available_batches?.length > 0 ? (
                                        <select
                                            value={item.batch_no}
                                            onChange={(e) => {
                                                const newList = [...dispenseList];
                                                newList[index].batch_no = e.target.value;
                                                setDispenseList(newList);
                                            }}
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                        >
                                            <option value="">Select Batch</option>
                                            {item.available_batches.map((b: any) => (
                                                <option key={b.batch_no} value={b.batch_no}>
                                                    {b.batch_no} (Stock: {b.stock}, Exp: {new Date(b.expiry).toLocaleDateString('en-GB')})
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            required
                                            value={item.batch_no}
                                            onChange={(e) => {
                                                const newList = [...dispenseList];
                                                newList[index].batch_no = e.target.value;
                                                setDispenseList(newList);
                                            }}
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                            placeholder="Scan/Type Batch"
                                        />
                                    )}
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Dispense Qty</label>
                                    <input
                                        type="number"
                                        value={item.dispense_qty}
                                        onChange={(e) => {
                                            const newList = [...dispenseList];
                                            newList[index].dispense_qty = Number(e.target.value);
                                            setDispenseList(newList);
                                        }}
                                        className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-4 border-t border-gray-200 flex justify-end gap-3">
                        <Link href="/pharmacy/orders" className="px-6 py-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold rounded-xl text-sm transition-colors shadow-sm">
                            Cancel
                        </Link>
                        <button
                            onClick={handleDispense}
                            disabled={saving || order.status === 'Completed'}
                            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition-all disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" /> Complete & Dispense
                        </button>
                    </div>
                </div>
            </div>
            {/* STOCK ADJUSTMENT / CORRECTION MODAL */}
            {adjustStockItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-left">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-base font-black text-gray-900">Correct Medicine Stock</h3>
                                <p className="text-xs text-gray-500 font-medium">{adjustStockItem.medicine_name} {adjustStockItem.batch_no ? `(${adjustStockItem.batch_no})` : ''}</p>
                            </div>
                            <button onClick={() => setAdjustStockItem(null)}>
                                <X className="h-5 w-5 text-gray-400 hover:text-gray-700 transition-colors" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveStockAdjustment} className="p-6 space-y-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center justify-between">
                                <span>Current Recorded Stock:</span>
                                <span className="font-mono font-black text-sm">{adjustStockItem.stock_count} units</span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">New Actual Stock Quantity</label>
                                <input
                                    type="number"
                                    min="0"
                                    required
                                    value={adjustStockQty}
                                    onChange={(e) => setAdjustStockQty(e.target.value)}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-lg font-bold text-gray-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                                    placeholder="Enter correct total stock"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Reason for Correction</label>
                                <input
                                    type="text"
                                    required
                                    value={adjustStockReason}
                                    onChange={(e) => setAdjustStockReason(e.target.value)}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                                    placeholder="e.g. Physical count correction, stock discrepancy"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setAdjustStockItem(null)}
                                    className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={adjustingStock}
                                    className="flex-1 py-3 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {adjustingStock ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Update Stock
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
