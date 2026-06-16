'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/app/components/layout/AppShell';
import { Undo2, Search, ArrowRight, Info } from 'lucide-react';
import { getRefunds } from '@/app/actions/finance-actions';

function fmt(n: number) {
    return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function RefundsPage() {
    const [refunds, setRefunds] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getRefunds();
        if (res.success) setRefunds(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return refunds;
        return refunds.filter((r: any) =>
            String(r.invoice_id || '').toLowerCase().includes(q) ||
            String(r.payment_id || '').toLowerCase().includes(q) ||
            String(r.reason || '').toLowerCase().includes(q) ||
            String(r.processed_by || '').toLowerCase().includes(q)
        );
    }, [refunds, query]);

    return (
        <AppShell
            pageTitle="Refund History"
            pageIcon={<Undo2 className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="space-y-5">
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-rose-900">
                        <p className="font-bold mb-1">Refunds are now processed from Master Billing.</p>
                        <p>
                            Click <span className="font-bold">Process Refund</span> in the{' '}
                            <Link href="/billing" className="underline font-bold">Master Billing</Link> quick action bar
                            (or use the Refund button on any patient's invoice) to pick a paid receipt and refund it.
                            The payment receipt and invoice balance are updated automatically.
                        </p>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by invoice, payment, reason, or user…"
                                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-400/10 outline-none"
                            />
                        </div>
                        <Link
                            href="/billing"
                            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl"
                        >
                            Process Refund <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Invoice</th>
                                    <th className="px-4 py-3">Payment</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3">Reason</th>
                                    <th className="px-4 py-3">Processed By</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((r: any) => (
                                    <tr key={r.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                            {new Date(r.created_at).toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">{r.invoice_id}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.payment_id || '—'}</td>
                                        <td className="px-4 py-3 text-right font-bold text-rose-600">₹{fmt(Number(r.amount))}</td>
                                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[260px] truncate" title={r.reason}>{r.reason}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{r.processed_by || '—'}</td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={r.status} />
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-16 text-center text-gray-500">
                                            <div className="flex flex-col items-center justify-center">
                                                <Undo2 className="h-10 w-10 text-gray-300 mb-3" />
                                                <p className="font-bold">No refunds {query ? 'match your search' : 'on record'}.</p>
                                                <p className="text-xs mt-1">
                                                    Process a refund from <Link href="/billing" className="underline">Master Billing</Link>.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {loading && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-16 text-center text-xs text-gray-400">
                                            Loading refunds…
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        Processed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Pending: 'bg-amber-50 text-amber-700 border-amber-200',
        Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    const cls = map[status] || 'bg-gray-50 text-gray-700 border-gray-200';
    return (
        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${cls}`}>
            {status}
        </span>
    );
}
