'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getMasterBillingData } from '@/app/actions/finance-master-actions';
import {
    Search, Filter, Loader2, ChevronDown, ChevronUp, Clock, FileText,
    CreditCard, DollarSign, Activity, Settings, Zap, History, X, Check, Eye, Pencil,
    Receipt
} from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { processPatientPayment, addPatientDues } from '@/app/actions/reception-actions';
import { reversePayment, cancelInvoice, revertInvoice, searchPatientsForBilling } from '@/app/actions/finance-actions';
import { EditInvoiceModal } from '@/app/components/finance/EditInvoiceModal';
import { RecordTpaPaymentModal } from '@/app/components/billing/RecordTpaPaymentModal';
import { useRouter } from 'next/navigation';

// Row shape that the TPA modal consumes — minimal subset of invoice fields the
// `RecordTpaPaymentModal` needs to render and submit a settlement. Shape must
// stay in sync with `RecordTpaPaymentModalProps.invoice`.
type RowShape = {
    id: number;
    version: number;
    invoice_number: string;
    patient_name?: string | null;
    tpa_provider_name?: string | null;
    tpa_approved_amount: number;
    tpa_settled_amount: number;
    // Extra context kept on the row so the dashboard can show summary chips
    // and decide button visibility without re-querying.
    tpa_outstanding?: number;
    tpa_claim_status?: string | null;
    billing_patient_type?: string | null;
};

interface BillingMasterProps {
    role: 'admin' | 'reception' | 'opd';
}

