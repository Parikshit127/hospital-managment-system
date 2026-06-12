'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import {
    Pill, Search, Plus, Minus, Receipt, ShoppingCart,
    Trash2, AlertTriangle, CheckCircle, Package, Printer, X, Loader2,
    CreditCard, Banknote, Smartphone, Clock, IndianRupee, FileText
} from 'lucide-react';
import { getInventory, generateInvoice, getPharmacyQueue, markOrderAsPaid, addInventoryBatch, processDoctorOrder } from '@/app/actions/pharmacy-actions';
import { searchPatientsForBilling } from '@/app/actions/finance-actions';
import { getDoctorsForDropdown } from '@/app/actions/admin-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { fetchBillBranding, fetchPharmacyBranding } from '@/app/actions/branding-actions';
import type { BillBranding } from '@/app/lib/bill-branding';
import type { PharmacyBranding } from '@/app/lib/pharmacy-branding';
import { formatDoctorName } from '@/app/lib/format-name';

type InventoryItem = {
    batch_id: string;
    medicine_name: string;
    medicine_id?: number;
    expiry_date: Date | null;
    stock_count: number;
    unit_price: number;
    mrp: number;
    gst_percent: number;
    hsn_sac_code: string;
    is_catalog?: boolean;
};

type CartItem = InventoryItem & { quantity: number };

const PAYMENT_METHODS = [
    { id: 'Cash', label: 'Cash', icon: Banknote },
    { id: 'Card', label: 'Card', icon: CreditCard },
    { id: 'UPI', label: 'UPI', icon: Smartphone },
];

const IPD_PAYMENT_METHODS = [
    { id: 'Cash', label: 'Cash', icon: Banknote },
    { id: 'Card', label: 'Card', icon: CreditCard },
    { id: 'UPI', label: 'UPI', icon: Smartphone },
    { id: 'Credit', label: 'Credit (Add to IPD Bill)', icon: Clock },
];

