'use client';

import { useState, useEffect } from 'react';
import {
    DollarSign, FileText, CreditCard, TrendingUp, Clock,
    AlertTriangle, Loader2, Search,
    Eye, CheckCircle, XCircle, ArrowUpRight, Receipt, Wallet,
    BarChart3, Download, TrendingDown
} from 'lucide-react';
import {
    getFinanceDashboardStats, getInvoices, recordPayment, finalizeInvoice,
    cancelInvoice, getChargeCatalog,
} from '@/app/actions/finance-actions';
import { getExpenseDashboardStats } from '@/app/actions/expense-actions';
import { getDepositStats } from '@/app/actions/deposit-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { InvoiceDetailModal } from '@/app/components/finance/InvoiceDetailModal';
import { PaymentRecordModal } from '@/app/components/finance/PaymentRecordModal';
import { useToast } from '@/app/components/ui/Toast';

export default function FinanceDashboard() {
    const toast = useToast();
    const [stats, setStats] = useState<any>(null);
    const [expenseStats, setExpenseStats] = useState<any>(null);
    const [depositStats, setDepositStats] = useState<any>(null);
    const [invoices, setInvoiceList] = useState<any[]>([]);
    const [catalog, setCatalog] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [paymentModal, setPaymentModal] = useState<any>(null);
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash', type: 'Settlement', notes: '' });
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [detailModal, setDetailModal] = useState<any>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, inv, cat, expStats, depStats] = await Promise.all([
                getFinanceDashboardStats(),
                getInvoices({ status: statusFilter || undefined, invoice_type: typeFilter || undefined }),
                getChargeCatalog(),
                getExpenseDashboardStats(),
                getDepositStats(),
            ]);
            if (s.success) setStats(s.data);
            if (inv.success) setInvoiceList(inv.data || []);
            if (cat.success) setCatalog(cat.data || []);
            if (expStats.success) setExpenseStats(expStats.data);
            if (depStats.success) setDepositStats(depStats.data);
        } catch (err) { console.error('Finance load error:', err); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [statusFilter, typeFilter]);

    const handleRecordPayment = async () => {
        if (!paymentModal || !paymentForm.amount) return;
        if (paymentForm.method === 'Razorpay') { await handleRazorpayPayment(); return; }
        setPaymentLoading(true);
        try {
            const res = await recordPayment({
                invoice_id: paymentModal.id, amount: parseFloat(paymentForm.amount),
                payment_method: paymentForm.method, payment_type: paymentForm.type, notes: paymentForm.notes,
            });
            if (res.success) { setPaymentModal(null); setPaymentForm({ amount: '', method: 'Cash', type: 'Settlement', notes: '' }); loadData(); }
        } catch (err) { console.error(err); }
        setPaymentLoading(false);
    };

    const handleRazorpayPayment = async () => {
        if (!paymentModal || !paymentForm.amount) return;
        setPaymentLoading(true);
        try {
            const orderRes = await fetch('/api/razorpay/create-order', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_id: paymentModal.id }),
            });
            const orderData = await orderRes.json();
            if (!orderData.success) { toast.error('Failed to create Razorpay order: ' + orderData.error); setPaymentLoading(false); return; }

            const rzp = new window.Razorpay({
                key: orderData.data.key_id, amount: orderData.data.amount, currency: orderData.data.currency,
                name: 'Avani Hospital', description: `Payment for ${paymentModal.invoice_number}`,
                order_id: orderData.data.order_id,
                handler: async (response: any) => {
                    try {
                        const verifyRes = await fetch('/api/razorpay/verify-payment', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...response, invoice_id: paymentModal.id, payment_type: paymentForm.type, notes: paymentForm.notes || 'Paid via Razorpay' }),
                        });
                        const verifyData = await verifyRes.json();
                        if (verifyData.success) { setPaymentModal(null); setPaymentForm({ amount: '', method: 'Cash', type: 'Settlement', notes: '' }); loadData(); }
                        else toast.error('Payment verification failed: ' + verifyData.error);
                    } catch { toast.warning('Payment completed but verification failed. The webhook will reconcile automatically.'); }
                    setPaymentLoading(false);
                },
                prefill: { name: paymentModal.patient?.full_name || '', contact: paymentModal.patient?.phone || '' },
                theme: { color: '#10b981' },
                modal: { ondismiss: () => setPaymentLoading(false) },
            });
            rzp.on('payment.failed', (r: any) => { toast.error(`Payment failed: ${r.error.description}`); setPaymentLoading(false); });
            rzp.open();
        } catch (err: any) { toast.error('Failed to initiate Razorpay payment: ' + err.message); setPaymentLoading(false); }
    };

    const handleFinalize = async (id: number) => { await finalizeInvoice(id); loadData(); };
    const handleCancel = async (id: number) => { await cancelInvoice(id, 'Cancelled by finance admin'); loadData(); };

    const getStatusColor = (s: string) => ({
        Draft: 'text-slate-400 bg-slate-500/10', Proforma: 'text-blue-400 bg-blue-500/10',
        Final: 'text-amber-400 bg-amber-500/10', Paid: 'text-emerald-400 bg-emerald-500/10',
        Partial: 'text-orange-400 bg-orange-500/10', Cancelled: 'text-rose-400 bg-rose-500/10',
    }[s] || 'text-gray-500 bg-gray-100');

    const filteredInvoices = invoices.filter(inv => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return inv.invoice_number.toLowerCase().includes(q) || inv.patient?.full_name?.toLowerCase().includes(q) || inv.patient_id.toLowerCase().includes(q);
    });

    const kpiCards = [
        { label: "Today's Revenue", value: `\u20B9${((stats?.todayRevenue || 0) / 1000).toFixed(1)}K`, sub: `${stats?.totalPaymentsToday || 0} transactions`, icon: <DollarSign className="h-3.5 w-3.5 text-emerald-400" />, color: 'emerald', subIcon: <ArrowUpRight className="h-3 w-3" /> },
        { label: 'Total Revenue', value: `\u20B9${((stats?.totalRevenue || 0) / 1000).toFixed(1)}K`, sub: `${stats?.totalInvoices || 0} invoices`, icon: <Wallet className="h-3.5 w-3.5 text-teal-400" />, color: 'teal', subIcon: <TrendingUp className="h-3 w-3" /> },
        { label: 'Expenses (Month)', value: `\u20B9${((expenseStats?.thisMonthTotal || 0) / 1000).toFixed(1)}K`, sub: `${expenseStats?.pendingApproval || 0} pending approval`, icon: <TrendingDown className="h-3.5 w-3.5 text-red-400" />, color: 'red', subIcon: <Clock className="h-3 w-3" /> },
        { label: 'Outstanding', value: `\u20B9${((stats?.pendingBalance || 0) / 1000).toFixed(1)}K`, sub: `${stats?.outstandingInvoices || 0} pending`, icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />, color: 'amber', subIcon: <Clock className="h-3 w-3" /> },
        { label: 'Draft Bills', value: String(stats?.draftInvoices || 0), sub: 'Awaiting finalization', icon: <FileText className="h-3.5 w-3.5 text-violet-400" />, color: 'violet', subIcon: <FileText className="h-3 w-3" /> },
        { label: 'Active Deposits', value: `\u20B9${((depositStats?.activeBalance || 0) / 1000).toFixed(1)}K`, sub: `${depositStats?.activeDeposits || 0} active`, icon: <Wallet className="h-3.5 w-3.5 text-cyan-400" />, color: 'cyan', subIcon: <Receipt className="h-3 w-3" /> },
    ];

    return (
        <AppShell pageTitle="Finance Dashboard" pageIcon={<DollarSign className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight text-gray-900">Finance Dashboard</h2>
                        <p className="text-gray-500 mt-1 font-medium">Invoicing, payments, and revenue analytics</p>
                    </div>
                    <div className="flex gap-2">
                        {['overview', 'invoices', 'catalog'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === tab ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-900'}`}>
                                {tab === 'overview' ? 'Overview' : tab === 'invoices' ? 'Invoices' : 'Rate Catalog'}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
                            <p className="text-gray-400 font-bold text-sm">Loading financial data...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {kpiCards.map((c, i) => (
                                <div key={i} className={`group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-${c.color}-500/30 transition-all overflow-hidden`}>
                                    <div className={`absolute top-0 right-0 w-24 h-24 bg-${c.color}-500/5 rounded-full blur-2xl`} />
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">{c.label}</span>
                                        <div className={`p-1.5 bg-${c.color}-500/10 rounded-lg`}>{c.icon}</div>
                                    </div>
                                    <p className="text-3xl font-black text-gray-900 tracking-tight">{c.value}</p>
                                    <div className={`flex items-center gap-1 mt-2 text-xs font-bold text-${c.color}-400`}>{c.subIcon} {c.sub}</div>
                                </div>
                            ))}
                        </div>

                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Revenue by Department */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="p-5 border-b border-gray-200"><h3 className="font-black text-gray-700 flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-emerald-400" /> Revenue by Department</h3></div>
                                    <div className="p-5">
                                        {stats?.revenueByDepartment?.length > 0 ? (
                                            <div className="space-y-3">
                                                {stats.revenueByDepartment.map((dept: any, i: number) => {
                                                    const maxAmt = Math.max(...stats.revenueByDepartment.map((d: any) => d.amount), 1);
                                                    const colors = ['from-emerald-500 to-teal-500', 'from-violet-500 to-indigo-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500', 'from-blue-500 to-cyan-500', 'from-fuchsia-500 to-purple-500'];
                                                    return (
                                                        <div key={i} className="flex items-center gap-3">
                                                            <span className="text-xs font-bold text-gray-500 w-28 truncate">{dept.department}</span>
                                                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`} style={{ width: `${(dept.amount / maxAmt) * 100}%` }} />
                                                            </div>
                                                            <span className="text-xs font-black text-gray-500 w-20 text-right">{'\u20B9'}{dept.amount.toLocaleString()}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="py-8 flex flex-col items-center text-gray-300"><BarChart3 className="h-8 w-8 mb-2" /><span className="text-xs font-bold">No revenue data yet</span></div>
                                        )}
                                    </div>
                                </div>

                                {/* Outstanding Aging */}
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="p-5 border-b border-gray-200"><h3 className="font-black text-gray-700 flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-amber-400" /> Outstanding Aging Report</h3></div>
                                    <div className="p-5 space-y-4">
                                        {[
                                            { label: '0-30 Days', amount: stats?.aging?.days0to30 || 0, bg: 'bg-emerald-500/5 border-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-400' },
                                            { label: '30-60 Days', amount: stats?.aging?.days30to60 || 0, bg: 'bg-amber-500/5 border-amber-500/10', dot: 'bg-amber-500', text: 'text-amber-400' },
                                            { label: '60+ Days', amount: stats?.aging?.days60plus || 0, bg: 'bg-rose-500/5 border-rose-500/10', dot: 'bg-rose-500', text: 'text-rose-400' },
                                        ].map((b, i) => (
                                            <div key={i} className={`flex items-center justify-between p-4 ${b.bg} border rounded-xl`}>
                                                <div className="flex items-center gap-3"><div className={`h-3 w-3 rounded-full ${b.dot}`} /><span className="text-sm font-bold text-gray-700">{b.label}</span></div>
                                                <span className={`text-lg font-black ${b.text}`}>{'\u20B9'}{b.amount.toLocaleString()}</span>
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between p-4 bg-gray-100 border border-gray-200 rounded-xl">
                                            <span className="text-sm font-black text-gray-500">Total Outstanding</span>
                                            <span className="text-lg font-black text-gray-900">{'\u20B9'}{((stats?.aging?.days0to30 || 0) + (stats?.aging?.days30to60 || 0) + (stats?.aging?.days60plus || 0)).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'invoices' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-3 items-center">
                                    <div className="relative flex-1 min-w-[200px] max-w-[400px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input type="text" placeholder="Search invoice #, patient name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500/50 focus:outline-none" />
                                    </div>
                                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-500 focus:outline-none">
                                        <option value="">All Status</option>
                                        {['Draft', 'Final', 'Paid', 'Partial', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-500 focus:outline-none">
                                        <option value="">All Types</option>
                                        <option value="OPD">OPD</option><option value="IPD">IPD</option>
                                    </select>
                                </div>
                                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    {['Invoice #', 'Patient', 'Type', 'Amount', 'Paid', 'Balance', 'Status', 'Actions'].map((h, i) => (
                                                        <th key={h} className={`${i >= 3 && i <= 5 ? 'text-right' : i >= 6 ? 'text-center' : 'text-left'} px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider`}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredInvoices.length === 0 ? (
                                                    <tr><td colSpan={8} className="px-5 py-16 text-center text-gray-300"><FileText className="h-8 w-8 mx-auto mb-2" /><p className="text-xs font-bold">No invoices found</p></td></tr>
                                                ) : filteredInvoices.map((inv: any) => (
                                                    <tr key={inv.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                                                        <td className="px-5 py-3.5 text-xs font-bold text-gray-700 font-mono">{inv.invoice_number}</td>
                                                        <td className="px-5 py-3.5"><p className="text-xs font-bold text-gray-700">{inv.patient?.full_name || inv.patient_id}</p><p className="text-[10px] text-gray-400">{inv.patient_id}</p></td>
                                                        <td className="px-5 py-3.5"><span className={`text-[10px] font-black px-2 py-0.5 rounded ${inv.invoice_type === 'IPD' ? 'bg-violet-500/10 text-violet-400' : 'bg-teal-500/10 text-teal-400'}`}>{inv.invoice_type}</span></td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-black text-gray-700">{'\u20B9'}{Number(inv.net_amount).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-emerald-400">{'\u20B9'}{Number(inv.paid_amount).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-right text-xs font-bold text-amber-400">{'\u20B9'}{Number(inv.balance_due).toLocaleString()}</td>
                                                        <td className="px-5 py-3.5 text-center"><span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${getStatusColor(inv.status)}`}>{inv.status}</span></td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button onClick={() => setDetailModal(inv)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="View"><Eye className="h-3.5 w-3.5 text-gray-500" /></button>
                                                                <button onClick={() => window.open(`/api/invoice/${inv.id}/pdf`, '_blank')} className="p-1.5 hover:bg-blue-500/10 rounded-lg" title="PDF"><Download className="h-3.5 w-3.5 text-blue-400/60" /></button>
                                                                {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                                                                    <button onClick={() => { setPaymentModal(inv); setPaymentForm({ ...paymentForm, amount: String(Number(inv.balance_due)) }); }} className="p-1.5 hover:bg-emerald-500/10 rounded-lg" title="Pay"><CreditCard className="h-3.5 w-3.5 text-emerald-400/60" /></button>
                                                                )}
                                                                {inv.status === 'Draft' && (<>
                                                                    <button onClick={() => handleFinalize(inv.id)} className="p-1.5 hover:bg-teal-500/10 rounded-lg" title="Finalize"><CheckCircle className="h-3.5 w-3.5 text-teal-400/60" /></button>
                                                                    <button onClick={() => handleCancel(inv.id)} className="p-1.5 hover:bg-rose-500/10 rounded-lg" title="Cancel"><XCircle className="h-3.5 w-3.5 text-rose-400/60" /></button>
                                                                </>)}
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
                            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                                <div className="p-5 border-b border-gray-200"><h3 className="font-black text-gray-700 flex items-center gap-2 text-sm"><Receipt className="h-4 w-4 text-teal-400" /> Charge Catalog (Service Rates)</h3></div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead><tr className="border-b border-gray-200">
                                            {['Code', 'Service', 'Category', 'Department'].map(h => <th key={h} className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">{h}</th>)}
                                            <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">Rate</th>
                                        </tr></thead>
                                        <tbody>
                                            {catalog.length === 0 ? (
                                                <tr><td colSpan={5} className="px-5 py-16 text-center text-gray-300"><Receipt className="h-8 w-8 mx-auto mb-2" /><p className="text-xs font-bold">No catalog items</p></td></tr>
                                            ) : catalog.map((item: any) => (
                                                <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                                                    <td className="px-5 py-3 text-xs font-mono text-gray-500">{item.item_code}</td>
                                                    <td className="px-5 py-3 text-xs font-bold text-gray-700">{item.item_name}</td>
                                                    <td className="px-5 py-3 text-[10px] font-bold text-gray-500">{item.category}</td>
                                                    <td className="px-5 py-3 text-[10px] font-bold text-gray-500">{item.department || '-'}</td>
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
            </div>

            {paymentModal && (
                <PaymentRecordModal
                    invoice={paymentModal} form={paymentForm}
                    onFormChange={setPaymentForm} onSubmit={handleRecordPayment}
                    onClose={() => setPaymentModal(null)} loading={paymentLoading}
                />
            )}
            {detailModal && <InvoiceDetailModal invoice={detailModal} onClose={() => setDetailModal(null)} />}
        </AppShell>
    );
}
