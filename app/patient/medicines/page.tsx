'use client';

/**
 * Feature 370 — Order Medicines
 * Patient can order prescribed medicines online
 */

import React, { useState, useEffect } from 'react';
import { Pill, Search, Plus, Minus, ShoppingCart, Loader2, CheckCircle, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';

type Medicine = { id: number; brand_name: string; generic_name: string | null; category: string | null; selling_price: number };
type CartItem = Medicine & { qty: number };

export default function OrderMedicinesPage() {
    const toast = useToast();
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [filtered, setFiltered] = useState<Medicine[]>([]);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [ordering, setOrdering] = useState(false);
    const [ordered, setOrdered] = useState(false);
    const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetch('/api/patient/medicines').then(r => r.json()).then(d => {
            setMedicines(d.medicines || []);
            setFiltered(d.medicines || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!search.trim()) { setFiltered(medicines); return; }
        const q = search.toLowerCase();
        setFiltered(medicines.filter(m =>
            m.brand_name.toLowerCase().includes(q) ||
            m.generic_name?.toLowerCase().includes(q) ||
            m.category?.toLowerCase().includes(q)
        ));
    }, [search, medicines]);

    const addToCart = (med: Medicine) => {
        setCart(prev => {
            const existing = prev.find(c => c.id === med.id);
            if (existing) return prev.map(c => c.id === med.id ? { ...c, qty: c.qty + 1 } : c);
            return [...prev, { ...med, qty: 1 }];
        });
        toast.success(`${med.brand_name} added to cart`);
    };

    const updateQty = (id: number, delta: number) => {
        setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
    };

    const removeFromCart = (id: number) => setCart(prev => prev.filter(c => c.id !== id));

    const total = cart.reduce((sum, c) => sum + c.selling_price * c.qty, 0);

    const handleOrder = async () => {
        if (cart.length === 0) { toast.error('Add medicines to cart first'); return; }
        setOrdering(true);
        try {
            const res = await fetch('/api/patient/medicine-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: cart.map(c => ({ medicine_id: c.id, name: c.brand_name, qty: c.qty, price: c.selling_price })), notes }),
            });
            const data = await res.json();
            if (data.success) {
                setOrdered(true);
                setCart([]);
            } else {
                toast.error(data.error || 'Order failed');
            }
        } catch {
            toast.error('Something went wrong');
        }
        setOrdering(false);
    };

    if (ordered) {
        return (
            <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-5">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900">Order Placed!</h2>
                <p className="text-gray-500 text-sm">Your medicine order has been received. The pharmacy will process it shortly.</p>
                <button onClick={() => setOrdered(false)} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition text-sm">
                    Order More
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
            <div className="mb-6">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    <Pill className="h-6 w-6 text-orange-500" /> Order Medicines
                </h2>
                <p className="text-sm text-gray-500 mt-1">Search and order your prescribed medicines</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Medicine List */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Prescription Upload */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                        <Upload className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-amber-800">Upload Prescription (Optional)</p>
                            <p className="text-xs text-amber-600">Some medicines require a valid prescription</p>
                        </div>
                        <label className="cursor-pointer px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition">
                            {prescriptionFile ? prescriptionFile.name.slice(0, 15) + '...' : 'Upload'}
                            <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setPrescriptionFile(e.target.files?.[0] || null)} />
                        </label>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search medicines by name or category..."
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
                    ) : (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                            {filtered.length === 0 ? (
                                <p className="text-center text-gray-400 py-8 text-sm">No medicines found</p>
                            ) : filtered.map(med => {
                                const inCart = cart.find(c => c.id === med.id);
                                return (
                                    <div key={med.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-orange-300 transition">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm text-gray-900">{med.brand_name}</p>
                                            <p className="text-xs text-gray-400">{med.generic_name || med.category || '—'}</p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="font-bold text-sm text-gray-800">₹{med.selling_price}</span>
                                            {inCart ? (
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => updateQty(med.id, -1)} className="w-7 h-7 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center hover:bg-orange-200"><Minus className="w-3 h-3" /></button>
                                                    <span className="w-6 text-center text-sm font-bold">{inCart.qty}</span>
                                                    <button onClick={() => updateQty(med.id, 1)} className="w-7 h-7 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center hover:bg-orange-200"><Plus className="w-3 h-3" /></button>
                                                </div>
                                            ) : (
                                                <button onClick={() => addToCart(med)} className="px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition">
                                                    + Add
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Cart */}
                <div className="space-y-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 sticky top-20">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                            <ShoppingCart className="w-4 h-4 text-orange-500" /> Cart ({cart.length})
                        </h3>
                        {cart.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">Your cart is empty</p>
                        ) : (
                            <>
                                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                                    {cart.map(item => (
                                        <div key={item.id} className="flex items-center justify-between text-sm">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-800 truncate">{item.brand_name}</p>
                                                <p className="text-xs text-gray-400">₹{item.selling_price} × {item.qty}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-bold text-gray-900">₹{(item.selling_price * item.qty).toFixed(0)}</span>
                                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-gray-100 pt-3 mb-4">
                                    <div className="flex justify-between font-black text-gray-900">
                                        <span>Total</span>
                                        <span>₹{total.toFixed(0)}</span>
                                    </div>
                                </div>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Delivery address or special instructions..."
                                    rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs mb-3 focus:outline-none focus:border-orange-400 resize-none" />
                                <button onClick={handleOrder} disabled={ordering}
                                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                    {ordering ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing...</> : 'Place Order'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
