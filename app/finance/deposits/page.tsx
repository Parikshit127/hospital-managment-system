'use client';

import { useState, useEffect } from 'react';
import {
    collectDeposit, getPatientDeposits, getActiveDeposits,
    applyDepositToInvoice, refundDeposit, getDepositStats, cancelDeposit,
} from '@/app/actions/deposit-actions';
import { getInvoices, searchPatientsForBilling } from '@/app/actions/finance-actions';
import { getRegisteredPanForPatient } from '@/app/actions/deposit-actions';
import { getCashComplianceConfig } from '@/app/actions/cash-compliance-actions';
import { CASH_COMPLIANCE_DEFAULTS, isValidPan, normalizePan } from '@/app/lib/cash-compliance';
import {
    Loader2, Search, Plus, Wallet, ArrowUpRight, ArrowDownRight,
    CheckCircle, XCircle, IndianRupee, Receipt, CreditCard, RefreshCw,
    ChevronDown, X, Printer, AlertTriangle, Ban,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';

export default function DepositsPage() {
    const toast = useToast();
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
    // Patient picker (search by name / phone / ID instead of free-typed UHID)
    const [patientSearch, setPatientSearch] = useState('');
    const [patientResults, setPatientResults] = useState<any[]>([]);
    const [searchingPatient, setSearchingPatient] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    // Cash compliance (PAN capture + limit) — thresholds from Finance Settings
    const [cashThresholds, setCashThresholds] = useState<{ pan_threshold: number; cash_limit: number }>(CASH_COMPLIANCE_DEFAULTS);
    const [panNumber, setPanNumber] = useState('');
    const [panName, setPanName] = useState('');
    const [registeredPan, setRegisteredPan] = useState<string | null>(null);

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
    const [cancelLoading, setCancelLoading] = useState<number | null>(null);

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        getCashComplianceConfig().then((res) => {
            if (res.success && res.data) setCashThresholds({ pan_threshold: res.data.pan_threshold, cash_limit: res.data.cash_limit });
        });
    }, []);

    // Resolve the patient's PAN already on file so high-value cash deposits skip re-capture.
    useEffect(() => {
        const id = collectForm.patient_id.trim();
        if (!id) { setRegisteredPan(null); return; }
        const t = setTimeout(async () => {
            const res = await getRegisteredPanForPatient(id);
            setRegisteredPan(res.success ? (res.data?.pan ?? null) : null);
        }, 400);
        return () => clearTimeout(t);
    }, [collectForm.patient_id]);

    // Debounced patient search (by name / phone / UHID).
    useEffect(() => {
        if (selectedPatient || patientSearch.trim().length < 2) { setPatientResults([]); return; }
        setSearchingPatient(true);
        const t = setTimeout(async () => {
            const res = await searchPatientsForBilling(patientSearch.trim());
            setPatientResults(res.success ? (res.data || []) : []);
            setSearchingPatient(false);
        }, 350);
        return () => clearTimeout(t);
    }, [patientSearch, selectedPatient]);

    function selectPatient(p: any) {
        setSelectedPatient(p);
        setCollectForm(f => ({ ...f, patient_id: p.patient_id }));
        setPatientSearch('');
        setPatientResults([]);
    }

    function clearPatient() {
        setSelectedPatient(null);
        setCollectForm(f => ({ ...f, patient_id: '' }));
        setRegisteredPan(null);
        setPatientSearch('');
        setPatientResults([]);
    }

    const depositAmt = parseFloat(collectForm.amount) || 0;
    const depositIsCash = collectForm.payment_method === 'Cash';
    const depositCashBlocked = depositIsCash && depositAmt > cashThresholds.cash_limit;
    const depositPanRequired = depositIsCash && depositAmt >= cashThresholds.pan_threshold && !depositCashBlocked;
    const depositHasRegisteredPan = isValidPan(registeredPan);
    const depositPanNeedsCapture = depositPanRequired && !depositHasRegisteredPan;
    const depositPanProvidedValid = isValidPan(panNumber) && panName.trim().length > 0;
    const collectBlocked = depositCashBlocked || (depositPanNeedsCapture && !depositPanProvidedValid);

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
        if (collectBlocked) return;
        setCollectLoading(true);
        const res = await collectDeposit({
            patient_id: collectForm.patient_id,
            admission_id: collectForm.admission_id || undefined,
            amount: parseFloat(collectForm.amount),
            payment_method: collectForm.payment_method,
            payment_ref: collectForm.payment_ref || undefined,
            payer_pan_number: depositIsCash ? panNumber.trim().toUpperCase() : undefined,
            payer_pan_name: depositIsCash ? panName.trim() : undefined,
            notes: collectForm.notes || undefined,
        });
        if (res.success) {
            setShowCollect(false);
            setCollectForm({ patient_id: '', amount: '', payment_method: 'Cash', payment_ref: '', notes: '', admission_id: '' });
            setPanNumber(''); setPanName(''); setRegisteredPan(null);
            setSelectedPatient(null); setPatientSearch(''); setPatientResults([]);
            loadData();
            if (res.data?.id) {
                window.open(`/api/deposit/${res.data.id}/receipt`, '_blank');
            }
        } else {
            toast.error(res.error || 'Failed to collect deposit');
        }
        setCollectLoading(false);
    }

    async function openApplyModal(deposit: any) {
        setApplyModal(deposit);
        setApplyAmount('');
        setApplyInvoiceId('');
        const invRes = await getInvoices({ patient_id: deposit.patient_id });
        // Applicable = invoices that still owe money. Filter on the actual
        // outstanding balance, not status: a header can drift to "Paid" while a
        // balance remains (e.g. a held deposit), and that must still be settleable.
        if (invRes.success) setInvoices((invRes.data || []).filter((i: any) => Number(i.balance_due || 0) > 0 && i.status !== 'Cancelled'));
    }

    async function handleApply() {
        if (!applyModal || !applyInvoiceId || !applyAmount) return;
        setApplyLoading(true);
        const res = await applyDepositToInvoice(applyModal.id, parseInt(applyInvoiceId), parseFloat(applyAmount));
        if (res.success) {
            setApplyModal(null);
            loadData();
        } else {
            toast.error(res.error || 'Failed to apply deposit');
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
            toast.error(res.error || 'Failed to process refund');
        }
        setRefundLoading(false);
    }

    async function handleCancel(depositId: number) {
        if (!window.confirm('Cancel this deposit? This action cannot be undone.')) return;
        setCancelLoading(depositId);
        const res = await cancelDeposit(depositId);
        if (res.success) {
            loadData();
        } else {
            toast.error(res.error || 'Failed to cancel deposit');
        }
        setCancelLoading(null);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const getAvailable = (d: any) => Number(d.amount) - Number(d.applied_amount || 0) - Number(d.refunded_amount || 0);

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Active: 'text-emerald-600 bg-emerald-50 border-emerald-200',
            Applied: 'text-blue-600 bg-blue-50 border-blue-200',
            Refunded: 'text-amber-600 bg-amber-50 border-amber-200',
            Cancelled: 'text-red-600 bg-red-50 border-red-200',
        };
        return map[status] || 'text-gray-600 bg-gray-50 border-gray-200';
    };

    const filtered = deposits.filter(d => {
        if (statusFilter && d.status !== statusFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return d.deposit_number?.toLowerCase().includes(q) ||
            d.patient_id?.toLowerCase().includes(q) ||
            d.patient_name?.toLowerCase().includes(q);
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
                                <div className="p-2 bg-orange-50 rounded-lg"><ArrowUpRight className="h-5 w-5 text-orange-600" /></div>
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
                            <input type="text" placeholder="Search by deposit #, patient name or ID..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                        </div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                            <option value="">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Applied">Applied</option>
                            <option value="Refunded">Refunded</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>

                    {/* Deposits Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Deposit #</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
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
                                                <td className="px-5 py-3">
                                                    <div className="text-sm font-medium text-gray-900">{d.patient_name || '—'}</div>
                                                    <div className="text-xs text-gray-500">{d.patient_id}</div>
                                                </td>
                                                <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(d.amount))}</td>
                                                <td className="px-5 py-3 text-sm text-orange-600 text-right">{fmt(Number(d.applied_amount || 0))}</td>
                                                <td className="px-5 py-3 text-sm text-amber-600 text-right">{fmt(Number(d.refunded_amount || 0))}</td>
                                                <td className="px-5 py-3 text-sm font-semibold text-emerald-600 text-right">{fmt(available)}</td>
                                                <td className="px-5 py-3 text-sm text-gray-600">{d.payment_method}</td>
                                                <td className="px-5 py-3 text-center">
                                                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(d.status)}`}>
                                                        {d.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-gray-500">{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                                                <td className="px-5 py-3 text-center">
                                                    <div className="flex flex-wrap items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => window.open(`/api/deposit/${d.id}/receipt`, '_blank')}
                                                            className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition flex items-center gap-1"
                                                            title="Print deposit receipt"
                                                        >
                                                            <Printer className="h-3 w-3" /> Receipt
                                                        </button>
                                                        {d.status === 'Active' && available > 0 && (
                                                            <>
                                                                <button onClick={() => openApplyModal(d)}
                                                                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                                                                    Apply
                                                                </button>
                                                                <button onClick={() => { setRefundModal(d); setRefundAmount(''); }}
                                                                    className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition">
                                                                    Refund
                                                                </button>
                                                            </>
                                                        )}
                                                        {d.status === 'Active' && Number(d.applied_amount || 0) === 0 && (
                                                            <button onClick={() => handleCancel(d.id)}
                                                                disabled={cancelLoading === d.id}
                                                                className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition flex items-center gap-1 disabled:opacity-50">
                                                                {cancelLoading === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                                                                Cancel
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
                </div>
            )}

            {/* Collect Deposit Modal */}
            {showCollect && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Collect Deposit</h3>
                            <button onClick={() => { setShowCollect(false); clearPatient(); }} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
                                {selectedPatient ? (
                                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{selectedPatient.full_name}</p>
                                            <p className="text-[11px] text-gray-500 font-mono truncate">
                                                {selectedPatient.patient_id}
                                                {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}
                                                {selectedPatient.age != null ? ` · ${selectedPatient.age}Y` : ''}
                                                {selectedPatient.gender ? ` · ${selectedPatient.gender}` : ''}
                                            </p>
                                        </div>
                                        <button onClick={clearPatient} className="shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-900 underline">Change</button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input type="text" value={patientSearch} onChange={e => setPatientSearch(e.target.value)}
                                            placeholder="Search by name, phone, or UHID…" autoComplete="off"
                                            className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                        {searchingPatient && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />}
                                        {patientResults.length > 0 && (
                                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
                                                {patientResults.map(p => (
                                                    <button key={p.patient_id} type="button" onClick={() => selectPatient(p)}
                                                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition">
                                                        <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                                                        <p className="text-[11px] text-gray-500 font-mono">
                                                            {p.patient_id}{p.phone ? ` · ${p.phone}` : ''}{p.age != null ? ` · ${p.age}Y` : ''}{p.gender ? ` · ${p.gender}` : ''}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {patientSearch.trim().length >= 2 && !searchingPatient && patientResults.length === 0 && (
                                            <p className="text-[11px] text-gray-400 mt-1">No matching patients.</p>
                                        )}
                                    </div>
                                )}
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
                                        <option>NEFT_RTGS</option>
                                        <option>Cheque</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
                                <input type="text" value={collectForm.payment_ref} onChange={e => setCollectForm({ ...collectForm, payment_ref: e.target.value })}
                                    placeholder="Cheque #, UPI ref, etc." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>

                            {/* Cash compliance — block over limit / capture PAN at threshold */}
                            {depositCashBlocked && (
                                <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>Cash deposits above ₹{cashThresholds.cash_limit.toLocaleString('en-IN')} are not permitted. Please use UPI, Card, Bank Transfer, or another approved method.</span>
                                </div>
                            )}
                            {depositPanRequired && depositHasRegisteredPan && (
                                <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-lg">
                                    <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>PAN on file from registration ({normalizePan(registeredPan)}) will be recorded on this deposit — no re-entry needed.</span>
                                </div>
                            )}
                            {depositPanNeedsCapture && (
                                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                    <div className="flex items-start gap-2 text-xs font-medium text-amber-800">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                                        <span>PAN details are mandatory for cash deposits of ₹{cashThresholds.pan_threshold.toLocaleString('en-IN')} or more.</span>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">PAN Number *</label>
                                        <input type="text" value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())}
                                            placeholder="ABCDE1234F" maxLength={10}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-amber-500" />
                                        {panNumber.length > 0 && !isValidPan(panNumber) && (
                                            <p className="text-[11px] text-rose-500 mt-1">Invalid PAN format. Expected: ABCDE1234F.</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">PAN Holder Name *</label>
                                        <input type="text" value={panName} onChange={e => setPanName(e.target.value)}
                                            placeholder="As per PAN card"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea value={collectForm.notes} onChange={e => setCollectForm({ ...collectForm, notes: e.target.value })}
                                    rows={2} placeholder="Optional notes..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => { setShowCollect(false); clearPatient(); }} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleCollect} disabled={collectLoading || !collectForm.patient_id || !collectForm.amount || collectBlocked}
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
                            <p className="text-sm font-semibold text-emerald-900">
                                {applyModal.patient_name || '—'} <span className="font-normal text-emerald-700">({applyModal.patient_id})</span>
                            </p>
                            <p className="text-sm text-emerald-800 mt-0.5">
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
                                            {inv.invoice_number || 'Draft (unsaved)'} — Balance: {fmt(Number(inv.balance_due || 0))} ({inv.status})
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
                            <p className="text-sm font-semibold text-amber-900">
                                {refundModal.patient_name || '—'} <span className="font-normal text-amber-700">({refundModal.patient_id})</span>
                            </p>
                            <p className="text-sm text-amber-800 mt-0.5">
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
