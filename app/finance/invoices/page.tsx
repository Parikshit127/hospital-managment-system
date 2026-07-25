'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Search, Filter, Eye, CheckCircle2, Phone } from 'lucide-react';
import { getInvoices, approveInvoice } from '@/app/actions/finance-actions';
import { parseWalkinNote } from '@/app/lib/walkin-note';
import Link from 'next/link';

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    // OPD/IPD drill-down from the reception revenue card (?rev=opd|ipd|total).
    const [revFilter, setRevFilter] = useState<'opd' | 'ipd' | ''>('');
    useEffect(() => {
        const r = new URLSearchParams(window.location.search).get('rev');
        if (r === 'opd' || r === 'ipd') setRevFilter(r);
    }, []);

    const loadData = async () => {
        setLoading(true);
        const res = await getInvoices({
            status: statusFilter || undefined,
            limit: 500
        });
        if (res.success && res.data) setInvoices(res.data);
        setLoading(false);
    };

    const handleApprove = async (id: number, source: string) => {
        if (!confirm(`Approve this ${source} payment? Status will change to Paid/Completed.`)) return;
        setLoading(true);
        const res = await approveInvoice(id, source);
        if (res.success) {
            await loadData();
        } else {
            alert('Approval failed: ' + res.error);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [statusFilter]);


    const filtered = invoices.filter(inv => {
        const walkinName = inv.patient_id === 'WALKIN' ? parseWalkinNote(inv.notes).name : '';
        const walkinContact = inv.patient_id === 'WALKIN' ? parseWalkinNote(inv.notes).contact : '';
        // invoice_number is null by design until an invoice is finalized ("drafts are
        // numberless"), so this must be optional — an unguarded .toLowerCase() threw
        // and blanked the whole invoice list as soon as one draft existed.
        const matchesSearch = inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.patient?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            walkinName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.patient?.phone?.includes(searchTerm) ||
            walkinContact.includes(searchTerm);
        // OPD = everything that isn't IPD (matches the reception revenue card split).
        const matchesRev = !revFilter
            || (revFilter === 'ipd' ? inv.source === 'IPD' : inv.source !== 'IPD');
        return matchesSearch && matchesRev;
    });


    return (
        <AppShell
            pageTitle="Unified Invoice Registry"
            pageIcon={<FileText className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">
                <div className="p-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50 border-b border-gray-100">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            type="text"
                            placeholder="Invoice#, Patient, or Mobile..."
                            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Filter className="h-4 w-4 text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="flex-1 md:w-56 p-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none transition-colors text-gray-700 shadow-sm hover:border-gray-300"
                        >
                            <option value="">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Final">Final</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                        {revFilter && (
                            <button
                                onClick={() => setRevFilter('')}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                                title="Clear OPD/IPD filter"
                            >
                                {revFilter === 'ipd' ? 'IPD only' : 'OPD only'} ✕
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 text-[10px] md:text-xs uppercase font-extrabold tracking-wider">
                            <tr>
                                <th className="px-3 py-4">Source</th>
                                <th className="px-3 py-4">Invoice #</th>
                                <th className="px-3 py-4">Date</th>
                                <th className="px-3 py-4">Patient</th>
                                <th className="px-3 py-4 text-right">Net Amount</th>
                                <th className="px-3 py-4 text-right">Balance Due</th>
                                <th className="px-3 py-4 text-center">Status</th>
                                <th className="px-3 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map((inv: any) => (
                                <tr key={`${inv.source}-${inv.id}`} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-3 py-4">
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] md:text-[10px] font-black uppercase tracking-tight ${inv.source === 'LAB' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                                inv.source === 'PHARMACY' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                                    inv.source === 'IPD' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                        'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                            }`}>
                                            {inv.source}
                                        </span>
                                    </td>
                                    <td className="px-3 py-4 font-black flex items-center gap-1.5">
                                        <FileText className="h-4 w-4 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                                        <span className="text-gray-900 tracking-tight text-[13px]">{inv.invoice_number || 'Draft (unsaved)'}</span>
                                    </td>
                                    <td className="px-3 py-4 font-medium text-gray-500 text-[13px]">{new Date(inv.created_at).toLocaleDateString('en-GB')}</td>
                                    <td className="px-3 py-4">
                                        <div className="flex items-center gap-2">
                                            <p className="font-extrabold text-gray-900 leading-tight text-[13px]">
                                                {inv.patient_id === 'WALKIN'
                                                    ? (parseWalkinNote(inv.notes).name || 'Walk-in Patient')
                                                    : (inv.patient?.full_name || 'Walk-in Patient')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold mt-0.5">
                                            <Phone className="h-2 w-2" />
                                            <span>
                                                {inv.patient_id === 'WALKIN'
                                                    ? (parseWalkinNote(inv.notes).contact || inv.patient?.phone || 'N/A')
                                                    : (inv.patient?.phone || 'N/A')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-4 font-black text-gray-900 text-right text-[15px] leading-none">
                                        <span className="text-[10px] text-gray-400 font-medium mr-0.5">₹</span>
                                        {Number(inv.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-4 font-black text-rose-600 text-right text-[15px] leading-none">
                                        <span className="text-[10px] text-rose-300 font-medium mr-0.5">₹</span>
                                        {Number(inv.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-4 text-center">
                                        <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-extrabold rounded-full ${inv.status === 'Final' ? 'bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200' :
                                                    inv.status === 'Draft' ? 'bg-gray-100 text-gray-700 shadow-sm border border-gray-200' :
                                                        inv.status === 'Cancelled' ? 'bg-rose-100 text-rose-700 shadow-sm border border-rose-200' :
                                                            'bg-gray-100 text-gray-600 shadow-sm border border-gray-200'
                                            }`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-4 text-right flex items-center justify-end gap-1.5">
                                        {inv.status === 'Draft' && (
                                            <button
                                                onClick={() => handleApprove(inv.id, inv.source)}
                                                className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-white font-black bg-emerald-50 hover:bg-emerald-600 px-2.5 py-1.5 rounded-lg transition-all shadow-sm active:scale-95"
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                            </button>
                                        )}
                                        {inv.source !== 'LAB' && inv.source !== 'PHARMACY' && (
                                            <Link href={`/finance/invoices/${inv.id}`} className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-white font-black bg-indigo-50 hover:bg-indigo-600 px-2.5 py-1.5 rounded-lg transition-all shadow-sm">
                                                <Eye className="h-3.5 w-3.5" /> View
                                            </Link>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-16 text-center text-gray-500 font-medium">
                                        No invoices found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
