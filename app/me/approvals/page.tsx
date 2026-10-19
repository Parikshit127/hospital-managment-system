'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getMyTeamApprovals } from '@/app/actions/hr-self-service-actions';
import { approveLeave, rejectLeave, reviewRegularization } from '@/app/actions/hr-actions';
import { fmtIstDate, fmtIstTime } from '@/app/lib/ist';
import { Card } from '@/app/components/hr/HrBits';

type Data = NonNullable<Extract<Awaited<ReturnType<typeof getMyTeamApprovals>>, { success: true }>['data']>;

export default function TeamApprovalsPage() {
    const toast = useToast();
    const [data, setData] = useState<Data | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await getMyTeamApprovals();
        if (res.success && res.data) setData(res.data);
        else { setData({ leave: [], regularizations: [] }); toast.error(('error' in res && res.error) || 'Could not load approvals'); }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const act = async (key: string, fn: () => Promise<{ success: boolean; error?: string } | any>, ok: string) => {
        setBusy(key);
        const res = await fn();
        setBusy(null);
        if (res.success) { toast.success(ok); load(); } else toast.error(res.error || 'Action failed');
    };

    const Buttons = ({ k, approve, reject }: { k: string; approve: () => Promise<any>; reject: () => Promise<any> }) =>
        busy === k ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : (
            <div className="flex gap-2">
                <button onClick={() => act(k, approve, 'Approved')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Approve</button>
                <button onClick={() => act(k, reject, 'Rejected')} className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 hover:bg-red-100 flex items-center gap-1"><XCircle className="h-3 w-3" /> Reject</button>
            </div>
        );

    return (
        <AppShell pageTitle="Team Approvals" pageIcon={<Users className="h-5 w-5" />} onRefresh={load}>
            <div className="space-y-5 max-w-4xl">
                {!data ? (
                    <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                ) : (
                    <>
                        <Card className="p-5">
                            <h3 className="text-sm font-black text-gray-900 mb-3">Leave requests ({data.leave.length})</h3>
                            {data.leave.length === 0 ? <p className="text-sm text-gray-400">Nothing waiting.</p> : (
                                <ul className="divide-y divide-gray-50">
                                    {data.leave.map(l => (
                                        <li key={l.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{l.employee} <span className="text-[10px] text-gray-400 font-medium">{l.code}</span></p>
                                                <p className="text-xs text-gray-600">{l.type} · {fmtIstDate(l.from + 'T00:00:00Z')}{l.to !== l.from ? ` → ${fmtIstDate(l.to + 'T00:00:00Z')}` : ''} · <b>{l.days}</b> day(s)</p>
                                                {l.reason && <p className="text-xs text-gray-400 italic">{l.reason}</p>}
                                            </div>
                                            <Buttons k={`l${l.id}`} approve={() => approveLeave(l.id)} reject={() => rejectLeave(l.id)} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card className="p-5">
                            <h3 className="text-sm font-black text-gray-900 mb-3">Attendance corrections ({data.regularizations.length})</h3>
                            {data.regularizations.length === 0 ? <p className="text-sm text-gray-400">Nothing waiting.</p> : (
                                <ul className="divide-y divide-gray-50">
                                    {data.regularizations.map(r => (
                                        <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{r.employee} <span className="text-[10px] text-gray-400 font-medium">{r.code}</span></p>
                                                <p className="text-xs text-gray-600">
                                                    {fmtIstDate(r.date + 'T00:00:00Z')}
                                                    {r.requestedIn && ` · in ${fmtIstTime(r.requestedIn)}`}
                                                    {r.requestedOut && ` · out ${fmtIstTime(r.requestedOut)}`}
                                                    {r.requestedStatus && ` · ${r.requestedStatus}`}
                                                </p>
                                                <p className="text-xs text-gray-400 italic">{r.reason}</p>
                                            </div>
                                            <Buttons k={`r${r.id}`} approve={() => reviewRegularization(r.id, 'Approved')} reject={() => reviewRegularization(r.id, 'Rejected')} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </>
                )}
            </div>
        </AppShell>
    );
}
