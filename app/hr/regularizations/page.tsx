'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FileClock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getRegularizations, reviewRegularization } from '@/app/actions/hr-actions';
import { fmtIstDate, fmtIstTime } from '@/app/lib/ist';
import { Card, StatusPill } from '@/app/components/hr/HrBits';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

export default function RegularizationsPage() {
    const toast = useToast();
    const [filter, setFilter] = useState<Filter>('pending');
    const [rows, setRows] = useState<any[] | null>(null);
    const [busy, setBusy] = useState<number | null>(null);

    const load = useCallback(async () => {
        setRows(null);
        const res = await getRegularizations(filter);
        setRows(res.success ? res.data : []);
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const decide = async (id: number, decision: 'Approved' | 'Rejected') => {
        let note: string | undefined;
        if (decision === 'Rejected') {
            const n = window.prompt('Reason for rejecting (shown to the employee):');
            if (n === null) return;
            note = n || undefined;
        }
        setBusy(id);
        const res: any = await reviewRegularization(id, decision, note);
        setBusy(null);
        if (res.success) { toast.success(`Request ${decision.toLowerCase()}`); load(); }
        else toast.error(res.error || 'Action failed');
    };

    return (
        <AppShell pageTitle="Attendance Corrections" pageIcon={<FileClock className="h-5 w-5" />} onRefresh={load}>
            <div className="space-y-4">
                <div className="flex gap-2">
                    {(['pending', 'approved', 'rejected', 'all'] as Filter[]).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border capitalize ${filter === f ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{f}</button>
                    ))}
                </div>
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    {['Employee', 'Date', 'Requested', 'Reason', 'Status', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows === null ? (
                                    <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" /></td></tr>
                                ) : rows.length === 0 ? (
                                    <tr><td colSpan={6} className="py-12 text-center text-gray-400">No requests.</td></tr>
                                ) : rows.map(r => (
                                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                                        <td className="px-4 py-3"><p className="font-bold text-gray-900">{r.employee?.name}</p><p className="text-[10px] text-gray-400">{r.employee?.employee_code}</p></td>
                                        <td className="px-4 py-3 text-gray-700">{fmtIstDate(r.date)}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">
                                            {r.requested_in && <div>In {fmtIstTime(r.requested_in)}</div>}
                                            {r.requested_out && <div>Out {fmtIstTime(r.requested_out)}</div>}
                                            {r.requested_status && <div>{r.requested_status}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 max-w-xs"><p className="truncate">{r.reason}</p>{r.review_note && <p className="text-[11px] italic text-gray-400 truncate">{r.review_note}</p>}</td>
                                        <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                                        <td className="px-4 py-3 text-right">
                                            {r.status === 'Pending' && (busy === r.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-auto" /> : (
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => decide(r.id, 'Approved')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Approve</button>
                                                    <button onClick={() => decide(r.id, 'Rejected')} className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 hover:bg-red-100 flex items-center gap-1"><XCircle className="h-3 w-3" /> Reject</button>
                                                </div>
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </AppShell>
    );
}
