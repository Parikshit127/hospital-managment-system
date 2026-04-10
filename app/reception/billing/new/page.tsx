'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Search, Loader2, Plus, ArrowLeft, Receipt, CheckCircle } from 'lucide-react';
import { searchPatientsForBilling, createInvoice, addInvoiceItem } from '@/app/actions/finance-actions';
import { getIpdServices } from '@/app/actions/ipd-master-actions';
import { useToast } from '@/app/components/ui/Toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ReceptionGenerateBillPage() {
    const router = useRouter();
    const toast = useToast();

    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);

    const [services, setServices] = useState<any[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
    
    // Line items for the bill
    const [items, setItems] = useState<any[]>([]);
    
    // New item draft
    const [draftQty, setDraftQty] = useState(1);
    const [draftDiscount, setDraftDiscount] = useState(0);

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getIpdServices().then(res => {
            if (res.success) setServices(res.data);
        });
    }, []);

    useEffect(() => {
        if (!searchQuery || searchQuery.length < 2) {
            setPatients([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            const res = await searchPatientsForBilling(searchQuery);
            if (res.success) setPatients(res.data);
            setSearching(false);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleAddService = () => {
        if (!selectedServiceId) return;
        const svc = services.find(s => s.id === selectedServiceId);
        if (!svc) return;

        const basePrice = Number(svc.default_rate) * draftQty;
        const taxRate = Number(svc.tax_rate) || 0;
        const netPrice = basePrice - draftDiscount;
        const taxAmount = netPrice * (taxRate / 100);

        setItems([...items, {
            service_id: svc.id,
            department: svc.service_category || 'General',
            description: svc.service_name,
            quantity: draftQty,
            unit_price: Number(svc.default_rate),
            discount: draftDiscount,
            tax_rate: taxRate,
            net_total: netPrice + taxAmount
        }]);

        // Reset draft
        setSelectedServiceId(null);
        setDraftQty(1);
        setDraftDiscount(0);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleGenerateBill = async () => {
        if (!selectedPatient) return toast.error('Please select a patient');
        if (items.length === 0) return toast.error('Please add at least one item');
        
        setIsSaving(true);
        try {
            // 1. Create Invoice
            const invRes = await createInvoice({
                patient_id: selectedPatient.patient_id,
                invoice_type: 'OPD',
                notes: 'Generated from Reception Master Billing'
            });

            if (!invRes.success) {
                setIsSaving(false);
                return toast.error('Failed to create invoice: ' + invRes.error);
            }

            const invoiceId = invRes.data.id;

            // 2. Add Line Items
            for (const item of items) {
                await addInvoiceItem({
                    invoice_id: invoiceId,
                    department: item.department,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    discount: item.discount,
                    tax_rate: item.tax_rate,
                    service_category: item.department
                });
            }

            toast.success('Bill generated successfully!');
            router.push(`/finance/invoices/${invoiceId}`);

        } catch (err: any) {
            toast.error(err.message || 'An error occurred');
        }
        setIsSaving(false);
    };

    const totals = items.reduce((acc, item) => {
        const base = item.unit_price * item.quantity;
        const afterDiscount = base - item.discount;
        const tax = afterDiscount * (item.tax_rate / 100);
        return {
            subtotal: acc.subtotal + base,
            discount: acc.discount + item.discount,
            tax: acc.tax + tax,
            net: acc.net + afterDiscount + tax
        };
    }, { subtotal: 0, discount: 0, tax: 0, net: 0 });

    return (
        <AppShell
            pageTitle="Generate New Bill"
            pageIcon={<Receipt className="h-5 w-5" />}
        >
            <div className="max-w-5xl mx-auto pb-12">
                <Link href="/reception/billing" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 font-medium mb-6 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Master Ledger
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Patient & Master Data */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* 1. Patient Selection */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">1. Select Patient</h2>
                            
                            {!selectedPatient ? (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Search by Name, Phone, or ID..."
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 font-medium outline-none transition-all placeholder:text-gray-400"
                                        />
                                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-teal-500 animate-spin" />}
                                    </div>

                                    {patients.length > 0 && (
                                        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-60 overflow-y-auto">
                                            {patients.map(p => (
                                                <div 
                                                    key={p.patient_id} 
                                                    onClick={() => setSelectedPatient(p)}
                                                    className="p-3 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors group"
                                                >
                                                    <div>
                                                        <p className="font-bold text-slate-900 group-hover:text-teal-600 transition-colors">{p.full_name}</p>
                                                        <p className="text-xs text-gray-500">{p.age} Y · {p.gender} · {p.phone}</p>
                                                    </div>
                                                    <span className="text-[10px] font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 font-bold">{p.patient_id}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center justify-between p-4 bg-teal-50 border border-teal-100 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                                            <CheckCircle className="h-6 w-6 text-teal-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-teal-900">{selectedPatient.full_name}</p>
                                            <p className="text-xs text-teal-700">{selectedPatient.patient_id} · {selectedPatient.phone}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => { setSelectedPatient(null); setSearchQuery(''); }}
                                        className="text-xs font-bold text-teal-600 hover:text-teal-800 underline"
                                    >Change Patient</button>
                                </div>
                            )}
                        </div>

                        {/* 2. Add Services from Master Data */}
                        <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 transition-opacity ${!selectedPatient ? 'opacity-50 pointer-events-none' : ''}`}>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">2. Add Services / Consultations</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Service (Master Data)</label>
                                    <select 
                                        value={selectedServiceId || ''} 
                                        onChange={e => setSelectedServiceId(Number(e.target.value))}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"
                                    >
                                        <option value="">-- Select Master Service --</option>
                                        {services.map(s => (
                                            <option key={s.id} value={s.id}>{s.service_name} (₹{Number(s.default_rate)})</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Qty</label>
                                    <input 
                                        type="number" min="1" 
                                        value={draftQty} onChange={e => setDraftQty(Number(e.target.value))}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Discount (₹)</label>
                                    <input 
                                        type="number" min="0" 
                                        value={draftDiscount} onChange={e => setDraftDiscount(Number(e.target.value))}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none"
                                    />
                                </div>

                                <div className="flex items-end">
                                    <button 
                                        onClick={handleAddService}
                                        disabled={!selectedServiceId}
                                        className="w-full p-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-slate-800 transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Plus className="h-4 w-4" /> Add
                                    </button>
                                </div>
                            </div>

                            {selectedServiceId && (
                                <div className="mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 font-medium">
                                    Base Rate: ₹{Number(services.find(s => s.id === selectedServiceId)?.default_rate).toFixed(2)} | 
                                    GST: {services.find(s => s.id === selectedServiceId)?.tax_rate}%
                                </div>
                            )}

                        </div>

                        {/* 3. Items List */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-slate-50">
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Bill Line Items</h3>
                            </div>
                            {items.length === 0 ? (
                                <div className="p-12 text-center text-gray-400 font-medium text-sm">
                                    No items added to the bill yet.
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3">Description</th>
                                            <th className="px-4 py-3 text-right">Qty</th>
                                            <th className="px-4 py-3 text-right">Rate</th>
                                            <th className="px-4 py-3 text-right">Disc</th>
                                            <th className="px-4 py-3 text-right">Net Amnt</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-slate-900">{item.description}</p>
                                                    <p className="text-[10px] text-gray-500">{item.department} {item.tax_rate > 0 && `· GST ${item.tax_rate}%`}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right font-medium">₹{item.unit_price.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right text-rose-500 font-medium">{item.discount > 0 ? `-₹${item.discount.toFixed(2)}` : '—'}</td>
                                                <td className="px-4 py-3 text-right font-black text-slate-900">₹{item.net_total.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => handleRemoveItem(idx)} className="text-rose-400 hover:text-rose-600 font-black text-lg leading-none">&times;</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                    </div>

                    {/* Right Column: Totals & Action */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-slate-900 text-white rounded-2xl shadow-xl overflow-hidden sticky top-6">
                            <div className="p-6 bg-slate-800/50 border-b border-slate-700/50">
                                <h3 className="text-sm font-black uppercase tracking-widest text-teal-400">Bill Summary</h3>
                            </div>
                            
                            <div className="p-6 space-y-4 font-mono text-sm">
                                <div className="flex justify-between text-slate-300">
                                    <span>Subtotal</span>
                                    <span>₹{totals.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-rose-400">
                                    <span>Discount</span>
                                    <span>-₹{totals.discount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-slate-300">
                                    <span>Estimated GST</span>
                                    <span>+₹{totals.tax.toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-slate-700 my-4" />
                                <div className="flex justify-between items-center">
                                    <span className="font-sans font-black uppercase tracking-wider text-slate-400 text-xs">Total Payable</span>
                                    <span className="text-3xl font-black text-white">₹{totals.net.toFixed(2)}</span>
                                </div>
                            </div>
                            
                            <div className="p-6 pt-0">
                                <button 
                                    onClick={handleGenerateBill}
                                    disabled={!selectedPatient || items.length === 0 || isSaving}
                                    className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-900 font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSaving && <Loader2 className="h-5 w-5 animate-spin" />}
                                    Generate & View Bill
                                </button>
                                <p className="text-center text-[10px] text-slate-500 font-medium mt-3">Bill will be saved in Draft status. You can edit or collect payment on the next screen.</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </AppShell>
    );
}
