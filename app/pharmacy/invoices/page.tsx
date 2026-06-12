'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DateField } from '@/app/components/ui/DateField';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Search, Eye, CreditCard, X, Pencil, Plus, Trash2, IndianRupee, Receipt, TrendingDown, ShoppingBag } from 'lucide-react';
import { getInvoices, addInvoiceItem, recordPayment } from '@/app/actions/finance-actions';
import { getInventory } from '@/app/actions/pharmacy-actions';
import Link from 'next/link';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const STATUS_COLOR: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    Final: 'bg-blue-100 text-blue-700',
    Paid: 'bg-emerald-100 text-emerald-700',
    Partial: 'bg-amber-100 text-amber-700',
    Cancelled: 'bg-red-100 text-red-700',
};

type DatePreset = 'today' | 'week' | 'month' | 'custom';
type CategoryFilter = 'all' | 'counter' | 'ipd-admitted' | 'ipd-discharged';

type MedRow = { medicine_id: number; name: string; qty: number; unit_price: number; tax_rate: number; hsn: string; batch_no: string };

function getPresetRange(preset: DatePreset): { from: Date; to: Date } | null {
    const now = new Date();
    if (preset === 'today') {
        const from = new Date(now); from.setHours(0, 0, 0, 0);
        const to = new Date(now); to.setHours(23, 59, 59, 999);
        return { from, to };
    }
    if (preset === 'week') {
        const from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0);
        const to = new Date(now); to.setHours(23, 59, 59, 999);
        return { from, to };
    }
    if (preset === 'month') {
        const from = new Date(now); from.setDate(1); from.setHours(0, 0, 0, 0);
        const to = new Date(now); to.setHours(23, 59, 59, 999);
        return { from, to };
    }
    return null;
}

