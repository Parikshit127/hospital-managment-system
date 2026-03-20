'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Undo2, Search, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { getRefunds, updateRefundStatus, requestRefund } from '@/app/actions/finance-actions';
import { useToast } from '@/app/components/ui/Toast';

export default function RefundsPage() {
    const toast = useToast();
    const [refunds, setRefunds] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Quick Form
    const [invId, setInvId] = useState('');
    const [amt, setAmt] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const res = await getRefunds();
        if (res.success) setRefunds(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const processStatus = async (id: number, status: string) => {
        const res = await updateRefundStatus(id, status);
        if (res.success) loadData();
        else toast.error('Failed to update status.');
    };

    const handleRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const res = await requestRefund({
            invoice_id: invId,
            amount: Number(amt),
            reason
        });
        setSubmitting(false);
        if (res.success) {
            setInvId(''); setAmt(''); setReason('');
            toast.success('Refund successfully queued for manager approval.');
            loadData();
        } else toast.error('Failed to queue refund.');
    };

    return (
        <AppShell
            pageTitle="Refund Processing"
            pageIcon={<Undo2 className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="grid lg:grid-cols-4 gap-8">
                {/* Left Controls */}
                <div className="lg:col-span-1">
                    <form onSubmit={handleRequest} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6 sticky top-24">
                        <div>
                            <h3 className="font-black text-gray-900 mb-1">Queue New Refund</h3>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-4 mb-4">Manual Override</p>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Invoice Number *</label>
                            <input required value={invId} onChange={e => setInvId(e.target.value)} type="text" placeholder="e.g. INV-2026..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-500/20 text-sm font-bold uppercase transition-colors outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Refund Value (₹) *</label>
                            <input required value={amt} onChange={e => setAmt(e.target.value)} type="number" min="1" step="0.01" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-500/20 text-sm font-bold transition-colors outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Auditor Justification *</label>
                            <textarea required value={reason} onChange={e => setReason(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-500/20 text-sm font-medium transition-colors outline-none min-h-[90px]" />
                        </div>

                        <button disabled={submitting} type="submit" className="w-full mt-6 py-4 bg-gray-900 hover:bg-black text-white font-black rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2">
                            {submitting ? 'Submitting...' : <><Undo2 className="h-5 w-5" /> Queue to L2 Approval</>}
                        </button>
                    </form>
                </div>

                {/* Right Viewport */}
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center gap-4">
                            <Undo2 className="h-5 w-5 text-gray-400" />
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Refund Approval Queue</h2>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Pending Management Authorization</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-white border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Request TS</th>
                                        <th className="px-6 py-4">Origin Invoice</th>
                                        <th className="px-6 py-4 text-right">Refund Amount (₹)</th>
                                        <th className="px-6 py-4">Status & Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {refunds.map((r: any) => (
                                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-5 font-medium text-gray-500">
                                                {new Date(r.created_at).toLocaleString()}
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mt-1">By: {r.processed_by || 'System'}</div>
                                            </td>
                                            <td className="px-6 py-5 font-black text-indigo-700 tracking-wider">
                                                {r.invoice_id}
                                                <div className="mt-2 text-xs font-medium text-gray-500 whitespace-normal min-w-[200px] border-l-2 border-gray-200 pl-2"> "{r.reason}"</div>
                                            </td>
                                            <td className="px-6 py-5 font-black text-rose-600 text-right text-lg">₹{Number(r.amount).toFixed(2)}</td>
                                            <td className="px-6 py-5">
                                                {r.status === 'Pending' ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => processStatus(r.id, 'Approved')} className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 font-bold px-3 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1 transition-colors shadow-sm"><CheckCircle2 className="h-4 w-4" />Approve</button>
                                                        <button onClick={() => processStatus(r.id, 'Rejected')} className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 font-bold px-3 py-2 rounded-xl text-xs uppercase tracking-wider flex items-center gap-1 transition-colors shadow-sm"><XCircle className="h-4 w-4" />Reject</button>
                                                    </div>
                                                ) : (
                                                    <span className={`px-4 py-2 text-[10px] uppercase tracking-widest font-black rounded-xl border flex items-center gap-2 w-max ${r.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                            r.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                'bg-gray-50 text-gray-700 border-gray-200'
                                                        }`}>
                                                        {r.status === 'Approved' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                                        {r.status}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {refunds.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-16 text-center text-gray-500">
                                                <div className="flex flex-col items-center justify-center">
                                                    <Undo2 className="h-10 w-10 text-gray-300 mb-3" />
                                                    <p className="font-bold">No Refund Authorizations Pending.</p>
                                                    <p className="text-xs mt-1">L1 Support requests will populate here.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
