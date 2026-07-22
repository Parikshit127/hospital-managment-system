'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import {
    Pill, Search, Plus, Minus, Receipt, ShoppingCart,
    Trash2, AlertTriangle, CheckCircle, Package, Printer, X, Loader2,
    CreditCard, Banknote, Smartphone, Clock, IndianRupee, FileText,
    Pencil, Save, BedDouble, SlidersHorizontal
} from 'lucide-react';
import { getInventoryPage, generateInvoice, getPharmacyQueue, markOrderAsPaid, addInventoryBatch, processDoctorOrder, adjustStock } from '@/app/actions/pharmacy-actions';
import { useDebouncedValue } from '@/app/lib/hooks/useDebouncedValue';
import { searchPatientsForBilling, removeInvoiceItem, updateInvoiceItem } from '@/app/actions/finance-actions';
import { getDoctorsForDropdown } from '@/app/actions/admin-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { StockCorrectionModal } from '@/app/components/pharmacy/StockCorrectionModal';
import { fetchBillBranding, fetchPharmacyBranding } from '@/app/actions/branding-actions';
import type { BillBranding } from '@/app/lib/bill-branding';
import type { PharmacyBranding } from '@/app/lib/pharmacy-branding';
import { formatDoctorName } from '@/app/lib/format-name';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { generateInterimBill, postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';

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

    const [activeTab, setActiveTab] = useState<'billing' | 'orders' | 'ipd-bills'>('billing');
    const [orderQueue, setOrderQueue] = useState<any[]>([]);

    // ── IPD Bills Tab State ─────────────────────────────────────────────────────
    const [ipdAdmissions, setIpdAdmissions] = useState<any[]>([]);
    const [ipdSearch, setIpdSearch] = useState('');
    const [selectedAdmission, setSelectedAdmission] = useState<any>(null);
    const [ipdBillData, setIpdBillData] = useState<any>(null);
    const [ipdBillLoading, setIpdBillLoading] = useState(false);
    const [ipdActionLoading, setIpdActionLoading] = useState<number | null>(null);
    const [ipdRemovingId, setIpdRemovingId] = useState<number | null>(null);
    const [ipdEditingId, setIpdEditingId] = useState<number | null>(null);
    const [ipdEditRow, setIpdEditRow] = useState<{ description: string; quantity: number; unit_price: number }>({ description: '', quantity: 1, unit_price: 0 });
    const [ipdToast, setIpdToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    // Add-charge modal
    const [showIpdAddModal, setShowIpdAddModal] = useState(false);
    const [ipdAddSearch, setIpdAddSearch] = useState('');
    const [ipdAddInventory, setIpdAddInventory] = useState<any[]>([]);
    const [ipdAddLoading, setIpdAddLoading] = useState(false);
    const [ipdAddItem, setIpdAddItem] = useState<any>(null);
    const [ipdAddQty, setIpdAddQty] = useState(1);
    const [ipdAddPrice, setIpdAddPrice] = useState('');
    const [ipdAddDesc, setIpdAddDesc] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    // Patient search state
    const [patientSearch, setPatientSearch] = useState('');
    const [patientSuggestions, setPatientSuggestions] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [isWalkIn, setIsWalkIn] = useState(false);
    const [isHospitalUse, setIsHospitalUse] = useState(false);
    const [walkInName, setWalkInName] = useState('');
    const [walkInContact, setWalkInContact] = useState('');
    // Optional bill-level discount (₹) for walk-in / OTC sales.
    const [discount, setDiscount] = useState('');

    // Backdate + prescribing doctor (optional)
    const [billDateTime, setBillDateTime] = useState('');
    const [doctorId, setDoctorId] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [doctorOptions, setDoctorOptions] = useState<{ id: string; name: string; reg_no?: string }[]>([]);
    const [doctorRegNo, setDoctorRegNo] = useState('');

    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [invoiceResult, setInvoiceResult] = useState<any>(null);
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [showStockCorrection, setShowStockCorrection] = useState(false);
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
        rack: '',
        hsn_sac_code: ''
    });

    // ── Direct Stock Correction / Adjustment state ──
    const [adjustStockItem, setAdjustStockItem] = useState<any>(null);
    const [adjustStockQty, setAdjustStockQty] = useState('');
    const [adjustStockReason, setAdjustStockReason] = useState('Dispensing stock correction');
    const [adjustingStock, setAdjustingStock] = useState(false);

    const handleSaveStockAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustStockItem || adjustStockQty === '') return;
        const targetQty = Number(adjustStockQty);
        if (isNaN(targetQty) || targetQty < 0) {
            alert('Please enter a valid non-negative stock quantity');
            return;
        }

        setAdjustingStock(true);
        try {
            const res = await adjustStock({
                medicine_id: adjustStockItem.medicine_id,
                batch_id: adjustStockItem.db_batch_id,
                target_stock_qty: targetQty,
                reason: adjustStockReason.trim() || 'Dispensing stock correction',
            });
            if (res.success) {
                setAdjustStockItem(null);
                await loadInventory(search);
            } else {
                alert(res.error || 'Failed to update stock');
            }
        } finally {
            setAdjustingStock(false);
        }
    };

    const debouncedSearch = useDebouncedValue(search, 250);

    const loadInventory = useCallback(async (query: string = '') => {
        const res = await getInventoryPage({ search: query, limit: 50 });
        if (res.success) {
            const mappedData = res.data.map((item: any) => ({
                db_batch_id: item.id,
                batch_id: item.batch_no,
                medicine_name: item.medicine?.brand_name || 'Unknown Medicine',
                medicine_id: item.medicine_id,
                expiry_date: item.expiry_date || null,
                stock_count: item.current_stock,
                unit_price: Number(item.mrp) || Number(item.medicine?.mrp) || Number(item.medicine?.selling_price) || Number(item.medicine?.price_per_unit) || 0,
                mrp: Number(item.mrp) || Number(item.medicine?.mrp) || Number(item.medicine?.price_per_unit) || 0,
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
        await Promise.all([loadInventory(debouncedSearch), loadQueue()]);
    };

    // Initial load + queue polling. Inventory itself is no longer polled —
    // it's refetched on debounced search keystrokes instead.
    useEffect(() => {
        loadQueue();
        fetchBillBranding().then(r => r.success && r.data && setBranding(r.data));
        fetchPharmacyBranding().then(r => r.success && r.data && setPharmacyBranding(r.data));
        getDoctorsForDropdown().then(r => {
            if (r.success && Array.isArray(r.data)) {
                setDoctorOptions(r.data.map((d: any) => ({ id: d.id, name: d.name, reg_no: d.doctor_registration_no || '' })));
            }
        });
        const interval = setInterval(loadQueue, 15000);
        return () => clearInterval(interval);
    }, [loadQueue]);

    // ── IPD Bills: load admitted patients when tab is active ────────────────────
    useEffect(() => {
        if (activeTab === 'ipd-bills') {
            getIPDAdmissions('Admitted').then(r => {
                if (r.success) setIpdAdmissions(r.data);
            });
        }
    }, [activeTab]);

    // IPD Add-charge inventory search
    useEffect(() => {
        if (!showIpdAddModal || ipdAddSearch.trim().length < 2) { setIpdAddInventory([]); return; }
        const t = setTimeout(async () => {
            setIpdAddLoading(true);
            const res = await getInventoryPage({ search: ipdAddSearch.trim(), limit: 20 });
            if (res.success) {
                setIpdAddInventory(res.data.map((item: any) => ({
                    batch_id: item.batch_no,
                    medicine_name: item.medicine?.brand_name || 'Unknown',
                    medicine_id: item.medicine_id,
                    stock_count: item.current_stock,
                    unit_price: Number(item.mrp) || Number(item.medicine?.mrp) || 0,
                    gst_percent: Number(item.medicine?.gst_percent) || 0,
                    is_catalog: item._catalog === true,
                })));
            }
            setIpdAddLoading(false);
        }, 300);
        return () => clearTimeout(t);
    }, [ipdAddSearch, showIpdAddModal]);

    function showIpdToast(message: string, type: 'success' | 'error' = 'success') {
        setIpdToast({ message, type });
        setTimeout(() => setIpdToast(null), 3000);
    }

    async function loadIpdBill(admission: any) {
        setSelectedAdmission(admission);
        setIpdBillData(null);
        setIpdEditingId(null);
        setIpdBillLoading(true);
        const res = await generateInterimBill(admission.admission_id);
        if (res.success && res.data) setIpdBillData(res.data);
        setIpdBillLoading(false);
    }

    async function refreshIpdBill() {
        if (!selectedAdmission) return;
        const res = await generateInterimBill(selectedAdmission.admission_id);
        if (res.success && res.data) setIpdBillData(res.data);
    }

    async function handleIpdRemove(item: any) {
        if (!ipdBillData?.invoice?.id) return;
        if (!confirm(`Remove "${item.description}" from the IPD bill?`)) return;
        setIpdRemovingId(item.id);
        const res = await removeInvoiceItem(item.id, ipdBillData.invoice.id);
        setIpdRemovingId(null);
        if (res.success) {
            showIpdToast('Item removed from bill');
            await refreshIpdBill();
        } else {
            showIpdToast(res.error || 'Failed to remove item', 'error');
        }
    }

    function startIpdEdit(item: any) {
        setIpdEditingId(item.id);
        setIpdEditRow({ description: item.description, quantity: item.quantity, unit_price: item.unit_price });
    }

    async function saveIpdEdit(item: any) {
        setIpdActionLoading(item.id);
        const res = await updateInvoiceItem(item.id, {
            description: ipdEditRow.description,
            quantity: Number(ipdEditRow.quantity),
            unit_price: Number(ipdEditRow.unit_price),
        });
        setIpdActionLoading(null);
        if (res.success) {
            setIpdEditingId(null);
            showIpdToast('Item updated');
            await refreshIpdBill();
        } else {
            showIpdToast(res.error || 'Failed to update item', 'error');
        }
    }

    async function handleIpdAddCharge() {
        if (!selectedAdmission || !ipdAddItem || !ipdAddDesc.trim()) return;
        setIpdActionLoading(-1);
        const res = await postChargeToIpdBill({
            admission_id: selectedAdmission.admission_id,
            source_module: 'pharmacy',
            description: ipdAddDesc.trim(),
            quantity: Number(ipdAddQty),
            unit_price: Number(ipdAddPrice),
            service_category: 'Pharmacy',
        });
        setIpdActionLoading(null);
        if (res.success) {
            showIpdToast('Pharmacy charge added to IPD bill ✓');
            setShowIpdAddModal(false);
            setIpdAddItem(null);
            setIpdAddSearch('');
            setIpdAddInventory([]);
            setIpdAddQty(1);
            setIpdAddPrice('');
            setIpdAddDesc('');
            await refreshIpdBill();
        } else {
            showIpdToast(res.error || 'Failed to add charge', 'error');
        }
    }

    const filteredIpdAdmissions = ipdAdmissions.filter((a: any) => {
        if (!ipdSearch.trim()) return true;
        const q = ipdSearch.toLowerCase();
        return (
            (a.patient?.full_name || '').toLowerCase().includes(q) ||
            (a.patient?.phone || '').includes(q) ||
            (a.admission_id || '').toLowerCase().includes(q)
        );
    });

    // Server-side debounced inventory search.
    useEffect(() => {
        loadInventory(debouncedSearch);
    }, [debouncedSearch, loadInventory]);

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
                if (!item.is_catalog && newQty > item.stock_count) return item;
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(Boolean) as CartItem[]);
    };

    const setQty = (batchId: string, raw: string) => {
        const parsed = parseInt(raw, 10);
        setCart(prev => prev.map(item => {
            if (item.batch_id !== batchId) return item;
            if (isNaN(parsed) || parsed <= 0) return { ...item, quantity: 1 };
            const next = !item.is_catalog ? Math.min(parsed, item.stock_count) : parsed;
            return { ...item, quantity: Math.max(1, next) };
        }));
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
    // Optional discount applies to walk-in / OTC only; clamped to [0, grandTotal].
    // Walk-in / OTC only: percentage discount (clamped 0–100%) → ₹ off the bill.
    const discountPct = isWalkIn ? Math.min(Math.max(0, Number(discount) || 0), 100) : 0;
    const discountAmt = grandTotal * discountPct / 100;
    const payableTotal = Math.max(0, grandTotal - discountAmt);

    const handleCheckout = () => {
        if (!isWalkIn && !isHospitalUse && !patientId) return alert('Please search and select a patient, or switch billing mode.');
        if (cart.length === 0) return alert('Cart is empty');
        setShowInvoiceModal(true);
    };

    const confirmPayment = async () => {
        if (isSubmitting) return;
        if (!isWalkIn && !isHospitalUse && !selectedPatient) {
            alert('Please search and select a patient, or switch billing mode.');
            return;
        }
        if (billDateTime) {
            const picked = new Date(billDateTime);
            if (isNaN(picked.getTime())) { alert('Invalid bill date'); return; }
            if (picked.getTime() > Date.now()) { alert('Bill date cannot be in the future'); return; }
        }
        setIsSubmitting(true);
        try {
            const resolvedPatientId = isHospitalUse ? 'HOSPITAL' : (isWalkIn ? 'WALKIN' : patientId);
            const payload = cart.map(item => ({ ...item, batch_no: item.batch_id }));
            const res = await generateInvoice(resolvedPatientId, payload, {
                walkInName: isHospitalUse ? 'Hospital Internal Use' : (isWalkIn ? walkInName : undefined),
                walkInContact: isWalkIn ? walkInContact : undefined,
                billDateTime: billDateTime || undefined,
                doctorId: doctorId || undefined,
                doctorName: doctorName || undefined,
                paymentMethod: isHospitalUse ? 'Credit' : paymentMethod,
                discountPct: discountPct || undefined,
            });
            if (res.success) {
                setInvoiceResult(res);
                setCart([]);
                setDiscount('');
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
        setWalkInContact('');
        setDiscount('');
        setBillDateTime('');
        setDoctorId('');
        setDoctorName('');
        setDoctorRegNo('');
        setIsHospitalUse(false);
    };

    // Name shown on the bill / receipt for the current sale.
    const billPatientLabel = isHospitalUse ? 'Hospital Internal Use' : (isWalkIn ? (walkInName.trim() || 'Walk-in / OTC') : patientId);
    const billDisplayDate = billDateTime ? new Date(billDateTime) : new Date();
    const billDisplayDateStr = billDisplayDate.toLocaleDateString('en-GB');
    const billDoctorLabel = formatDoctorName(doctorName) || 'Dr. Self';

    const uniqueMedicines = Array.from(new Set(inventory.map(i => JSON.stringify({ id: i.medicine_id, name: i.medicine_name }))))
        .map(s => JSON.parse(s));

    const handleAddInventory = async () => {
        if (!invForm.batch_no || !invForm.stock || !invForm.price) {
            return alert('Please fill Batch No, Stock Qty, and Unit Price');
        }
        if (!invForm.expiry) {
            return alert('Please enter a valid Expiry Date in dd/mm/yyyy format (e.g. 01/12/2026)');
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
                rack: invForm.rack,
                hsn_sac_code: invForm.hsn_sac_code || undefined
            };
            const res = await addInventoryBatch(payload);
            if (res.success) {
                setShowInventoryModal(false);
                loadInventory();
                setInvForm({ isNewMedicine: false, medicine_id: '', brand_name: '', generic_name: '', batch_no: '', stock: '', price: '', expiry: '', rack: '', hsn_sac_code: '' });
            } else {
                alert('Error: ' + res.error);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Server-filtered. No client-side reduction over thousands of rows.
    const filteredInventory = inventory;

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

            <div className="h-[calc(100vh-4rem)] overflow-auto bg-gray-50">
                <div className="max-w-7xl mx-auto w-full p-4 lg:p-6 space-y-4">

                    {/* PAGE HEADER */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <h1 className="text-lg font-black tracking-tight text-gray-900 whitespace-nowrap">Pharmacy &amp; Billing</h1>
                            <div className="flex gap-1 bg-gray-100 border border-gray-200 p-1 rounded-xl">
                                <button
                                    onClick={() => setActiveTab('billing')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'billing' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Receipt className="h-3.5 w-3.5" /> New Sale
                                </button>
                                <button
                                    onClick={() => setActiveTab('orders')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'orders' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Package className="h-3.5 w-3.5" /> Doctor Orders
                                    {orderQueue.length > 0 && <span className="ml-0.5 bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none">{orderQueue.length}</span>}
                                </button>
                                <button
                                    onClick={() => setActiveTab('ipd-bills')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'ipd-bills' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <BedDouble className="h-3.5 w-3.5" /> IPD Bills
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowInventoryModal(true)}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50 transition-all shrink-0"
                        >
                            <Plus className="h-3.5 w-3.5" /> Add Stock
                        </button>
                        {/* Add Stock only creates a new batch. Correcting a wrong quantity
                            used to mean leaving dispensing for the Stock screen. */}
                        <button
                            onClick={() => setShowStockCorrection(true)}
                            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-700 hover:bg-orange-50 transition-all shrink-0"
                        >
                            <Pencil className="h-3.5 w-3.5" /> Edit Stock
                        </button>
                    </div>

                    {activeTab === 'ipd-bills' ? (
                        <div className="grid grid-cols-12 gap-4">
                            {/* IPD Toast */}
                            {ipdToast && (
                                <div className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-xl text-sm font-bold flex items-center gap-2 transition-all ${
                                    ipdToast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                                }`}>
                                    {ipdToast.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                                    {ipdToast.message}
                                </div>
                            )}

                            {/* Left: Admitted Patient List */}
                            <div className="col-span-3 bg-white rounded-2xl shadow-sm border border-gray-200 p-4 max-h-[85vh] overflow-y-auto">
                                <div className="mb-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={ipdSearch}
                                            onChange={e => setIpdSearch(e.target.value)}
                                            placeholder="Search patient, ID, phone..."
                                            className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                                        />
                                        {ipdSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setIpdSearch('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-blue-600 mt-2 uppercase tracking-wider">Admitted Patients Only</p>
                                </div>
                                <div className="space-y-2">
                                    {filteredIpdAdmissions.length === 0 ? (
                                        <div className="text-center py-10 text-gray-400 text-xs font-medium">
                                            <BedDouble className="h-8 w-8 mx-auto text-gray-200 mb-2" />
                                            No admitted patients found
                                        </div>
                                    ) : filteredIpdAdmissions.map((a: any) => (
                                        <button
                                            key={a.admission_id}
                                            onClick={() => loadIpdBill(a)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${
                                                selectedAdmission?.admission_id === a.admission_id
                                                    ? 'bg-blue-50 border-blue-400 shadow-sm'
                                                    : 'border-gray-200 hover:bg-gray-50 hover:border-blue-200'
                                            }`}
                                        >
                                            <p className="font-bold text-sm text-gray-900 truncate">{a.patient?.full_name}</p>
                                            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{a.admission_id}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{a.wardName} · Bed {a.bed_id} · Day {a.daysAdmitted}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Right: IPD Bill Editor */}
                            <div className="col-span-9">
                                {!selectedAdmission ? (
                                    <div className="bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 flex flex-col items-center justify-center h-96 text-gray-400">
                                        <BedDouble className="h-12 w-12 text-gray-200 mb-3" />
                                        <p className="font-bold text-sm">Select an admitted patient to view &amp; edit their IPD bill</p>
                                        <p className="text-xs mt-1">Only pharmacy items can be added, edited, or deleted</p>
                                    </div>
                                ) : ipdBillLoading ? (
                                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center h-96">
                                        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                                    </div>
                                ) : ipdBillData ? (
                                    <div className="space-y-4">
                                        {/* Bill Header */}
                                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h2 className="text-lg font-black text-gray-900">{ipdBillData.admission.patient_name}</h2>
                                                    <p className="text-sm text-gray-500 mt-0.5">
                                                        {ipdBillData.admission.admission_id} &nbsp;·&nbsp;
                                                        {formatDoctorName(ipdBillData.admission.doctor_name)} &nbsp;·&nbsp;
                                                        {ipdBillData.admission.ward_name} / Bed {ipdBillData.admission.bed_id}
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-0.5">Day {ipdBillData.admission.days_admitted} &nbsp;·&nbsp; {ipdBillData.admission.diagnosis || 'No diagnosis'}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <p className="text-xs text-gray-400">Bill Total</p>
                                                        <p className="text-2xl font-black text-gray-900">₹{ipdBillData.invoice.net_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                                        {ipdBillData.invoice.balance_due > 0 && (
                                                            <p className="text-xs font-bold text-rose-600">Due: ₹{ipdBillData.invoice.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setIpdAddItem(null);
                                                            setIpdAddSearch('');
                                                            setIpdAddInventory([]);
                                                            setIpdAddQty(1);
                                                            setIpdAddPrice('');
                                                            setIpdAddDesc('');
                                                            setShowIpdAddModal(true);
                                                        }}
                                                        className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 whitespace-nowrap"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" /> Add Pharmacy Item
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bill Line Items */}
                                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50/60">
                                                <FileText className="h-4 w-4 text-gray-400" />
                                                <span className="text-xs font-black uppercase tracking-wider text-gray-600">Bill Line Items</span>
                                                <span className="ml-auto text-[10px] font-bold text-gray-400">{ipdBillData.items.length} items</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-50 border-b border-gray-200">
                                                        <tr>
                                                            <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Description</th>
                                                            <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Category</th>
                                                            <th className="text-center px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Qty</th>
                                                            <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Unit Price</th>
                                                            <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Total</th>
                                                            <th className="text-center px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {ipdBillData.items.length === 0 ? (
                                                            <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-xs font-medium">No charges posted yet</td></tr>
                                                        ) : ipdBillData.items.map((item: any) => {
                                                            const isPharmacy = (item.service_category || '').toLowerCase() === 'pharmacy' || (item.department || '').toLowerCase() === 'pharmacy';
                                                            const isEditing = ipdEditingId === item.id;
                                                            const isRemoving = ipdRemovingId === item.id;
                                                            const isSaving = ipdActionLoading === item.id;
                                                            return (
                                                                <tr
                                                                    key={item.id}
                                                                    className={`transition-colors ${
                                                                        isPharmacy
                                                                            ? isEditing ? 'bg-blue-50' : 'hover:bg-blue-50/40'
                                                                            : 'opacity-60 bg-gray-50/50'
                                                                    }`}
                                                                >
                                                                    {/* Description */}
                                                                    <td className="px-5 py-3">
                                                                        {isEditing ? (
                                                                            <input
                                                                                value={ipdEditRow.description}
                                                                                onChange={e => setIpdEditRow(r => ({ ...r, description: e.target.value }))}
                                                                                className="w-full px-2 py-1 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-medium"
                                                                            />
                                                                        ) : (
                                                                            <span className="font-medium text-gray-800">{item.description}</span>
                                                                        )}
                                                                    </td>
                                                                    {/* Category badge */}
                                                                    <td className="px-5 py-3">
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                            isPharmacy
                                                                                ? 'bg-blue-100 text-blue-700'
                                                                                : 'bg-gray-100 text-gray-500'
                                                                        }`}>
                                                                            {isPharmacy ? <Pill className="h-2.5 w-2.5 mr-1" /> : null}
                                                                            {item.service_category || item.department || 'General'}
                                                                        </span>
                                                                    </td>
                                                                    {/* Qty */}
                                                                    <td className="px-4 py-3 text-center">
                                                                        {isEditing ? (
                                                                            <input
                                                                                type="number" min="1"
                                                                                value={ipdEditRow.quantity}
                                                                                onChange={e => setIpdEditRow(r => ({ ...r, quantity: Number(e.target.value) }))}
                                                                                className="w-16 text-center px-2 py-1 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-bold"
                                                                            />
                                                                        ) : (
                                                                            <span className="font-semibold text-gray-700">{item.quantity}</span>
                                                                        )}
                                                                    </td>
                                                                    {/* Unit Price */}
                                                                    <td className="px-4 py-3 text-right">
                                                                        {isEditing ? (
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                <span className="text-xs text-gray-400">₹</span>
                                                                                <input
                                                                                    type="number" min="0" step="0.01"
                                                                                    value={ipdEditRow.unit_price}
                                                                                    onChange={e => setIpdEditRow(r => ({ ...r, unit_price: Number(e.target.value) }))}
                                                                                    className="w-24 text-right px-2 py-1 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-bold"
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <span className="font-semibold text-gray-700">₹{item.unit_price.toFixed(2)}</span>
                                                                        )}
                                                                    </td>
                                                                    {/* Row total */}
                                                                    <td className="px-5 py-3 text-right">
                                                                        <span className="font-bold text-gray-900">
                                                                            ₹{isEditing
                                                                                ? (ipdEditRow.quantity * ipdEditRow.unit_price).toFixed(2)
                                                                                : (item.quantity * item.unit_price).toFixed(2)}
                                                                        </span>
                                                                    </td>
                                                                    {/* Action buttons */}
                                                                    <td className="px-4 py-3 text-center">
                                                                        {isPharmacy ? (
                                                                            <div className="flex items-center justify-center gap-1.5">
                                                                                {isEditing ? (
                                                                                    <>
                                                                                        <button
                                                                                            onClick={() => saveIpdEdit(item)}
                                                                                            disabled={isSaving}
                                                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
                                                                                        >
                                                                                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                                                                            Save
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => setIpdEditingId(null)}
                                                                                            disabled={isSaving}
                                                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-bold rounded-lg transition-all"
                                                                                        >
                                                                                            <X className="h-3 w-3" /> Cancel
                                                                                        </button>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <button
                                                                                            onClick={() => startIpdEdit(item)}
                                                                                            title="Edit this item"
                                                                                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all"
                                                                                        >
                                                                                            <Pencil className="h-3.5 w-3.5" />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleIpdRemove(item)}
                                                                                            disabled={isRemoving}
                                                                                            title="Remove this item"
                                                                                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg transition-all disabled:opacity-40"
                                                                                        >
                                                                                            {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[10px] text-gray-300 font-medium">Read-only</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Bill summary footer */}
                                            <div className="px-5 py-4 bg-gray-50/60 border-t border-gray-200 grid grid-cols-3 gap-4 text-xs">
                                                <div>
                                                    <p className="text-gray-400 font-medium">Subtotal</p>
                                                    <p className="font-black text-gray-800 text-base">₹{ipdBillData.invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-400 font-medium">Pharmacy items total</p>
                                                    <p className="font-bold text-blue-700 text-base">
                                                        ₹{ipdBillData.items
                                                            .filter((i: any) => (i.service_category || '').toLowerCase() === 'pharmacy' || (i.department || '').toLowerCase() === 'pharmacy')
                                                            .reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
                                                            .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-gray-400 font-medium">Balance Due</p>
                                                    <p className={`font-black text-base ${ ipdBillData.invoice.balance_due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        ₹{ipdBillData.invoice.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Legend */}
                                        <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 px-1">
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-200 inline-block" /> Pharmacy items — editable</span>
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" /> Other charges — read-only</span>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {/* Add Pharmacy Item Modal */}
                            {showIpdAddModal && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                                    <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
                                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                                            <div>
                                                <h3 className="text-base font-black text-gray-900">Add Pharmacy Charge</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">Patient: <span className="font-bold text-blue-700">{ipdBillData?.admission?.patient_name}</span></p>
                                            </div>
                                            <button onClick={() => setShowIpdAddModal(false)}><X className="h-5 w-5 text-gray-400 hover:text-gray-700" /></button>
                                        </div>
                                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                            {/* Medicine search */}
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">Search Medicine</label>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                    <input
                                                        value={ipdAddSearch}
                                                        onChange={e => { setIpdAddSearch(e.target.value); setIpdAddItem(null); }}
                                                        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                                                        placeholder="Type medicine name..."
                                                    />
                                                </div>
                                                {/* Results */}
                                                {ipdAddLoading && <p className="text-xs text-gray-400 mt-2">Searching...</p>}
                                                {!ipdAddItem && ipdAddInventory.length > 0 && (
                                                    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                                                        {ipdAddInventory.map((inv: any) => (
                                                            <button
                                                                key={inv.batch_id}
                                                                onClick={() => {
                                                                    setIpdAddItem(inv);
                                                                    setIpdAddDesc(inv.medicine_name);
                                                                    setIpdAddPrice(String(inv.unit_price));
                                                                    setIpdAddQty(1);
                                                                    setIpdAddSearch(inv.medicine_name);
                                                                    setIpdAddInventory([]);
                                                                }}
                                                                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 flex items-center justify-between transition-colors"
                                                            >
                                                                <div>
                                                                    <p className="text-sm font-bold text-gray-800">{inv.medicine_name}</p>
                                                                    <p className="text-[10px] text-gray-400">{inv.is_catalog ? 'Catalog' : `Batch: ${inv.batch_id}`} &nbsp;·&nbsp; Stock: {inv.stock_count}</p>
                                                                </div>
                                                                <span className="font-bold text-blue-700 text-sm">₹{inv.unit_price.toFixed(2)}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {ipdAddItem && (
                                                    <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                                                        <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" />
                                                        <span className="text-sm font-bold text-blue-800">{ipdAddItem.medicine_name}</span>
                                                        <button onClick={() => { setIpdAddItem(null); setIpdAddDesc(''); setIpdAddPrice(''); setIpdAddSearch(''); }} className="ml-auto text-blue-400 hover:text-blue-600"><X className="h-3.5 w-3.5" /></button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">Description on Bill</label>
                                                <input
                                                    value={ipdAddDesc}
                                                    onChange={e => setIpdAddDesc(e.target.value)}
                                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                                                    placeholder="e.g. Paracetamol 500mg"
                                                />
                                            </div>

                                            {/* Qty + Price */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">Quantity</label>
                                                    <input
                                                        type="number" min="1"
                                                        value={ipdAddQty}
                                                        onChange={e => setIpdAddQty(Number(e.target.value))}
                                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-bold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block">Unit Price (₹)</label>
                                                    <input
                                                        type="number" min="0" step="0.01"
                                                        value={ipdAddPrice}
                                                        onChange={e => setIpdAddPrice(e.target.value)}
                                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-bold"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>

                                            {/* Line total preview */}
                                            {ipdAddQty > 0 && Number(ipdAddPrice) > 0 && (
                                                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                                                    <span className="text-xs font-bold text-blue-700">Line Total</span>
                                                    <span className="text-lg font-black text-blue-800">₹{(ipdAddQty * Number(ipdAddPrice)).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3 justify-end">
                                            <button
                                                onClick={() => setShowIpdAddModal(false)}
                                                className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleIpdAddCharge}
                                                disabled={!ipdAddItem || !ipdAddDesc.trim() || !ipdAddPrice || ipdActionLoading === -1}
                                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                {ipdActionLoading === -1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                                Add to IPD Bill
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'orders' ? (
                        <div>
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
                                                {order.indent_number ? (
                                                    <span className="text-[11px] text-teal-700 font-black font-mono bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">{order.indent_number}</span>
                                                ) : (
                                                    <span className="text-[10px] text-gray-300 font-mono">#{String(order.id).padStart(6, '0')}</span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-gray-700 text-lg">
                                                {order.patient?.full_name || 'Unknown Patient'}
                                                <span className="font-mono text-gray-400 text-xs font-normal ml-2">({order.patient_id})</span>
                                            </h3>
                                            <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-bold text-gray-500 border border-gray-200">{order.requested_by_name ? `Nurse: ${order.requested_by_name}` : `Dr. ${order.doctor_id}`}</span>
                                                {order.ward && order.ward !== '—' && (
                                                    <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-xs font-bold border border-indigo-100">{order.ward}</span>
                                                )}
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
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
                            {/* LEFT COLUMN — Patient picker, medicine search, inventory results */}
                            <div className="space-y-4 min-w-0">
                                {/* STEP 1 — Patient FIRST */}
                                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                                    <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Step 1 · Billing Mode</span>
                                            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200 self-start">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsWalkIn(false);
                                                        setIsHospitalUse(false);
                                                        clearPatient();
                                                        setDiscount('');
                                                    }}
                                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all ${
                                                        !isWalkIn && !isHospitalUse
                                                            ? 'bg-white text-orange-600 shadow-sm'
                                                            : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                >
                                                    👤 Patient
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsWalkIn(true);
                                                        setIsHospitalUse(false);
                                                        clearPatient();
                                                        setWalkInName('');
                                                        setWalkInContact('');
                                                        setDiscount('');
                                                    }}
                                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all ${
                                                        isWalkIn
                                                            ? 'bg-amber-500 text-white shadow-sm'
                                                            : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                >
                                                    ⚡ Walk-in / OTC
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsWalkIn(false);
                                                        setIsHospitalUse(true);
                                                        clearPatient();
                                                        setDiscount('');
                                                        setPaymentMethod('Credit');
                                                    }}
                                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-all ${
                                                        isHospitalUse
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                >
                                                    🏥 Hospital Use
                                                </button>
                                            </div>
                                        </div>

                                        {isHospitalUse ? (
                                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                                                <p className="text-xs font-bold text-blue-900">Hospital Internal Use Mode</p>
                                                <p className="text-[10px] text-blue-600 font-medium leading-relaxed">
                                                    Medicines/consumables will be billed to the hospital account under patient ID <code className="font-mono bg-blue-100 px-1 py-0.5 rounded font-bold">HOSPITAL</code>. The invoice will be saved as a credit transaction.
                                                </p>
                                            </div>
                                        ) : isWalkIn ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400" />
                                                    <input
                                                        value={walkInName}
                                                        onChange={e => setWalkInName(e.target.value)}
                                                        className="w-full pl-9 pr-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-300 outline-none font-medium text-amber-900 placeholder:text-amber-400"
                                                        placeholder="Customer name (optional)"
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        value={walkInContact}
                                                        onChange={e => setWalkInContact(e.target.value.replace(/[^0-9+\-\s]/g, ''))}
                                                        inputMode="tel"
                                                        maxLength={15}
                                                        className="w-full pl-3 pr-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-300 outline-none font-medium text-amber-900 placeholder:text-amber-400"
                                                        placeholder="Contact number (optional)"
                                                    />
                                                </div>
                                                <p className="text-[10px] font-bold text-amber-600 px-1 sm:col-span-2">Walk-in / OTC — no registration needed. Name &amp; contact appear on the bill.</p>
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
                                                {(selectedPatient || patientSearch) && (
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
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {!(isWalkIn || isHospitalUse || selectedPatient) ? (
                                    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-400 font-medium text-sm">
                                        Select a patient (or switch to Walk-in / OTC) to start billing.
                                    </div>
                                ) : (
                                    <>
                                        {/* Medicine search bar */}
                                        <div className="relative w-full group">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 h-4 w-4 group-focus-within:text-orange-500 transition-colors" />
                                            <input
                                                value={search} onChange={e => setSearch(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 outline-none text-sm transition-all placeholder:text-gray-400 font-medium text-gray-900"
                                                placeholder="Search medicine by name or batch..."
                                            />
                                        </div>

                                        {/* Search results */}
                                        {search.trim() === '' ? (
                                            <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-gray-400 text-xs font-medium">
                                                <Search className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                                                Type a medicine name to search and add to the bill.
                                            </div>
                                        ) : (
                                            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead className="bg-gray-50 border-b border-gray-200">
                                                            <tr>
                                                                {['Medicine', 'Batch', 'Expiry', 'Stock', 'Price', 'GST', ''].map((h, i) => (
                                                                    <th key={i} className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-gray-400 whitespace-nowrap ${i === 6 ? 'w-12' : ''}`}>{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-50 text-sm">
                                                            {loading ? (
                                                                Array(5).fill(0).map((_, i) => (
                                                                    <tr key={i}><td colSpan={7} className="px-4 py-5"><div className="h-4 bg-gray-100 rounded w-full animate-pulse" /></td></tr>
                                                                ))
                                                            ) : filteredInventory.length === 0 ? (
                                                                <tr><td colSpan={7} className="text-center py-16 text-gray-400 font-medium">No medicines found</td></tr>
                                                            ) : filteredInventory.map(item => {
                                                                const expStatus = getExpiryStatus(item.expiry_date);
                                                                const isExpired = !item.is_catalog && item.expiry_date ? new Date(item.expiry_date) < new Date() : false;
                                                                return (
                                                                    <tr key={item.batch_id} className={`hover:bg-orange-50/30 transition-colors ${isExpired ? 'opacity-50' : ''}`}>
                                                                        <td className="px-4 py-3">
                                                                            <span className="font-bold text-gray-700 break-words">{item.medicine_name}</span>
                                                                        </td>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            {item.is_catalog ? (
                                                                                <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-200 font-bold">Catalog</span>
                                                                            ) : (
                                                                                <span className="font-mono text-gray-500 text-xs bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{item.batch_id}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-0.5 ${expStatus.color}`}>
                                                                                {expStatus.urgent && <AlertTriangle className="h-3 w-3" />}
                                                                                {expStatus.label}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            {item.is_catalog ? (
                                                                                <span className="px-2 py-0.5 rounded-lg text-xs font-bold border bg-indigo-50 text-indigo-600 border-indigo-200">No Stock</span>
                                                                            ) : (
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${item.stock_count <= 0 ? 'bg-red-50 text-red-500 border-red-200' : item.stock_count < 10 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                                                                        {item.stock_count}
                                                                                    </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setAdjustStockItem(item);
                                                                                            setAdjustStockQty(String(item.stock_count));
                                                                                            setAdjustStockReason('Dispensing stock correction');
                                                                                        }}
                                                                                        className="p-1 hover:bg-amber-50 text-gray-400 hover:text-amber-600 rounded transition-all"
                                                                                        title="Edit / Correct Stock Quantity"
                                                                                    >
                                                                                        <Pencil className="h-3 w-3" />
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            <span className="font-bold text-gray-700">₹{item.unit_price.toFixed(2)}</span>
                                                                            {item.mrp > item.unit_price && (
                                                                                <span className="block text-[10px] leading-tight">
                                                                                    <span className="line-through text-gray-400">₹{item.mrp}</span>
                                                                                    <span className="ml-1 font-bold text-emerald-600">−{Math.round((1 - item.unit_price / item.mrp) * 100)}%</span>
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            <span className="text-xs text-gray-500 font-medium">{item.gst_percent}%</span>
                                                                        </td>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            <div className="flex items-center gap-1">
                                                                                <button
                                                                                    onClick={() => addToCart(item)}
                                                                                    disabled={!item.is_catalog && (item.stock_count <= 0 || isExpired)}
                                                                                    className="bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-600 p-1.5 rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                                                                    title="Add to bill"
                                                                                >
                                                                                    <Plus className="h-3.5 w-3.5" />
                                                                                </button>
                                                                                {!item.is_catalog && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setAdjustStockItem(item);
                                                                                            setAdjustStockQty(String(item.stock_count));
                                                                                            setAdjustStockReason('Dispensing stock correction');
                                                                                        }}
                                                                                        className="bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 p-1.5 rounded-lg transition-all"
                                                                                        title="Correct / Adjust Batch Stock"
                                                                                    >
                                                                                        <SlidersHorizontal className="h-3.5 w-3.5" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* RIGHT COLUMN — Sticky bill panel (cart + summary + payment + checkout) */}
                            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
                                {!(isWalkIn || isHospitalUse || selectedPatient) ? (
                                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center">
                                        <div className="h-14 w-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                            <ShoppingCart className="h-7 w-7 text-gray-300" />
                                        </div>
                                        <p className="font-bold text-gray-400 text-sm">No active bill</p>
                                        <p className="text-xs text-gray-300 mt-1">Select a patient to begin</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Patient banner */}
                                        {isHospitalUse ? (
                                            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Hospital Use</p>
                                                    <p className="text-sm font-bold text-blue-900 mt-0.5 truncate">Hospital Internal Use</p>
                                                    <p className="text-[10px] font-mono text-blue-700">Patient ID: HOSPITAL</p>
                                                </div>
                                                <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                            </div>
                                        ) : isWalkIn ? (
                                            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Walk-in / OTC</p>
                                                    <p className="text-sm font-bold text-amber-900 mt-0.5 truncate">{walkInName.trim() || 'Walk-in / OTC'}</p>
                                                    {walkInContact.trim() && <p className="text-[10px] font-mono text-amber-700">{walkInContact}</p>}
                                                </div>
                                                <CheckCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                            </div>
                                        ) : (
                                            <div className={`rounded-2xl px-4 py-3 border flex items-center justify-between ${selectedPatient.is_admitted ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Billing</p>
                                                    <p className="text-sm font-bold text-teal-800 mt-0.5 truncate">{selectedPatient.full_name}</p>
                                                    <p className="text-[10px] font-mono text-orange-500">{selectedPatient.patient_id}</p>
                                                    {selectedPatient.is_admitted && (
                                                        <p className="text-[10px] font-bold text-blue-700 mt-0.5">
                                                            🏥 IPD — posts to IPD bill
                                                        </p>
                                                    )}
                                                </div>
                                                <CheckCircle className={`h-4 w-4 flex-shrink-0 ${selectedPatient.is_admitted ? 'text-blue-500' : 'text-orange-500'}`} />
                                            </div>
                                        )}

                                        {/* Cart card with internal scroll */}
                                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                                                <h2 className="text-xs font-black text-gray-700 flex items-center gap-2 uppercase tracking-[0.12em]">
                                                    <ShoppingCart className="h-4 w-4 text-orange-500" /> Current Bill
                                                </h2>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{cart.length} item{cart.length === 1 ? '' : 's'}</span>
                                                    {cart.length > 0 && (
                                                        <button
                                                            onClick={() => { if (confirm('Clear all items from this bill?')) setCart([]); }}
                                                            className="text-[10px] font-bold text-gray-400 hover:text-rose-500 transition-colors"
                                                            title="Clear cart"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-3 space-y-2 max-h-[42vh] overflow-y-auto">
                                                {cart.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center text-center p-6">
                                                        <div className="h-12 w-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-2">
                                                            <ShoppingCart className="h-6 w-6 text-gray-300" />
                                                        </div>
                                                        <p className="font-bold text-gray-400 text-xs">Cart is empty</p>
                                                        <p className="text-[11px] text-gray-300 mt-0.5">Add items from search</p>
                                                    </div>
                                                ) : cart.map(item => {
                                                    const lineSubtotal = item.unit_price * item.quantity;
                                                    const itemTax = lineSubtotal * item.gst_percent / 100;
                                                    const mrpSavings = item.mrp > item.unit_price ? (item.mrp - item.unit_price) * item.quantity : 0;
                                                    const lowStockWarn = !item.is_catalog && item.quantity >= item.stock_count;
                                                    return (
                                                        <div key={item.batch_id} className="p-2.5 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:shadow-sm transition-all">
                                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="text-[13px] font-bold text-gray-800 leading-tight truncate" title={item.medicine_name}>{item.medicine_name}</h4>
                                                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                                        <span className="text-[10px] text-gray-400 font-mono truncate max-w-[110px]">{item.is_catalog ? 'Catalog' : item.batch_id}</span>
                                                                        {item.gst_percent > 0 && (
                                                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-100">GST {item.gst_percent}%</span>
                                                                        )}
                                                                        {lowStockWarn && (
                                                                            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-200" title="At maximum available stock">MAX</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <button onClick={() => removeFromCart(item.batch_id)} className="text-gray-300 hover:text-rose-500 p-1 hover:bg-rose-50 rounded transition-colors shrink-0">
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
                                                                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 p-0.5">
                                                                    <button onClick={() => updateQty(item.batch_id, -1)} className="h-6 w-6 flex items-center justify-center hover:bg-white rounded text-gray-600 transition-colors"><Minus className="h-3 w-3" /></button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={item.quantity}
                                                                        onChange={e => setQty(item.batch_id, e.target.value)}
                                                                        className="w-10 text-center text-xs font-bold text-gray-800 bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    />
                                                                    <button onClick={() => updateQty(item.batch_id, 1)} disabled={!item.is_catalog && item.quantity >= item.stock_count} className="h-6 w-6 flex items-center justify-center hover:bg-white rounded text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><Plus className="h-3 w-3" /></button>
                                                                </div>
                                                                <div className="flex items-center gap-1 justify-end">
                                                                    <span className="text-[10px] text-gray-400">×</span>
                                                                    <span className="text-[10px] text-gray-400">₹</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        value={item.unit_price}
                                                                        onChange={e => updatePrice(item.batch_id, e.target.value)}
                                                                        className="w-20 px-2 py-1 text-xs font-bold text-right text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-orange-400 focus:border-orange-400 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-dashed border-gray-200">
                                                                <div className="flex flex-col">
                                                                    {itemTax > 0 && <span className="text-[10px] text-gray-400">+₹{itemTax.toFixed(2)} tax</span>}
                                                                    {mrpSavings > 0 && <span className="text-[10px] font-bold text-emerald-600">Save ₹{mrpSavings.toFixed(2)}</span>}
                                                                </div>
                                                                <span className="font-black text-gray-900 text-sm">₹{lineSubtotal.toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Summary + Date/Doctor + Payment + Checkout */}
                                        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
                                            {cart.length > 0 && (
                                                <div className="space-y-1 mb-3 text-xs">
                                                    <div className="flex justify-between text-gray-500">
                                                        <span>Subtotal</span>
                                                        <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                                                    </div>
                                                    {totalTax > 0 && (
                                                        <>
                                                            <div className="flex justify-between text-gray-400">
                                                                <span>CGST</span>
                                                                <span>₹{cgst.toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex justify-between text-gray-400">
                                                                <span>SGST</span>
                                                                <span>₹{sgst.toFixed(2)}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                    {isWalkIn && (
                                                        <div className="flex justify-between items-center pt-1">
                                                            <span className="text-gray-500">Discount (%)</span>
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="number" min="0" max="100" step="0.01"
                                                                    value={discount}
                                                                    onChange={e => setDiscount(e.target.value)}
                                                                    placeholder="0"
                                                                    className="w-16 text-right text-xs p-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                                                                />
                                                                <span className="text-gray-400 text-xs">%</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {discountAmt > 0 && (
                                                        <div className="flex justify-between text-emerald-600">
                                                            <span>Discount ({discountPct}%)</span>
                                                            <span>−₹{discountAmt.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-gray-200">
                                                        <span className="font-bold text-gray-700 text-sm">Total</span>
                                                        <span className="text-2xl font-black text-gray-900">₹{payableTotal.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Bill Date + Doctor */}
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
                                                            setDoctorRegNo(picked?.reg_no || '');
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

                                            {/* Payment Method */}
                                            {isHospitalUse ? (
                                                <div className="mb-3 space-y-2">
                                                    <div className="py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 font-bold text-center flex items-center justify-center gap-1.5">
                                                        <Clock className="h-4 w-4 text-blue-500" /> Billed as Credit to Hospital Account
                                                    </div>
                                                </div>
                                            ) : selectedPatient?.is_admitted ? (
                                                <div className="mb-3 space-y-2">
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        {IPD_PAYMENT_METHODS.map(m => (
                                                            <button
                                                                key={m.id}
                                                                onClick={() => setPaymentMethod(m.id)}
                                                                className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all border ${
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
                                                        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium">
                                                            🏥 <strong>Credit:</strong> Posted to IPD bill. Settled at discharge.
                                                        </div>
                                                    ) : (
                                                        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 font-medium">
                                                            🏥 <strong>IPD Patient</strong> — also posted to IPD bill.
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-1.5 mb-3">
                                                    {PAYMENT_METHODS.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => setPaymentMethod(m.id)}
                                                            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${paymentMethod === m.id ? 'bg-orange-50 border-teal-300 text-orange-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                                        >
                                                            <m.icon className="h-3.5 w-3.5" /> {m.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <button
                                                onClick={handleCheckout}
                                                disabled={cart.length === 0 || (!isWalkIn && !isHospitalUse && !patientId)}
                                                className={`w-full font-bold py-3 rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] text-sm ${selectedPatient?.is_admitted || isHospitalUse ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/20' : 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-teal-500/20'}`}
                                            >
                                                <Receipt className="h-4 w-4" />
                                                {isHospitalUse
                                                    ? 'Generate Hospital Invoice (Credit)'
                                                    : selectedPatient?.is_admitted
                                                        ? (paymentMethod === 'Credit' ? 'Add to IPD Bill (Credit)' : 'Post to IPD Bill')
                                                        : 'Generate Invoice'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </aside>
                        </div>
                    )}
                </div>
            </div>

            {/* INVOICE MODAL */}
            {showInvoiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden print-area relative max-h-[90vh] flex flex-col print:fixed print:inset-0 print:max-w-none print:max-h-none print:rounded-none print:shadow-none print:overflow-visible">
                        <div className="absolute top-0 left-0 right-0 h-[2px] print:hidden" style={{ background: `linear-gradient(90deg, ${branding?.accentColor || '#1e3a6e'}, #f97316, ${branding?.accentColor || '#1e3a6e'})` }} />

                        {invoiceResult ? (
                            /* Invoice Generated - Show Receipt */
                            <>
                                <div className="p-4 border-b border-dashed border-gray-200 shrink-0" style={{ paddingTop: undefined }}>
                                    {/* Letterhead — hidden in print, letterhead image replaces it */}
                                    <div className="flex items-start justify-between pb-3 mb-3 print:hidden" style={{ borderBottom: `2px solid ${branding?.accentColor || '#1e3a6e'}` }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={branding?.logoUrl || '/logo.jpeg'} alt={branding?.hospitalName || 'Hospital'} className="h-10 w-auto object-contain" />
                                        <div className="text-right">
                                            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: branding?.accentColor || '#1e3a6e' }}>Pharmacy Invoice</p>
                                            <p className="text-[10px] font-mono text-gray-500 mt-0.5">{invoiceResult.invoice_number}</p>
                                            <p className="text-[10px] text-gray-400">{billDisplayDateStr}</p>
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
                                    <div className="flex items-center justify-center gap-1.5 mt-1">
                                        <div className="h-6 w-6 bg-emerald-100 rounded-md flex items-center justify-center">
                                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                        </div>
                                        <p className="text-xs font-black text-gray-900">Invoice Generated</p>
                                    </div>
                                </div>
                                <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">Patient</span>
                                        <span className="font-bold text-gray-700">{billPatientLabel}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">Date</span>
                                        <span className="font-medium text-gray-700">{billDisplayDateStr}</span>
                                    </div>
                                    {billDoctorLabel && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Doctor</span>
                                            <span className="font-medium text-gray-700">{billDoctorLabel}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-dashed border-gray-200 pt-2 space-y-1">
                                        {invoiceResult.items?.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-xs gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <span className="font-medium text-gray-700 truncate block">{item.medicine_name}</span>
                                                    <span className="text-[10px] text-gray-400">x{item.qty} · HSN: {item.hsn_sac_code}</span>
                                                </div>
                                                <span className="font-bold text-gray-700 shrink-0">₹{item.net_price.toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t border-gray-200 pt-2 space-y-1">
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>Subtotal</span>
                                            <span>₹{invoiceResult.subtotal?.toFixed(2)}</span>
                                        </div>
                                        {invoiceResult.tax > 0 && (
                                            <>
                                                <div className="flex justify-between text-[10px] text-gray-400">
                                                    <span>CGST</span>
                                                    <span>₹{invoiceResult.cgst?.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-[10px] text-gray-400">
                                                    <span>SGST</span>
                                                    <span>₹{invoiceResult.sgst?.toFixed(2)}</span>
                                                </div>
                                            </>
                                        )}
                                        {invoiceResult.discount > 0 && (
                                            <div className="flex justify-between text-xs text-emerald-600">
                                                <span>Discount{invoiceResult.discount_pct > 0 ? ` (${invoiceResult.discount_pct}%)` : ''}</span>
                                                <span>−₹{invoiceResult.discount?.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-1.5 border-t border-gray-300">
                                            <span className="font-bold text-sm text-gray-700">Total</span>
                                            <span className="font-black text-lg text-emerald-600">₹{invoiceResult.total?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                                        <div className="flex items-center justify-center gap-1.5 text-emerald-700 text-xs font-bold">
                                            <FileText className="h-3.5 w-3.5" />
                                            {invoiceResult.credit_bill
                                                ? 'Credit Bill Created — Pending at Reception'
                                                : 'Posted to GL & GST Register'}
                                        </div>
                                        {invoiceResult.credit_bill && (
                                            <p className="text-[10px] text-amber-700 mt-0.5 font-medium">
                                                Bill #{invoiceResult.invoice_number} added to IPD admission. Collect payment at discharge.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="p-3 bg-gray-50 border-t border-gray-200 flex gap-2 no-print shrink-0">
                                    <button onClick={handlePrint} className="flex-1 py-2.5 font-bold text-xs text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1.5 transition-all">
                                        <Printer className="h-3.5 w-3.5" /> Print
                                    </button>
                                    <button onClick={closeInvoice} className="flex-1 py-2.5 font-bold text-xs text-white bg-gradient-to-r from-teal-500 to-emerald-600 rounded-lg shadow-lg shadow-teal-500/20 transition-all">
                                        Done
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Confirm Payment */
                            <>
                                <div className="p-4 border-b border-gray-200 text-center shrink-0">
                                    <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                                        <IndianRupee className="h-4 w-4 text-orange-600" />
                                    </div>
                                    <h2 className="text-sm font-black text-gray-900">Confirm Payment</h2>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Patient: <span className="font-bold text-gray-600">{billPatientLabel}</span></p>
                                </div>
                                <div className="p-4 space-y-2 overflow-y-auto flex-1 min-h-0">
                                    <div className="border-b border-dashed border-gray-200 pb-2 space-y-1">
                                        {cart.map(item => (
                                            <div key={item.batch_id} className="flex justify-between text-xs gap-2">
                                                <span className="font-medium text-gray-700 truncate flex-1 min-w-0">{item.medicine_name} <span className="text-gray-400 text-[10px]">x{item.quantity}</span></span>
                                                <span className="font-bold text-gray-700 shrink-0">₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                                        </div>
                                        {totalTax > 0 && (
                                            <div className="flex justify-between text-[10px] text-gray-400">
                                                <span>GST (CGST + SGST)</span><span>₹{totalTax.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {discountAmt > 0 && (
                                            <div className="flex justify-between text-xs text-emerald-600">
                                                <span>Discount ({discountPct}%)</span><span>−₹{discountAmt.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-1.5 border-t border-gray-300">
                                            <span className="font-bold text-sm text-gray-700">Total</span>
                                            <span className="font-black text-lg text-gray-900">₹{payableTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        {isHospitalUse ? (
                                            <div className="flex-1 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-700 flex items-center justify-center gap-1.5">
                                                <Clock className="h-3 w-3 text-blue-500" /> Billed as Credit to Hospital Account
                                            </div>
                                        ) : (
                                            (selectedPatient?.is_admitted ? IPD_PAYMENT_METHODS : PAYMENT_METHODS).map(m => (
                                                <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                                                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border transition-all ${
                                                        paymentMethod === m.id
                                                            ? m.id === 'Credit' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-orange-50 border-teal-300 text-orange-700'
                                                            : 'bg-white border-gray-200 text-gray-500'
                                                    }`}>
                                                    <m.icon className="h-3 w-3" /> {m.id === 'Credit' ? 'Credit' : m.label}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                    {paymentMethod === 'Credit' && !isHospitalUse && (
                                        <div className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800">
                                            Payment will be tracked as pending under the patient&apos;s IPD admission. Collect at discharge.
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 bg-gray-50 border-t border-gray-200 flex gap-2 no-print shrink-0">
                                    <button onClick={() => setShowInvoiceModal(false)} className="flex-1 py-2.5 font-bold text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all">Cancel</button>
                                    <button onClick={confirmPayment} disabled={isSubmitting} className="flex-[1.5] py-2.5 font-bold text-xs text-white bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 rounded-lg shadow-lg shadow-teal-500/20 disabled:opacity-70 flex items-center justify-center gap-1.5">
                                        {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle className="h-3.5 w-3.5" /> Confirm & Generate</>}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* PRINT-ONLY FULL PAGE — GST Invoice matching Avise Hospital format */}
            {invoiceResult && (() => {
                // ── helpers ──────────────────────────────────────────────────
                const fmtExp = (iso: string | null) => {
                    if (!iso) return '';
                    const d = new Date(iso);
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const y = String(d.getFullYear()).slice(2);
                    return `${m}/${y}`;
                };
                const fmtDate = (d: Date) =>
                    `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;

                const items: any[] = invoiceResult.items || [];
                const subtotal = invoiceResult.subtotal ?? 0;
                const discountAmt = invoiceResult.discount ?? 0;
                const discountPctVal = invoiceResult.discount_pct ?? 0;
                const cgstAmt = invoiceResult.cgst ?? 0;
                const sgstAmt = invoiceResult.sgst ?? 0;
                const grandTotal = invoiceResult.total ?? 0;
                const roundOff = Math.round(grandTotal) - grandTotal;
                const grandTotalRounded = Math.round(grandTotal);

                // amount in words
                const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
                const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
                const numToWords = (n: number): string => {
                    if (n === 0) return 'Zero';
                    if (n < 0) return 'Minus ' + numToWords(-n);
                    let words = '';
                    if (Math.floor(n / 10000000) > 0) { words += numToWords(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
                    if (Math.floor(n / 100000) > 0) { words += numToWords(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
                    if (Math.floor(n / 1000) > 0) { words += numToWords(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
                    if (Math.floor(n / 100) > 0) { words += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
                    if (n > 0) { words += n < 20 ? ones[n] + ' ' : tens[Math.floor(n / 10)] + ' ' + (n % 10 !== 0 ? ones[n % 10] + ' ' : ''); }
                    return words.trim();
                };
                const amountInWords = `Rs. ${numToWords(grandTotalRounded)} only`;

                const billDate = billDateTime ? new Date(billDateTime) : new Date();
                const hospitalName = branding?.hospitalName || pharmacyBranding?.name || 'Hospital';
                const hospitalAddress = branding?.hospitalAddress || pharmacyBranding?.address || '';
                const hospitalPhone = branding?.hospitalPhone || '';
                const hospitalEmail = branding?.hospitalEmail || '';
                // This is a pharmacy (Garnet Medicare) bill, so the GSTIN must be the
                // pharmacy's own — NOT the hospital org GSTIN. Orgs whose pharmacy has no
                // GSTIN yet (e.g. Avise) therefore print a plain non-GST bill.
                const hospitalGstin = pharmacyBranding?.gstin || '';
                const patientName = isHospitalUse ? 'Hospital Internal Use' : (isWalkIn ? (walkInName || 'Walk-in / OTC') : (selectedPatient?.full_name || patientId));
                const patientAddress = isWalkIn ? '' : (selectedPatient?.address || '');

                // avg tax rate for GST note
                const avgTaxRate = items.length > 0 ? (items.reduce((s: number, it: any) => s + (it.tax_rate || 0), 0) / items.length) : 0;
                const halfTax = (avgTaxRate / 2).toFixed(1);

                // GST presentation is only valid when the dispensing pharmacy has a GSTIN.
                // Orgs without one (e.g. Avise — GST not issued yet) print a plain bill:
                // no "GST INVOICE" title, no SGST/CGST columns/rows/note. To keep the
                // totals reconciling, amounts are shown tax-inclusive in that mode.
                const showGst = !!hospitalGstin;
                const itemColCount = showGst ? 12 : 10;
                const displaySubtotal = showGst ? subtotal : subtotal + cgstAmt + sgstAmt;

                const TD: React.CSSProperties = { border: '1px solid #000', padding: '2px 4px', fontSize: '9px', verticalAlign: 'middle' };
                const TH: React.CSSProperties = { border: '1px solid #000', padding: '2px 4px', fontSize: '9px', fontWeight: 700, background: '#f5f5f5', textAlign: 'center', verticalAlign: 'middle' };

                return (
                <div className="pharmacy-print-view" style={{ display: 'none' }}>
                    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#000', padding: '8px 14px', maxWidth: '800px', margin: '0 auto' }}>

                        {/* ── HEADER ── */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
                            <tbody>
                                <tr>
                                    <td style={{ width: '55%', verticalAlign: 'top', padding: '0 0 4px 0' }}>
                                        <div style={{ fontWeight: 900, fontSize: '15px', letterSpacing: '0.5px' }}>{hospitalName}</div>
                                        {hospitalAddress && <div style={{ fontSize: '9px', marginTop: '1px' }}>{hospitalAddress}</div>}
                                        {hospitalPhone && <div style={{ fontSize: '9px' }}>Phone : {hospitalPhone}</div>}
                                        {hospitalEmail && <div style={{ fontSize: '9px' }}>E-Mail : {hospitalEmail}</div>}
                                    </td>
                                    <td style={{ width: '45%', verticalAlign: 'top', padding: '0 0 4px 8px' }}>
                                        <div style={{ fontSize: '9px' }}><strong>Patient Name :</strong> {patientName.toUpperCase()}</div>
                                        <div style={{ fontSize: '9px' }}>Patient Address : {patientAddress}</div>
                                        <div style={{ fontSize: '9px' }}><strong>Dr Name :</strong> {billDoctorLabel !== 'Dr. Self' ? billDoctorLabel.toUpperCase() : ''}</div>
                                        <div style={{ fontSize: '9px' }}>Dr Reg No. {doctorRegNo}</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {hospitalGstin && <div style={{ fontSize: '9px', marginBottom: '3px' }}><strong>GSTIN : {hospitalGstin}</strong></div>}

                        {/* ── TITLE ── */}
                        <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 900, borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '3px 0', marginBottom: '3px' }}>{showGst ? 'GST INVOICE' : 'INVOICE'}</div>

                        {/* Invoice no + date */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '9px', marginBottom: '3px' }}>
                            <span><strong>Invoice No. :</strong> {invoiceResult.invoice_number} &nbsp; <strong>Date:</strong> {fmtDate(billDate)}</span>
                        </div>

                        {/* ── ITEMS TABLE ── */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...TH, width: '26px' }}>SN.</th>
                                    <th style={{ ...TH, textAlign: 'left' }}>PRODUCT NAME</th>
                                    <th style={{ ...TH, width: '52px' }}>PACK</th>
                                    <th style={{ ...TH, width: '58px' }}>HSN</th>
                                    <th style={{ ...TH, width: '62px' }}>BATCH</th>
                                    <th style={{ ...TH, width: '34px' }}>EXP.</th>
                                    <th style={{ ...TH, width: '32px' }}>QTY</th>
                                    <th style={{ ...TH, width: '48px' }}>MRP</th>
                                    <th style={{ ...TH, width: '48px' }}>RATE</th>
                                    {showGst && <th style={{ ...TH, width: '30px' }}>SGST</th>}
                                    {showGst && <th style={{ ...TH, width: '30px' }}>CGST</th>}
                                    <th style={{ ...TH, width: '52px' }}>AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item: any, idx: number) => {
                                    const halfTaxRate = (item.tax_rate || 0) / 2;
                                    const rate = item.unit_price;
                                    const amount = item.net_price;
                                    return (
                                        <tr key={idx}>
                                            <td style={{ ...TD, textAlign: 'center' }}>{idx + 1}.</td>
                                            <td style={{ ...TD, textAlign: 'left' }}>{item.medicine_name.toUpperCase()}</td>
                                            <td style={{ ...TD, textAlign: 'center' }}>{item.pack || '—'}</td>
                                            <td style={{ ...TD, textAlign: 'center' }}>{item.hsn_sac_code || '3004'}</td>
                                            <td style={{ ...TD, textAlign: 'center' }}>{item.batch_no || '—'}</td>
                                            <td style={{ ...TD, textAlign: 'center' }}>{fmtExp(item.expiry_date)}</td>
                                            <td style={{ ...TD, textAlign: 'center' }}>{item.qty}</td>
                                            <td style={{ ...TD, textAlign: 'right' }}>{Number(item.mrp || 0).toFixed(2)}</td>
                                            <td style={{ ...TD, textAlign: 'right' }}>{rate.toFixed(2)}</td>
                                            {showGst && <td style={{ ...TD, textAlign: 'center' }}>{halfTaxRate.toFixed(2)}</td>}
                                            {showGst && <td style={{ ...TD, textAlign: 'center' }}>{halfTaxRate.toFixed(2)}</td>}
                                            <td style={{ ...TD, textAlign: 'right' }}>{(showGst ? amount : amount + (item.tax_amount || 0)).toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                                {/* empty rows to fill to at least 8 lines */}
                                {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}>
                                        {Array.from({ length: itemColCount }).map((_, j) => <td key={j} style={{ ...TD, height: '14px' }}>&nbsp;</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* ── FOOTER AREA ── */}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    {/* LEFT: GST note + terms */}
                                    <td style={{ width: '62%', verticalAlign: 'top', paddingRight: '8px' }}>
                                        {showGst && avgTaxRate > 0 && (
                                            <div style={{ fontSize: '8px', marginBottom: '4px' }}>
                                                GST {subtotal.toFixed(2)}*{halfTax}+{halfTax}%={sgstAmt.toFixed(2)}SGST+{cgstAmt.toFixed(2)}CGST, &nbsp;&nbsp;<strong>*** GET WELL SOON **</strong>
                                            </div>
                                        )}
                                        {!showGst && (
                                            <div style={{ fontSize: '8px', marginBottom: '4px' }}>
                                                <strong>*** GET WELL SOON **</strong>
                                            </div>
                                        )}
                                        <div style={{ fontSize: '8px', marginBottom: '2px' }}><strong>Terms &amp; Conditions</strong></div>
                                        <div style={{ fontSize: '8px' }}>Goods once sold will not be taken back or exchanged.</div>
                                        <div style={{ fontSize: '8px' }}>Bills not paid due date will attract 24% interest.</div>
                                        <div style={{ fontSize: '8px' }}>All disputes subject to Jurisdication only.</div>
                                        <div style={{ fontSize: '8px', marginBottom: '10px' }}>Prescribed Sales Tax declaration will be given.</div>
                                        <div style={{ fontSize: '8px' }}><em>Remark :</em></div>
                                        <div style={{ marginTop: '14px', fontSize: '8px' }}><strong>{amountInWords}</strong></div>
                                    </td>
                                    {/* RIGHT: summary box */}
                                    <td style={{ width: '38%', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '9px', marginBottom: '6px', textAlign: 'right' }}>For {hospitalName.toUpperCase().includes('PHARMA') ? hospitalName.toUpperCase() : `${hospitalName.toUpperCase()} PHARMACY`}</div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                {[
                                                    ['SUB TOTAL', displaySubtotal.toFixed(2)],
                                                    ['ROUND OFF', roundOff > 0 ? `-${Math.abs(roundOff).toFixed(2)}` : roundOff < 0 ? `+${Math.abs(roundOff).toFixed(2)}` : '0.00'],
                                                    ...(discountAmt > 0 ? [[`Discount ${discountPctVal > 0 ? discountPctVal + ' %' : ''}`, discountAmt.toFixed(2)]] : []),
                                                    ...(showGst && sgstAmt > 0 ? [[`SGST ${halfTax} %`, sgstAmt.toFixed(2)]] : []),
                                                    ...(showGst && cgstAmt > 0 ? [[`CGST ${halfTax} %`, cgstAmt.toFixed(2)]] : []),
                                                    ...(roundOff !== 0 ? [['Roundoff', Math.abs(roundOff).toFixed(2)]] : []),
                                                ].map(([label, val], i) => (
                                                    <tr key={i}>
                                                        <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '9px', fontWeight: 600 }}>{label}</td>
                                                        <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '9px', textAlign: 'right' }}>{val}</td>
                                                    </tr>
                                                ))}
                                                <tr>
                                                    <td style={{ border: '2px solid #000', padding: '3px 4px', fontSize: '10px', fontWeight: 900 }}>GRAND TOTAL</td>
                                                    <td style={{ border: '2px solid #000', padding: '3px 4px', fontSize: '10px', fontWeight: 900, textAlign: 'right' }}>{grandTotalRounded.toFixed(2)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '9px' }}>Authorised Signatory</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                );
            })()}

            {/* EDIT / CORRECT STOCK */}
            <StockCorrectionModal
                open={showStockCorrection}
                onClose={() => setShowStockCorrection(false)}
                onChanged={() => { void loadInventory(debouncedSearch); }}
            />

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
                                    <DateField value={invForm.expiry} onChange={e => setInvForm({ ...invForm, expiry: e.target.value })} className={`w-full p-3.5 bg-white border rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900 ${invForm.expiry === '' && invForm.batch_no ? 'border-red-300' : 'border-gray-300'}`} placeholder="dd/mm/yyyy (e.g. 01/12/2026)" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Unit Price (₹)</label>
                                    <input value={invForm.price} onChange={e => setInvForm({ ...invForm, price: e.target.value })} type="number" step="0.01" className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-bold text-gray-900 placeholder:text-gray-400" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">Rack Location</label>
                                    <input value={invForm.rack} onChange={e => setInvForm({ ...invForm, rack: e.target.value })} className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-medium text-gray-900 placeholder:text-gray-400" placeholder="Optional (e.g. A-4)" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1">HSN / SAC Code</label>
                                    <input
                                        value={invForm.hsn_sac_code}
                                        // Same normalisation as the Medicine Master editor: uppercase,
                                        // alphanumeric only, max 12 (HSN/SAC is 4-12 chars).
                                        onChange={e => setInvForm({ ...invForm, hsn_sac_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })}
                                        maxLength={12}
                                        pattern="[A-Z0-9]{4,12}"
                                        title="HSN/SAC should be 4-12 alphanumeric characters"
                                        className="w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none font-mono font-medium text-gray-900 placeholder:text-gray-400"
                                        placeholder="e.g. 30049087"
                                    />
                                    {/* HSN lives on the medicine, not the batch — saving it here updates
                                        the medicine for every batch. Say so rather than surprise them. */}
                                    <p className="text-[10px] text-gray-400 ml-1">
                                        {invForm.isNewMedicine
                                            ? 'Optional · used for GST'
                                            : 'Optional · applies to all batches of this medicine'}
                                    </p>
                                </div>
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
                                {[...PAYMENT_METHODS, { id: 'Credit', label: 'Credit (IPD)', icon: Clock }].map(m => (
                                    <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                                            paymentMethod === m.id
                                                ? m.id === 'Credit' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-orange-50 border-teal-300 text-orange-700'
                                                : 'bg-white border-gray-200 text-gray-500'
                                        }`}>
                                        <m.icon className="h-3.5 w-3.5" /> {m.label}
                                    </button>
                                ))}
                            </div>
                            {paymentMethod === 'Credit' && (
                                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-3 font-medium">
                                    💳 Credit — payment pending, will be collected at IPD discharge.
                                </p>
                            )}
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
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle className="h-5 w-5" /> {paymentMethod === 'Credit' ? 'Mark Delivered (Credit)' : 'Mark Paid & Delivered'}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* STOCK ADJUSTMENT / CORRECTION MODAL */}
            {adjustStockItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-base font-black text-gray-900">Correct Medicine Stock</h3>
                                <p className="text-xs text-gray-500 font-medium">{adjustStockItem.medicine_name} {adjustStockItem.batch_id ? `(${adjustStockItem.batch_id})` : ''}</p>
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
