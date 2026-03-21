'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Pill, CheckCircle, Search, ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import { getPharmacyOrderDetails, dispenseMedicine, checkInteractions } from '@/app/actions/pharmacy-actions';
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

    const loadOrder = async () => {
        setLoading(true);
        const res = await getPharmacyOrderDetails(orderId);
        if (res.success && res.data) {
            setOrder(res.data);
            // Pre-fill dispense list with asked quantities, but batch_no empty
            setDispenseList(res.data.items.map((it: any) => ({
                id: it.id,
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
        const toDispense = dispenseList.map(item => ({
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
                                    <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${item.total_stock === 0 ? 'bg-rose-100 text-rose-700' : item.total_stock <= item.requested_qty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        Stock: {item.total_stock}
                                    </span>
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
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                        >
                                            <option value="">Select Batch</option>
                                            {item.available_batches.map((b: any) => (
                                                <option key={b.batch_no} value={b.batch_no}>
                                                    {b.batch_no} (Stock: {b.stock}, Exp: {new Date(b.expiry).toLocaleDateString('en-IN')})
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
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
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
                                        className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
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
        </AppShell>
    );
}
