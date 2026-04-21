'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Pill, Search, Plus, Minus, Receipt, ShoppingCart,
    Trash2, AlertTriangle, CheckCircle, Package, Printer, X, Loader2,
    CreditCard, Banknote, Smartphone, Clock, IndianRupee, FileText
} from 'lucide-react';
import { getInventory, generateInvoice, getPharmacyQueue, markOrderAsPaid, addInventoryBatch } from '@/app/actions/pharmacy-actions';
import { AppShell } from '@/app/components/layout/AppShell';

type InventoryItem = {
    batch_id: string;
    medicine_name: string;
    medicine_id?: number;
    expiry_date: Date;
    stock_count: number;
    unit_price: number;
    mrp: number;
    gst_percent: number;
    hsn_sac_code: string;
};

type CartItem = InventoryItem & { quantity: number };

const PAYMENT_METHODS = [
    { id: 'Cash', label: 'Cash', icon: Banknote },
    { id: 'Card', label: 'Card', icon: CreditCard },
    { id: 'UPI', label: 'UPI', icon: Smartphone },
];

function getExpiryStatus(expiry: Date) {
    const now = new Date();
    const exp = new Date(expiry);
    const daysLeft = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: 'EXPIRED', color: 'bg-red-500 text-white', urgent: true };
    if (daysLeft <= 30) return { label: `${daysLeft}d left`, color: 'bg-red-100 text-red-700 border border-red-200', urgent: true };
    if (daysLeft <= 60) return { label: `${daysLeft}d left`, color: 'bg-amber-100 text-amber-700 border border-amber-200', urgent: false };
    if (daysLeft <= 90) return { label: `${daysLeft}d left`, color: 'bg-yellow-50 text-yellow-700 border border-yellow-200', urgent: false };
    return { label: new Date(expiry).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), color: 'bg-gray-100 text-gray-500 border border-gray-200', urgent: false };
}