function fmtDateTime(d: string | Date) {
    return new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export default function PharmacyInvoicesPage() {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('month');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

    // Payment modal
    const [payModal, setPayModal] = useState(false);
    const [payInvoice, setPayInvoice] = useState<any>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState('Cash');
    const [payRef, setPayRef] = useState('');
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState('');

    // Edit medicines modal (IPD only)
    const [editModal, setEditModal] = useState(false);
    const [editInvoice, setEditInvoice] = useState<any>(null);
    const [inventory, setInventory] = useState<any[]>([]);
    const [medSearch, setMedSearch] = useState('');
    const [editRows, setEditRows] = useState<MedRow[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const load = async () => {
        setLoading(true);
        const opts: any = { invoice_type: 'PHARMACY', limit: 1000 };
        if (statusFilter) opts.status = statusFilter;

        // For custom range pass dates to server; presets filter client-side from a larger set
        if (datePreset === 'custom' && customFrom && customTo) {
            opts.date_from = new Date(customFrom + 'T00:00:00');
            opts.date_to = new Date(customTo + 'T23:59:59');
        }

        const res = await getInvoices(opts);
        if (res.success && res.data) setInvoices(res.data);
        setLoading(false);
    };

    useEffect(() => { load(); }, [statusFilter, datePreset, customFrom, customTo]);

    // Client-side filtering
    const filtered = useMemo(() => {
        const presetRange = datePreset !== 'custom' ? getPresetRange(datePreset) : null;

        return invoices.filter(inv => {
            // Text search
            if (search) {
                const q = search.toLowerCase();
                const hit = inv.invoice_number?.toLowerCase().includes(q) ||
                    inv.patient?.full_name?.toLowerCase().includes(q) ||
                    inv.patient?.phone?.includes(search) ||
                    inv.patient_id?.toLowerCase().includes(q);
                if (!hit) return false;
            }

            // Date preset (client-side for today/week/month)
            if (presetRange) {
                const d = new Date(inv.created_at);
                if (d < presetRange.from || d > presetRange.to) return false;
            }

            // Category
            if (categoryFilter !== 'all') {
                const isIpd = inv.source === 'IPD-PHARMACY';
                const isAdmitted = inv.admission_status === 'Admitted';
                if (categoryFilter === 'counter' && isIpd) return false;
                if (categoryFilter === 'ipd-admitted' && (!isIpd || !isAdmitted)) return false;
                if (categoryFilter === 'ipd-discharged' && (!isIpd || isAdmitted)) return false;
            }

            return true;
        });
    }, [invoices, search, datePreset, categoryFilter]);

    // KPI summary
    const summary = useMemo(() => {
        const totalBills = filtered.length;
        const grossAmount = filtered.reduce((s, inv) => s + Number(inv.net_amount || 0), 0);
        const balanceDue = filtered.reduce((s, inv) => s + Number(inv.balance_due || 0), 0);
        const receipts = grossAmount - balanceDue;
        return { totalBills, grossAmount, receipts, balanceDue };
    }, [filtered]);

    // ── Payment modal ─────────────────────────────────────────────────────
    const openPayModal = (inv: any) => {
        setPayInvoice(inv);
        setPayAmount(String(Number(inv.balance_due || 0)));
        setPayMethod('Cash'); setPayRef(''); setPayError('');
        setPayModal(true);
    };

    const handleCollectPayment = async () => {
        if (!payInvoice) return;
        const amt = parseFloat(payAmount);
        if (!amt || amt <= 0) { setPayError('Enter a valid amount'); return; }
        if (amt > Number(payInvoice.balance_due)) { setPayError('Amount exceeds balance due'); return; }
        setPaying(true); setPayError('');
        try {
            const res = await recordPayment({
                invoice_id: payInvoice.id,
                amount: amt,
                payment_method: payMethod,
                notes: payRef || undefined,
                payment_type: amt >= Number(payInvoice.balance_due) ? 'Full' : 'Partial',
            });
            if (res.success) { setPayModal(false); await load(); }
            else setPayError(res.error || 'Payment failed');
        } catch (e: any) { setPayError(e.message || 'Payment failed'); }
        setPaying(false);
    };

    // ── Edit medicines modal (IPD only) ───────────────────────────────────
    const openEditModal = useCallback(async (inv: any) => {
        setEditInvoice(inv);
        setEditRows([]);
        setMedSearch('');
        setSaveError('');
        setEditModal(true);
        const res = await getInventory();
        if (res.success) setInventory(res.data || []);
    }, []);

    const filteredMeds = inventory.filter(m =>
        !medSearch ||
        m.medicine?.brand_name?.toLowerCase().includes(medSearch.toLowerCase()) ||
        m.medicine?.generic_name?.toLowerCase().includes(medSearch.toLowerCase())
    );

    const addMedRow = (med: any) => {
        const existing = editRows.find(r => r.medicine_id === med.medicine_id);
        if (existing) {
            setEditRows(rows => rows.map(r => r.medicine_id === med.medicine_id ? { ...r, qty: r.qty + 1 } : r));
        } else {
            setEditRows(rows => [...rows, {
                medicine_id: med.medicine_id,
                name: med.medicine?.brand_name || '',
                qty: 1,
                unit_price: Number(med.medicine?.selling_price || med.medicine?.price_per_unit || 0),
                tax_rate: Number(med.medicine?.gst_percent || med.medicine?.tax_rate || 0),
                hsn: med.medicine?.hsn_sac_code || '3004',
                batch_no: med.batch_no || 'N/A',
            }]);
        }
        setMedSearch('');
    };

    const handleSaveMedicines = async () => {
        if (!editInvoice || editRows.length === 0) { setSaveError('Add at least one medicine'); return; }
        setSaving(true); setSaveError('');
        try {
            for (const row of editRows) {
                const res = await addInvoiceItem({
                    invoice_id: editInvoice.id,
                    department: 'Pharmacy',
                    description: `Pharmacy: ${row.name} (Batch ${row.batch_no}) × ${row.qty}`,
                    quantity: row.qty,
                    unit_price: row.unit_price,
                    tax_rate: row.tax_rate,
                    hsn_sac_code: row.hsn,
                    service_category: 'Pharmacy',
                });
                if (!res.success) { setSaveError(res.error || 'Failed to add item'); setSaving(false); return; }
            }
            setEditModal(false);
            await load();
        } catch (e: any) { setSaveError(e.message || 'Failed'); }
        setSaving(false);
    };

    const PRESETS: { key: DatePreset; label: string }[] = [
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'custom', label: 'Custom' },
    ];

    return (
        <AppShell
            pageTitle="Pharmacy Sales"
            pageIcon={<FileText className="h-5 w-5" />}
            onRefresh={load}
            refreshing={loading}
        >
            <div className="space-y-4">

                {/* ── KPI Summary Bar ──────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div className="p-2 bg-orange-50 rounded-lg"><ShoppingBag className="h-4 w-4 text-orange-500" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Total Bills</p>
                            <p className="text-lg font-bold text-gray-900">{summary.totalBills}</p>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div className="p-2 bg-blue-50 rounded-lg"><IndianRupee className="h-4 w-4 text-blue-500" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Gross Amount</p>
                            <p className="text-lg font-bold text-gray-900">{fmt(summary.grossAmount)}</p>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div className="p-2 bg-emerald-50 rounded-lg"><Receipt className="h-4 w-4 text-emerald-500" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Receipts</p>
                            <p className="text-lg font-bold text-emerald-700">{fmt(summary.receipts)}</p>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div className="p-2 bg-rose-50 rounded-lg"><TrendingDown className="h-4 w-4 text-rose-500" /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Balance Due</p>
                            <p className="text-lg font-bold text-rose-600">{fmt(summary.balanceDue)}</p>
                        </div>
                    </div>
                </div>

                {/* ── Filters ──────────────────────────────────────────────── */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                    {/* Row 1: date presets + category + status */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Date preset pills */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                            {PRESETS.map(p => (
                                <button key={p.key} onClick={() => setDatePreset(p.key)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${datePreset === p.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom date pickers */}
                        {datePreset === 'custom' && (
                            <div className="flex items-center gap-2">
                                <DateField value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none" />
                                <span className="text-xs text-gray-400">to</span>
                                <DateField value={customTo} onChange={e => setCustomTo(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                        )}

                        <div className="flex-1" />

                        {/* Category filter */}
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-orange-500 outline-none">
                            <option value="all">All Categories</option>
                            <option value="counter">Counter (OPD)</option>
                            <option value="ipd-admitted">IPD · Admitted</option>
                            <option value="ipd-discharged">IPD · Discharged</option>
                        </select>

                        {/* Status filter */}
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-orange-500 outline-none">
                            <option value="">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Final">Final</option>
                            <option value="Paid">Paid</option>
                            <option value="Partial">Partial</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>

                    {/* Row 2: search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search by invoice #, patient name, MRN, or phone..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none" />
                    </div>
                </div>

                {/* ── Table ────────────────────────────────────────────────── */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-10">SR</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Invoice #</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Patient / MRN</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Doctor</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Bill Amt</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Balance</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={10} className="px-5 py-16 text-center text-gray-400 text-sm">Loading...</td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={10} className="px-5 py-16 text-center text-gray-400 text-sm">No pharmacy invoices found</td></tr>
                                ) : filtered.map((inv: any, idx: number) => {
                                    const isIpd = inv.source === 'IPD-PHARMACY';
                                    const isAdmitted = inv.admission_status === 'Admitted';
                                    const isDischarged = !isAdmitted;
                                    const hasBalance = Number(inv.balance_due) > 0;
                                    const notCancelled = inv.status !== 'Cancelled';

                                    return (
                                        <tr key={`${inv.source}-${inv.id}`} className="hover:bg-orange-50/30 transition-colors">
                                            {/* SR # */}
                                            <td className="px-4 py-3 text-xs text-gray-400 font-mono">{idx + 1}</td>

                                            {/* Invoice # */}
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-bold text-gray-900 text-xs">{inv.invoice_number}</span>
                                            </td>

                                            {/* Patient + MRN */}
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900">{inv.patient?.full_name || 'Walk-in'}</p>
                                                {inv.patient_id && (
                                                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">MRN: {inv.patient_id}</p>
                                                )}
                                                {inv.patient?.phone && (
                                                    <p className="text-[10px] text-gray-400 mt-0.5">{inv.patient.phone}</p>
                                                )}
                                            </td>

                                            {/* Category */}
                                            <td className="px-4 py-3">
                                                {isIpd ? (
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${isAdmitted ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                        IPD · {isAdmitted ? 'Admitted' : 'Discharged'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                                                        Counter
                                                    </span>
                                                )}
                                            </td>

                                            {/* Doctor */}
                                            <td className="px-4 py-3 text-xs text-gray-600">
                                                {inv.doctor_name || <span className="text-gray-300">—</span>}
                                            </td>

                                            {/* Date & Time */}
                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                {fmtDateTime(inv.created_at)}
                                            </td>

                                            {/* Bill Amount */}
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 text-sm">
                                                {fmt(Number(inv.net_amount || inv.total_amount || 0))}
                                            </td>

                                            {/* Balance */}
                                            <td className="px-4 py-3 text-right font-bold text-sm">
                                                <span className={Number(inv.balance_due) > 0 ? 'text-rose-600' : 'text-gray-300'}>
                                                    {Number(inv.balance_due) > 0 ? fmt(Number(inv.balance_due)) : '—'}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {inv.status}
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                                    <Link href={`/pharmacy/invoices/${inv.id}/view`} target="_blank"
                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold rounded-lg hover:bg-orange-100 transition-colors">
                                                        <Eye className="h-3 w-3" /> View
                                                    </Link>
                                                    {isIpd && isAdmitted && notCancelled && (
                                                        <button onClick={() => openEditModal(inv)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-lg hover:bg-blue-100 transition-colors">
                                                            <Pencil className="h-3 w-3" /> Add Meds
                                                        </button>
                                                    )}
                                                    {hasBalance && notCancelled && (!isIpd || isDischarged) && (
                                                        <button onClick={() => openPayModal(inv)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition-colors">
                                                            <CreditCard className="h-3 w-3" /> Collect
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
                    {filtered.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                            Showing {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Payment Collection Modal ───────────────────────────────────────── */}
            {payModal && payInvoice && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div>
                                <h2 className="font-bold text-gray-900">Collect Payment</h2>
                                <p className="text-xs text-gray-500 mt-0.5">{payInvoice.invoice_number} · {payInvoice.patient?.full_name || 'Walk-in'}</p>
                            </div>
                            <button onClick={() => setPayModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Balance Due</span>
                                <span className="font-bold text-rose-600">{fmt(Number(payInvoice.balance_due))}</span>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Amount (₹)</label>
                                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                    max={Number(payInvoice.balance_due)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Payment Method</label>
                                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                    <option>Cash</option><option>UPI</option><option>Card</option><option>BankTransfer</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Reference / Txn ID (optional)</label>
                                <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                                    placeholder="UPI ref, card last 4, etc."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            {payError && <p className="text-xs text-rose-600 font-medium">{payError}</p>}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                            <button onClick={() => setPayModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleCollectPayment} disabled={paying}
                                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
                                {paying ? 'Processing...' : 'Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Medicines Modal (IPD active admission) ───────────────────── */}
            {editModal && editInvoice && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                            <div>
                                <h2 className="font-bold text-gray-900">Add Medicines to IPD Bill</h2>
                                <p className="text-xs text-gray-500 mt-0.5">{editInvoice.invoice_number} · {editInvoice.patient?.full_name}</p>
                            </div>
                            <button onClick={() => setEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
                        </div>

                        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Search & Add Medicine</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input type="text" value={medSearch} onChange={e => setMedSearch(e.target.value)}
                                        placeholder="Type medicine name..."
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                {medSearch.length >= 2 && (
                                    <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-lg">
                                        {filteredMeds.slice(0, 20).map((med: any, i: number) => (
                                            <button key={i} onClick={() => addMedRow(med)}
                                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left text-sm border-b border-gray-100 last:border-0">
                                                <div>
                                                    <span className="font-semibold text-gray-900">{med.medicine?.brand_name}</span>
                                                    <span className="text-gray-400 text-xs ml-2">{med.medicine?.generic_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span>Batch: {med.batch_no}</span>
                                                    <span className={`font-bold ${med.current_stock > 10 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        Qty: {med.current_stock === 999999 ? '∞' : med.current_stock}
                                                    </span>
                                                    <span className="text-blue-600 font-bold">₹{Number(med.medicine?.selling_price || 0).toFixed(2)}</span>
                                                    <Plus className="h-3.5 w-3.5 text-blue-600" />
                                                </div>
                                            </button>
                                        ))}
                                        {filteredMeds.length === 0 && (
                                            <div className="px-4 py-3 text-xs text-gray-400">No medicines found</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {editRows.length > 0 && (
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-2 block">Medicines to Add ({editRows.length})</label>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Medicine</th>
                                                    <th className="px-3 py-2 text-center w-24">Qty</th>
                                                    <th className="px-3 py-2 text-right w-28">Unit Price</th>
                                                    <th className="px-3 py-2 text-right w-24">Total</th>
                                                    <th className="px-3 py-2 w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {editRows.map((row, i) => (
                                                    <tr key={i}>
                                                        <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <input type="number" min={1} value={row.qty}
                                                                onChange={e => setEditRows(rows => rows.map((r, ri) => ri === i ? { ...r, qty: Math.max(1, parseInt(e.target.value) || 1) } : r))}
                                                                className="w-16 text-center px-2 py-1 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <input type="number" min={0} value={row.unit_price}
                                                                onChange={e => setEditRows(rows => rows.map((r, ri) => ri === i ? { ...r, unit_price: parseFloat(e.target.value) || 0 } : r))}
                                                                className="w-24 text-right px-2 py-1 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-bold text-gray-900">
                                                            ₹{(row.qty * row.unit_price).toFixed(2)}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <button onClick={() => setEditRows(rows => rows.filter((_, ri) => ri !== i))}
                                                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-right text-sm font-bold text-gray-900">
                                            Total: ₹{editRows.reduce((s, r) => s + r.qty * r.unit_price, 0).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {saveError && <p className="text-xs text-rose-600 font-medium">{saveError}</p>}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                            <button onClick={() => setEditModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleSaveMedicines} disabled={saving || editRows.length === 0}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                                {saving ? 'Saving...' : `Add ${editRows.length} Medicine${editRows.length !== 1 ? 's' : ''} to Bill`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
