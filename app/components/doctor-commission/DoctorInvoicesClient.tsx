'use client';

/**
 * DoctorInvoicesClient
 * --------------------
 * Every invoice raised for one doctor, with what is paid and what is still due,
 * plus a flat ledger of every payment made to them (exact time, mode, reference).
 * The daily "who have we paid, who is pending" view.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Search, FileText, Wallet, ChevronRight } from 'lucide-react';
import { getDoctorInvoices, getDoctorPayments } from '@/app/actions/doctor-invoice-actions';
import { INVOICE_STATUS_LABEL } from '@/app/lib/doctor-invoice-calc';
import { fmtIstDate, fmtIstDateTime } from '@/app/lib/ist';

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

type DataOf<T> = T extends { data: infer D } ? (undefined extends D ? never : D) : never;
type ListData = DataOf<Awaited<ReturnType<typeof getDoctorInvoices>>>;
type PayData = DataOf<Awaited<ReturnType<typeof getDoctorPayments>>>;

const STATUS_CLS: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-700',
    finalized: 'bg-amber-100 text-amber-700',
    partially_paid: 'bg-blue-100 text-blue-700',
    paid: 'bg-emerald-100 text-emerald-700',
};

export default function DoctorInvoicesClient({ doctorId, basePath }: { doctorId: string; basePath: string }) {
    const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
    const [status, setStatus] = useState('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [search, setSearch] = useState('');
    const [applied, setApplied] = useState('');
    const [list, setList] = useState<ListData | null>(null);
    const [pays, setPays] = useState<PayData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [a, b] = await Promise.all([
            getDoctorInvoices(doctorId, { status, from: from || undefined, to: to || undefined, search: applied || undefined }),
            getDoctorPayments(doctorId, { from: from || undefined, to: to || undefined, includeVoided: true }),
        ]);
        if (a.success && a.data) setList(a.data as ListData);
        else setError(a.error || 'Failed to load');
        if (b.success && b.data) setPays(b.data as PayData);
        setLoading(false);
    }, [doctorId, status, from, to, applied]);

    useEffect(() => {
        load();
    }, [load]);

    if (!list) {
        return (
            <div className="p-10 text-center text-gray-400">
                {loading ? <><Loader2 className="h-6 w-6 animate-spin inline" /> Loading…</> : error || 'Not found.'}
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Link href={`${basePath}/${doctorId}`} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
                <ArrowLeft className="h-4 w-4" /> Back to doctor
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <FileText className="h-6 w-6 text-indigo-500" /> Doctor Invoices
                    </h1>
                    <div className="mt-1 text-sm text-gray-500">
                        <span className="font-bold text-gray-700">{list.doctor.name}</span>
                        {list.doctor.specialty && <span> · {list.doctor.specialty}</span>}
                    </div>
                </div>
                <Link href={`${basePath}/${doctorId}/statement`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-sm">
                    <Plus className="h-4 w-4" /> New invoice
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                    { l: 'Invoices', v: String(list.totals.count), c: 'text-gray-800' },
                    { l: 'Net invoiced', v: inr(list.totals.net), c: 'text-gray-800' },
                    { l: 'Paid to doctor', v: inr(list.totals.paid), c: 'text-emerald-600' },
                    { l: 'Balance due', v: inr(list.totals.balance), c: list.totals.balance > 0 ? 'text-amber-600' : 'text-gray-800' },
                ].map((c) => (
                    <div key={c.l} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="text-[10px] uppercase text-gray-400 font-black">{c.l}</div>
                        <div className={`text-xl font-black mt-1 ${c.c}`}>{c.v}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['invoices', 'Invoices'], ['payments', 'Payments']] as const).map(([k, label]) => (
                        <button key={k} onClick={() => setTab(k)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                {tab === 'invoices' && (
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="all">All invoices</option>
                        <option value="unpaid">Unpaid / part paid</option>
                        <option value="paid">Paid</option>
                    </select>
                )}
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" aria-label="From" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" aria-label="To" />
                {tab === 'invoices' && (
                    <div className="relative">
                        <Search className="h-4 w-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && setApplied(search)} onBlur={() => setApplied(search)}
                            placeholder="Invoice no." className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-44" />
                    </div>
                )}
                {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-300 mb-2.5" />}
            </div>

            {tab === 'invoices' ? (
                list.invoices.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                        No invoices yet. <Link href={`${basePath}/${doctorId}/statement`} className="font-bold text-indigo-600 hover:underline">Create the first one</Link>.
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-black">
                                <tr>
                                    {['Invoice', 'Date', 'Bills', 'Gross', 'TDS', 'Net', 'Paid', 'Balance', 'Status', 'Last payment', ''].map((h) => (
                                        <th key={h} className={`px-4 py-3 ${['Gross', 'TDS', 'Net', 'Paid', 'Balance', 'Bills'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {list.invoices.map((r) => (
                                    <tr key={r.id} className="hover:bg-gray-50/60">
                                        <td className="px-4 py-3 font-bold text-gray-800">
                                            <Link href={`${basePath}/${doctorId}/invoices/${r.id}`} className="hover:text-indigo-600">{r.statement_number || 'Draft'}</Link>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{fmtIstDate(r.invoice_date)}</td>
                                        <td className="px-4 py-3 text-right text-gray-500">{r.bill_count}</td>
                                        <td className="px-4 py-3 text-right text-gray-600">{inr(r.gross)}</td>
                                        <td className="px-4 py-3 text-right text-gray-400">−{inr(r.tds)}</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">{inr(r.net)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600 font-bold">{inr(r.paid)}</td>
                                        <td className={`px-4 py-3 text-right font-bold ${r.balance > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{inr(r.balance)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CLS[r.status] || 'bg-gray-100 text-gray-500'}`}>
                                                {INVOICE_STATUS_LABEL[r.status] ?? r.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{r.last_paid_at ? fmtIstDateTime(r.last_paid_at) : '—'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Link href={`${basePath}/${doctorId}/invoices/${r.id}`} className="inline-flex items-center gap-0.5 text-xs font-bold text-indigo-600 hover:underline">
                                                Open <ChevronRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            ) : !pays || pays.payments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">No payments recorded for this doctor yet.</div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 text-xs font-bold text-gray-500 inline-flex items-center gap-2 w-full">
                        <Wallet className="h-4 w-4 text-emerald-500" /> {pays.count} payment(s) · {inr(pays.total)} paid in total
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-black">
                            <tr>
                                {['Paid on', 'Invoice', 'Mode', 'Reference', 'Note', 'Recorded by', 'Amount'].map((h) => (
                                    <th key={h} className={`px-4 py-3 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {pays.payments.map((p) => (
                                <tr key={p.id} className={p.voided_at ? 'opacity-50' : 'hover:bg-gray-50/60'}>
                                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtIstDateTime(p.paid_at)}</td>
                                    <td className="px-4 py-3">
                                        <Link href={`${basePath}/${doctorId}/invoices/${p.statement_id}`} className="font-bold text-indigo-600 hover:underline">
                                            {p.statement_number || 'Invoice'}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{p.payment_mode || '—'}</td>
                                    <td className="px-4 py-3 text-gray-500">{p.reference || '—'}</td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                        {p.voided_at ? <span className="text-red-500 font-bold">Voided{p.void_reason ? ` — ${p.void_reason}` : ''}</span> : p.notes || ''}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{p.recorded_by || '—'}</td>
                                    <td className={`px-4 py-3 text-right font-black text-gray-800 ${p.voided_at ? 'line-through' : ''}`}>{inr(p.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
