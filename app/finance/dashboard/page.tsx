'use client';

import React, { useState, useEffect } from 'react';
import {
    DollarSign, FileText, CreditCard, TrendingUp, TrendingDown, Clock,
    AlertTriangle, LogOut, RefreshCw, Loader2, ChevronRight, Search,
    Plus, Eye, CheckCircle, XCircle, ArrowUpRight, Receipt, Wallet,
    BarChart3, PieChart, Filter, Download, HeartPulse, Building2,
    CircleDollarSign, Banknote, ArrowDownRight
} from 'lucide-react';
import Link from 'next/link';
import {
    getFinanceDashboardStats, getInvoices, recordPayment, finalizeInvoice,
    cancelInvoice, createInvoice, addInvoiceItem, getChargeCatalog,
} from '@/app/actions/finance-actions';

export default function FinanceDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [invoices, setInvoiceList] = useState<any[]>([]);
    const [catalog, setCatalog] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Payment modal
    const [paymentModal, setPaymentModal] = useState<any>(null);
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash', type: 'Settlement', notes: '' });
    const [paymentLoading, setPaymentLoading] = useState(false);

    // Invoice detail modal
    const [detailModal, setDetailModal] = useState<any>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, inv, cat] = await Promise.all([
                getFinanceDashboardStats(),
                getInvoices({ status: statusFilter || undefined, invoice_type: typeFilter || undefined }),
                getChargeCatalog(),
            ]);
            if (s.success) setStats(s.data);
            if (inv.success) setInvoiceList(inv.data || []);
            if (cat.success) setCatalog(cat.data || []);
        } catch (err) {
            console.error('Finance load error:', err);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [statusFilter, typeFilter]);

    const handleRecordPayment = async () => {
        if (!paymentModal || !paymentForm.amount) return;

        // Branch to Razorpay flow when selected
        if (paymentForm.method === 'Razorpay') {
            await handleRazorpayPayment();
            return;
        }

        setPaymentLoading(true);
        try {
            const res = await recordPayment({
                invoice_id: paymentModal.id,
                amount: parseFloat(paymentForm.amount),
                payment_method: paymentForm.method,
                payment_type: paymentForm.type,
                notes: paymentForm.notes,
            });
            if (res.success) {
                setPaymentModal(null);
                setPaymentForm({ amount: '', method: 'Cash', type: 'Settlement', notes: '' });
                loadData();
            }
        } catch (err) { console.error(err); }
        setPaymentLoading(false);
    };

    const handleRazorpayPayment = async () => {
        if (!paymentModal || !paymentForm.amount) return;
        setPaymentLoading(true);

        try {
            const amount = parseFloat(paymentForm.amount);

            // Step 1: Create Razorpay Order
            const orderRes = await fetch('/api/razorpay/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount,
                    invoice_id: paymentModal.id,
                    invoice_number: paymentModal.invoice_number,
                    patient_name: paymentModal.patient?.full_name || '',
                }),
            });

            const orderData = await orderRes.json();
            if (!orderData.success) {
                alert('Failed to create Razorpay order: ' + orderData.error);
                setPaymentLoading(false);
                return;
            }

            // Step 2: Open Razorpay Checkout popup
            const options = {
                key: orderData.data.key_id,
                amount: orderData.data.amount,
                currency: orderData.data.currency,
                name: 'Avani Hospital',
                description: `Payment for ${paymentModal.invoice_number}`,
                order_id: orderData.data.order_id,
                handler: async function (response: {
                    razorpay_payment_id: string;
                    razorpay_order_id: string;
                    razorpay_signature: string;
                }) {
                    // Step 3: Verify payment server-side
                    try {
                        const verifyRes = await fetch('/api/razorpay/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                invoice_id: paymentModal.id,
                                amount,
                                payment_type: paymentForm.type,
                                notes: paymentForm.notes || 'Paid via Razorpay',
                            }),
                        });

                        const verifyData = await verifyRes.json();
                        if (verifyData.success) {
                            setPaymentModal(null);
                            setPaymentForm({ amount: '', method: 'Cash', type: 'Settlement', notes: '' });
                            loadData();
                        } else {
                            alert('Payment verification failed: ' + verifyData.error);
                        }
                    } catch (verifyErr) {
                        console.error('Verification error:', verifyErr);
                        alert('Payment completed but verification failed. The webhook will reconcile automatically.');
                    }
                    setPaymentLoading(false);
                },
                prefill: {
                    name: paymentModal.patient?.full_name || '',
                    contact: paymentModal.patient?.phone || '',
                },
                theme: {
                    color: '#10b981',
                },
                modal: {
                    ondismiss: function () {
                        setPaymentLoading(false);
                    },
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
                console.error('Razorpay payment failed:', response.error);
                alert(`Payment failed: ${response.error.description}`);
                setPaymentLoading(false);
            });
            rzp.open();
        } catch (err: any) {
            console.error('Razorpay payment error:', err);
            alert('Failed to initiate Razorpay payment: ' + err.message);
            setPaymentLoading(false);
        }
    };

    const handleFinalize = async (invoiceId: number) => {
        await finalizeInvoice(invoiceId);
        loadData();
    };

    const handleCancel = async (invoiceId: number) => {
        await cancelInvoice(invoiceId, 'Cancelled by finance admin');
        loadData();
    };

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Draft: 'text-slate-400 bg-slate-500/10',
            Proforma: 'text-blue-400 bg-blue-500/10',
            Final: 'text-amber-400 bg-amber-500/10',
            Paid: 'text-emerald-400 bg-emerald-500/10',
            Partial: 'text-orange-400 bg-orange-500/10',
            Cancelled: 'text-rose-400 bg-rose-500/10',
        };
        return map[status] || 'text-white/40 bg-white/5';
    };

    const filteredInvoices = invoices.filter(inv => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return inv.invoice_number.toLowerCase().includes(q) ||
            inv.patient?.full_name?.toLowerCase().includes(q) ||
            inv.patient_id.toLowerCase().includes(q);
    });

    return (
        <div className="min-h-screen bg-[#0B0F1A] text-white font-sans">
            {/* HEADER */}
            <header className="bg-[#0F1425]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl blur-md opacity-50" />
                            <div className="relative bg-gradient-to-br from-emerald-400 to-teal-600 p-2 rounded-xl shadow-lg shadow-emerald-500/20">
                                <CircleDollarSign className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                                Finance & Billing
                            </h1>
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">
                                Revenue Intelligence
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/admin/dashboard" className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
                            <BarChart3 className="h-3.5 w-3.5" /> Admin
                        </Link>
                        <Link href="/ipd" className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5" /> IPD
                        </Link>
                        <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white transition-all">
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <Link href="/login" className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-500/10 transition-all">
                            <LogOut className="h-3.5 w-3.5" /> Logout
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
                {/* TITLE */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">Finance Dashboard</h2>
                        <p className="text-white/40 mt-1 font-medium">Invoicing, payments, and revenue analytics</p>
                    </div>
                    <div className="flex gap-2">
                        {['overview', 'invoices', 'catalog'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === tab ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-white/40 border border-white/10 hover:text-white'}`}>
                                {tab === 'overview' ? 'Overview' : tab === 'invoices' ? 'Invoices' : 'Rate Catalog'}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
                            <p className="text-white/30 font-bold text-sm">Loading financial data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI CARDS */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Today&apos;s Revenue</span>
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg"><DollarSign className="h-3.5 w-3.5 text-emerald-400" /></div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">
                                    {'\u20B9'}{((stats?.todayRevenue || 0) / 1000).toFixed(1)}K
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                                    <ArrowUpRight className="h-3 w-3" /> {stats?.totalPaymentsToday || 0} transactions
                                </div>
                            </div>

                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-teal-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Total Revenue</span>
                                    <div className="p-1.5 bg-teal-500/10 rounded-lg"><Wallet className="h-3.5 w-3.5 text-teal-400" /></div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">
                                    {'\u20B9'}{((stats?.totalRevenue || 0) / 1000).toFixed(1)}K
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                                    <TrendingUp className="h-3 w-3" /> {stats?.totalInvoices || 0} invoices
                                </div>
                            </div>

                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-amber-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Outstanding</span>
                                    <div className="p-1.5 bg-amber-500/10 rounded-lg"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /></div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">
                                    {'\u20B9'}{((stats?.pendingBalance || 0) / 1000).toFixed(1)}K
                                </p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-amber-400">
                                    <Clock className="h-3 w-3" /> {stats?.outstandingInvoices || 0} pending
                                </div>
                            </div>

                            <div className="group relative bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl p-5 border border-white/5 hover:border-violet-500/30 transition-all overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl" />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">Draft Bills</span>
                                    <div className="p-1.5 bg-violet-500/10 rounded-lg"><FileText className="h-3.5 w-3.5 text-violet-400" /></div>
                                </div>
                                <p className="text-3xl font-black text-white tracking-tight">{stats?.draftInvoices || 0}</p>
                                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-violet-400">
                                    <FileText className="h-3 w-3" /> Awaiting finalization
                                </div>
                            </div>
                        </div>

                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Revenue by Department */}
                                <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                    <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                        <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                            <BarChart3 className="h-4 w-4 text-emerald-400" /> Revenue by Department
                                        </h3>
                                    </div>
                                    <div className="p-5">
                                        {stats?.revenueByDepartment?.length > 0 ? (
                                            <div className="space-y-3">
                                                {stats.revenueByDepartment.map((dept: any, i: number) => {
                                                    const maxAmt = Math.max(...stats.revenueByDepartment.map((d: any) => d.amount), 1);
                                                    const widthPct = (dept.amount / maxAmt) * 100;
                                                    const colors = ['from-emerald-500 to-teal-500', 'from-violet-500 to-indigo-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500', 'from-blue-500 to-cyan-500', 'from-fuchsia-500 to-purple-500'];
                                                    return (
                                                        <div key={i} className="flex items-center gap-3">
                                                            <span className="text-xs font-bold text-white/40 w-28 truncate">{dept.department}</span>
                                                            <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                                                                <div className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`}
                                                                    style={{ width: `${widthPct}%` }} />
                                                            </div>
                                                            <span className="text-xs font-black text-white/60 w-20 text-right">{'\u20B9'}{dept.amount.toLocaleString()}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="py-8 flex flex-col items-center text-white/20">
                                                <BarChart3 className="h-8 w-8 mb-2" />
                                                <span className="text-xs font-bold">No revenue data yet</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Outstanding Aging Report */}
                                <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                    <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                        <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                            <Clock className="h-4 w-4 text-amber-400" /> Outstanding Aging Report
                                        </h3>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        {[
                                            { label: '0-30 Days', amount: stats?.aging?.days0to30 || 0, color: 'emerald' },
                                            { label: '30-60 Days', amount: stats?.aging?.days30to60 || 0, color: 'amber' },
                                            { label: '60+ Days', amount: stats?.aging?.days60plus || 0, color: 'rose' },
                                        ].map((bucket, i) => (
                                            <div key={i} className={`flex items-center justify-between p-4 bg-${bucket.color}-500/5 border border-${bucket.color}-500/10 rounded-xl`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-3 w-3 rounded-full bg-${bucket.color}-500`} />
                                                    <span className="text-sm font-bold text-white/70">{bucket.label}</span>
                                                </div>
                                                <span className={`text-lg font-black text-${bucket.color}-400`}>
                                                    {'\u20B9'}{bucket.amount.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl mt-2">
                                            <span className="text-sm font-black text-white/60">Total Outstanding</span>
                                            <span className="text-lg font-black text-white">
                                                {'\u20B9'}{((stats?.aging?.days0to30 || 0) + (stats?.aging?.days30to60 || 0) + (stats?.aging?.days60plus || 0)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'invoices' && (
                            <div className="space-y-4">
                                {/* Filters */}
                                <div className="flex flex-wrap gap-3 items-center">
                                    <div className="relative flex-1 min-w-[200px] max-w-[400px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                                        <input type="text" placeholder="Search invoice #, patient name..."
                                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:border-emerald-500/50 focus:outline-none" />
                                    </div>
                                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                        className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 focus:outline-none">
                                        <option value="">All Status</option>
                                        {['Draft', 'Final', 'Paid', 'Partial', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                                        className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 focus:outline-none">
                                        <option value="">All Types</option>
                                        <option value="OPD">OPD</option>
                                        <option value="IPD">IPD</option>
                                    </select>
                                </div>

                                {/* Invoice Table */}
                                <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-white/5">
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Invoice #</th>
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Patient</th>
                                                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Type</th>
                                                    <th className="text-right px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Amount</th>
                                                    <th className="text-right px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Paid</th>
                                                    <th className="text-right px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Balance</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Status</th>
                                                    <th className="text-center px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredInvoices.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="px-5 py-16 text-center text-white/20">
                                                            <FileText className="h-8 w-8 mx-auto mb-2" />
                                                            <p className="text-xs font-bold">No invoices found</p>
                                                        </td>
                                                    </tr>
                                                ) : filteredInvoices.map((inv: any) => (
                                                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-5 py-3.5 text-xs font-bold text-white/80 font-mono">{inv.invoice_number}</td>
                                                        <td className="px-5 py-3.5">
                                                            <p className="text-xs font-bold text-white/80">{inv.patient?.full_name || inv.patient_id}</p>
                                                            <p className="text-[10px] text-white/30">{inv.patient_id}</p>
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${inv.invoice_type === 'IPD' ? 'bg-violet-500/10 text-violet-400' : 'bg-teal-500/10 text-teal-400'}`}>{inv.invoice_type}</span>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-black text-white/80">{'\u20B9'}{Number(inv.net_amount).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-emerald-400">{'\u20B9'}{Number(inv.paid_amount).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-amber-400">{'\u20B9'}{Number(inv.balance_due).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${getStatusColor(inv.status)}`}>{inv.status}</span>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button onClick={() => setDetailModal(inv)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all" title="View Details">
                                                                    <Eye className="h-3.5 w-3.5 text-white/40 hover:text-white" />
                                                                </button>
                                                                <button onClick={() => window.open(`/api/invoice/${inv.id}/pdf`, '_blank')} className="p-1.5 hover:bg-blue-500/10 rounded-lg transition-all" title="Print Invoice">
                                                                    <Download className="h-3.5 w-3.5 text-blue-400/60 hover:text-blue-400" />
                                                                </button>
                                                                {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                                                                    <button onClick={() => { setPaymentModal(inv); setPaymentForm({ ...paymentForm, amount: String(Number(inv.balance_due)) }); }}
                                                                        className="p-1.5 hover:bg-emerald-500/10 rounded-lg transition-all" title="Record Payment">
                                                                        <CreditCard className="h-3.5 w-3.5 text-emerald-400/60 hover:text-emerald-400" />
                                                                    </button>
                                                                )}
                                                                {inv.status === 'Draft' && (
                                                                    <>
                                                                        <button onClick={() => handleFinalize(inv.id)} className="p-1.5 hover:bg-teal-500/10 rounded-lg transition-all" title="Finalize">
                                                                            <CheckCircle className="h-3.5 w-3.5 text-teal-400/60 hover:text-teal-400" />
                                                                        </button>
                                                                        <button onClick={() => handleCancel(inv.id)} className="p-1.5 hover:bg-rose-500/10 rounded-lg transition-all" title="Cancel">
                                                                            <XCircle className="h-3.5 w-3.5 text-rose-400/60 hover:text-rose-400" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'catalog' && (
                            <div className="bg-gradient-to-br from-[#131A2E] to-[#0F1425] rounded-2xl border border-white/5 overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-black text-white/90 flex items-center gap-2 text-sm">
                                        <Receipt className="h-4 w-4 text-teal-400" /> Charge Catalog (Service Rates)
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/5">
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Code</th>
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Service</th>
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Category</th>
                                                <th className="text-left px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Department</th>
                                                <th className="text-right px-5 py-3.5 text-[10px] font-black text-white/30 uppercase tracking-wider">Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {catalog.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-5 py-16 text-center text-white/20">
                                                        <Receipt className="h-8 w-8 mx-auto mb-2" />
                                                        <p className="text-xs font-bold">No catalog items. Run seed to populate.</p>
                                                    </td>
                                                </tr>
                                            ) : catalog.map((item: any) => (
                                                <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                                    <td className="px-5 py-3 text-xs font-mono text-white/50">{item.item_code}</td>
                                                    <td className="px-5 py-3 text-xs font-bold text-white/80">{item.item_name}</td>
                                                    <td className="px-5 py-3 text-[10px] font-bold text-white/40">{item.category}</td>
                                                    <td className="px-5 py-3 text-[10px] font-bold text-white/40">{item.department || '-'}</td>
                                                    <td className="px-5 py-3 text-right text-xs font-black text-emerald-400">{'\u20B9'}{Number(item.default_price).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* PAYMENT MODAL */}
            {paymentModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#131A2E] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-white flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-emerald-400" /> Record Payment
                            </h3>
                            <button onClick={() => setPaymentModal(null)} className="text-white/30 hover:text-white text-xl">&times;</button>
                        </div>
                        <div className="text-xs text-white/40 font-mono bg-white/5 p-3 rounded-xl">
                            Invoice: {paymentModal.invoice_number} &bull; Balance: {'\u20B9'}{Number(paymentModal.balance_due).toLocaleString()}
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-wider block mb-1">Amount</label>
                                <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:border-emerald-500/50 focus:outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-wider block mb-1">Method</label>
                                    <select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
                                        {['Cash', 'UPI', 'Card', 'Razorpay', 'BankTransfer'].map(m => <option key={m} value={m} className="bg-[#1a1f3a] text-white">{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-wider block mb-1">Type</label>
                                    <select value={paymentForm.type} onChange={e => setPaymentForm({ ...paymentForm, type: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
                                        {['Advance', 'Settlement', 'PartialPayment', 'Refund'].map(t => <option key={t} value={t} className="bg-[#1a1f3a] text-white">{t}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-wider block mb-1">Notes</label>
                                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:border-emerald-500/50 focus:outline-none" placeholder="Optional" />
                            </div>
                        </div>
                        {paymentForm.method === 'Razorpay' && (
                            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                                <CreditCard className="h-4 w-4 flex-shrink-0" />
                                You will be redirected to Razorpay&apos;s secure payment page to complete the transaction.
                            </div>
                        )}
                        <button onClick={handleRecordPayment} disabled={paymentLoading || !paymentForm.amount}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                            {paymentForm.method === 'Razorpay' ? 'Pay with Razorpay' : 'Record Payment'}
                        </button>
                    </div>
                </div>
            )}

            {/* DETAIL MODAL */}
            {detailModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#131A2E] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-white">Invoice: {detailModal.invoice_number}</h3>
                            <button onClick={() => setDetailModal(null)} className="text-white/30 hover:text-white text-xl">&times;</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="bg-white/5 rounded-xl p-3">
                                <p className="text-white/30 font-bold mb-1">Patient</p>
                                <p className="text-white font-bold">{detailModal.patient?.full_name || detailModal.patient_id}</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3">
                                <p className="text-white/30 font-bold mb-1">Status</p>
                                <span className={`font-black px-2 py-0.5 rounded ${getStatusColor(detailModal.status)}`}>{detailModal.status}</span>
                            </div>
                        </div>
                        {/* Line Items */}
                        <div>
                            <h4 className="text-xs font-black text-white/50 uppercase tracking-wider mb-2">Line Items</h4>
                            <div className="space-y-1.5">
                                {detailModal.items?.map((item: any) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-xs">
                                        <div>
                                            <p className="font-bold text-white/80">{item.description}</p>
                                            <p className="text-[10px] text-white/30">{item.department} &bull; Qty: {item.quantity}</p>
                                        </div>
                                        <span className="font-black text-white/70">{'\u20B9'}{Number(item.net_price).toLocaleString()}</span>
                                    </div>
                                ))}
                                {(!detailModal.items || detailModal.items.length === 0) && (
                                    <p className="text-xs text-white/20 py-4 text-center">No line items</p>
                                )}
                            </div>
                        </div>
                        {/* Payments */}
                        <div>
                            <h4 className="text-xs font-black text-white/50 uppercase tracking-wider mb-2">Payments</h4>
                            <div className="space-y-1.5">
                                {detailModal.payments?.map((pay: any) => (
                                    <div key={pay.id} className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-xs">
                                        <div>
                                            <p className="font-bold text-emerald-400">{pay.receipt_number}</p>
                                            <p className="text-[10px] text-white/30">{pay.payment_method} &bull; {pay.payment_type}</p>
                                        </div>
                                        <span className="font-black text-emerald-400">{'\u20B9'}{Number(pay.amount).toLocaleString()}</span>
                                    </div>
                                ))}
                                {(!detailModal.payments || detailModal.payments.length === 0) && (
                                    <p className="text-xs text-white/20 py-4 text-center">No payments recorded</p>
                                )}
                            </div>
                        </div>
                        {/* Summary */}
                        <div className="bg-white/5 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between text-xs"><span className="text-white/40">Total</span><span className="font-black text-white">{'\u20B9'}{Number(detailModal.net_amount).toLocaleString()}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-white/40">Paid</span><span className="font-bold text-emerald-400">{'\u20B9'}{Number(detailModal.paid_amount).toLocaleString()}</span></div>
                            <div className="flex justify-between text-xs border-t border-white/10 pt-2"><span className="text-white/60 font-bold">Balance Due</span><span className="font-black text-amber-400">{'\u20B9'}{Number(detailModal.balance_due).toLocaleString()}</span></div>
                        </div>
                    </div>
                </div>
            )}

            <footer className="mt-8 border-t border-white/5 py-6 px-6">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/15 uppercase tracking-wider">Avani Hospital OS &bull; Finance Module &bull; v2.0</p>
                    <p className="text-[10px] font-medium text-white/15">Audit-logged &bull; Soft-delete compliant</p>
                </div>
            </footer>
        </div>
    );
}
