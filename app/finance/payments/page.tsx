'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { CreditCard, Search, ArrowUpRight, Filter } from 'lucide-react';
import { getPaymentLedger } from '@/app/actions/finance-actions';

export default function PaymentsLedgerPage() {
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [methodFilter, setMethodFilter] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getPaymentLedger({ method: methodFilter || undefined, limit: 1000 });
        if (res.success) setPayments(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [methodFilter]);

    return (
        <AppShell
            pageTitle="Payment Ledger"
            pageIcon={<CreditCard className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[500px]">
                <div className="p-6 bg-gray-50 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-xl font-black text-gray-900">Global Ledger</h2>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Transaction History</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <select
                                value={methodFilter}
                                onChange={e => setMethodFilter(e.target.value)}
                                className="w-full pl-10 pr-8 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none cursor-pointer transition-colors shadow-sm"
                            >
                                <option value="">All Tenders</option>
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="UPI">UPI</option>
                                <option value="Insurance">Insurance / TPA</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto p-0">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest sticky top-0">
                            <tr>
                                <th className="px-6 py-4">Receipt #</th>
                                <th className="px-6 py-4">Timestamp (UTC)</th>
                                <th className="px-6 py-4">Patient Link</th>
                                <th className="px-6 py-4">Tender</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4 text-right">Credit (₹)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {payments.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50/70 transition-colors group">
                                    <td className="px-6 py-4 font-black flex items-center gap-2">
                                        <ArrowUpRight className={`h-4 w-4 ${p.payment_type === 'Refund' ? 'rotate-180 text-rose-500' : 'text-emerald-500'}`} />
                                        <span className="text-gray-900">{p.receipt_number}</span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-500">{new Date(p.created_at).toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer">{p.invoice?.invoice_number}</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{p.invoice?.patient?.full_name}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 text-[10px] uppercase tracking-wider font-bold rounded-lg border ${p.payment_method === 'Cash' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                p.payment_method === 'Card' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                                    p.payment_method === 'UPI' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        'bg-gray-50 text-gray-700 border-gray-200'
                                            }`}>
                                            {p.payment_method}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 font-medium">{p.payment_type}</td>
                                    <td className={`px-6 py-4 font-black text-right ${p.payment_type === 'Refund' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {p.payment_type === 'Refund' ? '-' : '+'}₹{Number(p.amount).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            {payments.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-gray-500 font-medium">
                                        No payment records found matching criteria.
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
