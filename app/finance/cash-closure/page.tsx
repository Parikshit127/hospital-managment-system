'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { Wallet, ShieldAlert, CheckCircle2, History } from 'lucide-react';
import { performCashClosure, getCashClosures } from '@/app/actions/finance-actions';

export default function CashClosurePage() {
    const [closures, setClosures] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [notes, setNotes] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getCashClosures();
        if (res.success) setClosures(res.data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleClosure = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirm('Are you sure you want to perform EOD Cash Closure? This will lock current balances.')) return;

        setClosing(true);
        const res = await performCashClosure({ notes });
        setClosing(false);

        if (res.success) {
            setNotes('');
            loadData();
            alert(`Drawer successfully closed with Cash Total: ₹${Number(res.data.cash_total).toFixed(2)}`);
        } else {
            alert('Closure failed: ' + res.error);
        }
    };

    return (
        <AppShell
            pageTitle="End of Day Closure"
            pageIcon={<Wallet className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
        >
            <div className="grid lg:grid-cols-3 gap-8 pb-12">

                {/* Left: Perform Closure */}
                <div className="lg:col-span-1 border border-gray-200 rounded-3xl p-6 bg-white shadow-sm h-min sticky top-24">
                    <div className="flex items-center gap-3 mb-6 bg-rose-50 border border-rose-100 p-4 rounded-xl text-rose-700">
                        <ShieldAlert className="h-8 w-8" />
                        <div>
                            <h3 className="font-black text-sm uppercase tracking-widest">Action Required</h3>
                            <p className="text-xs font-bold opacity-80 mt-1">Cash drawer must be tallied and closed daily before 23:59.</p>
                        </div>
                    </div>

                    <form onSubmit={handleClosure} className="space-y-6">
                        <div>
                            <label className="block text-xs uppercase tracking-widest font-bold text-gray-500 mb-2">Auditor Notes / Discrepancies</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Any physical vs system cash differences..."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-500/20 text-sm font-medium outline-none min-h-[120px] shadow-sm transition-colors"
                            />
                        </div>

                        <button disabled={closing || loading} type="submit" className="w-full py-4 bg-gray-900 hover:bg-black text-white font-black rounded-xl shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3">
                            {closing ? 'Locking Drawer...' : <><Wallet className="h-5 w-5" /> Execute Cash Closure</>}
                        </button>
                    </form>
                </div>

                {/* Right: History Log */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                        <History className="h-5 w-5 text-gray-400" />
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Closure History</h2>
                    </div>

                    {closures.map((c: any) => (
                        <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 hover:border-indigo-200 transition-colors relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>

                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4 mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Draw #{c.id} Reconciled</h3>
                                    </div>
                                    <p className="text-xs font-bold text-gray-500 mt-2 font-mono tracking-wider">{new Date(c.closure_date).toLocaleString()}</p>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-center">
                                    <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-0.5">Auditor</p>
                                    <p className="font-black text-xs">{c.closed_by}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                                <div>
                                    <p className="text-xs uppercase tracking-widest font-bold text-amber-600 mb-1">Physical Currency</p>
                                    <p className="text-2xl font-black text-gray-900">₹{Number(c.cash_total).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-widest font-bold text-indigo-600 mb-1">Credit / Debit Card</p>
                                    <p className="text-2xl font-black text-gray-900">₹{Number(c.card_total).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-widest font-bold text-emerald-600 mb-1">Online / UPI</p>
                                    <p className="text-2xl font-black text-gray-900">₹{Number(c.online_total).toFixed(2)}</p>
                                </div>
                            </div>

                            {c.notes && (
                                <div className="mt-6 pt-4 border-t border-dashed border-gray-200">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Discrepancy Notes</p>
                                    <p className="text-sm font-medium text-gray-600 italic">"{c.notes}"</p>
                                </div>
                            )}
                        </div>
                    ))}

                    {closures.length === 0 && !loading && (
                        <div className="p-16 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50 mt-6">
                            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                            <h3 className="text-lg font-black text-gray-900 mb-2">No Closure History</h3>
                            <p className="text-sm font-medium max-w-sm mx-auto">Tally records will populate here after the first system EOD cash drawer closure.</p>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
