'use client';

import { useState, useEffect } from 'react';
import {
    createCreditNote, approveCreditNote, getCreditNotes,
} from '@/app/actions/deposit-actions';
import { getInvoices } from '@/app/actions/finance-actions';
import {
    Loader2, Plus, FileText, CheckCircle, Clock, X,
    IndianRupee, Search, AlertCircle, Receipt,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function CreditNotesPage() {
    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [createForm, setCreateForm] = useState({
        original_invoice_id: '', reason: '', total_amount: '', notes: '', items: '',
    });
    const [createLoading, setCreateLoading] = useState(false);
    const [invoiceLoading, setInvoiceLoading] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getCreditNotes(statusFilter ? { status: statusFilter } : undefined);
        if (res.success) setNotes(res.data || []);
        setLoading(false);
    }

    useEffect(() => { loadData(); }, [statusFilter]);

    async function openCreateModal() {
        setShowCreate(true);
        setCreateForm({ original_invoice_id: '', reason: '', total_amount: '', notes: '', items: '' });
        setInvoiceLoading(true);
        const invRes = await getInvoices({});
        if (invRes.success) setInvoices((invRes.data || []).filter((i: any) => i.status !== 'Cancelled'));
        setInvoiceLoading(false);
    }

    async function handleCreate() {
        if (!createForm.original_invoice_id || !createForm.reason || !createForm.total_amount) return;
        setCreateLoading(true);
        const res = await createCreditNote({
            original_invoice_id: parseInt(createForm.original_invoice_id),
            reason: createForm.reason,
            total_amount: parseFloat(createForm.total_amount),
            notes: createForm.notes || undefined,
            items: createForm.items || undefined,
        });
        if (res.success) {
            setShowCreate(false);
            loadData();
        } else {
            alert(res.error);
        }
        setCreateLoading(false);
    }

    async function handleApprove(id: number) {
        if (!confirm('Approve this credit note?')) return;
        const res = await approveCreditNote(id);
        if (res.success) loadData();
        else alert(res.error);
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const getStatusColor = (status: string) => {
        const map: Record<string, string> = {
            Draft: 'text-slate-600 bg-slate-50 border-slate-200',
            Approved: 'text-emerald-600 bg-emerald-50 border-emerald-200',
            Applied: 'text-blue-600 bg-blue-50 border-blue-200',
        };
        return map[status] || 'text-gray-600 bg-gray-50 border-gray-200';
    };

    const totalDraft = notes.filter(n => n.status === 'Draft').length;
    const totalApproved = notes.filter(n => n.status === 'Approved').length;
    const totalAmount = notes.reduce((s, n) => s + Number(n.total_amount), 0);

    const filtered = notes.filter(n => {
        if (!search) return true;
        const q = search.toLowerCase();
        return n.credit_note_number?.toLowerCase().includes(q) ||
            n.reason?.toLowerCase().includes(q) ||
            n.original_invoice?.invoice_number?.toLowerCase().includes(q);
    });

    return (
        <AppShell pageTitle="Credit Notes" pageIcon={<Receipt className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Credit Notes</h1>
                    <p className="text-sm text-gray-500 mt-1">Issue credit notes for billing adjustments and corrections</p>
                </div>
                <button onClick={openCreateModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                    <Plus className="h-4 w-4" /> Create Credit Note
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
                                <div className="p-2 bg-blue-50 rounded-lg"><FileText className="h-5 w-5 text-blue-600" /></div>
                                <span className="text-sm text-gray-500">Total Credit Notes</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{notes.length}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-amber-50 rounded-lg"><Clock className="h-5 w-5 text-amber-600" /></div>
                                <span className="text-sm text-gray-500">Pending Approval</span>
                            </div>
                            <p className="text-2xl font-bold text-amber-600">{totalDraft}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
                                <span className="text-sm text-gray-500">Approved</span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-600">{totalApproved}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-violet-50 rounded-lg"><IndianRupee className="h-5 w-5 text-violet-600" /></div>
                                <span className="text-sm text-gray-500">Total Value</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{fmt(totalAmount)}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input type="text" placeholder="Search by CN #, reason, or invoice..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                        </div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                            <option value="">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Approved">Approved</option>
                            <option value="Applied">Applied</option>
                        </select>
                    </div>

                    {/* Credit Notes Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Credit Note #</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Original Invoice</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient ID</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Approved By</th>
                                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="py-16 text-center text-gray-400 text-sm">No credit notes found</td>
                                        </tr>
                                    ) : filtered.map(cn => (
                                        <tr key={cn.id} className="hover:bg-gray-50">
                                            <td className="px-5 py-3 text-sm font-medium text-gray-900">{cn.credit_note_number}</td>
                                            <td className="px-5 py-3 text-sm text-blue-600 font-medium">{cn.original_invoice?.invoice_number || '—'}</td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{cn.original_invoice?.patient_id || '—'}</td>
                                            <td className="px-5 py-3 text-sm text-gray-600 max-w-[200px] truncate">{cn.reason}</td>
                                            <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(Number(cn.total_amount))}</td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(cn.status)}`}>
                                                    {cn.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-gray-500">{new Date(cn.created_at).toLocaleDateString('en-IN')}</td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{cn.approved_by || '—'}</td>
                                            <td className="px-5 py-3 text-center">
                                                {cn.status === 'Draft' && (
                                                    <button onClick={() => handleApprove(cn.id)}
                                                        className="px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                                                        Approve
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Credit Note Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900">Create Credit Note</h3>
                            <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Original Invoice *</label>
                                {invoiceLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...</div>
                                ) : (
                                    <select value={createForm.original_invoice_id} onChange={e => setCreateForm({ ...createForm, original_invoice_id: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                        <option value="">Select an invoice...</option>
                                        {invoices.map(inv => (
                                            <option key={inv.id} value={inv.id}>
                                                {inv.invoice_number} — {fmt(Number(inv.net_amount || 0))} ({inv.status})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                                <select value={createForm.reason} onChange={e => setCreateForm({ ...createForm, reason: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                    <option value="">Select reason...</option>
                                    <option value="Billing Error">Billing Error</option>
                                    <option value="Service Not Rendered">Service Not Rendered</option>
                                    <option value="Duplicate Charge">Duplicate Charge</option>
                                    <option value="Insurance Adjustment">Insurance Adjustment</option>
                                    <option value="Patient Discount">Patient Discount</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Amount *</label>
                                <input type="number" value={createForm.total_amount} onChange={e => setCreateForm({ ...createForm, total_amount: e.target.value })}
                                    placeholder="0.00" min="1" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Items / Description</label>
                                <textarea value={createForm.items} onChange={e => setCreateForm({ ...createForm, items: e.target.value })}
                                    rows={2} placeholder="Describe the line items being credited..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                                    rows={2} placeholder="Optional internal notes..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700">Credit notes are created in Draft status and require approval before they can be applied.</p>
                        </div>
                        <div className="flex justify-end gap-3 mt-5">
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">Cancel</button>
                            <button onClick={handleCreate} disabled={createLoading || !createForm.original_invoice_id || !createForm.reason || !createForm.total_amount}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2">
                                {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                                Create Credit Note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AppShell>
    );
}
