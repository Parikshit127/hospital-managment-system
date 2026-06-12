'use client';

import React, { useState, useEffect } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    FileText, Plus, X, Loader2, CheckCircle, Eye, CreditCard,
    AlertTriangle, Search, Filter,
} from 'lucide-react';
import {
    getPurchaseInvoices, createPurchaseInvoice, matchPurchaseInvoice,
    postPurchaseInvoice, recordSupplierPayment, getSuppliers, searchMedicine,
    getPurchaseOrders,
} from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';

const STATUS_COLORS: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    PendingApproval: 'bg-amber-100 text-amber-700',
    Posted: 'bg-blue-100 text-blue-700',
    PartiallyPaid: 'bg-orange-100 text-orange-700',
    Paid: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-red-100 text-red-700',
};

const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function PurchaseInvoicesPage() {
    const toast = useToast();
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [showDetail, setShowDetail] = useState<any>(null);
    const [showPayModal, setShowPayModal] = useState<any>(null);

    // Create form
    const [vendors, setVendors] = useState<any[]>([]);
    const [pos, setPos] = useState<any[]>([]);
    const [form, setForm] = useState({ vendor_id: '', po_id: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', vendor_gstin: '' });
    const [lines, setLines] = useState<any[]>([{ medicine_id: '', medicine_name: '', quantity: 1, unit_price: 0, gst_rate: 12, hsn_code: '3004' }]);
    const [medSearch, setMedSearch] = useState('');
    const [medResults, setMedResults] = useState<any[]>([]);
    const [activeLineIdx, setActiveLineIdx] = useState(-1);
    const [saving, setSaving] = useState(false);

    // Pay form
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState('Bank');
    const [payRef, setPayRef] = useState('');
    const [paying, setPaying] = useState(false);

    // Match result
    const [matchResult, setMatchResult] = useState<any>(null);

    const load = async () => {
        setLoading(true);
        const res = await getPurchaseInvoices(statusFilter ? { status: statusFilter } : undefined);
        if (res.success) setInvoices(res.data || []);
        setLoading(false);
    };

    useEffect(() => { load(); }, [statusFilter]);

    const openCreate = async () => {
        const [v, p] = await Promise.all([getSuppliers(), getPurchaseOrders()]);
        if (v.success) setVendors(v.data || []);
        if (p.success) setPos((p.data || []).filter((po: any) => ['Received', 'Partially Received'].includes(po.status)));
        setForm({ vendor_id: '', po_id: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', vendor_gstin: '' });
        setLines([{ medicine_id: '', medicine_name: '', quantity: 1, unit_price: 0, gst_rate: 12, hsn_code: '3004' }]);
        setShowCreate(true);
    };

    const handleMedSearch = async (q: string, idx: number) => {
        setMedSearch(q);
        setActiveLineIdx(idx);
        if (q.length >= 2) {
            const res = await searchMedicine(q);
            if (res.success) setMedResults(res.data || []);
        } else {
            setMedResults([]);
        }
    };

    const selectMedicine = (med: any, idx: number) => {
        const updated = [...lines];
        updated[idx] = { ...updated[idx], medicine_id: med.id, medicine_name: med.brand_name, unit_price: med.purchase_price || 0, gst_rate: med.gst_percent || 12, hsn_code: med.hsn_sac_code || '3004' };
        setLines(updated);
        setMedResults([]);
        setMedSearch('');
        setActiveLineIdx(-1);
    };

    const addLine = () => setLines([...lines, { medicine_id: '', medicine_name: '', quantity: 1, unit_price: 0, gst_rate: 12, hsn_code: '3004' }]);
    const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

    const handleCreate = async () => {
        if (!form.vendor_id || !form.invoice_number || lines.some(l => !l.medicine_id)) {
            toast.error('Fill vendor, invoice number, and all medicine lines');
            return;
        }
        setSaving(true);
        const res = await createPurchaseInvoice({
            vendor_id: parseInt(form.vendor_id),
            po_id: form.po_id ? parseInt(form.po_id) : undefined,
            invoice_number: form.invoice_number,
            invoice_date: form.invoice_date,
            due_date: form.due_date || undefined,
            vendor_gstin: form.vendor_gstin || undefined,
            lines: lines.map(l => ({
                medicine_id: parseInt(l.medicine_id),
                quantity: parseInt(l.quantity),
                unit_price: parseFloat(l.unit_price),
                gst_rate: parseFloat(l.gst_rate),
                hsn_code: l.hsn_code,
            })),
        });
        setSaving(false);
        if (res.success) {
            toast.success('Purchase invoice created');
            setShowCreate(false);
            load();
        } else {
            toast.error(res.error || 'Failed');
        }
    };

    const handleMatch = async (inv: any) => {
        const res = await matchPurchaseInvoice(inv.id);
        if (res.success) setMatchResult(res.data);
        else toast.error(res.error || 'Matching failed');
    };

    const handlePost = async (inv: any) => {
        const res = await postPurchaseInvoice(inv.id);
        if (res.success) { toast.success('Invoice posted to GL & GST'); load(); }
        else toast.error(res.error || 'Failed to post');
    };

    const handlePay = async () => {
        if (!showPayModal || !payAmount) return;
        setPaying(true);
        const res = await recordSupplierPayment({
            invoice_id: showPayModal.id,
            amount: parseFloat(payAmount),
            payment_method: payMethod,
            payment_reference: payRef || undefined,
        });
        setPaying(false);
        if (res.success) { toast.success(res.fully_paid ? 'Fully paid' : 'Partial payment recorded'); setShowPayModal(null); load(); }
        else toast.error(res.error || 'Failed');
    };

    const lineTotal = (l: any) => {
        const taxable = (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0);
        return taxable + taxable * (parseFloat(l.gst_rate) || 0) / 100;
    };
    const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

    return (
        <AppShell pageTitle="Purchase Invoices" pageIcon={<FileText className="h-5 w-5" />} onRefresh={load} refreshing={loading}
            headerActions={<button onClick={openCreate} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-2 px-4 rounded-xl text-sm"><Plus className="h-4 w-4" /> New Invoice</button>}>

            {/* Filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {['', 'Draft', 'Posted', 'PartiallyPaid', 'Paid'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${statusFilter === s ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {s || 'All'}
                    </button>
                ))}
            </div>

            {/* Invoice List */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
            ) : invoices.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <h3 className="font-bold text-gray-900 mb-1">No Purchase Invoices</h3>
                    <p className="text-sm">Create your first supplier invoice to start tracking payables.</p>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Invoice #</th>
                                <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Vendor</th>
                                <th className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase">PO</th>
                                <th className="text-right px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Amount</th>
                                <th className="text-right px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Paid</th>
                                <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Status</th>
                                <th className="text-center px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Date</th>
                                <th className="text-right px-4 py-3 text-[10px] font-black text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-bold text-gray-900">{inv.invoice_number}</td>
                                    <td className="px-4 py-3 text-gray-600">{inv.vendor?.vendor_name}</td>
                                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{inv.po?.po_number || '—'}</td>
                                    <td className="px-4 py-3 text-right font-bold">{fmt(inv.total_amount)}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{fmt(inv.amount_paid)}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'}`}>{inv.status}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{new Date(inv.invoice_date).toLocaleDateString('en-GB')}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex gap-1.5 justify-end">
                                            <button onClick={() => setShowDetail(inv)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="View Details"><Eye className="h-3.5 w-3.5 text-gray-500" /></button>
                                            {inv.status === 'Draft' && inv.po_id && (
                                                <button onClick={() => handleMatch(inv)} className="p-1.5 hover:bg-amber-50 rounded-lg" title="3-Way Match"><Search className="h-3.5 w-3.5 text-amber-500" /></button>
                                            )}
                                            {['Draft', 'PendingApproval'].includes(inv.status) && (
                                                <button onClick={() => handlePost(inv)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="Post to GL"><CheckCircle className="h-3.5 w-3.5 text-blue-500" /></button>
                                            )}
                                            {['Posted', 'PartiallyPaid'].includes(inv.status) && (
                                                <button onClick={() => { setShowPayModal(inv); setPayAmount(String(Number(inv.total_amount) - Number(inv.amount_paid))); }} className="p-1.5 hover:bg-emerald-50 rounded-lg" title="Record Payment"><CreditCard className="h-3.5 w-3.5 text-emerald-500" /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Match Result Modal */}
            {matchResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-black text-gray-900">3-Way Matching Result</h3>
                            <button onClick={() => setMatchResult(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className={`p-3 rounded-xl text-sm font-bold ${matchResult.all_within_tolerance ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {matchResult.all_within_tolerance
                                    ? `All variances within ${matchResult.tolerance_pct}% tolerance — ready to post`
                                    : `Variances exceed ${matchResult.tolerance_pct}% tolerance — review required`}
                            </div>
                            {matchResult.variances.map((v: any, i: number) => (
                                <div key={i} className="border border-gray-200 rounded-xl p-3 text-xs space-y-1">
                                    <div className="flex justify-between"><span className="text-gray-500">Qty: Invoice</span><span className="font-bold">{v.invoice_qty}</span></div>
                                    {v.po_qty && <div className="flex justify-between"><span className="text-gray-500">Qty: PO</span><span>{v.po_qty}</span></div>}
                                    {v.grn_qty && <div className="flex justify-between"><span className="text-gray-500">Qty: GRN Received</span><span>{v.grn_qty}</span></div>}
                                    {v.qty_variance !== undefined && <div className="flex justify-between"><span className="text-gray-500">Qty Variance</span><span className={v.qty_variance_pct > matchResult.tolerance_pct ? 'text-red-600 font-bold' : ''}>{v.qty_variance} ({v.qty_variance_pct?.toFixed(1)}%)</span></div>}
                                    {v.rate_variance !== undefined && <div className="flex justify-between"><span className="text-gray-500">Rate Variance</span><span className={v.rate_variance_pct > matchResult.tolerance_pct ? 'text-red-600 font-bold' : ''}>{fmt(v.rate_variance)} ({v.rate_variance_pct?.toFixed(1)}%)</span></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {showDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="font-black text-gray-900">Invoice: {showDetail.invoice_number}</h3>
                            <button onClick={() => setShowDetail(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-gray-500">Vendor:</span> <span className="font-bold">{showDetail.vendor?.vendor_name}</span></div>
                                <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${STATUS_COLORS[showDetail.status]}`}>{showDetail.status}</span></div>
                                <div><span className="text-gray-500">Date:</span> {new Date(showDetail.invoice_date).toLocaleDateString('en-GB')}</div>
                                <div><span className="text-gray-500">Due:</span> {showDetail.due_date ? new Date(showDetail.due_date).toLocaleDateString('en-GB') : '—'}</div>
                                <div><span className="text-gray-500">Subtotal:</span> {fmt(showDetail.subtotal)}</div>
                                <div><span className="text-gray-500">GST:</span> CGST {fmt(showDetail.cgst_amount)} + SGST {fmt(showDetail.sgst_amount)}</div>
                                <div><span className="text-gray-500">Total:</span> <span className="font-black text-lg">{fmt(showDetail.total_amount)}</span></div>
                                <div><span className="text-gray-500">Paid:</span> <span className="font-bold text-emerald-600">{fmt(showDetail.amount_paid)}</span></div>
                            </div>
                            <h4 className="text-xs font-black text-gray-400 uppercase mt-4">Line Items</h4>
                            <table className="w-full text-xs">
                                <thead><tr className="border-b"><th className="text-left py-2">Medicine</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Rate</th><th className="text-right py-2">GST%</th><th className="text-right py-2">Total</th></tr></thead>
                                <tbody>
                                    {showDetail.line_items?.map((li: any) => (
                                        <tr key={li.id} className="border-b border-gray-50">
                                            <td className="py-2 font-medium">{li.medicine?.brand_name}</td>
                                            <td className="py-2 text-right">{li.quantity}</td>
                                            <td className="py-2 text-right">{fmt(li.unit_price)}</td>
                                            <td className="py-2 text-right">{li.gst_rate}%</td>
                                            <td className="py-2 text-right font-bold">{fmt(li.line_total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Pay Modal */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-black text-gray-900">Record Payment</h3>
                            <button onClick={() => setShowPayModal(null)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">Invoice: <span className="font-bold">{showPayModal.invoice_number}</span> | Balance: <span className="font-bold text-red-600">{fmt(Number(showPayModal.total_amount) - Number(showPayModal.amount_paid))}</span></p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase">Amount</label>
                                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm font-bold" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase">Method</label>
                                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm">
                                    <option value="Bank">Bank Transfer</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="UPI">UPI</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase">Reference</label>
                                <input value={payRef} onChange={e => setPayRef(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm" placeholder="UTR / Cheque No." />
                            </div>
                        </div>
                        <div className="p-5 bg-gray-50 border-t flex justify-end gap-3">
                            <button onClick={() => setShowPayModal(null)} className="px-5 py-2.5 text-gray-500 font-bold">Cancel</button>
                            <button onClick={handlePay} disabled={paying} className="px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-70">
                                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
                    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="font-black text-gray-900">Create Purchase Invoice</h3>
                            <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Vendor *</label>
                                    <select value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })} className="w-full p-3 border border-gray-300 rounded-xl text-sm">
                                        <option value="">Select vendor</option>
                                        {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Linked PO (optional)</label>
                                    <select value={form.po_id} onChange={e => setForm({ ...form, po_id: e.target.value })} className="w-full p-3 border border-gray-300 rounded-xl text-sm">
                                        <option value="">No PO link</option>
                                        {pos.map((p: any) => <option key={p.id} value={p.id}>{p.po_number} — {p.vendor?.vendor_name || p.supplier?.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Invoice Number *</label>
                                    <input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} className="w-full p-3 border border-gray-300 rounded-xl text-sm font-bold" placeholder="SUPINV-001" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Vendor GSTIN</label>
                                    <input value={form.vendor_gstin} onChange={e => setForm({ ...form, vendor_gstin: e.target.value.toUpperCase() })} maxLength={15} className="w-full p-3 border border-gray-300 rounded-xl text-sm font-mono" placeholder="27AABCU9603R1ZM" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Invoice Date</label>
                                    <DateField value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} className="w-full p-3 border border-gray-300 rounded-xl text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Due Date</label>
                                    <DateField value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full p-3 border border-gray-300 rounded-xl text-sm" />
                                </div>
                            </div>

                            {/* Line Items */}
                            <h4 className="text-xs font-black text-gray-400 uppercase pt-2">Line Items</h4>
                            <div className="space-y-3">
                                {lines.map((line, idx) => (
                                    <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1 relative">
                                                <label className="text-[10px] font-black text-gray-400 uppercase">Medicine</label>
                                                {line.medicine_name ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-gray-900">{line.medicine_name}</span>
                                                        <button onClick={() => { const u = [...lines]; u[idx] = { ...u[idx], medicine_id: '', medicine_name: '' }; setLines(u); }} className="text-red-400 text-xs">change</button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <input value={activeLineIdx === idx ? medSearch : ''} onChange={e => handleMedSearch(e.target.value, idx)} className="w-full p-2 border border-gray-300 rounded-lg text-sm" placeholder="Search medicine..." />
                                                        {activeLineIdx === idx && medResults.length > 0 && (
                                                            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                                {medResults.map((m: any) => (
                                                                    <button key={m.id} onClick={() => selectMedicine(m, idx)} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50">
                                                                        <span className="font-bold">{m.brand_name}</span> <span className="text-gray-400 text-xs">{m.generic_name}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            {lines.length > 1 && <button onClick={() => removeLine(idx)} className="text-red-400 p-1"><X className="h-4 w-4" /></button>}
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-gray-400 uppercase">Qty</label>
                                                <input type="number" value={line.quantity} onChange={e => { const u = [...lines]; u[idx].quantity = e.target.value; setLines(u); }} className="w-full p-2 border border-gray-300 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-gray-400 uppercase">Unit Price</label>
                                                <input type="number" value={line.unit_price} onChange={e => { const u = [...lines]; u[idx].unit_price = e.target.value; setLines(u); }} className="w-full p-2 border border-gray-300 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-gray-400 uppercase">GST %</label>
                                                <input type="number" value={line.gst_rate} onChange={e => { const u = [...lines]; u[idx].gst_rate = e.target.value; setLines(u); }} className="w-full p-2 border border-gray-300 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-gray-400 uppercase">Line Total</label>
                                                <div className="p-2 bg-gray-50 rounded-lg text-sm font-bold text-right">{fmt(lineTotal(line))}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={addLine} className="text-blue-500 text-xs font-bold flex items-center gap-1"><Plus className="h-3 w-3" /> Add Line</button>
                            </div>

                            <div className="flex justify-end pt-2">
                                <div className="bg-gray-50 rounded-xl px-5 py-3 text-right">
                                    <span className="text-xs text-gray-500">Grand Total: </span>
                                    <span className="text-xl font-black text-gray-900">{fmt(grandTotal)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-5 bg-gray-50 border-t flex justify-end gap-3 sticky bottom-0">
                            <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-gray-500 font-bold">Cancel</button>
                            <button onClick={handleCreate} disabled={saving} className="px-6 py-2.5 bg-blue-500 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-70">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Create Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
