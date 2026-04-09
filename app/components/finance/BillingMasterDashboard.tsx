'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getMasterBillingData } from '@/app/actions/finance-master-actions';
import {
    Search, Filter, Loader2, ChevronDown, ChevronUp, Clock, FileText,
    CreditCard, DollarSign, Activity, Settings, Zap, History, X, Check, Eye
} from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { processPatientPayment, addPatientDues } from '@/app/actions/reception-actions';
import { reversePayment, cancelInvoice } from '@/app/actions/finance-actions';

interface BillingMasterProps {
    role: 'admin' | 'reception' | 'opd';
}

export function BillingMasterDashboard({ role }: BillingMasterProps) {
    const [data, setData] = useState<any[]>([]);
    const [meta, setMeta] = useState<any>({ page: 1, limit: 15, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'SETTLED'>('ACTIVE');
    const [page, setPage] = useState(1);

    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Modals
    const [paymentModal, setPaymentModal] = useState<any>(null); // { invoice_id, patient_id, max_amount }
    const [duesModal, setDuesModal] = useState<string | null>(null); // patient_id
    const [processLoading, setProcessLoading] = useState(false);

    const [dueForm, setDueForm] = useState({ amount: '', description: '', department: 'General' });
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash' });

    const toast = useToast();

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getMasterBillingData({ page, limit: 15, search, filter });
        if (res.success) {
            setData(res.data);
            setMeta(res.meta);
        }
        setLoading(false);
    }, [page, search, filter]);

    useEffect(() => {
        const t = setTimeout(() => { loadData(); }, 300);
        return () => clearTimeout(t);
    }, [loadData]);

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentModal) return;
        setProcessLoading(true);
        const res = await processPatientPayment({
            patient_id: paymentModal.patient_id,
            invoice_id: paymentModal.invoice_id,
            amount: Number(paymentForm.amount),
            payment_method: paymentForm.method
        });
        setProcessLoading(false);
        if (res.success) {
            toast.success('Payment Recorded Successfully');
            setPaymentModal(null);
            setPaymentForm({ amount: '', method: 'Cash' });
            loadData();
        } else {
            toast.error('Payment Failed: ' + (res.error || ''));
        }
    };

    const handleAddDues = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!duesModal) return;
        setProcessLoading(true);
        const res = await addPatientDues({
            patient_id: duesModal,
            department: dueForm.department,
            description: dueForm.description,
            amount: Number(dueForm.amount)
        });
        setProcessLoading(false);
        if (res.success) {
            toast.success('Dues Applied Successfully');
            setDuesModal(null);
            setDueForm({ amount: '', description: '', department: 'General' });
            loadData();
        } else {
            toast.error('Failed to add dues: ' + (res.error || ''));
        }
    };

    const handleReversePayment = async (paymentId: number) => {
        if (!confirm('Are you sure you want to reverse this payment? This action is heavily audited.')) return;
        setProcessLoading(true);
        const res = await reversePayment(paymentId, 'Reversed by Admin');
        if (res.success) {
            toast.success('Payment Reversed');
            loadData();
        } else {
            toast.error('Failed to reverse');
        }
        setProcessLoading(false);
    };

    const handleVoidInvoice = async (invoiceId: number) => {
        if (!confirm('Are you sure you want to void this bill?')) return;
        setProcessLoading(true);
        const res = await cancelInvoice(invoiceId, 'Voided by Admin');
        if (res.success) {
            toast.success('Bill Voided');
            loadData();
        } else {
            toast.error('Failed to void bill');
        }
        setProcessLoading(false);
    };

    const formatDate = (d: any) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Grouping helper for the expanded view
    const groupItemsByCategory = (invoices: any[]) => {
        const groups: Record<string, any[]> = {};
        invoices.forEach(inv => {
            if (inv.status === 'Cancelled') return;
            inv.items?.forEach((item: any) => {
                const cat = item.department || inv.invoice_type || 'Others';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push({ ...item, date: inv.created_at, invoice_number: inv.invoice_number, inv_status: inv.status });
            });
        });
        return groups;
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 p-4 md:p-8">
            {/* Header & Controls */}
            <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Master Billing Ledger</h1>
                    <p className="text-sm text-gray-500 font-medium">Global patient financials and collection timeline</p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search Patient Name or ID..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium"
                        />
                    </div>
                    <select
                        value={filter}
                        onChange={e => { setFilter(e.target.value as any); setPage(1); }}
                        className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-teal-500"
                    >
                        <option value="ALL">All Accounts</option>
                        <option value="ACTIVE">Active Balance Due</option>
                        <option value="SETTLED">Settled Accounts</option>
                    </select>
                </div>
            </div>

            {/* Master Table */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Patient Name</th>
                                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Demographics</th>
                                <th className="px-6 py-4 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Registered</th>
                                <th className="px-6 py-4 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">Total Billed</th>
                                <th className="px-6 py-4 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">Balance Due</th>
                                <th className="px-6 py-4 text-center text-[11px] font-black text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-center text-[11px] font-black text-gray-500 uppercase tracking-wider">Ledger</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-20 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-teal-500 mx-auto" />
                                        <p className="text-sm text-gray-400 mt-2 font-medium">Scanning Master Data...</p>
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-20 text-center text-gray-400 font-medium">
                                        No financial records found for these filters.
                                    </td>
                                </tr>
                            ) : (
                                data.map((patient) => {
                                    const isExpanded = expandedRow === patient.patient_id;
                                    const totalBilled = patient.total_balance + patient.total_paid;
                                    
                                    // Extract unique payments across all invoices
                                    const allPayments = patient.invoices?.flatMap((inv: any) => 
                                        inv.payments?.map((p: any) => ({ ...p, invoice_number: inv.invoice_number })) || []
                                    ).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];

                                    const groupedItems = groupItemsByCategory(patient.invoices || []);

                                    return (
                                        <React.Fragment key={patient.id}>
                                            <tr 
                                                className={`hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                                                onClick={() => setExpandedRow(isExpanded ? null : patient.patient_id)}
                                            >
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-900">{patient.full_name}</p>
                                                    <p className="text-xs font-mono text-teal-600 mt-0.5">{patient.patient_id}</p>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500">
                                                    {patient.age} Y · {patient.gender} · {patient.phone}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500">{formatDate(patient.created_at)}</td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-700">₹{Number(totalBilled).toFixed(2)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`font-black ${patient.total_balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        ₹{Number(patient.total_balance).toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex px-2.5 py-1 text-[10px] font-black rounded-full border ${patient.total_balance > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                        {patient.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
                                                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* EXPANDED ACCORDION VIEW */}
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={7} className="p-0 border-b-4 border-slate-200">
                                                        <div className="bg-white p-6 shadow-[inset_0px_10px_20px_-15px_rgba(0,0,0,0.1)]">
                                                            
                                                            <div className="flex items-center justify-between mb-6">
                                                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                                                    <FileText className="h-4 w-4 text-teal-500" /> Account Details: {patient.full_name}
                                                                </h3>
                                                                <div className="flex gap-2">
                                                                    <button onClick={() => setDuesModal(patient.patient_id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 shadow-sm">
                                                                        <Zap className="h-3.5 w-3.5" /> Post Misc Dues
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="grid lg:grid-cols-3 gap-8">
                                                                
                                                                {/* Left: Categorized Ledger */}
                                                                <div className="lg:col-span-2 space-y-4">
                                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                                                                        
                                                                        {Object.keys(groupedItems).length === 0 ? (
                                                                            <div className="p-8 text-center text-gray-400 text-sm">No items billed yet.</div>
                                                                        ) : (
                                                                            Object.keys(groupedItems).map((category, idx) => {
                                                                                const catTotal = groupedItems[category].reduce((sum: number, it: any) => sum + Number(it.unit_price * it.quantity), 0);
                                                                                return (
                                                                                    <div key={idx} className="border-b border-slate-200 last:border-b-0">
                                                                                        {/* Category Header */}
                                                                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100/50">
                                                                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{category} Services</span>
                                                                                            <span className="text-[11px] font-black text-slate-700">₹ {catTotal.toFixed(2)}</span>
                                                                                        </div>
                                                                                        {/* Items */}
                                                                                        <div className="divide-y divide-slate-100">
                                                                                            {groupedItems[category].map((item: any) => (
                                                                                                <div key={item.id} className="flex items-center justify-between px-4 py-2 hover:bg-white text-sm">
                                                                                                    <div className="flex-1">
                                                                                                        <p className="font-medium text-slate-800">{item.description}</p>
                                                                                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                                                                                            <span className="font-mono text-teal-600/70">{item.invoice_number}</span> • 
                                                                                                            <span>{formatDate(item.date)}</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div className="text-right flex items-center justify-end gap-6 w-1/3">
                                                                                                        <span className="text-xs text-gray-500">Qty: {item.quantity}</span>
                                                                                                        <span className="text-sm font-bold text-slate-900 w-20">₹{Number(item.unit_price * item.quantity).toFixed(2)}</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )
                                                                            })
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Right: Payment Timeline & Outstanding Invoices */}
                                                                <div className="space-y-6">
                                                                    
                                                                    {/* Actionable Invoices */}
                                                                    <div className="bg-white border border-rose-100 rounded-xl overflow-hidden shadow-sm">
                                                                        <div className="px-4 py-3 bg-rose-50/50 border-b border-rose-100 flex justify-between items-center">
                                                                            <h4 className="text-[11px] font-black text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                                                                                <DollarSign className="h-3.5 w-3.5" /> Due Bills
                                                                            </h4>
                                                                        </div>
                                                                        <div className="p-3 space-y-2">
                                                                            {patient.invoices?.filter((inv:any) => inv.balance_due > 0 && inv.status !== 'Cancelled').map((inv: any) => (
                                                                                <div key={inv.id} className="flex flex-col gap-2 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-teal-200 transition-colors">
                                                                                    <div className="flex justify-between items-start">
                                                                                        <div>
                                                                                            <p className="text-[10px] font-mono font-bold text-slate-500">{inv.invoice_number}</p>
                                                                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{inv.invoice_type}</span>
                                                                                        </div>
                                                                                        <div className="text-right">
                                                                                            <p className="text-sm font-black text-rose-600">₹{Number(inv.balance_due).toFixed(2)}</p>
                                                                                            <p className="text-[10px] text-gray-400">Total: ₹{Number(inv.net_amount).toFixed(2)}</p>
                                                                                        </div>
                                                                                    </div>
                                                                                    
                                                                                    <div className="flex gap-2 mt-1">
                                                                                        <button 
                                                                                            onClick={() => setPaymentModal({ invoice_id: inv.id, patient_id: patient.patient_id, max: inv.balance_due })}
                                                                                            className="flex-1 py-1.5 bg-teal-50 text-teal-700 text-xs font-bold rounded-md hover:bg-teal-100">
                                                                                            Accept Payment
                                                                                        </button>
                                                                                        {role === 'admin' && (
                                                                                            <button 
                                                                                                onClick={() => handleVoidInvoice(inv.id)}
                                                                                                className="px-2 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-md hover:bg-rose-100" title="Void Bill">
                                                                                                <X className="h-3.5 w-3.5" />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {patient.invoices?.filter((inv:any) => inv.balance_due > 0 && inv.status !== 'Cancelled').length === 0 && (
                                                                                <p className="text-xs text-gray-400 text-center py-2">No pending bills</p>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Payment Timeline */}
                                                                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                                                            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                                                <History className="h-3.5 w-3.5" /> Payment Timeline
                                                                            </h4>
                                                                        </div>
                                                                        <div className="p-4 pl-6 relative">
                                                                            {allPayments.length > 0 ? (
                                                                                <div className="space-y-4 relative border-l-2 border-slate-100 ml-2">
                                                                                    {allPayments.map((p: any) => (
                                                                                        <div key={p.id} className="relative pl-5">
                                                                                            <div className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ring-4 ring-white ${p.status === 'Completed' ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                                                                            <div>
                                                                                                <div className="flex items-center justify-between">
                                                                                                    <p className="text-sm font-bold text-slate-800">₹{Number(p.amount).toFixed(2)}</p>
                                                                                                    <span className="text-[10px] text-gray-400">{formatDate(p.created_at)}</span>
                                                                                                </div>
                                                                                                <p className="text-xs text-slate-500 mt-0.5">{p.payment_method} · {p.payment_type}</p>
                                                                                                
                                                                                                <div className="flex items-center justify-between mt-1">
                                                                                                    <span className="text-[10px] font-mono text-gray-400">Inv: {p.invoice_number}</span>
                                                                                                    {role === 'admin' && p.status === 'Completed' && (
                                                                                                        <button onClick={() => handleReversePayment(p.id)} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 underline">Reverse</button>
                                                                                                    )}
                                                                                                </div>
                                                                                                {p.status === 'Reversed' && <p className="text-[10px] text-rose-500 italic mt-1">REVERSED: {p.notes}</p>}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <p className="text-xs text-gray-400">No payment history</p>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {meta.totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-200">
                        <span className="text-xs font-bold text-gray-400">
                            Showing Page {meta.page} of {meta.totalPages} ({meta.total} Total Records)
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-slate-200">Previous</button>
                            <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-slate-200">Next</button>
                        </div>
                    </div>
                )}
            </div>

            {/* PAYMENT MODAL */}
            {paymentModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-teal-600" /> Collect Payment
                        </h3>
                        <form onSubmit={handlePayment} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount to Collect (₹)</label>
                                <input type="number" required min="1" max={paymentModal.max} step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 font-mono text-lg text-teal-700 font-bold" placeholder={`Max: ₹${Number(paymentModal.max).toFixed(2)}`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Payment Method</label>
                                <select value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 font-medium">
                                    <option>Cash</option>
                                    <option>Card</option>
                                    <option>UPI</option>
                                    <option>Bank Transfer</option>
                                </select>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setPaymentModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                                <button type="submit" disabled={processLoading} className="flex-1 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2">
                                    {processLoading && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ADD DUES MODAL */}
            {duesModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                            <Zap className="h-5 w-5 text-amber-500" /> Post Misc Dues
                        </h3>
                        <form onSubmit={handleAddDues} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount (₹)</label>
                                <input type="number" required min="1" step="0.01" value={dueForm.amount} onChange={e => setDueForm({...dueForm, amount: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 font-mono text-lg" placeholder="e.g. 500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description / Category</label>
                                <input type="text" required value={dueForm.description} onChange={e => setDueForm({...dueForm, description: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 font-medium" placeholder="e.g. Extra Consumables" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Internal Department Tag</label>
                                <select value={dueForm.department} onChange={e => setDueForm({...dueForm, department: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 font-medium text-sm">
                                    <option value="General">General</option>
                                    <option value="Diagnostics">Diagnostics</option>
                                    <option value="Pharmacy">Pharmacy</option>
                                    <option value="Medical Management">Medical Management</option>
                                    <option value="Others">Others</option>
                                </select>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setDuesModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                                <button type="submit" disabled={processLoading} className="flex-1 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                                    {processLoading && <Loader2 className="h-4 w-4 animate-spin" />} Post Due
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