export default function PharmacyPage() {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [search, setSearch] = useState('');
    const [patientId, setPatientId] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('Cash');

    const [activeTab, setActiveTab] = useState<'billing' | 'orders'>('billing');
    const [orderQueue, setOrderQueue] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [invoiceResult, setInvoiceResult] = useState<any>(null);
    const [showInventoryModal, setShowInventoryModal] = useState(false);

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

    const loadInventory = useCallback(async () => {
        const res = await getInventory();
        if (res.success) {
            const mappedData = res.data.map((item: any) => ({
                batch_id: item.batch_no,
                medicine_name: item.medicine?.brand_name || 'Unknown Medicine',
                medicine_id: item.medicine_id,
                expiry_date: item.expiry_date,
                stock_count: item.current_stock,
                unit_price: Number(item.medicine?.selling_price) || Number(item.medicine?.price_per_unit) || 0,
                mrp: Number(item.medicine?.mrp) || Number(item.medicine?.price_per_unit) || 0,
                gst_percent: Number(item.medicine?.gst_percent) || Number(item.medicine?.tax_rate) || 0,
                hsn_sac_code: item.medicine?.hsn_sac_code || '3004',
            }));
            setInventory(mappedData);
        }
        setLoading(false);
    }, []);

    const loadQueue = useCallback(async () => {
        const res = await getPharmacyQueue();
        if (res.success) setOrderQueue(res.data);
    }, []);

    const loadData = async () => {
        setLoading(true);
        await Promise.all([loadInventory(), loadQueue()]);
    };

    useEffect(() => {
        loadInventory();
        const interval = setInterval(loadQueue, 5000);
        loadQueue();
        return () => clearInterval(interval);
    }, [loadInventory, loadQueue]);

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

    // GST calculations
    const subtotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const totalTax = cart.reduce((sum, item) => {
        const net = item.unit_price * item.quantity;
        return sum + (net * item.gst_percent / 100);
    }, 0);
    const cgst = totalTax / 2;
    const sgst = totalTax / 2;
    const grandTotal = subtotal + totalTax;

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
                setInvoiceResult(res);
                setCart([]);
                loadInventory();
            } else {
                alert('Checkout Failed: ' + (res.error || ''));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrint = () => { window.print(); };

    const closeInvoice = () => {
        setShowInvoiceModal(false);
        setInvoiceResult(null);
        setPatientId('');
    };

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
        <AppShell pageTitle="Pharmacy" pageIcon={<Pill className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
            <style jsx global>{`
                @media print {
                  body * { visibility: hidden; }
                  .print-area, .print-area * { visibility: visible; }
                  .print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background: white; color: black; }
                  .no-print { display: none !important; }
                }
            `}</style>

            <div className="flex h-[calc(100vh-4rem)] overflow-hidden relative">

                {/* LEFT PANEL */}
                <section className="flex-[3] flex flex-col min-w-0 bg-white border-r border-gray-200 relative z-10">
                    <div className="p-6 border-b border-gray-200 bg-white">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h1 className="text-lg font-black tracking-tight text-gray-900">Pharmacy & Billing</h1>
                                <div className="flex gap-6 mt-1 text-sm font-bold text-gray-400">
                                    <button onClick={() => setActiveTab('billing')} className={`pb-1 border-b-2 transition-all ${activeTab === 'billing' ? 'text-teal-500 border-teal-500' : 'border-transparent hover:text-gray-500'}`}>Inventory</button>
                                    <button onClick={() => setActiveTab('orders')} className={`pb-1 border-b-2 transition-all ${activeTab === 'orders' ? 'text-teal-500 border-teal-500' : 'border-transparent hover:text-gray-500'}`}>
                                        Doctor Orders
                                        {orderQueue.length > 0 && <span className="ml-2 bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">{orderQueue.length}</span>}
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowInventoryModal(true)}
                                className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 transform hover:-translate-y-0.5 transition-all"
                            >
                                <Plus className="h-4 w-4" /> Add Stock
                            </button>
                        </div>

                        {activeTab === 'billing' && (
                            <div className="relative w-full group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 h-4 w-4 group-focus-within:text-teal-500 transition-colors" />
                                <input
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none text-sm transition-all placeholder:text-gray-400 font-medium text-gray-900"
                                    placeholder="Search medicine by name or batch..."
                                />
                            </div>
                        )}
                    </div>

                    {activeTab === 'orders' ? (
                        <div className="flex-1 overflow-auto p-6">
                            {orderQueue.length === 0 ? (
                                <div className="text-center p-20 flex flex-col items-center">
                                    <div className="h-16 w-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                                        <Package className="h-8 w-8 text-gray-300" />
                                    </div>
                                    <span className="text-gray-400 font-bold">No incoming orders from doctors</span>
                                </div>
                            ) : orderQueue.map(order => (
                                <div key={order.id} className="bg-white border border-gray-200 shadow-sm p-6 rounded-2xl mb-4 hover:border-teal-500/20 transition-all relative overflow-hidden group">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-400 to-emerald-500" />
                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="bg-amber-500/10 text-amber-500 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-500/20">{order.status}</span>
                                                {order.is_ipd_linked && (
                                                    <span className="bg-blue-500/10 text-blue-500 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-blue-500/20">IPD</span>
                                                )}
                                                <span className="text-[10px] text-gray-300 font-mono">#{String(order.id).padStart(6, '0')}</span>
                                            </div>
                                            <h3 className="font-bold text-gray-700 text-lg">
                                                {order.patient?.full_name || 'Unknown Patient'}
                                                <span className="font-mono text-gray-400 text-xs font-normal ml-2">({order.patient_id})</span>
                                            </h3>
                                            <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-bold text-gray-500 border border-gray-200">Dr. {order.doctor_id}</span>
                                                <span className="text-gray-300">|</span>
                                                <Clock className="h-3 w-3 text-gray-400" />
                                                <span className="text-xs">{new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm text-gray-400 font-bold">{order.items?.length || 0} items</div>
                                            {order.stockWarning && (
                                                <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${order.stockWarning === 'Out of Stock' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                                    <AlertTriangle className="h-3 w-3" /> {order.stockWarning}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Items preview */}
                                    <div className="pl-2 mb-4 flex flex-wrap gap-1.5">
                                        {order.items?.slice(0, 5).map((item: any, idx: number) => (
                                            <span key={idx} className="bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg text-xs text-gray-600 font-medium">
                                                {item.medicine_name} <span className="text-gray-400">x{item.quantity_requested}</span>
                                            </span>
                                        ))}
                                        {order.items?.length > 5 && <span className="text-xs text-gray-400 py-1">+{order.items.length - 5} more</span>}
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 pl-2">
                                        <button onClick={() => setSelectedOrder(order)} className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-teal-500/20 hover:from-teal-400 hover:to-emerald-500 transition-all flex items-center gap-2">
                                            <Receipt className="h-4 w-4" /> Process Order
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white z-20 border-b border-gray-200">
                                    <tr>
                                        {['Medicine', 'Batch', 'Expiry', 'Stock', 'Price', 'GST', ''].map((h, i) => (
                                            <th key={i} className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-gray-400 ${i === 6 ? 'w-12' : ''}`}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-sm">
                                    {loading ? (
                                        Array(5).fill(0).map((_, i) => (
                                            <tr key={i}><td colSpan={7} className="px-5 py-5"><div className="h-4 bg-gray-100 rounded w-full animate-pulse" /></td></tr>
                                        ))
                                    ) : filteredInventory.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center py-16 text-gray-400 font-medium">No medicines found</td></tr>
                                    ) : filteredInventory.map(item => {
                                        const expStatus = getExpiryStatus(item.expiry_date);
                                        const isExpired = new Date(item.expiry_date) < new Date();
                                        return (
                                            <tr key={item.batch_id} className={`hover:bg-gray-50/50 transition-colors ${isExpired ? 'opacity-50' : ''}`}>
                                                <td className="px-5 py-4">
                                                    <span className="font-bold text-gray-700">{item.medicine_name}</span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="font-mono text-gray-500 text-xs bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{item.batch_id}</span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${expStatus.color}`}>
                                                        {expStatus.urgent && <AlertTriangle className="h-3 w-3 inline mr-0.5 -mt-0.5" />}
                                                        {expStatus.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${item.stock_count <= 0 ? 'bg-red-50 text-red-500 border-red-200' : item.stock_count < 10 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                                        {item.stock_count}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="font-bold text-gray-700">₹{item.unit_price.toFixed(2)}</span>
                                                    {item.mrp > item.unit_price && (
                                                        <span className="block line-through text-gray-400 text-[10px]">MRP ₹{item.mrp}</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="text-xs text-gray-500 font-medium">{item.gst_percent}%</span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <button
                                                        onClick={() => addToCart(item)}
                                                        disabled={item.stock_count <= 0 || isExpired}
                                                        className="bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-600 p-1.5 rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* BILLING CART */}
                <aside className="flex-[1.2] flex flex-col bg-white border-l border-gray-200 min-w-[380px] z-30 relative">
                    <div className="p-5 border-b border-gray-200">
                        <h2 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2 uppercase tracking-[0.12em]">
                            <ShoppingCart className="h-4 w-4 text-teal-500" /> Current Bill
                        </h2>
                        <input
                            value={patientId}
                            onChange={e => setPatientId(e.target.value)}
                            className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-bold text-gray-900 placeholder:text-gray-400"
                            placeholder="Patient ID"
                        />
                    </div>

                    <div className="flex-1 overflow-auto p-4 space-y-2">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <div className="h-14 w-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                                    <ShoppingCart className="h-7 w-7 text-gray-300" />
                                </div>
                                <p className="font-bold text-gray-400 text-sm">Cart is empty</p>
                                <p className="text-xs text-gray-300 mt-1">Add items from inventory</p>
                            </div>
                        ) : cart.map(item => {
                            const itemTax = item.unit_price * item.quantity * item.gst_percent / 100;
                            return (
                                <div key={item.batch_id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 group hover:border-teal-200 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-gray-700 truncate">{item.medicine_name}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-gray-400 font-mono">{item.batch_id}</span>
                                                {item.gst_percent > 0 && (
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-100">GST {item.gst_percent}%</span>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => removeFromCart(item.batch_id)} className="text-gray-300 hover:text-rose-400 p-1 hover:bg-rose-50 rounded transition-colors ml-2">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5">
                                            <button onClick={() => updateQty(item.batch_id, -1)} className="h-6 w-6 flex items-center justify-center hover:bg-gray-100 rounded text-gray-500 transition-colors"><Minus className="h-3 w-3" /></button>
                                            <span className="w-7 text-center text-xs font-bold text-gray-700">{item.quantity}</span>
                                            <button onClick={() => updateQty(item.batch_id, 1)} className="h-6 w-6 flex items-center justify-center hover:bg-gray-100 rounded text-gray-500 transition-colors"><Plus className="h-3 w-3" /></button>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-gray-700 text-sm">₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                                            {itemTax > 0 && <span className="block text-[10px] text-gray-400">+₹{itemTax.toFixed(2)} tax</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bill Summary */}
                    <div className="p-5 bg-gray-50 border-t border-gray-200 z-20">
                        {cart.length > 0 && (
                            <div className="space-y-1.5 mb-4 text-sm">
                                <div className="flex justify-between text-gray-500">
                                    <span>Subtotal</span>
                                    <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                                </div>
                                {totalTax > 0 && (
                                    <>
                                        <div className="flex justify-between text-gray-400 text-xs">
                                            <span>CGST</span>
                                            <span>₹{cgst.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-400 text-xs">
                                            <span>SGST</span>
                                            <span>₹{sgst.toFixed(2)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between pt-2 border-t border-gray-200">
                                    <span className="font-bold text-gray-700">Total</span>
                                    <span className="text-2xl font-black text-gray-900">₹{grandTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        )}

                        {/* Payment Method */}
                        <div className="flex gap-1.5 mb-3">
                            {PAYMENT_METHODS.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setPaymentMethod(m.id)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${paymentMethod === m.id ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                >
                                    <m.icon className="h-3.5 w-3.5" /> {m.label}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleCheckout}
                            disabled={cart.length === 0 || !patientId}
                            className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-xl shadow-teal-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            <Receipt className="h-5 w-5" /> Generate Invoice
                        </button>
                    </div>
                </aside>
            </div>

            {/* INVOICE MODAL */}
            {showInvoiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden print-area relative">
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />

                        {invoiceResult ? (
                            /* Invoice Generated - Show Receipt */
                            <>
                                <div className="p-6 border-b border-dashed border-gray-200 text-center">
                                    <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle className="h-5 w-5 text-emerald-600" />
                                    </div>
                                    <h2 className="text-lg font-black text-gray-900">Invoice Generated</h2>
                                    <p className="text-xs text-gray-400 font-mono mt-1">{invoiceResult.invoice_number}</p>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Patient</span>
                                        <span className="font-bold text-gray-700">{patientId}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Date</span>
                                        <span className="font-medium text-gray-700">{new Date().toLocaleDateString('en-IN')}</span>
                                    </div>
                                    <div className="border-t border-dashed border-gray-200 pt-4 space-y-2">
                                        {invoiceResult.items?.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <div>
                                                    <span className="font-medium text-gray-700">{item.medicine_name}</span>
                                                    <span className="text-gray-400 text-xs ml-1">x{item.qty}</span>
                                                    <span className="text-[10px] text-gray-400 ml-2">HSN: {item.hsn_sac_code}</span>
                                                </div>
                                                <span className="font-bold text-gray-700">₹{item.net_price.toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t border-gray-200 pt-3 space-y-1">
                                        <div className="flex justify-between text-sm text-gray-500">
                                            <span>Subtotal</span>
                                            <span>₹{invoiceResult.subtotal?.toFixed(2)}</span>
                                        </div>
                                        {invoiceResult.tax > 0 && (
                                            <>
                                                <div className="flex justify-between text-xs text-gray-400">
                                                    <span>CGST</span>
                                                    <span>₹{invoiceResult.cgst?.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-gray-400">
                                                    <span>SGST</span>
                                                    <span>₹{invoiceResult.sgst?.toFixed(2)}</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="flex justify-between pt-2 border-t border-gray-300">
                                            <span className="font-bold text-lg text-gray-700">Total</span>
                                            <span className="font-black text-2xl text-emerald-600">₹{invoiceResult.total?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                                        <div className="flex items-center justify-center gap-2 text-emerald-700 text-sm font-bold">
                                            <FileText className="h-4 w-4" />
                                            Posted to GL & GST Register
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 bg-gray-50 border-t border-gray-200 flex gap-3 no-print">
                                    <button onClick={handlePrint} className="flex-1 py-3 font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl flex items-center justify-center gap-2 transition-all">
                                        <Printer className="h-4 w-4" /> Print
                                    </button>
                                    <button onClick={closeInvoice} className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl shadow-lg shadow-teal-500/20 transition-all">
                                        Done
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Confirm Payment */
                            <>
                                <div className="p-6 border-b border-gray-200 text-center">
                                    <div className="h-10 w-10 bg-teal-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                        <IndianRupee className="h-5 w-5 text-teal-600" />
                                    </div>
                                    <h2 className="text-lg font-black text-gray-900">Confirm Payment</h2>
                                    <p className="text-xs text-gray-400 mt-1">Patient: <span className="font-bold text-gray-600">{patientId}</span></p>
                                </div>
                                <div className="p-6 space-y-3">
                                    <div className="border-b border-dashed border-gray-200 pb-3 space-y-2">
                                        {cart.map(item => (
                                            <div key={item.batch_id} className="flex justify-between text-sm">
                                                <span className="font-medium text-gray-700">{item.medicine_name} <span className="text-gray-400 text-xs">x{item.quantity}</span></span>
                                                <span className="font-bold text-gray-700">₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-sm text-gray-500">
                                            <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                                        </div>
                                        {totalTax > 0 && (
                                            <div className="flex justify-between text-xs text-gray-400">
                                                <span>GST (CGST + SGST)</span><span>₹{totalTax.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-2 border-t border-gray-300">
                                            <span className="font-bold text-gray-700">Total</span>
                                            <span className="font-black text-2xl text-gray-900">₹{grandTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        {PAYMENT_METHODS.map(m => (
                                            <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${paymentMethod === m.id ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                                                <m.icon className="h-3.5 w-3.5" /> {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-5 bg-gray-50 border-t border-gray-200 flex gap-3 no-print">
                                    <button onClick={() => setShowInvoiceModal(false)} className="flex-1 py-3 font-bold text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                                    <button onClick={confirmPayment} disabled={isSubmitting} className="flex-[1.5] py-3 font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 rounded-xl shadow-lg shadow-teal-500/20 disabled:opacity-70 flex items-center justify-center gap-2">
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" /> Confirm & Generate</>}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* INVENTORY MODAL */}
            {showInventoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-8 py-5 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-black text-gray-900">Add Inventory</h3>
                            <button onClick={() => setShowInventoryModal(false)}><X className="h-5 w-5 text-gray-400 hover:text-gray-700 transition-colors" /></button>
                        </div>

                        <div className="p-8 space-y-5 max-h-[70vh] overflow-auto">
                            <div className="flex gap-2 mb-6 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
                                <button onClick={() => setInvForm(f => ({ ...f, isNewMedicine: false }))} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!invForm.isNewMedicine ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Existing Medicine</button>
                                <button onClick={() => setInvForm(f => ({ ...f, isNewMedicine: true }))} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${invForm.isNewMedicine ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>New Medicine</button>
                            </div>

                            {invForm.isNewMedicine ? (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Brand Name</label>
                                        <input value={invForm.brand_name} onChange={e => setInvForm({ ...invForm, brand_name: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="e.g. Dolo 650" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Generic Name</label>
                                        <input value={invForm.generic_name} onChange={e => setInvForm({ ...invForm, generic_name: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400" placeholder="e.g. Paracetamol" />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Select Medicine</label>
                                    <select value={invForm.medicine_id} onChange={e => setInvForm({ ...invForm, medicine_id: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-bold text-gray-900 appearance-none">
                                        <option value="">Choose from list...</option>
                                        {uniqueMedicines.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-5 pt-2">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Batch No</label>
                                    <input value={invForm.batch_no} onChange={e => setInvForm({ ...invForm, batch_no: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-mono font-medium text-gray-900 placeholder:text-gray-400" placeholder="B-123" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Stock Qty</label>
                                    <input value={invForm.stock} onChange={e => setInvForm({ ...invForm, stock: e.target.value })} type="number" className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="0" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Expiry Date</label>
                                    <input value={invForm.expiry} onChange={e => setInvForm({ ...invForm, expiry: e.target.value })} type="date" className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-gray-900" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Unit Price (₹)</label>
                                    <input value={invForm.price} onChange={e => setInvForm({ ...invForm, price: e.target.value })} type="number" step="0.01" className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Rack Location</label>
                                <input value={invForm.rack} onChange={e => setInvForm({ ...invForm, rack: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none font-medium text-gray-900 placeholder:text-gray-400" placeholder="Optional (e.g. A-4)" />
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setShowInventoryModal(false)} disabled={isSubmitting} className="px-6 py-3 text-gray-500 font-bold hover:text-gray-700 rounded-xl transition-all">Cancel</button>
                            <button onClick={handleAddInventory} disabled={isSubmitting} className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 flex items-center gap-2 disabled:opacity-70">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Stock Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PROCESS ORDER MODAL */}
            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-8 py-5 border-b border-gray-200 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Process Order #{selectedOrder.id}</h3>
                                <p className="text-sm text-gray-700 font-bold mt-0.5">
                                    {selectedOrder.patient?.full_name || 'Unknown Patient'}
                                    <span className="text-gray-400 font-mono text-xs ml-2 font-normal">{selectedOrder.patient_id}</span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)}><X className="h-5 w-5 text-gray-400 hover:text-gray-700" /></button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="space-y-2">
                                {selectedOrder.items?.map((item: any) => {
                                    const hasStock = item.stock?.status !== 'Out of Stock';
                                    return (
                                        <div key={item.id} className={`flex justify-between items-center p-4 rounded-xl border ${hasStock ? 'bg-emerald-50/50 border-emerald-200/50' : 'bg-red-50/50 border-red-200/50 opacity-60'}`}>
                                            <div>
                                                <span className={`font-bold block ${hasStock ? 'text-gray-700' : 'text-gray-500 line-through'}`}>{item.medicine_name}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-400">Qty: {item.quantity_requested}</span>
                                                    {hasStock ? (
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">Stock: {item.stock?.totalStock}</span>
                                                    ) : (
                                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Out of Stock</span>
                                                    )}
                                                </div>
                                            </div>
                                            {hasStock && (
                                                <div className="text-right">
                                                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-5 bg-gray-50 border-t border-gray-200 shrink-0">
                            <div className="flex gap-2 mb-3">
                                {PAYMENT_METHODS.map(m => (
                                    <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${paymentMethod === m.id ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                                        <m.icon className="h-3.5 w-3.5" /> {m.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedOrder(null)} className="px-6 py-3 text-gray-400 font-bold hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                                <button
                                    onClick={async () => {
                                        setIsSubmitting(true);
                                        await markOrderAsPaid(selectedOrder.id, paymentMethod);
                                        await loadQueue();
                                        setIsSubmitting(false);
                                        setSelectedOrder(null);
                                    }}
                                    disabled={isSubmitting}
                                    className="flex-1 px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-70 transition-all active:scale-[0.98]"
                                >
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle className="h-5 w-5" /> Mark Paid & Delivered</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