function getExpiryStatus(expiry: Date | null) {
    if (!expiry) return { label: 'Catalog', color: 'bg-indigo-50 text-indigo-600 border border-indigo-200', urgent: false };
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

    // Patient search state
    const [patientSearch, setPatientSearch] = useState('');
    const [patientSuggestions, setPatientSuggestions] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [isWalkIn, setIsWalkIn] = useState(false);
    const [walkInName, setWalkInName] = useState('');

    // Backdate + prescribing doctor (optional)
    const [billDateTime, setBillDateTime] = useState('');
    const [doctorId, setDoctorId] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [doctorOptions, setDoctorOptions] = useState<{ id: string; name: string }[]>([]);

    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [invoiceResult, setInvoiceResult] = useState<any>(null);
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [branding, setBranding] = useState<BillBranding | null>(null);
    const [pharmacyBranding, setPharmacyBranding] = useState<PharmacyBranding | null>(null);

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
                expiry_date: item.expiry_date || null,
                stock_count: item.current_stock,
                unit_price: Number(item.medicine?.selling_price) || Number(item.medicine?.price_per_unit) || 0,
                mrp: Number(item.medicine?.mrp) || Number(item.medicine?.price_per_unit) || 0,
                gst_percent: Number(item.medicine?.gst_percent) || Number(item.medicine?.tax_rate) || 0,
                hsn_sac_code: item.medicine?.hsn_sac_code || '3004',
                is_catalog: item._catalog === true,
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
        loadQueue();
        fetchBillBranding().then(r => r.success && r.data && setBranding(r.data));
        fetchPharmacyBranding().then(r => r.success && r.data && setPharmacyBranding(r.data));
        getDoctorsForDropdown().then(r => {
            if (r.success && Array.isArray(r.data)) {
                setDoctorOptions(r.data.map((d: any) => ({ id: d.id, name: d.name })));
            }
        });
        // Poll queue every 15s instead of 5s
        const interval = setInterval(loadQueue, 15000);
        return () => clearInterval(interval);
    }, [loadInventory, loadQueue]);

    // Cart Logic
    // Patient search debounce
    useEffect(() => {
        if (isWalkIn || patientSearch.length < 2) { setPatientSuggestions([]); return; }
        const t = setTimeout(async () => {
            const res = await searchPatientsForBilling(patientSearch);
            if (res.success) setPatientSuggestions(res.data);
        }, 300);
        return () => clearTimeout(t);
    }, [patientSearch, isWalkIn]);

    const selectPatient = (p: any) => {
        setSelectedPatient(p);
        setPatientId(p.patient_id);
        setPatientSearch(p.full_name);
        setPatientSuggestions([]);
    };

    const clearPatient = () => {
        setSelectedPatient(null);
        setPatientId('');
        setPatientSearch('');
    };

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

    const updatePrice = (batchId: string, price: string) => {
        const parsed = parseFloat(price);
        setCart(prev => prev.map(item =>
            item.batch_id === batchId
                ? { ...item, unit_price: isNaN(parsed) || parsed < 0 ? 0 : parsed }
                : item
        ));
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
        if (!isWalkIn && !patientId) return alert('Please search and select a patient, or enable Walk-in / OTC mode.');
        if (cart.length === 0) return alert('Cart is empty');
        setShowInvoiceModal(true);
    };

    const confirmPayment = async () => {
        if (isSubmitting) return;
        if (!isWalkIn && !selectedPatient) {
            alert('Please search and select a patient, or enable Walk-in / OTC mode.');
            return;
        }
        if (billDateTime) {
            const picked = new Date(billDateTime);
            if (isNaN(picked.getTime())) { alert('Invalid bill date'); return; }
            if (picked.getTime() > Date.now()) { alert('Bill date cannot be in the future'); return; }
        }
        setIsSubmitting(true);
        try {
            const resolvedPatientId = isWalkIn ? 'WALKIN' : patientId;
            const payload = cart.map(item => ({ ...item, batch_no: item.batch_id }));
            const res = await generateInvoice(resolvedPatientId, payload, {
                walkInName: isWalkIn ? walkInName : undefined,
                billDateTime: billDateTime || undefined,
                doctorId: doctorId || undefined,
                doctorName: doctorName || undefined,
                paymentMethod: paymentMethod,
            });
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
        setPatientSearch('');
        setSelectedPatient(null);
        setWalkInName('');
        setBillDateTime('');
        setDoctorId('');
        setDoctorName('');
    };

    // Name shown on the bill / receipt for the current sale.
    const billPatientLabel = isWalkIn ? (walkInName.trim() || 'Walk-in / OTC') : patientId;
    const billDisplayDate = billDateTime ? new Date(billDateTime) : new Date();
    const billDisplayDateStr = billDisplayDate.toLocaleDateString('en-GB');
    const billDoctorLabel = formatDoctorName(doctorName) || 'Dr. Self';

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
                  .pharmacy-print-view, .pharmacy-print-view * { visibility: visible !important; }
                  .pharmacy-print-view {
                    display: block !important;
                    position: fixed !important;
                    inset: 0 !important;
                    z-index: 9999 !important;
                    background: white !important;
                    padding: 0 !important;
                    overflow: visible !important;
                  }                  .no-print { display: none !important; }
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
                                    <button onClick={() => setActiveTab('billing')} className={`pb-1 border-b-2 transition-all ${activeTab === 'billing' ? 'text-orange-500 border-orange-500' : 'border-transparent hover:text-gray-500'}`}>Inventory</button>
                                    <button onClick={() => setActiveTab('orders')} className={`pb-1 border-b-2 transition-all ${activeTab === 'orders' ? 'text-orange-500 border-orange-500' : 'border-transparent hover:text-gray-500'}`}>
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
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 h-4 w-4 group-focus-within:text-orange-500 transition-colors" />
                                <input
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none text-sm transition-all placeholder:text-gray-400 font-medium text-gray-900"
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
                                <div key={order.id} className="bg-white border border-gray-200 shadow-sm p-6 rounded-2xl mb-4 hover:border-orange-500/20 transition-all relative overflow-hidden group">
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
                                        const isExpired = !item.is_catalog && item.expiry_date ? new Date(item.expiry_date) < new Date() : false;
                                        return (
                                            <tr key={item.batch_id} className={`hover:bg-gray-50/50 transition-colors ${isExpired ? 'opacity-50' : ''}`}>
                                                <td className="px-5 py-4">
                                                    <span className="font-bold text-gray-700">{item.medicine_name}</span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    {item.is_catalog ? (
                                                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-200 font-bold">Catalog</span>
                                                    ) : (
                                                        <span className="font-mono text-gray-500 text-xs bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{item.batch_id}</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${expStatus.color}`}>
                                                        {expStatus.urgent && <AlertTriangle className="h-3 w-3 inline mr-0.5 -mt-0.5" />}
                                                        {expStatus.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    {item.is_catalog ? (
                                                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold border bg-indigo-50 text-indigo-600 border-indigo-200">No Stock</span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${item.stock_count <= 0 ? 'bg-red-50 text-red-500 border-red-200' : item.stock_count < 10 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                                            {item.stock_count}
                                                        </span>
                                                    )}
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
                                                        disabled={!item.is_catalog && (item.stock_count <= 0 || isExpired)}
                                                        className="bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-600 p-1.5 rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed"
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
                            <ShoppingCart className="h-4 w-4 text-orange-500" /> Current Bill
                        </h2>

                        {/* Patient selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Patient</span>
                                <button
                                    type="button"
                                    onClick={() => { setIsWalkIn(!isWalkIn); clearPatient(); setWalkInName(''); }}
                                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                                        isWalkIn ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                >
                                    {isWalkIn ? '⚡ Walk-in / OTC' : 'Walk-in / OTC'}
                                </button>
                            </div>

                            {isWalkIn ? (
                                <div className="space-y-1.5">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400" />
                                        <input
                                            value={walkInName}
                                            onChange={e => setWalkInName(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-300 outline-none font-medium text-amber-900 placeholder:text-amber-400"
                                            placeholder="Customer name (optional)"
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold text-amber-600 px-1">Walk-in / OTC — no registration needed. Name appears on the bill.</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <input
                                        value={patientSearch}
                                        onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null); setPatientId(''); }}
                                        className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400"
                                        placeholder="Search by name, ID, phone..."
                                    />
                                    {selectedPatient && (
                                        <button onClick={clearPatient} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    {patientSuggestions.length > 0 && !selectedPatient && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-44 overflow-y-auto">
                                            {patientSuggestions.map((p: any) => (
                                                <button key={p.patient_id} type="button"
                                                    onClick={() => selectPatient(p)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-orange-50 border-b border-gray-50 last:border-0 transition-colors"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900">{p.full_name}</p>
                                                            <p className="text-[10px] text-gray-400 font-mono">{p.patient_id} · {p.phone}</p>
                                                        </div>
                                                        {p.is_admitted && (
                                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full shrink-0">IPD</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {selectedPatient && (
                                        <div className={`mt-1.5 px-3 py-2 border rounded-lg flex items-center justify-between ${selectedPatient.is_admitted ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                                            <div>
                                                <p className="text-xs font-bold text-teal-800">{selectedPatient.full_name}</p>
                                                <p className="text-[10px] font-mono text-orange-500">{selectedPatient.patient_id}</p>
                                                {selectedPatient.is_admitted && (
                                                    <p className="text-[10px] font-bold text-blue-700 mt-0.5">
                                                        🏥 IPD Admitted — medicines will be posted to IPD bill
                                                    </p>
                                                )}
                                            </div>
                                            <CheckCircle className={`h-4 w-4 flex-shrink-0 ${selectedPatient.is_admitted ? 'text-blue-500' : 'text-orange-500'}`} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
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
                                <div key={item.batch_id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 group hover:border-orange-200 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-gray-700 truncate">{item.medicine_name}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-gray-400 font-mono">{item.is_catalog ? 'Catalog' : item.batch_id}</span>
                                                {item.gst_percent > 0 && (
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-100">GST {item.gst_percent}%</span>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => removeFromCart(item.batch_id)} className="text-gray-300 hover:text-rose-400 p-1 hover:bg-rose-50 rounded transition-colors ml-2">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    {/* Editable price per unit */}
                                    <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-[10px] text-gray-400 shrink-0">₹/unit</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_price}
                                            onChange={e => updatePrice(item.batch_id, e.target.value)}
                                            className="w-24 px-2 py-1 text-xs font-bold text-gray-700 bg-white border border-orange-200 rounded-lg focus:ring-1 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                        />
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

                        {/* Bill Date (optional backdate) + Prescribing Doctor */}
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Bill Date</label>
                                <input
                                    type="datetime-local"
                                    value={billDateTime}
                                    max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                                    onChange={e => setBillDateTime(e.target.value)}
                                    className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                    placeholder="Defaults to now"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Doctor</label>
                                <select
                                    value={doctorId}
                                    onChange={e => {
                                        const picked = doctorOptions.find(d => d.id === e.target.value);
                                        setDoctorId(picked?.id || '');
                                        setDoctorName(picked?.name || '');
                                    }}
                                    className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                >
                                    <option value="">— None —</option>
                                    {doctorOptions.map(d => (
                                        <option key={d.id} value={d.id}>{formatDoctorName(d.name)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Payment Method — show Credit option for IPD patients */}
                        {selectedPatient?.is_admitted ? (
                            <div className="mb-3 space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {IPD_PAYMENT_METHODS.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => setPaymentMethod(m.id)}
                                            className={`flex-1 min-w-[70px] py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                                                paymentMethod === m.id
                                                    ? m.id === 'Credit'
                                                        ? 'bg-amber-50 border-amber-400 text-amber-700'
                                                        : 'bg-orange-50 border-teal-300 text-orange-700'
                                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                        >
                                            <m.icon className="h-3.5 w-3.5" /> {m.id === 'Credit' ? 'Credit' : m.label}
                                        </button>
                                    ))}
                                </div>
                                {paymentMethod === 'Credit' ? (
                                    <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                                        🏥 <strong>Credit:</strong> Medicines posted to IPD bill. Payment pending — tracked under patient&apos;s admission.
                                    </div>
                                ) : (
                                    <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-medium">
                                        🏥 <strong>IPD Patient</strong> — medicines will also be posted to the IPD bill.
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Payment Method */
                            <div className="flex gap-1.5 mb-3">
                                {PAYMENT_METHODS.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => setPaymentMethod(m.id)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${paymentMethod === m.id ? 'bg-orange-50 border-teal-300 text-orange-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                    >
                                        <m.icon className="h-3.5 w-3.5" /> {m.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={handleCheckout}
                            disabled={cart.length === 0 || (!isWalkIn && !patientId)}
                            className={`w-full font-bold py-3.5 rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] ${selectedPatient?.is_admitted ? (paymentMethod === 'Credit' ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/20' : 'bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white shadow-blue-500/20') : 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-teal-500/20'}`}
                        >
                            <Receipt className="h-5 w-5" />
                            {selectedPatient?.is_admitted
                                ? (paymentMethod === 'Credit' ? 'Add to IPD Bill (Credit)' : 'Post to IPD Bill')
                                : 'Generate Invoice'}
                        </button>
                    </div>
                </aside>
            </div>

            {/* INVOICE MODAL */}
            {showInvoiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden print-area relative print:fixed print:inset-0 print:max-w-none print:rounded-none print:shadow-none print:overflow-visible">
                        <div className="absolute top-0 left-0 right-0 h-[2px] print:hidden" style={{ background: `linear-gradient(90deg, ${branding?.accentColor || '#1e3a6e'}, #f97316, ${branding?.accentColor || '#1e3a6e'})` }} />

                        {invoiceResult ? (
                            /* Invoice Generated - Show Receipt */
                            <>
                                <div className="p-6 border-b border-dashed border-gray-200" style={{ paddingTop: undefined }}>
                                    {/* Letterhead — hidden in print, letterhead image replaces it */}
                                    <div className="flex items-start justify-between pb-4 mb-4 print:hidden" style={{ borderBottom: `2px solid ${branding?.accentColor || '#1e3a6e'}` }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={branding?.logoUrl || '/logo.jpeg'} alt={branding?.hospitalName || 'Hospital'} className="h-12 w-auto object-contain" />
                                        <div className="text-right">
                                            <p className="text-xs font-black uppercase tracking-widest" style={{ color: branding?.accentColor || '#1e3a6e' }}>Pharmacy Invoice</p>
                                            <p className="text-xs font-mono text-gray-500 mt-0.5">{invoiceResult.invoice_number}</p>
                                            <p className="text-xs text-gray-400">{billDisplayDateStr}</p>
                                        </div>
                                    </div>
                                    {/* Print-only invoice info with top padding for letterhead */}
                                    <div className="hidden print:flex justify-end mb-4" style={{ paddingTop: '130px' }}>
                                        <div className="text-right">
                                            <p className="text-xs font-black uppercase tracking-widest" style={{ color: branding?.accentColor || '#1e3a6e' }}>Pharmacy Invoice</p>
                                            <p className="text-xs font-mono text-gray-500 mt-0.5">{invoiceResult.invoice_number}</p>
                                            <p className="text-xs text-gray-400">{billDisplayDateStr}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 mt-2">
                                        <div className="h-8 w-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                                        </div>
                                        <p className="text-sm font-black text-gray-900">Invoice Generated</p>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Patient</span>
                                        <span className="font-bold text-gray-700">{billPatientLabel}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Date</span>
                                        <span className="font-medium text-gray-700">{billDisplayDateStr}</span>
                                    </div>
                                    {billDoctorLabel && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Doctor</span>
                                            <span className="font-medium text-gray-700">{billDoctorLabel}</span>
                                        </div>
                                    )}
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
                                            {invoiceResult.credit_bill
                                                ? 'Credit Bill Created — Pending at Reception'
                                                : 'Posted to GL & GST Register'}
                                        </div>
                                        {invoiceResult.credit_bill && (
                                            <p className="text-xs text-amber-700 mt-1 font-medium">
                                                Bill #{invoiceResult.invoice_number} added to IPD admission. Collect payment at discharge.
                                            </p>
                                        )}
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
                                    <div className="h-10 w-10 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                        <IndianRupee className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <h2 className="text-lg font-black text-gray-900">Confirm Payment</h2>
                                    <p className="text-xs text-gray-400 mt-1">Patient: <span className="font-bold text-gray-600">{billPatientLabel}</span></p>
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
                                        {(selectedPatient?.is_admitted ? IPD_PAYMENT_METHODS : PAYMENT_METHODS).map(m => (
                                            <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                                                    paymentMethod === m.id
                                                        ? m.id === 'Credit' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-orange-50 border-teal-300 text-orange-700'
                                                        : 'bg-white border-gray-200 text-gray-500'
                                                }`}>
                                                <m.icon className="h-3.5 w-3.5" /> {m.id === 'Credit' ? 'Credit' : m.label}
                                            </button>
                                        ))}
                                    </div>
                                    {paymentMethod === 'Credit' && (
                                        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                                            Payment will be tracked as pending under the patient&apos;s IPD admission. Collect at discharge.
                                        </div>
                                    )}
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

            {/* PRINT-ONLY FULL PAGE — shown only when printing pharmacy invoice */}
            {invoiceResult && (
                <div className="pharmacy-print-view" style={{ display: 'none' }}>
                    {/* No hospital letterhead — pharmacy bills show only the dispensing pharmacy header */}
                    <div style={{ padding: '40px 60px 60px 60px' }}>
                    <div className="max-w-2xl mx-auto space-y-4">

                        {/* Third Party Pharmacy Header — bill is issued by the dispensing pharmacy, not the hospital */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: '14px', marginBottom: '10px' }}>
                            <div>
                                <p style={{ fontSize: '20px', fontWeight: 900, color: '#111', margin: 0, letterSpacing: '0.5px' }}>{pharmacyBranding?.name || 'Garnet Medicare'}</p>
                                <p style={{ fontSize: '9px', color: '#666', marginTop: '2px', fontStyle: 'italic' }}>{pharmacyBranding?.division || '(Division of Garnet Pharmaceutical)'}</p>
                                {pharmacyBranding?.address && <p style={{ fontSize: '10px', color: '#555', marginTop: '3px' }}>{pharmacyBranding.address}</p>}
                                {pharmacyBranding?.gstin && <p style={{ fontSize: '10px', color: '#555' }}>GST No.: {pharmacyBranding.gstin}</p>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p className="text-xs font-black uppercase tracking-widest" style={{ color: '#111' }}>Pharmacy Invoice</p>
                                <p className="text-xs font-mono text-gray-600 mt-0.5">{invoiceResult.invoice_number}</p>
                                <p className="text-xs text-gray-500">{billDisplayDateStr}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><span className="text-gray-500">Patient:</span> <span className="font-bold">{patientId}</span></div>
                            <div className="text-right"><span className="text-gray-500">Date:</span> <span className="font-bold">{billDisplayDateStr}</span></div>
                            {billDoctorLabel && (
                                <div><span className="text-gray-500">Doctor:</span> <span className="font-bold">{billDoctorLabel}</span></div>
                            )}
                        </div>
                        <table className="w-full text-sm border-collapse mt-2">
                            <thead>
                                <tr className="border-y-2 border-black">
                                    <th className="py-2 text-left font-black uppercase tracking-wider text-xs">Medicine</th>
                                    <th className="py-2 text-center font-black uppercase tracking-wider text-xs">Qty</th>
                                    <th className="py-2 text-right font-black uppercase tracking-wider text-xs">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {invoiceResult.items?.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="py-2 font-medium">{item.medicine_name}</td>
                                        <td className="py-2 text-center">{item.qty}</td>
                                        <td className="py-2 text-right font-bold">₹{item.net_price.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-300">
                                    <td colSpan={2} className="py-2 text-right text-gray-500 text-xs">Subtotal</td>
                                    <td className="py-2 text-right">₹{invoiceResult.subtotal?.toFixed(2)}</td>
                                </tr>
                                {invoiceResult.tax > 0 && (
                                    <>
                                        <tr>
                                            <td colSpan={2} className="py-1 text-right text-gray-400 text-xs">CGST</td>
                                            <td className="py-1 text-right text-xs">₹{invoiceResult.cgst?.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan={2} className="py-1 text-right text-gray-400 text-xs">SGST</td>
                                            <td className="py-1 text-right text-xs">₹{invoiceResult.sgst?.toFixed(2)}</td>
                                        </tr>
                                    </>
                                )}
                                <tr className="border-t-2 border-black">
                                    <td colSpan={2} className="py-3 text-right font-black uppercase tracking-wider">Total</td>
                                    <td className="py-3 text-right font-black text-xl">₹{invoiceResult.total?.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                        <div className="pt-12 flex justify-end">
                            <div className="text-center">
                                <div className="border-t border-gray-400 w-40 mb-1" />
                                <p className="text-xs font-bold uppercase tracking-wider">Authorized Signatory</p>
                                <p className="text-[10px] text-gray-400">Computer Generated Digital Receipt</p>
                            </div>
                        </div>
                    </div>
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
                                        <input value={invForm.brand_name} onChange={e => setInvForm({ ...invForm, brand_name: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="e.g. Dolo 650" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Generic Name</label>
                                        <input value={invForm.generic_name} onChange={e => setInvForm({ ...invForm, generic_name: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400" placeholder="e.g. Paracetamol" />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Select Medicine</label>
                                    <select value={invForm.medicine_id} onChange={e => setInvForm({ ...invForm, medicine_id: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-bold text-gray-900 appearance-none">
                                        <option value="">Choose from list...</option>
                                        {uniqueMedicines.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-5 pt-2">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Batch No</label>
                                    <input value={invForm.batch_no} onChange={e => setInvForm({ ...invForm, batch_no: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-mono font-medium text-gray-900 placeholder:text-gray-400" placeholder="B-123" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Stock Qty</label>
                                    <input value={invForm.stock} onChange={e => setInvForm({ ...invForm, stock: e.target.value })} type="number" className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="0" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Expiry Date</label>
                                    <DateField value={invForm.expiry} onChange={e => setInvForm({ ...invForm, expiry: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Unit Price (₹)</label>
                                    <input value={invForm.price} onChange={e => setInvForm({ ...invForm, price: e.target.value })} type="number" step="0.01" className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Rack Location</label>
                                <input value={invForm.rack} onChange={e => setInvForm({ ...invForm, rack: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900 placeholder:text-gray-400" placeholder="Optional (e.g. A-4)" />
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
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${paymentMethod === m.id ? 'bg-orange-50 border-teal-300 text-orange-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                                        <m.icon className="h-3.5 w-3.5" /> {m.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedOrder(null)} className="px-6 py-3 text-gray-400 font-bold hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                                <button
                                    onClick={async () => {
                                        setIsSubmitting(true);
                                        const res = await processDoctorOrder(selectedOrder.id, paymentMethod);
                                        if (res.success) {
                                            await loadQueue();
                                            setSelectedOrder(null);
                                        } else {
                                            alert((res as any).error || 'Failed to process order');
                                        }
                                        setIsSubmitting(false);
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