export function BillingMasterDashboard({ role }: BillingMasterProps) {
    const [data, setData] = useState<any[]>([]);
    const [meta, setMeta] = useState<any>({ page: 1, limit: 15, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'SETTLED'>('ACTIVE');
    const [patientType, setPatientType] = useState<'ALL' | 'OPD' | 'IPD' | 'WALKIN'>('ALL');
    const [tpaStatus, setTpaStatus] = useState<'ALL' | 'NONE' | 'PENDING' | 'APPROVED' | 'SETTLED'>('ALL');
    const [datePreset, setDatePreset] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('ALL');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [minBalance, setMinBalance] = useState('');
    const [maxBalance, setMaxBalance] = useState('');
    const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'balance_desc' | 'balance_asc' | 'name_asc'>('recent');
    const [showFilters, setShowFilters] = useState(false);
    const [page, setPage] = useState(1);

    // Derive ISO date range from preset. CUSTOM keeps user-entered values intact.
    const applyDatePreset = (preset: typeof datePreset) => {
        setDatePreset(preset);
        const today = new Date();
        const fmt = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        if (preset === 'TODAY') {
            setDateFrom(fmt(today)); setDateTo(fmt(today));
        } else if (preset === 'WEEK') {
            const d = new Date(); d.setDate(d.getDate() - 6);
            setDateFrom(fmt(d)); setDateTo(fmt(today));
        } else if (preset === 'MONTH') {
            const d = new Date(); d.setDate(d.getDate() - 29);
            setDateFrom(fmt(d)); setDateTo(fmt(today));
        } else if (preset === 'ALL') {
            setDateFrom(''); setDateTo('');
        }
        setPage(1);
    };

    const clearAllFilters = () => {
        setSearch('');
        setFilter('ACTIVE');
        setPatientType('ALL');
        setTpaStatus('ALL');
        setDatePreset('ALL');
        setDateFrom(''); setDateTo('');
        setMinBalance(''); setMaxBalance('');
        setSortBy('recent');
        setPage(1);
    };

    const activeFilterCount =
        (filter !== 'ACTIVE' ? 1 : 0) +
        (patientType !== 'ALL' ? 1 : 0) +
        (tpaStatus !== 'ALL' ? 1 : 0) +
        (datePreset !== 'ALL' ? 1 : 0) +
        (minBalance ? 1 : 0) +
        (maxBalance ? 1 : 0) +
        (sortBy !== 'recent' ? 1 : 0);

    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Modals
    const [paymentModal, setPaymentModal] = useState<any>(null); // { invoice_id, patient_id, max_amount }
    const [duesModal, setDuesModal] = useState<string | null>(null); // patient_id
    const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
    const [tpaModalInvoice, setTpaModalInvoice] = useState<RowShape | null>(null);
    const [processLoading, setProcessLoading] = useState(false);

    const [dueForm, setDueForm] = useState({ amount: '', description: '', department: 'General' });
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash' });

    const toast = useToast();
    const router = useRouter();

    // Patient-search modal: primary path for creating a bill — funnels into
    // the patient profile so the inline bill builder picks up the context.
    const [showPatientSearch, setShowPatientSearch] = useState(false);
    const [patientSearchQuery, setPatientSearchQuery] = useState('');
    const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
    const [patientSearching, setPatientSearching] = useState(false);

    useEffect(() => {
        if (!showPatientSearch) return;
        const q = patientSearchQuery.trim();
        if (q.length < 2) { setPatientSearchResults([]); return; }
        let cancelled = false;
        setPatientSearching(true);
        const t = setTimeout(async () => {
            const res = await searchPatientsForBilling(q);
            if (cancelled) return;
            setPatientSearching(false);
            if (res.success) setPatientSearchResults(res.data || []);
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [patientSearchQuery, showPatientSearch]);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getMasterBillingData({
            page,
            limit: 15,
            search,
            filter,
            patientType,
            tpaStatus,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            minBalance: minBalance ? Number(minBalance) : undefined,
            maxBalance: maxBalance ? Number(maxBalance) : undefined,
            sortBy,
        });
        if (res.success) {
            // Enrich each patient row with TPA aggregates computed from their
            // invoices. The server already returns the new TPA scalars via the
            // default Prisma `include`, but rolling them up here keeps the
            // table render trivially fast and avoids re-summing on every render.
            const enriched = (res.data || []).map((p: any) => {
                const invs = p.invoices || [];
                let tpaApproved = 0;
                let tpaSettled = 0;
                let tpaOutstanding = 0;
                let patientOutstanding = 0;
                for (const inv of invs) {
                    if (inv.status === 'Cancelled') continue;
                    const a = Number(inv.tpa_approved_amount || 0);
                    const s = Number(inv.tpa_settled_amount || 0);
                    const balance = Number(inv.balance_due || 0);
                    const tOut = Math.max(0, a - s);
                    const pOut = Math.max(0, balance - tOut);
                    tpaApproved += a;
                    tpaSettled += s;
                    tpaOutstanding += tOut;
                    patientOutstanding += pOut;
                }
                return {
                    ...p,
                    tpa_approved_amount: tpaApproved,
                    tpa_settled_amount: tpaSettled,
                    tpa_outstanding: tpaOutstanding,
                    patient_outstanding: patientOutstanding,
                };
            });
            setData(enriched);
            setMeta(res.meta);
        }
        setLoading(false);
    }, [page, search, filter]);

    useEffect(() => {
        const t = setTimeout(() => { loadData(); }, 300);
        return () => clearTimeout(t);
    }, [loadData]);

    // Whenever any filter dimension changes, kick the page back to 1 — keeps the
    // user from seeing an empty page because the previous offset overshot the
    // narrower result set.
    useEffect(() => {
        setPage(1);
    }, [filter, patientType, tpaStatus, datePreset, minBalance, maxBalance, sortBy]);

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
        const reason = prompt('Reason for cancelling this bill? (required)');
        if (!reason || !reason.trim()) return;
        setProcessLoading(true);
        const res = await cancelInvoice(invoiceId, reason.trim());
        if (res.success) {
            toast.success('Bill Cancelled');
            loadData();
        } else {
            toast.error('Failed to cancel bill');
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
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Today's Billing</h1>
                    <p className="text-sm text-gray-500 font-medium">Global patient financials and collection timeline</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                    <button
                        onClick={() => { setShowPatientSearch(true); setPatientSearchQuery(''); setPatientSearchResults([]); }}
                        className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        <Receipt className="h-4 w-4" /> New Bill (Search Patient)
                    </button>
                    <a
                        href="/billing/new"
                        className="text-xs font-bold text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
                        title="Classic single-page bill flow"
                    >
                        or use classic flow
                    </a>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search name, UHID, or phone…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            className="w-full pl-10 pr-9 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => { setSearch(''); setPage(1); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 rounded"
                                title="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowFilters(s => !s)}
                        className={`relative px-3 py-2 border rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors ${
                            showFilters || activeFilterCount > 0
                                ? 'bg-orange-50 border-orange-300 text-orange-700'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilterCount > 0 && (
                            <span className="ml-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-black bg-orange-600 text-white rounded-full">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* ADVANCED FILTERS PANEL */}
            {showFilters && (
                <div className="mb-4 bg-white border border-gray-200 rounded-2xl shadow-sm p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[11px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5 text-orange-500" /> Refine Results
                        </h2>
                        <div className="flex items-center gap-2">
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={clearAllFilters}
                                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                                >
                                    <X className="h-3 w-3" /> Clear all
                                </button>
                            )}
                            <button
                                onClick={() => setShowFilters(false)}
                                className="text-[11px] font-bold text-gray-400 hover:text-gray-700"
                            >
                                Hide
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Account Status */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Account Status</label>
                            <div className="flex flex-wrap gap-1.5">
                                {([
                                    { v: 'ALL', l: 'All' },
                                    { v: 'ACTIVE', l: 'Has Due' },
                                    { v: 'SETTLED', l: 'Settled' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.v}
                                        onClick={() => setFilter(opt.v as any)}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                                            filter === opt.v
                                                ? 'bg-orange-600 border-orange-600 text-white'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
                                        }`}
                                    >{opt.l}</button>
                                ))}
                            </div>
                        </div>

                        {/* Patient Type */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Bill Type</label>
                            <div className="flex flex-wrap gap-1.5">
                                {([
                                    { v: 'ALL', l: 'All' },
                                    { v: 'OPD', l: 'OPD' },
                                    { v: 'IPD', l: 'IPD' },
                                    { v: 'WALKIN', l: 'Walk-in' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.v}
                                        onClick={() => setPatientType(opt.v as any)}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                                            patientType === opt.v
                                                ? 'bg-slate-900 border-slate-900 text-white'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-slate-400'
                                        }`}
                                    >{opt.l}</button>
                                ))}
                            </div>
                        </div>

                        {/* TPA Status */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">TPA Status</label>
                            <select
                                value={tpaStatus}
                                onChange={e => setTpaStatus(e.target.value as any)}
                                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-orange-500"
                            >
                                <option value="ALL">All TPA states</option>
                                <option value="NONE">Cash / Corporate (no TPA)</option>
                                <option value="PENDING">TPA Pending</option>
                                <option value="APPROVED">TPA Approved (awaiting receipt)</option>
                                <option value="SETTLED">TPA Settled</option>
                            </select>
                        </div>

                        {/* Sort */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Sort By</label>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as any)}
                                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-orange-500"
                            >
                                <option value="recent">Newest first</option>
                                <option value="oldest">Oldest first</option>
                                <option value="balance_desc">Highest balance</option>
                                <option value="balance_asc">Lowest balance</option>
                                <option value="name_asc">Name (A–Z)</option>
                            </select>
                        </div>

                        {/* Date Range */}
                        <div className="lg:col-span-2">
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Bill Date</label>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {([
                                    { v: 'ALL', l: 'Any' },
                                    { v: 'TODAY', l: 'Today' },
                                    { v: 'WEEK', l: 'Last 7d' },
                                    { v: 'MONTH', l: 'Last 30d' },
                                    { v: 'CUSTOM', l: 'Custom' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.v}
                                        onClick={() => applyDatePreset(opt.v as any)}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                                            datePreset === opt.v
                                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                                        }`}
                                    >{opt.l}</button>
                                ))}
                            </div>
                            {datePreset === 'CUSTOM' && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={e => setDateFrom(e.target.value)}
                                        className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                    <span className="text-xs text-gray-400">to</span>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={e => setDateTo(e.target.value)}
                                        className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Balance Range */}
                        <div className="lg:col-span-2">
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Outstanding Balance (₹)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={minBalance}
                                    onChange={e => setMinBalance(e.target.value)}
                                    className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-orange-500"
                                />
                                <span className="text-xs text-gray-400">–</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={maxBalance}
                                    onChange={e => setMaxBalance(e.target.value)}
                                    className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-orange-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ACTIVE FILTER CHIPS */}
            {!showFilters && activeFilterCount > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase mr-1">Filters:</span>
                    {filter !== 'ACTIVE' && (
                        <FilterChip label={filter === 'ALL' ? 'All accounts' : 'Settled only'} onClear={() => setFilter('ACTIVE')} />
                    )}
                    {patientType !== 'ALL' && (
                        <FilterChip label={`Type: ${patientType}`} onClear={() => setPatientType('ALL')} />
                    )}
                    {tpaStatus !== 'ALL' && (
                        <FilterChip label={`TPA: ${tpaStatus.toLowerCase()}`} onClear={() => setTpaStatus('ALL')} />
                    )}
                    {datePreset !== 'ALL' && (
                        <FilterChip
                            label={datePreset === 'CUSTOM' ? `${dateFrom || '…'} → ${dateTo || '…'}` : datePreset.toLowerCase()}
                            onClear={() => applyDatePreset('ALL')}
                        />
                    )}
                    {minBalance && <FilterChip label={`Min ₹${minBalance}`} onClear={() => setMinBalance('')} />}
                    {maxBalance && <FilterChip label={`Max ₹${maxBalance}`} onClear={() => setMaxBalance('')} />}
                    {sortBy !== 'recent' && (
                        <FilterChip label={`Sort: ${sortBy.replace('_', ' ')}`} onClear={() => setSortBy('recent')} />
                    )}
                    <button
                        onClick={clearAllFilters}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 hover:underline"
                    >Clear all</button>
                </div>
            )}

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
                                <th className="px-6 py-4 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">TPA Approved</th>
                                <th className="px-6 py-4 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">TPA Received</th>
                                <th className="px-6 py-4 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">Patient Out</th>
                                <th className="px-6 py-4 text-center text-[11px] font-black text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-center text-[11px] font-black text-gray-500 uppercase tracking-wider">Ledger</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && data.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-20 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
                                        <p className="text-sm text-gray-400 mt-2 font-medium">Scanning Master Data...</p>
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-20 text-center text-gray-400 font-medium">
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
                                                    <p className="text-xs font-mono text-orange-600 mt-0.5">{patient.patient_id}</p>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500">
                                                    {patient.age} Y · {patient.gender} · {patient.phone}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500">{formatDate(patient.created_at)}</td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-700">₹{Number(totalBilled).toFixed(2)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    {(() => {
                                                        const pOut = Number(patient.patient_outstanding || 0);
                                                        const tOut = Number(patient.tpa_outstanding || 0);
                                                        // Split into stacked pills when both Patient AND TPA have
                                                        // outstanding balances; otherwise fall back to the legacy
                                                        // single coloured number so settled accounts stay green.
                                                        if (pOut > 0 && tOut > 0) {
                                                            return (
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <span className="inline-flex px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                                                        Patient: ₹{pOut.toFixed(2)}
                                                                    </span>
                                                                    <span className="inline-flex px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                                                        TPA: ₹{tOut.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                        if (pOut > 0) {
                                                            return (
                                                                <span className="inline-flex px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                                                    Patient: ₹{pOut.toFixed(2)}
                                                                </span>
                                                            );
                                                        }
                                                        if (tOut > 0) {
                                                            return (
                                                                <span className="inline-flex px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                                                    TPA: ₹{tOut.toFixed(2)}
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <span className="font-black text-emerald-600">
                                                                ₹{Number(patient.total_balance).toFixed(2)}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-700 font-medium">
                                                    {Number(patient.tpa_approved_amount || 0) > 0
                                                        ? `₹${Number(patient.tpa_approved_amount).toFixed(2)}`
                                                        : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-700 font-medium">
                                                    {Number(patient.tpa_settled_amount || 0) > 0
                                                        ? `₹${Number(patient.tpa_settled_amount).toFixed(2)}`
                                                        : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`font-black ${Number(patient.patient_outstanding || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        ₹{Number(patient.patient_outstanding || 0).toFixed(2)}
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
                                                    <td colSpan={10} className="p-0 border-b-4 border-slate-200">
                                                        <div className="bg-white p-6 shadow-[inset_0px_10px_20px_-15px_rgba(0,0,0,0.1)]">
                                                            
                                                            <div className="flex items-center justify-between mb-6">
                                                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                                                    <FileText className="h-4 w-4 text-orange-500" /> Account Details: {patient.full_name}
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
                                                                                                            <span className="font-mono text-orange-600/70">{item.invoice_number}</span> • 
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
                                                                                <div key={inv.id} className="flex flex-col gap-2 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-orange-200 transition-colors">
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
                                                                                    
                                                                                    <div className="flex gap-2 mt-1 flex-wrap">
                                                                                        <button
                                                                                            onClick={() => setPaymentModal({ invoice_id: inv.id, patient_id: patient.patient_id, max: inv.balance_due })}
                                                                                            className="flex-1 py-1.5 bg-orange-50 text-orange-700 text-xs font-bold rounded-md hover:bg-orange-100">
                                                                                            Accept Payment
                                                                                        </button>
                                                                                        {(inv.tpa_claim_status === 'approved' || inv.tpa_claim_status === 'partially_settled') && (
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    const approved = Number(inv.tpa_approved_amount || 0);
                                                                                                    const settled = Number(inv.tpa_settled_amount || 0);
                                                                                                    setTpaModalInvoice({
                                                                                                        id: Number(inv.id),
                                                                                                        version: Number(inv.version || 0),
                                                                                                        invoice_number: inv.invoice_number,
                                                                                                        patient_name: patient.full_name,
                                                                                                        tpa_provider_name: inv.tpa_provider?.name ?? inv.tpa_provider?.provider_name ?? null,
                                                                                                        tpa_approved_amount: approved,
                                                                                                        tpa_settled_amount: settled,
                                                                                                        tpa_outstanding: Math.max(0, approved - settled),
                                                                                                        tpa_claim_status: inv.tpa_claim_status,
                                                                                                        billing_patient_type: inv.billing_patient_type ?? null,
                                                                                                    });
                                                                                                }}
                                                                                                className="px-2 py-1.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-md hover:bg-amber-100"
                                                                                                title="Record TPA payment received"
                                                                                            >
                                                                                                Mark TPA Received
                                                                                            </button>
                                                                                        )}
                                                                                        {inv.status !== 'Cancelled' && (Number(inv.paid_amount ?? 0) === 0 || role === 'admin') && (
                                                                                            <button
                                                                                                onClick={() => setEditingInvoiceId(Number(inv.id))}
                                                                                                className="px-2 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md hover:bg-indigo-100"
                                                                                                title={Number(inv.paid_amount ?? 0) > 0 ? 'Edit bill (payment collected — Admin/Finance)' : 'Edit Invoice'}>
                                                                                                <Pencil className="h-3.5 w-3.5" />
                                                                                            </button>
                                                                                        )}
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
                            <CreditCard className="h-5 w-5 text-orange-600" /> Collect Payment
                        </h3>
                        <form onSubmit={handlePayment} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount to Collect (₹)</label>
                                <input type="number" required min="1" max={paymentModal.max} step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 font-mono text-lg text-orange-700 font-bold" placeholder={`Max: ₹${Number(paymentModal.max).toFixed(2)}`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Payment Method</label>
                                <select value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 font-medium">
                                    <option>Cash</option>
                                    <option>Card</option>
                                    <option>UPI</option>
                                    <option>Bank Transfer</option>
                                    <option>NEFT_RTGS</option>
                                    <option>Cheque</option>
                                </select>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setPaymentModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                                <button type="submit" disabled={processLoading} className="flex-1 py-2.5 bg-orange-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2">
                                    {processLoading && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT INVOICE MODAL */}
            {editingInvoiceId !== null && (
                <EditInvoiceModal
                    invoiceId={editingInvoiceId}
                    isOpen
                    onClose={() => setEditingInvoiceId(null)}
                    onSaved={() => { setEditingInvoiceId(null); loadData(); }}
                />
            )}

            {/* RECORD TPA PAYMENT MODAL */}
            {tpaModalInvoice && (
                <RecordTpaPaymentModal
                    open
                    invoice={tpaModalInvoice}
                    onClose={() => setTpaModalInvoice(null)}
                    onRecorded={() => { setTpaModalInvoice(null); loadData(); }}
                />
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
                                <input type="number" required min="1" step="0.01" value={dueForm.amount} onChange={e => setDueForm({...dueForm, amount: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 font-mono text-lg" placeholder="e.g. 500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description / Category</label>
                                <input type="text" required value={dueForm.description} onChange={e => setDueForm({...dueForm, description: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 font-medium" placeholder="e.g. Extra Consumables" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Internal Department Tag</label>
                                <select value={dueForm.department} onChange={e => setDueForm({...dueForm, department: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 font-medium text-sm">
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

            {/* PATIENT SEARCH MODAL — funnels into profile inline bill builder */}
            {showPatientSearch && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                                <Receipt className="h-4 w-4 text-orange-600" /> New Bill — find patient
                            </h3>
                            <button onClick={() => setShowPatientSearch(false)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Name, UHID, or phone…"
                                    value={patientSearchQuery}
                                    onChange={(e) => setPatientSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 outline-none"
                                />
                                {patientSearching && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                                )}
                            </div>

                            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                                {patientSearchQuery.trim().length < 2 && (
                                    <p className="text-xs text-gray-400 text-center py-6">Type at least 2 characters to search.</p>
                                )}
                                {patientSearchQuery.trim().length >= 2 && !patientSearching && patientSearchResults.length === 0 && (
                                    <p className="text-xs text-gray-400 text-center py-6">No patients match.</p>
                                )}
                                {patientSearchResults.map((p: any) => (
                                    <button
                                        key={p.patient_id}
                                        onClick={() => {
                                            setShowPatientSearch(false);
                                            router.push(`/reception/patient/${p.patient_id}?tab=billing&action=new`);
                                        }}
                                        className="w-full text-left p-3 bg-white border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50/40 transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{p.full_name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">{p.patient_id} · {p.phone || 'no phone'}</p>
                                            </div>
                                            <ChevronUp className="h-4 w-4 text-gray-300 rotate-90 shrink-0" />
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-[11px] text-gray-400">
                                <span>Pro tip: register a new patient first.</span>
                                <a href="/reception/register" className="underline hover:text-gray-700">New patient</a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-bold rounded-lg">
            {label}
            <button
                onClick={onClear}
                className="ml-0.5 -mr-0.5 p-0.5 rounded hover:bg-orange-100"
                title="Remove filter"
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    );
}
