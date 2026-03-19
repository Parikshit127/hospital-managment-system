'use client';

import { useState, useEffect } from 'react';
import {
    collectDeposit, getPatientDeposits, getActiveDeposits,
    applyDepositToInvoice, refundDeposit, getDepositStats,
} from '@/app/actions/deposit-actions';
import { getInvoices } from '@/app/actions/finance-actions';
import {
    Loader2, Search, Plus, Wallet, ArrowUpRight, ArrowDownRight,
    CheckCircle, XCircle, IndianRupee, Receipt, CreditCard, RefreshCw,
    ChevronDown, X,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function DepositsPage() {
    const [deposits, setDeposits] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Collect modal
    const [showCollect, setShowCollect] = useState(false);
    const [collectForm, setCollectForm] = useState({
        patient_id: '', amount: '', payment_method: 'Cash', payment_ref: '', notes: '', admission_id: '',
    });
    const [collectLoading, setCollectLoading] = useState(false);

    // Apply modal
    const [applyModal, setApplyModal] = useState<any>(null);
    const [applyAmount, setApplyAmount] = useState('');
    const [applyInvoiceId, setApplyInvoiceId] = useState('');
    const [invoices, setInvoices] = useState<any[]>([]);
    const [applyLoading, setApplyLoading] = useState(false);

    // Refund modal
    const [refundModal, setRefundModal] = useState<any>(null);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundLoading, setRefundLoading] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [dRes, sRes] = await Promise.all([
            getPatientDeposits(),
            getDepositStats(),
        ]);
        if (dRes.success) setDeposits(dRes.data || []);
        if (sRes.success) setStats(sRes.data);
        setLoading(false);
    }

    async function handleCollect() {
        if (!collectForm.patient_id || !collectForm.amount) return;
        setCollectLoading(true);
        const res = await collectDeposit({
            patient_id: collectForm.patient_id,
            admission_id: collectForm.admission_id || undefined,
            amount: parseFloat(collectForm.amount),
            payment_method: collectForm.payment_method,
            payment_ref: collectForm.payment_ref || undefined,
            notes: collectForm.notes || undefined,
        });
        if (res.success) {
            setShowCollect(false);
            setCollectForm({ patient_id: '', amount: '', payment_method: 'Cash', payment_ref: '', notes: '', admission_id: '' });
            loadData();
        } else {
            alert(res.error);
        }
        setCollectLoading(false);
    }

    async function openApplyModal(deposit: any) {
        setApplyModal(deposit);
        setApplyAmount('');
        setApplyInvoiceId('');
        const invRes = await getInvoices({ patient_id: deposit.patient_id });
        if (invRes.success) setInvoices((invRes.data || []).filter((i: any) => i.status !== 'Paid' && i.status !== 'Cancelled'));
    }

    async function handleApply() {
        if (!applyModal || !applyInvoiceId || !applyAmount) return;
        setApplyLoading(true);
        const res = await applyDepositToInvoice(applyModal.id, parseInt(applyInvoiceId), parseFloat(applyAmount));
        if (res.success) {
            setApplyModal(null);
            loadData();
        } else {
            alert(res.error);
        }
        setApplyLoading(false);
    }

    async function handleRefund() {
        if (!refundModal || !refundAmount) return;
        setRefundLoading(true);
        const res = await refundDeposit(refundModal.id, parseFloat(refundAmount));
        if (res.success) {
            setRefundModal(null);
            loadData();
        } else {
            alert(res.error);
        }
        setRefundLoading(false);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const getAvailable = (d: any) => Number(d.amount) - Number(d.applied_amount || 0) - Number(d.refunded_amount || 0);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Active: 'text-emerald-600 bg-emerald-50 border-emerald-200',
            Applied: 'text-blue-600 bg-blue-50 border-blue-200',
            Refunded: 'text-amber-600 bg-amber-50 border-amber-200',
        };
        return map[status] || 'text-gray-600 bg-gray-50 border-gray-200';
    };

    const filtered = deposits.filter(d => {
        if (statusFilter && d.status !== statusFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return d.deposit_number?.toLowerCase().includes(q) ||
            d.patient_id?.toLowerCase().includes(q);
    });

    return (
        <AppShell pageTitle="Deposits & Advances" pageIcon={<Wallet className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Patient Deposits & Advances</h1>
                    <p className="text-sm text-gray-500 mt-1">Collect, apply, and refund patient deposits</p>
                </div>
                <button onClick={() => setShowCollect(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                    <Plus className="h-4 w-4" /> Collect Deposit
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-50 rounded-lg"><Wallet className="h-5 w-5 text-emerald-600" /></div>
                                <span className="text-sm text-gray-500">Active Deposits</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{stats?.activeDeposits || 0}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-50 rounded-lg"><IndianRupee className="h-5 w-5 text-blue-600" /></div>
                                <span className="text-sm text-gray-500">Total Collected</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{fmt(stats?.totalCollected || 0)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-teal-50 rounded-lg"><ArrowUpRight className="h-5 w-5 text-teal-600" /></div>
                                <span className="text-sm text-gray-500">Applied to Bills</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{fmt(stats?.totalApplied || 0)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-violet-50 rounded-lg"><Receipt className="h-5 w-5 text-violet-600" /></div>
                                <span className="text-sm text-gray-500">Active Balance</span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-600">{fmt(stats?.activeBalance || 0)}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input type="text" placeholder="Search by deposit # or patient ID..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                        </div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                            <option value="">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Applied">Applied</option>
                            <option value="Refunded">Refunded</option>
                        </select>
                    </div>

                    {/* Deposits Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Deposit #</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient ID</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Applied</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Refunded</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Available</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-16 text-center text-gray-400 text-sm">No deposits found</td>
                                        </tr>
                                    ) : filtered.map(d => {
                                        const available = getAvailable(d);
                                        return (
                                            <tr key={d.id} className="hover:bg-gray-50">
                                                <td className="px-5 py-3 text-sm font-medium text-gray-900">{d.deposit_number}</td>
                                                <td className="px-5 py-3 text-sm text-gray-600">{d.patient_id}</td>
                                                <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(d.amount))}</td>
                                                <td className="px-5 py-3 text-sm text-teal-600 text-right">{fmt(Number(d.applied_amount || 0))}</td>
                                                <td className="px-5 py-3 text-sm text-amber-600 text-right">{fmt(Number(d.refunded_amount || 0))}</td>
                                                <td className="px-5 py-3 text-sm font-semibold text-emerald-600 text-right">{fmt(available)}</td>
                                                <td className="px-5 py-3 text-sm text-gray-600">{d.payment_method}</td>
                                                <td className="px-5 py-3 text-center">
                                                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(d.status)}`}>
                                                        {d.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-gray-500">{new Date(d.created_at).toLocaleDateString('en-IN')}</td>
                                                <td className="px-5 py-3 text-center">
                                                    {d.status === 'Active' && available > 0 && (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button onClick={() => openApplyModal(d)}
                                                                className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                                                                Apply
                                                            </button>
                                                            <button onClick={() => { setRefundModal(d); setRefundAmount(''); }}
                                                                className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition">
                                                                Refund
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Collect Deposit Modal */}
            {showCollect && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Collect Deposit</h3>
                            <button onClick={() => setShowCollect(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Patient ID *</label>
                                <input type="text" value={collectForm.patient_id} onChange={e => setCollectForm({ ...collectForm, patient_id: e.target.value })}
                                    placeholder="e.g. PAT-001" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Admission ID (optional)</label>
                                <input type="text" value={collectForm.admission_id} onChange={e => setCollectForm({ ...collectForm, admission_id: e.target.value })}
                                    placeholder="Leave empty for OPD deposits" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                                    <input type="number" value={collectForm.amount} onChange={e => setCollectForm({ ...collectForm, amount: e.target.value })}
                                        placeholder="0.00" min="1" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                    <select value={collectForm.payment_method} onChange={e => setCollectForm({ ...collectForm, payment_method: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                        <option>Cash</option>
                                        <option>Card</option>
                                        <option>UPI</option>
                                        <option>Bank Transfer</option>
                                        <option>Cheque</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
                                <input type="text" value={collectForm.payment_ref} onChange={e => setCollectForm({ ...collectForm, payment_ref: e.target.value })}
                                    placeholder="Cheque #, UPI ref, etc." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea value={collectForm.notes} onChange={e => setCollectForm({ ...collectForm, notes: e.target.value })}
                                    rows={2} placeholder="Optional notes..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowCollect(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleCollect} disabled={collectLoading || !collectForm.patient_id || !collectForm.amount}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2">
                                {collectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Collect Deposit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Apply to Invoice Modal */}
            {applyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Apply Deposit to Invoice</h3>
                            <button onClick={() => setApplyModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                            <p className="text-sm text-emerald-800">
                                <span className="font-semibold">{applyModal.deposit_number}</span> — Available: <span className="font-bold">{fmt(getAvailable(applyModal))}</span>
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Select Invoice *</label>
                                <select value={applyInvoiceId} onChange={e => setApplyInvoiceId(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                    <option value="">Choose an invoice...</option>
                                    {invoices.map(inv => (
                                        <option key={inv.id} value={inv.id}>
                                            {inv.invoice_number} — Balance: {fmt(Number(inv.balance_due || 0))} ({inv.status})
                                        </option>
                                    ))}
                                </select>
                                {invoices.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">No unpaid invoices found for this patient</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Apply *</label>
                                <input type="number" value={applyAmount} onChange={e => setApplyAmount(e.target.value)}
                                    placeholder="0.00" min="1" max={getAvailable(applyModal)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setApplyModal(null)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleApply} disabled={applyLoading || !applyInvoiceId || !applyAmount}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2">
                                {applyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                Apply Deposit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Refund Modal */}
            {refundModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Refund Deposit</h3>
                            <button onClick={() => setRefundModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                            <p className="text-sm text-amber-800">
                                <span className="font-semibold">{refundModal.deposit_number}</span> — Available: <span className="font-bold">{fmt(getAvailable(refundModal))}</span>
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Refund Amount *</label>
                            <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                                placeholder="0.00" min="1" max={getAvailable(refundModal)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setRefundModal(null)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleRefund} disabled={refundLoading || !refundAmount}
                                className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition disabled:opacity-50 flex items-center gap-2">
                                {refundLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownRight className="h-4 w-4" />}
                                Process Refund
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AppShell>
    );
}
