'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Plus, X, Send } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { DateField } from '@/app/components/ui/DateField';
import { useToast } from '@/app/components/ui/Toast';
import { getMyLeave, applyMyLeave, cancelMyLeave } from '@/app/actions/hr-self-service-actions';
import { fmtIstDate } from '@/app/lib/ist';
import { istTodayKey } from '@/app/lib/hr/hr-dates';
import { Card, StatusPill, inputCls, labelCls, primaryBtn, ghostBtn } from '@/app/components/hr/HrBits';

type Data = NonNullable<Extract<Awaited<ReturnType<typeof getMyLeave>>, { success: true }>['data']>;

const EMPTY = { leaveTypeId: '', fromDate: '', toDate: '', reason: '', isHalfDay: false };

export default function MyLeavePage() {
    const toast = useToast();
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        const res = await getMyLeave();
        if (res.success && res.data) setData(res.data);
        else toast.error(('error' in res && res.error) || 'Could not load leave');
        setLoading(false);
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const today = istTodayKey();

    const submit = async () => {
        if (!form.leaveTypeId || !form.fromDate || !form.toDate) { toast.error('Choose a leave type and dates'); return; }
        setSubmitting(true);
        const res = await applyMyLeave({
            leaveTypeId: Number(form.leaveTypeId), fromDate: form.fromDate,
            toDate: form.isHalfDay ? form.fromDate : form.toDate, reason: form.reason || undefined, isHalfDay: form.isHalfDay,
        });
        setSubmitting(false);
        if (res.success && res.data) {
            toast.success(`Leave requested (${res.data.days} day${res.data.days === 1 ? '' : 's'})`);
            setForm(EMPTY); setShowForm(false); load();
        } else {
            toast.error(('error' in res && res.error) || 'Could not submit');
        }
    };

    const cancel = async (id: number) => {
        setBusyId(id);
        const res = await cancelMyLeave(id);
        setBusyId(null);
        if (res.success) { toast.success('Leave cancelled'); load(); }
        else toast.error(('error' in res && res.error) || 'Could not cancel');
    };

    return (
        <AppShell pageTitle="My Leave" pageIcon={<CalendarDays className="h-5 w-5" />} onRefresh={load}
            headerActions={<button onClick={() => setShowForm(v => !v)} className={primaryBtn}><Plus className="h-4 w-4" /> Apply leave</button>}>
            <div className="space-y-5 max-w-5xl">
                {loading || !data ? (
                    <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {data.balances.map(b => (
                                <Card key={b.leaveTypeId} className="p-4">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{b.leaveType}{!b.isPaid && ' (unpaid)'}</p>
                                    <p className="text-2xl font-black text-gray-900 mt-1">{b.remaining}<span className="text-sm font-bold text-gray-400"> / {b.total}</span></p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{b.used} used{b.pending > 0 ? ` · ${b.pending} pending` : ''}</p>
                                </Card>
                            ))}
                            {data.balances.length === 0 && (
                                <Card className="p-4 col-span-full text-sm text-gray-500">No leave types are set up yet. Ask HR to add them (HR → Settings).</Card>
                            )}
                        </div>

                        {showForm && (
                            <Card className="p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-black text-gray-900">Apply for leave</h3>
                                    <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Close"><X className="h-4 w-4 text-gray-400" /></button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelCls}>Leave type *</label>
                                        <select className={inputCls} value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
                                            <option value="">Select…</option>
                                            {data.types.map(t => <option key={t.id} value={t.id}>{t.name}{t.isPaid ? '' : ' (unpaid)'}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>From *</label>
                                        <DateField value={form.fromDate} min={today} onChange={e => setForm({ ...form, fromDate: e.target.value, toDate: form.toDate && form.toDate < e.target.value ? e.target.value : form.toDate })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>To *</label>
                                        <DateField value={form.isHalfDay ? form.fromDate : form.toDate} min={form.fromDate || today} disabled={form.isHalfDay} onChange={e => setForm({ ...form, toDate: e.target.value })} className={inputCls} />
                                    </div>
                                </div>
                                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <input type="checkbox" checked={form.isHalfDay} onChange={e => setForm({ ...form, isHalfDay: e.target.checked })} /> Half day
                                </label>
                                <div className="mt-3">
                                    <label className={labelCls}>Reason</label>
                                    <textarea rows={2} className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} maxLength={500} />
                                </div>
                                <p className="mt-2 text-[11px] text-gray-400">Weekly offs and public holidays inside the range are not deducted.</p>
                                <button onClick={submit} disabled={submitting} className={`${primaryBtn} mt-4`}>
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit request
                                </button>
                            </Card>
                        )}

                        <Card className="overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-black text-gray-900">My requests</h3></div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/50 border-b border-gray-100">
                                            {['Type', 'From', 'To', 'Days', 'Reason', 'Status', ''].map(h => (
                                                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.requests.length === 0 ? (
                                            <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No leave requests yet.</td></tr>
                                        ) : data.requests.map(r => {
                                            const cancellable = r.status === 'Pending' || (r.status === 'Approved' && r.from >= today);
                                            return (
                                                <tr key={r.id} className="border-b border-gray-50">
                                                    <td className="px-4 py-3 font-semibold text-gray-800">{r.type}{r.isHalfDay && <span className="text-[10px] text-gray-400"> (half)</span>}</td>
                                                    <td className="px-4 py-3 text-gray-600">{fmtIstDate(r.from + 'T00:00:00Z')}</td>
                                                    <td className="px-4 py-3 text-gray-600">{fmtIstDate(r.to + 'T00:00:00Z')}</td>
                                                    <td className="px-4 py-3 font-black">{r.days}</td>
                                                    <td className="px-4 py-3 text-gray-500 max-w-[220px]">
                                                        <p className="truncate">{r.reason || '—'}</p>
                                                        {r.reviewNote && <p className="text-[11px] italic text-gray-400 truncate">{r.reviewNote}</p>}
                                                    </td>
                                                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                                                    <td className="px-4 py-3 text-right">
                                                        {cancellable && (
                                                            busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-auto" />
                                                                : <button onClick={() => cancel(r.id)} className={ghostBtn}>Cancel</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </>
                )}
            </div>
        </AppShell>
    );
}
