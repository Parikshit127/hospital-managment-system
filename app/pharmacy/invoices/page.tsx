'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Search, Eye } from 'lucide-react';
import { getInvoices } from '@/app/actions/finance-actions';
import Link from 'next/link';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const STATUS_COLOR: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    Final: 'bg-blue-100 text-blue-700',
    Paid: 'bg-emerald-100 text-emerald-700',
    Partial: 'bg-amber-100 text-amber-700',
    Cancelled: 'bg-red-100 text-red-700',
};

export default function PharmacyInvoicesPage() {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const load = async () => {
        setLoading(true);
        const res = await getInvoices({
            invoice_type: 'PHARMACY',
            status: statusFilter || undefined,
            limit: 500,
        });
        if (res.success && res.data) setInvoices(res.data);
        setLoading(false);
    };

    useEffect(() => { load(); }, [statusFilter]);

    const filtered = invoices.filter(inv =>
        !search ||
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.patient?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        inv.patient?.phone?.includes(search)
    );

    return (
        <AppShell
            pageTitle="Customer Invoices"
            pageIcon={<FileText className="h-5 w-5" />}
            onRefresh={load}
            refreshing={loading}
        >
            <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by invoice #, patient name, or phone..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                    >
                        <option value="">All Statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="Final">Final</option>
                        <option value="Paid">Paid</option>
                        <option value="Partial">Partial</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Invoice #</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Patient</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Phone</th>
                                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Balance</th>
                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-16 text-center text-gray-400 text-sm">Loading...</td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-16 text-center text-gray-400 text-sm">No pharmacy invoices found</td>
                                    </tr>
                                ) : filtered.map((inv: any) => (
                                    <tr key={inv.id} className="hover:bg-orange-50/30 transition-colors">
                                        <td className="px-5 py-3 font-mono font-bold text-gray-900">{inv.invoice_number}</td>
                                        <td className="px-5 py-3 font-medium text-gray-800">{inv.patient?.full_name || '-'}</td>
                                        <td className="px-5 py-3 text-gray-500">{inv.patient?.phone || '-'}</td>
                                        <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(Number(inv.net_amount || inv.total_amount || 0))}</td>
                                        <td className="px-5 py-3 text-right font-bold text-rose-600">{fmt(Number(inv.balance_due || 0))}</td>
                                        <td className="px-5 py-3 text-center">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {inv.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-center text-xs text-gray-500">
                                            {new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <Link href={`/pharmacy/invoices/${inv.id}/view`} target="_blank"
                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold rounded-lg hover:bg-orange-100 transition-colors">
                                                <Eye className="h-3 w-3" /> View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                            Showing {filtered.length} pharmacy invoice{filtered.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
