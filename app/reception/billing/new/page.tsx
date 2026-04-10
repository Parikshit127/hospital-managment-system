'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Search, Loader2, Plus, ArrowLeft, Receipt, CheckCircle } from 'lucide-react';
import { searchPatientsForBilling, createInvoice, addInvoiceItem } from '@/app/actions/finance-actions';
import { calculateBillSplit, createPaymentSplits, type BillSplit } from '@/app/actions/billing-engine';
import { getIpdServices } from '@/app/actions/ipd-master-actions';
import { useToast } from '@/app/components/ui/Toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const PT_BADGE: Record<string, string> = {
    cash: 'bg-teal-100 text-teal-700',
    corporate: 'bg-blue-100 text-blue-700',
    tpa_insurance: 'bg-amber-100 text-amber-700',
};
const PT_LABEL: Record<string, string> = {
    cash: 'Cash',
    corporate: 'Corporate',
    tpa_insurance: 'TPA / Insurance',
};

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
    // Phase 2 — bill split
    const [billSplit, setBillSplit] = useState<BillSplit | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [preAuthBlocked, setPreAuthBlocked] = useState(false);
    const [concessionAmount, setConcessionAmount] = useState(0);
    const [concessionReason, setConcessionReason] = useState('');

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

    // Recalculate bill split whenever patient or items change
    useEffect(() => {
        if (!selectedPatient || items.length === 0) {
            setBillSplit(null);
            setPreAuthBlocked(false);
            return;
        }
        setIsCalculating(true);
        calculateBillSplit(
            selectedPatient.patient_id,
            items.map(i => ({
                department: i.department,
                description: i.description,
                quantity: i.quantity,
                unit_price: i.unit_price,
                discount: i.discount,
                tax_rate: i.tax_rate,
            }))
        ).then(split => {
            setBillSplit(split);
            setPreAuthBlocked(split.warnings.some(w => w.startsWith('PRE_AUTH_REQUIRED')));
            setIsCalculating(false);
        });
    }, [selectedPatient, items]);

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
        if (preAuthBlocked) return toast.error('Pre-authorization required. Obtain TPA approval before billing.');

        setIsSaving(true);
        try {
            const patientType = selectedPatient.patient_type || 'cash';
            const activePolicy = selectedPatient.insurance_policies?.[0];
            const split = billSplit;

            // 1. Create Invoice with Phase 2 fields
            const invRes = await createInvoice({
                patient_id: selectedPatient.patient_id,
                invoice_type: 'OPD',
                notes: 'Generated from Reception Billing',
                billing_patient_type: patientType,
                corporate_id: patientType === 'corporate' ? selectedPatient.corporate_id : undefined,
                tpa_provider_id: patientType === 'tpa_insurance' ? activePolicy?.provider?.id : undefined,
                patient_payable: split?.patientPayable ?? totals.net,
                corporate_payable: split?.corporatePayable ?? 0,
                tpa_payable: split?.tpaPayable ?? 0,
                concession_amount: concessionAmount,
                concession_reason: concessionReason || undefined,
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

            // 3. Create payment splits
            const splitsToCreate = [];
            if ((split?.patientPayable ?? 0) > 0) {
                splitsToCreate.push({ payer_type: 'patient' as const, amount: split!.patientPayable, payment_method: 'Cash' });
            }
            if ((split?.corporatePayable ?? 0) > 0) {
                splitsToCreate.push({ payer_type: 'corporate' as const, payer_id: selectedPatient.corporate_id, amount: split!.corporatePayable });
            }
            if ((split?.tpaPayable ?? 0) > 0) {
                splitsToCreate.push({ payer_type: 'tpa_insurance' as const, payer_id: String(activePolicy?.provider?.id || ''), amount: split!.tpaPayable });
            }
            if (splitsToCreate.length > 0) {
                await createPaymentSplits(invoiceId, splitsToCreate);
            }

            toast.success('Bill generated successfully!');
            router.push(`/finance/invoices/${invoiceId}`);

        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'An error occurred');
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
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-4 bg-teal-50 border border-teal-100 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                                                <CheckCircle className="h-6 w-6 text-teal-600" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-teal-900">{selectedPatient.full_name}</p>
                                                    {selectedPatient.patient_type && (
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${PT_BADGE[selectedPatient.patient_type] || 'bg-gray-100 text-gray-600'}`}>
                                                            {PT_LABEL[selectedPatient.patient_type] || selectedPatient.patient_type}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-teal-700">{selectedPatient.patient_id} · {selectedPatient.phone}</p>
                                                {selectedPatient.patient_type === 'corporate' && selectedPatient.corporate && (
                                                    <p className="text-xs text-blue-600 font-bold mt-0.5">
                                                        {selectedPatient.corporate.company_name} · {Number(selectedPatient.corporate.discount_percentage)}% discount
                                                    </p>
                                                )}
                                                {selectedPatient.patient_type === 'tpa_insurance' && selectedPatient.insurance_policies?.[0] && (
                                                    <p className="text-xs text-amber-600 font-bold mt-0.5">
                                                        {selectedPatient.insurance_policies[0].provider?.provider_name} · Policy: {selectedPatient.insurance_policies[0].policy_number}
                                                        {selectedPatient.insurance_policies[0].provider?.pre_auth_required && (
                                                            <span className="ml-2 text-red-600">⚠ Pre-auth required</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedPatient(null); setSearchQuery(''); setBillSplit(null); setPreAuthBlocked(false); }}
                                            className="text-xs font-bold text-teal-600 hover:text-teal-800 underline"
                                        >Change Patient</button>
                                    </div>
                                    {/* Pre-auth blocking warning */}
                                    {preAuthBlocked && (
                                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                                            <span className="text-red-600 font-black text-lg leading-none">⚠</span>
                                            <div>
                                                <p className="text-sm font-bold text-red-700">Pre-Authorization Required</p>
                                                <p className="text-xs text-red-600 mt-0.5">Cannot generate bill without TPA approval. Obtain pre-authorization first.</p>
                                            </div>
                                        </div>
                                    )}
                                    {/* Non-blocking warnings */}
                                    {billSplit?.warnings.filter(w => !w.startsWith('PRE_AUTH_REQUIRED')).map((w, i) => (
                                        <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                            <span className="text-amber-600 font-black text-sm">⚠</span>
                                            <p className="text-xs text-amber-700 font-medium">{w}</p>
                                        </div>
                                    ))}
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
                                    <span>-₹{(isCalculating ? totals.discount : (billSplit?.totalDiscount ?? totals.discount)).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-slate-300">
                                    <span>Estimated GST</span>
                                    <span>+₹{totals.tax.toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-slate-700 my-4" />
                                <div className="flex justify-between items-center">
                                    <span className="font-sans font-black uppercase tracking-wider text-slate-400 text-xs">Total Payable</span>
                                    <span className="text-3xl font-black text-white">
                                        ₹{(isCalculating ? totals.net : (billSplit?.grandTotal ?? totals.net)).toFixed(2)}
                                    </span>
                                </div>

                                {/* Split breakdown for corporate/TPA */}
                                {billSplit && selectedPatient?.patient_type !== 'cash' && (
                                    <>
                                        <div className="h-px bg-slate-700 my-2" />
                                        <p className="font-sans text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment Split</p>
                                        {billSplit.patientPayable > 0 && (
                                            <div className="flex justify-between text-teal-400">
                                                <span className="font-sans text-xs">Patient (Co-Pay)</span>
                                                <span>₹{billSplit.patientPayable.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {billSplit.corporatePayable > 0 && (
                                            <div className="flex justify-between text-blue-400">
                                                <span className="font-sans text-xs">Corporate ({selectedPatient?.corporate?.company_name})</span>
                                                <span>₹{billSplit.corporatePayable.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {billSplit.tpaPayable > 0 && (
                                            <div className="flex justify-between text-amber-400">
                                                <span className="font-sans text-xs">TPA / Insurance</span>
                                                <span>₹{billSplit.tpaPayable.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Cash concession field */}
                                {selectedPatient?.patient_type === 'cash' && (
                                    <>
                                        <div className="h-px bg-slate-700 my-2" />
                                        <div className="space-y-2">
                                            <p className="font-sans text-[10px] font-black uppercase tracking-widest text-slate-400">Concession (Optional)</p>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={concessionAmount}
                                                onChange={e => setConcessionAmount(parseFloat(e.target.value) || 0)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
                                                placeholder="₹ Amount"
                                            />
                                            {concessionAmount > 0 && (
                                                <input
                                                    type="text"
                                                    value={concessionReason}
                                                    onChange={e => setConcessionReason(e.target.value)}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
                                                    placeholder="Reason for concession"
                                                />
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            <div className="p-6 pt-0">
                                <button 
                                    onClick={handleGenerateBill}
                                    disabled={!selectedPatient || items.length === 0 || isSaving || preAuthBlocked}
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
