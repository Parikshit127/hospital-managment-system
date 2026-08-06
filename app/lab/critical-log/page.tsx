'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { PhoneCall, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { getCriticalCallbacks } from '@/app/actions/lab-actions';

type Callback = {
    id: number;
    barcode: string | null;
    logged_by: string;
    created_at: string;
    notified_name: string;
    notified_role: string;
    read_back_confirmed: boolean;
    remarks: string;
};

export default function CriticalCallbackLogPage() {
    const [rows, setRows] = useState<Callback[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const res = await getCriticalCallbacks();
        if (res.success) setRows(res.data as Callback[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    return (
        <AppShell pageTitle="Critical-Value Callback Log" pageIcon={<PhoneCall className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-red-500" /></div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <PhoneCall className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">No critical-value callbacks logged yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date / Time</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Barcode</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Notified</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Read-back</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Remarks</th>
                                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Logged by</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="px-5 py-3.5 text-gray-600">{new Date(r.created_at).toLocaleString('en-GB')}</td>
                                        <td className="px-5 py-3.5 font-mono text-xs text-gray-700">{r.barcode || '—'}</td>
                                        <td className="px-5 py-3.5">
                                            <span className="font-semibold text-gray-900">{r.notified_name || '—'}</span>
                                            {r.notified_role && <span className="text-xs text-gray-400 ml-1">({r.notified_role})</span>}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {r.read_back_confirmed
                                                ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold"><CheckCircle className="h-3.5 w-3.5" /> Confirmed</span>
                                                : <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-bold"><XCircle className="h-3.5 w-3.5" /> Not confirmed</span>}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-600 max-w-xs truncate">{r.remarks || '—'}</td>
                                        <td className="px-5 py-3.5 text-gray-500 text-xs">{r.logged_by}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
