'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Search, Filter, Eye } from 'lucide-react';
import { getInvoices } from '@/app/actions/finance-actions';
import Link from 'next/link';

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getInvoices({
            status: statusFilter || undefined,
            limit: 500
        });
        if (res.success) setInvoices(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [statusFilter]);

    const filtered = invoices.filter(inv =>
    (inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.patient?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <AppShell
            pageTitle="Invoice Registry"
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
                            placeholder="Search by Invoice No. or Patient..."
                            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-colors"
                        />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full md:w-auto p-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none transition-colors text-gray-700">
                        <option value="">All Statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="Final">Final</option>
                        <option value="Partial">Partial</option>
                        <option value="Paid">Paid</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Invoice #</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4 text-right">Net Amount</th>
                                <th className="px-6 py-4 text-right">Balance Due</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4 font-black flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                                        <span className="text-gray-900">{inv.invoice_number}</span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-gray-900">{inv.patient?.full_name}</p>
                                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{inv.invoice_type}</p>
                                    </td>
                                    <td className="px-6 py-4 font-black text-gray-900 text-right">₹{Number(inv.net_amount).toFixed(2)}</td>
                                    <td className="px-6 py-4 font-black text-rose-600 text-right">₹{Number(inv.balance_due).toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                inv.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
                                                    inv.status === 'Draft' ? 'bg-gray-100 text-gray-700' :
                                                        inv.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' :
                                                            'bg-indigo-100 text-indigo-700'
                                            }`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/finance/invoices/${inv.id}`} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                                            <Eye className="h-4 w-4" /> View
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-gray-500 font-medium">
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
