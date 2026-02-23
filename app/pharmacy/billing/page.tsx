'use client';

import React, { useState, useEffect } from 'react';
import {
    Pill, Search, Plus, Minus, Receipt, ShoppingCart,
    Trash2, AlertTriangle, CheckCircle, Package, Printer, X, Loader2, ArrowRight,
    HeartPulse, LogOut
} from 'lucide-react';
import { getInventory, generateInvoice, getPharmacyQueue, markOrderAsPaid, addInventoryBatch } from '@/app/actions/pharmacy-actions';
import Link from 'next/link';

// Types
type InventoryItem = {
    batch_id: string;
    medicine_name: string;
    medicine_id?: number;
    expiry_date: Date;
    stock_count: number;
    unit_price: number;
};

type CartItem = InventoryItem & { quantity: number };

export default function PharmacyPage() {
    // Data State
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [search, setSearch] = useState('');
    const [patientId, setPatientId] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Order Queue State
    const [activeTab, setActiveTab] = useState<'billing' | 'orders'>('billing');
    const [orderQueue, setOrderQueue] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    // Modals
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [showInventoryModal, setShowInventoryModal] = useState(false);

    // Inventory Form State
    const [invForm, setInvForm] = useState({
        isNewMedicine: false,
        medicine_id: '',
        brand_name: '',
        generic_name: '',
        batch_no: '',
        stock: '',
        price: '',
        expiry: '',
        rack: ''
    });

    const loadInventory = async () => {
        const res = await getInventory();
        if (res.success) {
            const mappedData = res.data.map((item: any) => ({
                batch_id: item.batch_no,
                medicine_name: item.medicine?.brand_name || 'Unknown Medicine',
                medicine_id: item.medicine_id,
                expiry_date: item.expiry_date,
                stock_count: item.current_stock,
                unit_price: item.medicine?.price_per_unit || 0
            }));
            setInventory(mappedData);
        }
        setLoading(false);
    };

    const loadQueue = async () => {
        const res = await getPharmacyQueue();
        if (res.success) setOrderQueue(res.data);
    };

    useEffect(() => {
        loadInventory();
        const interval = setInterval(loadQueue, 5000);
        loadQueue();
        return () => clearInterval(interval);
    }, []);

    // Cart Logic
    const addToCart = (item: InventoryItem) => {
        setCart(prev => {
            const existing = prev.find(i => i.batch_id === item.batch_id);
            if (existing) {
                if (existing.quantity < item.stock_count) {
                    return prev.map(i => i.batch_id === item.batch_id ? { ...i, quantity: i.quantity + 1 } : i);
                }
                return prev;
            }
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const updateQty = (batchId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.batch_id === batchId) {
                const newQty = item.quantity + delta;
                if (newQty <= 0) return null;
                if (newQty > item.stock_count) return item;
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(Boolean) as CartItem[]);
    };

    const removeFromCart = (batchId: string) => {
        setCart(prev => prev.filter(i => i.batch_id !== batchId));
    };

    const totalAmount = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    // Checkout Logic
    const handleCheckout = () => {
        if (!patientId) return alert('Please enter Patient ID');
        if (cart.length === 0) return alert('Cart is empty');
        setShowInvoiceModal(true);
    };

    const confirmPayment = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const payload = cart.map(item => ({ ...item, batch_no: item.batch_id }));
            const res = await generateInvoice(patientId, payload);
            if (res.success) {
                setCart([]);
                setPatientId('');
                setShowInvoiceModal(false);
                loadInventory();
                alert('Invoice Generated & Stock Updated!');
            } else {
                alert('Checkout Failed');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrint = () => { window.print(); };

    // Inventory Management Logic
    const uniqueMedicines = Array.from(new Set(inventory.map(i => JSON.stringify({ id: i.medicine_id, name: i.medicine_name }))))
        .map(s => JSON.parse(s));

    const handleAddInventory = async () => {
        if (!invForm.batch_no || !invForm.stock || !invForm.expiry || !invForm.price) {
            return alert('Please fill all required fields');
        }
        setIsSubmitting(true);
        try {
            const payload = {
                medicine_id: invForm.isNewMedicine ? undefined : Number(invForm.medicine_id),
                brand_name: invForm.brand_name,
                generic_name: invForm.generic_name,
                batch_no: invForm.batch_no,
                stock: Number(invForm.stock),
                price: Number(invForm.price),
                expiry: new Date(invForm.expiry),
                rack: invForm.rack
            };
            const res = await addInventoryBatch(payload);
            if (res.success) {
                setShowInventoryModal(false);
                loadInventory();
                setInvForm({ isNewMedicine: false, medicine_id: '', brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', expiry: '', rack: '' });
                alert('Stock Added Successfully');
            } else {
                alert('Error: ' + res.error);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredInventory = inventory.filter(i =>
        (i.medicine_name && i.medicine_name.toLowerCase().includes(search.toLowerCase())) ||
        (i.batch_id && i.batch_id.toString().toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="flex h-screen bg-[#0B0F1A] font-sans text-white overflow-hidden relative">
            <style jsx global>{`
                @media print {
                  body * { visibility: hidden; }
                  .print-area, .print-area * { visibility: visible; }
                  .print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background: white; color: black; }
                  .no-print { display: none !important; }
                }
            `}</style>

            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
            </div>

            {/* LEFT PANEL - INVENTORY */}
            <section className="flex-[3] flex flex-col min-w-0 bg-[#0F1425]/80 backdrop-blur-xl border-r border-white/5 relative z-10">
                <div className="p-6 border-b border-white/5 bg-[#0F1425]/90">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-xl blur-md opacity-50" />
                                <div className="relative bg-gradient-to-br from-teal-400 to-emerald-600 p-2 rounded-xl shadow-lg shadow-teal-500/20">
                                    <HeartPulse className="h-5 w-5 text-white" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Pharmacy & Billing</h1>
                                <div className="flex gap-6 mt-1 text-sm font-bold text-white/30">
                                    <button onClick={() => setActiveTab('billing')} className={`pb-1 border-b-2 transition-all ${activeTab === 'billing' ? 'text-teal-400 border-teal-400' : 'border-transparent hover:text-white/50'}`}>Inventory</button>
                                    <button onClick={() => setActiveTab('orders')} className={`pb-1 border-b-2 transition-all ${activeTab === 'orders' ? 'text-teal-400 border-teal-400' : 'border-transparent hover:text-white/50'}`}>
                                        Doctor Orders
                                        {orderQueue.length > 0 && <span className="ml-2 bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">{orderQueue.length}</span>}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Link href="/login" className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-all">
                                <LogOut className="h-3.5 w-3.5" /> Logout
                            </Link>
                            <button
                                onClick={() => setShowInventoryModal(true)}
                                className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 transform hover:-translate-y-0.5 transition-all"
                            >
                                <Plus className="h-4 w-4" /> Add Stock
                            </button>
                        </div>
                    </div>

                    {activeTab === 'billing' && (
                        <div className="relative w-full group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 h-4 w-4 group-focus-within:text-teal-400 transition-colors" />
                            <input
                                value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none text-sm transition-all placeholder:text-white/20 font-medium text-white"
                                placeholder="Search medicine by name, category, or batch ID..."
                            />
                        </div>
                    )}
                </div>

                {activeTab === 'orders' ? (
                    <div className="flex-1 overflow-auto p-6">
                        {orderQueue.length === 0 ? (
                            <div className="text-center p-20 flex flex-col items-center">
                                <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                                    <Package className="h-8 w-8 text-white/15" />
                                </div>
                                <span className="text-white/30 font-bold">No incoming orders from doctors</span>
                            </div>
                        ) : orderQueue.map(order => (
                            <div key={order.id} className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] p-6 rounded-2xl border border-white/5 mb-4 hover:border-teal-500/20 transition-all relative overflow-hidden group">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-400 to-emerald-500" />
                                <div className="flex justify-between items-start mb-4 pl-2">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-500/20">{order.status}</span>
                                            <span className="text-[10px] text-white/20 font-mono">#{String(order.id).padStart(6, '0')}</span>
                                        </div>
                                        <h3 className="font-bold text-white/90 text-lg flex items-center gap-2">
                                            {order.patient?.full_name || 'Unknown Patient'}
                                            <span className="font-mono text-white/25 text-xs font-normal">({order.patient_id})</span>
                                        </h3>
                                        <p className="text-sm text-white/40 flex items-center gap-2 mt-1">
                                            <span className="bg-white/5 px-2 py-0.5 rounded text-xs font-bold text-white/50 border border-white/5">Dr. {order.doctor_id}</span>
                                            <span className="text-white/15">•</span>
                                            <span className="text-xs">{new Date(order.created_at).toLocaleTimeString()}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text tracking-tight">₹{order.total_amount}</div>
                                        <div className="text-[10px] text-white/25 font-bold uppercase mt-1">Total Bill</div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-white/5 pl-2">
                                    <button onClick={() => setSelectedOrder(order)} className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-violet-500/20 hover:from-violet-400 hover:to-indigo-500 transition-all flex items-center gap-2">
                                        <Receipt className="h-4 w-4" /> Process Order
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-[#0F1425]/95 backdrop-blur-sm z-20 border-b border-white/5">
                                <tr>
                                    {['Medicine Name', 'Batch ID', 'Expiry', 'Stock', 'Unit Price', 'Action'].map((h, i) => (
                                        <th key={i} className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 ${i === 5 ? 'text-right' : ''}`}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm">
                                {loading ? (
                                    Array(5).fill(0).map((_, i) => (
                                        <tr key={i}><td colSpan={6} className="px-6 py-6"><div className="h-4 bg-white/5 rounded w-full animate-pulse" /></td></tr>
                                    ))
                                ) : filteredInventory.map(item => (
                                    <tr key={item.batch_id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-5 font-bold text-white/80">{item.medicine_name}</td>
                                        <td className="px-6 py-5"><span className="font-mono text-white/40 text-xs bg-white/5 px-2 py-1 rounded-lg border border-white/5">{item.batch_id}</span></td>
                                        <td className="px-6 py-5 text-white/50 font-medium">
                                            <span className={`${new Date(item.expiry_date) < new Date() ? 'text-rose-400 font-bold flex items-center gap-1' : ''}`}>
                                                {new Date(item.expiry_date) < new Date() && <AlertTriangle className="h-3 w-3" />}
                                                {new Date(item.expiry_date).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${item.stock_count < 10 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-white/5 text-white/50 border-white/10'}`}>
                                                {item.stock_count}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 font-bold text-teal-400">₹{item.unit_price}</td>
                                        <td className="px-6 py-5 text-right">
                                            <button
                                                onClick={() => addToCart(item)}
                                                disabled={item.stock_count <= 0}
                                                className="bg-white/5 border border-white/10 hover:border-teal-500/30 hover:bg-teal-500/10 text-teal-400 p-2 rounded-xl transition-all disabled:opacity-20 disabled:hover:border-white/10 disabled:hover:bg-white/5"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* BILLING CART */}
            <aside className="flex-[1.2] flex flex-col bg-gradient-to-b from-[#131A2E] to-[#0F1425] border-l border-white/5 min-w-[400px] z-30 relative">
                <div className="p-6 border-b border-white/5">
                    <h2 className="text-sm font-black text-white/60 mb-4 flex items-center gap-2 uppercase tracking-[0.15em]">
                        <ShoppingCart className="h-4 w-4 text-teal-400" /> Current Bill
                    </h2>
                    <input
                        value={patientId}
                        onChange={e => setPatientId(e.target.value)}
                        className="w-full p-4 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-bold text-white placeholder:text-white/15"
                        placeholder="Enter Patient ID / Name"
                    />
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8">
                            <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                                <ShoppingCart className="h-8 w-8 text-white/10" />
                            </div>
                            <p className="font-bold text-white/25">Cart is empty</p>
                            <p className="text-xs text-white/15 mt-1">Add items from inventory</p>
                        </div>
                    ) : cart.map(item => (
                        <div key={item.batch_id} className="p-4 bg-white/[0.03] rounded-2xl border border-white/5 flex justify-between items-center group hover:border-teal-500/20 transition-colors">
                            <div>
                                <h4 className="text-sm font-bold text-white/80">{item.medicine_name}</h4>
                                <p className="text-xs text-white/30 font-medium mt-0.5">₹{item.unit_price} x {item.quantity} units</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
                                    <button onClick={() => updateQty(item.batch_id, -1)} className="h-7 w-7 flex items-center justify-center hover:bg-white/10 rounded-md text-white/50 transition-colors"><Minus className="h-3.5 w-3.5" /></button>
                                    <span className="w-8 text-center text-sm font-bold text-white/80">{item.quantity}</span>
                                    <button onClick={() => updateQty(item.batch_id, 1)} className="h-7 w-7 flex items-center justify-center hover:bg-white/10 rounded-md text-white/50 transition-colors"><Plus className="h-3.5 w-3.5" /></button>
                                </div>
                                <button onClick={() => removeFromCart(item.batch_id)} className="text-white/20 hover:text-rose-400 p-2 hover:bg-rose-500/10 rounded-lg transition-colors"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 bg-[#0F1425]/80 border-t border-white/5 z-20">
                    <div className="flex justify-between items-center mb-6">
                        <span className="font-bold text-white/25 uppercase text-[10px] tracking-[0.15em]">Total Amount</span>
                        <span className="text-4xl font-black text-transparent bg-gradient-to-r from-white to-white/70 bg-clip-text tracking-tighter">₹{totalAmount}</span>
                    </div>
                    <button
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || !patientId}
                        className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-xl shadow-teal-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                    >
                        <Receipt className="h-5 w-5" /> Generate Invoice
                    </button>
                </div>
            </aside>

            {/* INVOICE MODAL */}
            {showInvoiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden print-area">
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />
                        <div className="p-8 border-b border-dashed border-white/10 text-center relative overflow-hidden">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-xl blur-md opacity-30 mx-auto w-12 h-12" />
                                <div className="h-12 w-12 bg-gradient-to-br from-[#131A2E] to-[#0F1425] border border-white/10 rounded-xl flex items-center justify-center mx-auto mb-4 relative">
                                    <Receipt className="h-6 w-6 text-teal-400" />
                                </div>
                            </div>
                            <h2 className="text-xl font-black text-white">Avani Hospital Pharmacy</h2>
                            <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.2em] mt-1">Official Receipt</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex justify-between text-sm items-center">
                                <span className="text-white/40 font-medium">Patient Details</span>
                                <span className="font-bold text-white/90 text-base">{patientId}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span className="text-white/40 font-medium">Date</span>
                                <span className="font-bold text-white/90">{new Date().toLocaleDateString()}</span>
                            </div>
                            <div className="border-t border-dashed border-white/10 my-2 pt-6 space-y-3">
                                {cart.map(item => (
                                    <div key={item.batch_id} className="flex justify-between text-sm">
                                        <span className="font-medium text-white/60">{item.medicine_name} <span className="text-white/25 text-xs ml-1">x{item.quantity}</span></span>
                                        <span className="font-bold text-white/80">₹{item.unit_price * item.quantity}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-white/20 pt-6 flex justify-between items-end">
                                <span className="font-bold text-lg text-white/90">Total Paid</span>
                                <span className="font-black text-3xl text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text">₹{totalAmount}</span>
                            </div>
                        </div>
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3 no-print">
                            <button onClick={() => setShowInvoiceModal(false)} className="flex-1 py-3.5 font-bold text-white/30 hover:text-white/60 hover:bg-white/5 rounded-xl transition-all">Cancel</button>
                            <button onClick={handlePrint} className="flex-1 py-3.5 font-bold text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl flex items-center justify-center gap-2 transition-all"><Printer className="h-4 w-4" /> Print</button>
                            <button onClick={confirmPayment} disabled={isSubmitting} className="flex-[1.5] py-3.5 font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 rounded-xl shadow-lg shadow-teal-500/20 disabled:opacity-70 flex items-center justify-center gap-2">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* INVENTORY MODAL */}
            {showInventoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
                        <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-lg font-black text-white">Add Inventory</h3>
                            <button onClick={() => setShowInventoryModal(false)}><X className="h-5 w-5 text-white/30 hover:text-white/60 transition-colors" /></button>
                        </div>

                        <div className="p-8 space-y-5 max-h-[70vh] overflow-auto">
                            <div className="flex gap-2 mb-6 bg-white/5 p-1.5 rounded-xl border border-white/5">
                                <button onClick={() => setInvForm(f => ({ ...f, isNewMedicine: false }))} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!invForm.isNewMedicine ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>Existing Medicine</button>
                                <button onClick={() => setInvForm(f => ({ ...f, isNewMedicine: true }))} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${invForm.isNewMedicine ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>New Medicine</button>
                            </div>

                            {invForm.isNewMedicine ? (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Brand Name</label>
                                        <input value={invForm.brand_name} onChange={e => setInvForm({ ...invForm, brand_name: e.target.value })} className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-bold text-white placeholder:text-white/15" placeholder="e.g. Dolo 650" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Generic Name</label>
                                        <input value={invForm.generic_name} onChange={e => setInvForm({ ...invForm, generic_name: e.target.value })} className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-white placeholder:text-white/15" placeholder="e.g. Paracetamol" />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Select Medicine</label>
                                    <select value={invForm.medicine_id} onChange={e => setInvForm({ ...invForm, medicine_id: e.target.value })} className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-bold text-white appearance-none">
                                        <option value="" className="bg-[#131A2E]">Choose from list...</option>
                                        {uniqueMedicines.map((m: any) => <option key={m.id} value={m.id} className="bg-[#131A2E]">{m.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-5 pt-2">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Batch No</label>
                                    <input value={invForm.batch_no} onChange={e => setInvForm({ ...invForm, batch_no: e.target.value })} className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-mono font-medium text-white placeholder:text-white/15" placeholder="B-123" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Stock Qty</label>
                                    <input value={invForm.stock} onChange={e => setInvForm({ ...invForm, stock: e.target.value })} type="number" className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-bold text-white placeholder:text-white/15" placeholder="0" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Expiry Date</label>
                                    <input value={invForm.expiry} onChange={e => setInvForm({ ...invForm, expiry: e.target.value })} type="date" className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Unit Price (₹)</label>
                                    <input value={invForm.price} onChange={e => setInvForm({ ...invForm, price: e.target.value })} type="number" step="0.01" className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-bold text-white placeholder:text-white/15" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] ml-1">Rack Location</label>
                                <input value={invForm.rack} onChange={e => setInvForm({ ...invForm, rack: e.target.value })} className="w-full p-3.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-white placeholder:text-white/15" placeholder="Optional (e.g. A-4)" />
                            </div>
                        </div>

                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3">
                            <button onClick={() => setShowInventoryModal(false)} disabled={isSubmitting} className="px-6 py-3 text-white/40 font-bold hover:text-white/70 rounded-xl transition-all">Cancel</button>
                            <button onClick={handleAddInventory} disabled={isSubmitting} className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 flex items-center gap-2 disabled:opacity-70">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Stock Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PROCESS ORDER MODAL */}
            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] w-full max-w-2xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-white">Process Order #{selectedOrder.id}</h3>
                                <p className="text-sm text-white/60 font-bold mt-1">
                                    {selectedOrder.patient?.full_name || 'Unknown Patient'}
                                    <span className="text-white/25 font-mono text-xs ml-2 font-normal">{selectedOrder.patient_id}</span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)}><X className="h-6 w-6 text-white/30 hover:text-white/60" /></button>
                        </div>

                        <div className="p-8 overflow-y-auto">
                            {/* Dispensed Items */}
                            <div className="mb-8">
                                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                                    <CheckCircle className="h-3.5 w-3.5" /> Ready to Dispense
                                </h4>
                                <div className="space-y-3">
                                    {selectedOrder.items.filter((i: any) => i.status === 'Dispensed').length === 0 ? (
                                        <p className="text-white/25 text-sm">No items available to dispense.</p>
                                    ) : (
                                        selectedOrder.items.filter((i: any) => i.status === 'Dispensed').map((item: any) => (
                                            <div key={item.id} className="flex justify-between items-center p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                                <div>
                                                    <span className="font-bold text-white/80 block">{item.medicine_name}</span>
                                                    <span className="text-xs text-emerald-400 font-bold">Qty: {item.quantity_requested}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-bold text-white/80 block">₹{item.total_price}</span>
                                                    <span className="text-xs text-white/30">@ ₹{item.unit_price}/unit</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Unavailable Items */}
                            <div>
                                <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Unavailable / Out of Stock
                                </h4>
                                <div className="space-y-3">
                                    {selectedOrder.items.filter((i: any) => i.status !== 'Dispensed').length === 0 ? (
                                        <p className="text-white/25 text-sm">All requested items are available.</p>
                                    ) : (
                                        selectedOrder.items.filter((i: any) => i.status !== 'Dispensed').map((item: any) => (
                                            <div key={item.id} className="flex justify-between items-center p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl opacity-75">
                                                <div>
                                                    <span className="font-bold text-white/50 block line-through">{item.medicine_name}</span>
                                                    <span className="text-xs text-rose-400 font-bold">Qty: {item.quantity_requested}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-bold text-white/25 block">Unavailable</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-white/[0.02] border-t border-white/5 shrink-0">
                            <div className="flex justify-between items-center mb-6">
                                <span className="font-bold text-white/25 uppercase text-[10px] tracking-[0.15em]">Total Amount to Collect</span>
                                <span className="font-black text-3xl text-white">₹{selectedOrder.total_amount}</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedOrder(null)} className="px-6 py-3.5 text-white/30 font-bold hover:text-white/60 hover:bg-white/5 rounded-xl transition-all">Cancel</button>
                                <button
                                    onClick={async () => {
                                        setIsSubmitting(true);
                                        await markOrderAsPaid(selectedOrder.id);
                                        await loadQueue();
                                        setIsSubmitting(false);
                                        setSelectedOrder(null);
                                        alert("Order Completed & Delivered!");
                                    }}
                                    disabled={isSubmitting}
                                    className="flex-1 px-8 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-70 transition-all active:scale-95"
                                >
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle className="h-5 w-5" /> Mark Paid & Delivered</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
