'use client';

/**
 * DoctorInvoiceDetailClient
 * -------------------------
 * One doctor invoice, end to end on a single screen:
 *   · review every patient / bill / service and what is being paid for it
 *   · edit any part while it is unpaid (amount per bill, rate per service, remove a
 *     bill, TDS %, an invoice-level +/- adjustment, notes, date)
 *   · record payments as they happen — exact time, mode, reference — and void a
 *     wrong one with a reason
 *   · send it to the doctor, as a detailed or a summary PDF, via download /
 *     share sheet / WhatsApp / email
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Loader2, Pencil, Save, X, Download, Eye, Share2, MessageCircle, Mail, Copy,
    Trash2, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Ban, Wallet, AlertTriangle,
} from 'lucide-react';
import {
    getDoctorInvoiceDetail,
    updateDoctorInvoice,
    recordDoctorInvoicePayment,
    voidDoctorInvoicePayment,
} from '@/app/actions/doctor-invoice-actions';
import { discardDoctorStatement } from '@/app/actions/doctor-commission-actions';
import { applyBillEdit, invoiceTotals, r2, INVOICE_STATUS_LABEL, PAYMENT_MODES } from '@/app/lib/doctor-invoice-calc';
import { fmtIstDate, fmtIstDateTime } from '@/app/lib/ist';
import type { DoctorInvoiceDoc } from './DoctorInvoicePDF';

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const rate2 = (n: number) => Math.round((n || 0) * 100) / 100;

type DataOf<T> = T extends { data: infer D } ? (undefined extends D ? never : D) : never;
type Detail = DataOf<Awaited<ReturnType<typeof getDoctorInvoiceDetail>>>;
type Line = Detail['lines'][number];
type LineEdit = { amount?: number | null; rates?: Record<string, number>; note?: string };

const STATUS_CLS: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-700',
    finalized: 'bg-amber-100 text-amber-700',
    partially_paid: 'bg-blue-100 text-blue-700',
    paid: 'bg-emerald-100 text-emerald-700',
};

/** `YYYY-MM-DDTHH:mm` in the browser's zone, for <input type="datetime-local">. */
function localInput(d = new Date()) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const dateInput = (d: string | Date) => localInput(new Date(d)).slice(0, 10);

export default function DoctorInvoiceDetailClient({
    statementId,
    doctorId,
    basePath,
}: {
    statementId: string;
    doctorId: string;
    basePath: string;
}) {
    const router = useRouter();
    const [data, setData] = useState<Detail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    // ── edit mode
    const [editing, setEditing] = useState(false);
    const [edits, setEdits] = useState<Record<string, LineEdit>>({});
    const [removed, setRemoved] = useState<Set<string>>(new Set());
    const [tds, setTds] = useState(10);
    const [adjAmt, setAdjAmt] = useState('0');
    const [adjNote, setAdjNote] = useState('');
    const [notes, setNotes] = useState('');
    const [invDate, setInvDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        const res = await getDoctorInvoiceDetail(statementId);
        if (res.success && res.data) {
            setData(res.data as Detail);
            setError(null);
        } else setError(res.error || 'Failed to load');
        setLoading(false);
    }, [statementId]);

    useEffect(() => {
        load();
    }, [load]);

    const startEdit = () => {
        if (!data) return;
        setEdits({});
        setRemoved(new Set());
        setTds(data.statement.tds_rate_percent);
        setAdjAmt(String(data.statement.adjustment_amount || 0));
        setAdjNote(data.statement.adjustment_note || '');
        setNotes(data.statement.notes || '');
        setInvDate(dateInput(data.statement.invoice_date));
        setMsg(null);
        setEditing(true);
    };
    const cancelEdit = () => setEditing(false);

    /** What a bill pays right now, with any unsaved edit applied. */
    const effective = useCallback(
        (l: Line) => {
            const e = edits[l.id];
            if (!e || (e.amount === undefined && !e.rates)) return { amount: l.amount, services: l.services };
            const a = applyBillEdit(l.computed_amount, l.services, { amount: e.amount, rates: e.rates });
            return { amount: a.final, services: a.services };
        },
        [edits],
    );

    const live = useMemo(() => {
        if (!data) return null;
        if (!editing) return data.totals;
        const kept = data.lines.filter((l) => !removed.has(l.id));
        const t = invoiceTotals(kept.map((l) => effective(l).amount), Number(adjAmt) || 0, tds);
        const paid = data.totals.paid;
        return { ...t, net: t.net, paid, balance: r2(Math.max(0, t.net - paid)), lines: t.lines };
    }, [data, editing, removed, effective, adjAmt, tds]);

    const patch = (id: string, p: Partial<LineEdit>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
    const resetLine = (id: string) => setEdits((prev) => ({ ...prev, [id]: { amount: null, note: '' } }));
    const toggleRemove = (id: string) =>
        setRemoved((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    const toggleOpen = (id: string) =>
        setOpen((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    const save = async () => {
        if (!data) return;
        setSaving(true);
        setError(null);
        const res = await updateDoctorInvoice({
            statementId,
            tds_rate_percent: tds,
            adjustment_amount: Number(adjAmt) || 0,
            adjustment_note: adjNote,
            notes,
            invoice_date: invDate || undefined,
            removeLineIds: [...removed],
            lines: Object.entries(edits)
                .filter(([id]) => !removed.has(id))
                .map(([id, e]) => ({ id, amount: e.amount, rates: e.rates, note: e.note })),
        });
        setSaving(false);
        if (!res.success) {
            setError(res.error || 'Could not save');
            return;
        }
        setEditing(false);
        setMsg('Invoice updated.');
        await load();
    };

    const discard = async () => {
        if (!confirm('Discard this invoice? Its bills go back to the “not yet invoiced” list.')) return;
        const res = await discardDoctorStatement(statementId);
        if (!res.success) {
            setError(res.error || 'Could not discard');
            return;
        }
        router.push(`${basePath}/${doctorId}/invoices`);
    };

    if (loading) {
        return (
            <div className="p-10 text-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin inline" /> Loading invoice…
            </div>
        );
    }
    if (!data || !live) {
        return <div className="p-10 text-center text-gray-400">{error || 'Doctor invoice not found.'}</div>;
    }

    const st = data.statement;
    const status = st.status;
    const patients = groupByPatient(data.lines);
    const livePayments = data.payments.filter((p) => !p.voided_at);
    const adjusted = data.lines.filter((l) => l.is_adjusted).length;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Link href={`${basePath}/${doctorId}/invoices`} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
                <ArrowLeft className="h-4 w-4" /> All invoices
            </Link>

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-gray-800">{st.statement_number || 'Doctor invoice'}</h1>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-black ${STATUS_CLS[status] || 'bg-gray-100 text-gray-500'}`}>
                            {INVOICE_STATUS_LABEL[status] ?? status}
                        </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                        <span className="font-bold text-gray-700">{data.doctor.name}</span>
                        {data.doctor.specialty && <span> · {data.doctor.specialty}</span>}
                        <span> · {fmtIstDate(st.invoice_date)}</span>
                        <span> · bills {fmtIstDate(st.period_start)} – {fmtIstDate(st.period_end)}</span>
                        {st.created_by && <span> · raised by {st.created_by}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {data.editable && !editing && (
                        <button onClick={startEdit} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50">
                            <Pencil className="h-4 w-4" /> Edit invoice
                        </button>
                    )}
                    {data.editable && !editing && livePayments.length === 0 && (
                        <button onClick={discard} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-gray-400 hover:text-red-500 font-bold text-sm">
                            <Trash2 className="h-4 w-4" /> Discard
                        </button>
                    )}
                </div>
            </div>

            {msg && (
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> {msg}
                </div>
            )}
            {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}
            {!data.editable && (
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
                    This invoice is fully paid, so it is locked. To change it, void the last payment below — you can then edit and pay again.
                </div>
            )}

            {/* Money strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                {[
                    { l: 'Bills subtotal', v: inr(live.lines), c: 'text-gray-800' },
                    { l: `Adjustment`, v: (live.adjustment > 0 ? '+' : '') + inr(live.adjustment), c: 'text-gray-800' },
                    { l: `TDS (${rate2(editing ? tds : st.tds_rate_percent)}%)`, v: '−' + inr(live.tds), c: 'text-gray-500' },
                    { l: 'Net payable', v: inr(live.net), c: 'text-indigo-600' },
                    { l: live.balance > 0.004 ? 'Balance due' : 'Paid in full', v: inr(live.balance > 0.004 ? live.balance : live.paid), c: live.balance > 0.004 ? 'text-amber-600' : 'text-emerald-600' },
                ].map((c) => (
                    <div key={c.l} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="text-[10px] uppercase text-gray-400 font-black">{c.l}</div>
                        <div className={`text-xl font-black mt-1 ${c.c}`}>{c.v}</div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-5">
                {/* ── Bills ───────────────────────────────────────────────── */}
                <div className="lg:col-span-2 space-y-4">
                    {editing && (
                        <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 grid sm:grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase text-gray-400 font-black">TDS %</span>
                                <input type="number" min={0} max={100} step={0.1} value={tds}
                                    onChange={(e) => setTds(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase text-gray-400 font-black">Invoice date</span>
                                <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase text-gray-400 font-black">Adjustment (₹, + adds, − deducts)</span>
                                <input type="number" step="0.01" value={adjAmt} onChange={(e) => setAdjAmt(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase text-gray-400 font-black">Adjustment reason</span>
                                <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="e.g. advance recovered, bonus, round-off"
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                            </label>
                            <label className="flex flex-col gap-1 sm:col-span-2">
                                <span className="text-[10px] uppercase text-gray-400 font-black">Invoice notes (printed on the invoice)</span>
                                <input value={notes} onChange={(e) => setNotes(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                            </label>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-black">
                                {patients.length} patient(s) · {data.lines.length - removed.size} bill(s)
                                {adjusted > 0 && <span className="ml-2 text-amber-600">· {adjusted} adjusted</span>}
                            </span>
                            <button
                                onClick={() => setOpen(open.size ? new Set() : new Set(data.lines.map((l) => l.id)))}
                                className="text-xs font-bold text-indigo-600 hover:underline"
                            >
                                {open.size ? 'Collapse services' : 'Show services'}
                            </button>
                        </div>

                        {patients.map((p) => (
                            <div key={p.patient_id} className="border-b border-gray-50 last:border-0">
                                <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
                                    <div className="font-bold text-gray-800">{p.patient_name || '—'}</div>
                                    <div className="text-[11px] text-gray-400">{p.patient_id}</div>
                                </div>
                                <div className="px-4 pb-3 space-y-1">
                                    {p.lines.map((l) => {
                                        const isRemoved = removed.has(l.id);
                                        const eff = effective(l);
                                        const e = edits[l.id];
                                        const changed = Math.abs(eff.amount - l.computed_amount) > 0.004;
                                        const isOpen = open.has(l.id);
                                        return (
                                            <div key={l.id} className={`rounded-xl border px-3 py-2 ${isRemoved ? 'opacity-40 border-dashed border-gray-200' : changed ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100'}`}>
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => toggleOpen(l.id)} className="text-gray-400 hover:text-gray-600" aria-label="Toggle services">
                                                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-gray-700">
                                                            {l.invoice_number}
                                                            <span className="ml-2 text-xs font-normal text-gray-400">{l.invoice_type} · {fmtIstDate(l.bill_date)}</span>
                                                        </div>
                                                        <div className="text-[11px] text-gray-400">
                                                            share collected {inr(l.collected)}
                                                            {l.rate > 0 && <> @ {rate2(l.rate)}%</>}
                                                            {changed && <span className="text-amber-600 font-bold"> · was {inr(l.computed_amount)}</span>}
                                                        </div>
                                                    </div>
                                                    {editing && !isRemoved ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-gray-400 text-sm">₹</span>
                                                            <input
                                                                type="number" min={0} step="0.01"
                                                                value={e?.amount === undefined ? eff.amount : e.amount === null ? l.computed_amount : e.amount}
                                                                onChange={(ev) => patch(l.id, { amount: ev.target.value === '' ? 0 : Number(ev.target.value) })}
                                                                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right font-bold"
                                                                aria-label={`Payable for ${l.invoice_number}`}
                                                            />
                                                            {(changed || e) && (
                                                                <button onClick={() => resetLine(l.id)} title="Reset to computed" className="text-gray-400 hover:text-indigo-600">
                                                                    <RotateCcw className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-right font-black text-gray-800">{inr(eff.amount)}</div>
                                                    )}
                                                    {editing && (
                                                        <button onClick={() => toggleRemove(l.id)} title={isRemoved ? 'Keep this bill' : 'Remove from invoice'}
                                                            className={isRemoved ? 'text-indigo-600' : 'text-gray-300 hover:text-red-500'}>
                                                            {isRemoved ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                        </button>
                                                    )}
                                                </div>

                                                {(editing && changed && !isRemoved) && (
                                                    <input
                                                        value={e?.note ?? l.adjust_note ?? ''}
                                                        onChange={(ev) => patch(l.id, { note: ev.target.value })}
                                                        placeholder="Why was this changed? (shown to the doctor)"
                                                        className="mt-2 w-full px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs bg-white"
                                                    />
                                                )}
                                                {!editing && l.is_adjusted && l.adjust_note && (
                                                    <div className="mt-1 text-[11px] text-amber-700 pl-7">Adjusted: {l.adjust_note}</div>
                                                )}

                                                {isOpen && (
                                                    <div className="mt-2 pl-7 space-y-1">
                                                        {eff.services.length === 0 && (
                                                            <div className="text-[11px] text-gray-400">No service breakdown was saved for this bill.</div>
                                                        )}
                                                        {eff.services.map((s, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-[11px] text-gray-500">
                                                                <span className="flex-1 truncate" title={s.name}>{s.name}</span>
                                                                <span>{inr(s.collected)}</span>
                                                                {editing && !isRemoved && s.item_id != null ? (
                                                                    <span className="inline-flex items-center gap-0.5">
                                                                        @<input
                                                                            type="number" min={0} max={100} step="0.1"
                                                                            value={rate2(s.rate)}
                                                                            onChange={(ev) => patch(l.id, { rates: { ...(edits[l.id]?.rates ?? {}), [String(s.item_id)]: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) } })}
                                                                            className="w-14 px-1 py-0.5 border border-gray-200 rounded text-right"
                                                                            aria-label={`Rate for ${s.name}`}
                                                                        />%
                                                                    </span>
                                                                ) : (
                                                                    <span className={`font-bold ${s.base_rate != null ? 'text-amber-600' : 'text-indigo-500'}`}>@{rate2(s.rate)}%</span>
                                                                )}
                                                                <span className="w-16 text-right font-bold text-gray-600">{inr(s.amount)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {!editing && (st.adjustment_amount !== 0 || st.notes) && (
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-600 space-y-1">
                            {st.adjustment_amount !== 0 && (
                                <div>
                                    <span className="font-bold text-gray-700">Adjustment:</span>{' '}
                                    {(st.adjustment_amount > 0 ? '+' : '') + inr(st.adjustment_amount)}
                                    {st.adjustment_note && <span className="text-gray-500"> — {st.adjustment_note}</span>}
                                </div>
                            )}
                            {st.notes && <div><span className="font-bold text-gray-700">Notes:</span> {st.notes}</div>}
                        </div>
                    )}
                </div>

                {/* ── Right: payments + send ───────────────────────────────── */}
                <div className="space-y-4">
                    <PaymentsCard data={data} locked={editing} onChanged={async (m) => { setMsg(m); setError(null); await load(); }} onError={setError} />
                    <SendCard data={data} disabled={editing} onError={setError} />
                </div>
            </div>

            {/* Sticky save bar */}
            {editing && (
                <div className="sticky bottom-4 mt-5 z-20">
                    <div className="bg-white border border-indigo-200 shadow-lg rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-gray-600">
                            <span className="font-black text-gray-800">{inr(live.gross)}</span> gross − {inr(live.tds)} TDS ={' '}
                            <span className="font-black text-indigo-600">{inr(live.net)}</span> net
                            {live.paid > 0 && <span className="text-gray-400"> · {inr(live.paid)} already paid</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={cancelEdit} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100">Cancel</button>
                            <button onClick={save} disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function groupByPatient(lines: Line[]) {
    const out: Array<{ patient_id: string; patient_name: string; lines: Line[] }> = [];
    for (const l of lines) {
        let g = out.find((x) => x.patient_id === l.patient_id);
        if (!g) out.push((g = { patient_id: l.patient_id, patient_name: l.patient_name, lines: [] }));
        g.lines.push(l);
    }
    return out;
}

// ── Payments ────────────────────────────────────────────────────────────────

function PaymentsCard({
    data, locked, onChanged, onError,
}: {
    data: Detail; locked: boolean; onChanged: (msg: string) => Promise<void>; onError: (e: string | null) => void;
}) {
    const balance = data.totals.balance;
    const [amount, setAmount] = useState('');
    const [when, setWhen] = useState(localInput());
    const [mode, setMode] = useState<string>('Bank Transfer');
    const [ref, setRef] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [voidFor, setVoidFor] = useState<string | null>(null);
    const [reason, setReason] = useState('');

    // Default the amount to what is still due, and re-default after each payment.
    useEffect(() => {
        setAmount(balance > 0 ? String(balance) : '');
    }, [balance]);

    const record = async () => {
        const amt = Number(amount);
        if (!(amt > 0)) return onError('Enter the amount paid');
        setBusy(true);
        onError(null);
        const res = await recordDoctorInvoicePayment({
            statementId: data.statement.id,
            amount: amt,
            paid_at: when ? new Date(when).toISOString() : undefined,
            payment_mode: mode,
            reference: ref || undefined,
            notes: note || undefined,
        });
        setBusy(false);
        if (!res.success) return onError(res.error || 'Could not record payment');
        setRef('');
        setNote('');
        setWhen(localInput());
        await onChanged(`Payment of ${inr(amt)} recorded.`);
    };

    const doVoid = async () => {
        if (!voidFor) return;
        setBusy(true);
        const res = await voidDoctorInvoicePayment({ paymentId: voidFor, reason });
        setBusy(false);
        if (!res.success) return onError(res.error || 'Could not void');
        setVoidFor(null);
        setReason('');
        await onChanged('Payment voided.');
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-gray-400 font-black inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-emerald-500" /> Payments to doctor
                </span>
                <span className="text-xs font-bold text-gray-500">{inr(data.totals.paid)} of {inr(data.totals.net)}</span>
            </div>

            <div className="divide-y divide-gray-50">
                {data.payments.length === 0 && <div className="px-4 py-5 text-sm text-gray-400 text-center">No payment made yet.</div>}
                {data.payments.map((p) => (
                    <div key={p.id} className={`px-4 py-3 ${p.voided_at ? 'opacity-50' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <div className={`font-black text-gray-800 ${p.voided_at ? 'line-through' : ''}`}>{inr(p.amount)}</div>
                                <div className="text-[11px] text-gray-500">{fmtIstDateTime(p.paid_at)}</div>
                                <div className="text-[11px] text-gray-400">
                                    {[p.payment_mode, p.reference && `Ref ${p.reference}`, p.recorded_by && `by ${p.recorded_by}`].filter(Boolean).join(' · ')}
                                </div>
                                {p.notes && <div className="text-[11px] text-gray-400 italic">{p.notes}</div>}
                                {p.voided_at && (
                                    <div className="text-[11px] text-red-500 font-bold">
                                        Voided {fmtIstDateTime(p.voided_at)}{p.void_reason ? ` — ${p.void_reason}` : ''}
                                    </div>
                                )}
                            </div>
                            {!p.voided_at && (
                                <button onClick={() => { setVoidFor(p.id); setReason(''); }} title="Void this payment" className="text-gray-300 hover:text-red-500">
                                    <Ban className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {voidFor === p.id && (
                            <div className="mt-2 flex items-center gap-2">
                                <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for voiding"
                                    className="flex-1 px-2.5 py-1.5 border border-red-200 rounded-lg text-xs" />
                                <button onClick={doVoid} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold disabled:opacity-50">Void</button>
                                <button onClick={() => setVoidFor(null)} className="text-xs text-gray-400">Cancel</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {balance > 0.004 ? (
                <div className="p-4 border-t border-gray-100 bg-gray-50/40 space-y-2">
                    <div className="text-[10px] uppercase text-gray-400 font-black">Record a payment · {inr(balance)} due</div>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-400 font-bold">Amount (₹)</span>
                            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                                className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm font-bold" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-400 font-bold">Paid on</span>
                            <input type="datetime-local" value={when} max={localInput()} onChange={(e) => setWhen(e.target.value)}
                                className="px-2.5 py-2 border border-gray-200 rounded-lg text-xs" />
                        </label>
                        <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                        </select>
                        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference / txn id"
                            className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
                        className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm" />
                    <div className="flex items-center gap-2">
                        <button onClick={record} disabled={busy || locked}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-40">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Record payment
                        </button>
                        {Number(amount) !== balance && (
                            <button onClick={() => setAmount(String(balance))} className="text-xs font-bold text-indigo-600 hover:underline whitespace-nowrap">Pay full</button>
                        )}
                    </div>
                    {locked && <p className="text-[11px] text-amber-600">Save or cancel your edits before recording a payment.</p>}
                </div>
            ) : (
                data.totals.net > 0 && (
                    <div className="px-4 py-3 border-t border-gray-100 bg-emerald-50/50 text-sm font-bold text-emerald-700 inline-flex items-center gap-2 w-full">
                        <CheckCircle2 className="h-4 w-4" /> Fully paid
                    </div>
                )
            )}
        </div>
    );
}

// ── Send to doctor ──────────────────────────────────────────────────────────

function SendCard({ data, disabled, onError }: { data: Detail; disabled: boolean; onError: (e: string | null) => void }) {
    const [mode, setMode] = useState<'detailed' | 'summary'>('detailed');
    const [busy, setBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const doc = data as unknown as DoctorInvoiceDoc;
    const fileName = `${(data.statement.statement_number || 'Doctor-invoice').replace(/[^a-zA-Z0-9-]/g, '-')}-${data.doctor.name.replace(/[^a-zA-Z0-9]/g, '-')}-${mode}.pdf`;

    const makeBlob = async () => {
        const [{ pdf }, { default: DoctorInvoicePDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('./DoctorInvoicePDF'),
        ]);
        return pdf(<DoctorInvoicePDF doc={doc} mode={mode} />).toBlob();
    };

    const run = async (key: string, fn: (blob: Blob) => void | Promise<void>) => {
        setBusy(key);
        onError(null);
        try {
            await fn(await makeBlob());
        } catch (err) {
            console.error('Doctor invoice PDF failed:', err);
            onError('Could not build the PDF. Please try again.');
        } finally {
            setBusy(null);
        }
    };

    const download = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const preview = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const share = async (blob: Blob) => {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
        if (nav.canShare?.({ files: [file] })) {
            try {
                await nav.share({ files: [file], title: data.statement.statement_number || 'Doctor invoice', text: summaryText(data) });
            } catch {
                /* user dismissed the share sheet */
            }
        } else {
            download(blob);
            onError('This browser cannot share files directly — the PDF was downloaded instead.');
        }
    };

    const text = summaryText(data);
    const phone = normalisePhone(data.doctor.phone);
    const wa = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    const mailto = `mailto:${data.doctor.email || ''}?subject=${encodeURIComponent(`${data.org.name} — payout invoice ${data.statement.statement_number || ''}`)}&body=${encodeURIComponent(text + '\n\n(PDF attached)')}`;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-400 font-black">
                Send to doctor
            </div>
            <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['detailed', 'Detailed'], ['summary', 'Summary']] as const).map(([k, label]) => (
                        <button key={k} onClick={() => setMode(k)}
                            className={`py-1.5 rounded-lg text-sm font-bold ${mode === k ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-gray-400 leading-snug">
                    {mode === 'detailed'
                        ? 'Every patient, bill and service with its rate, any changes made, totals and all payments.'
                        : 'One compact page: totals, split by bill type, one line per patient, and payments received.'}
                </p>

                <div className="grid grid-cols-2 gap-2">
                    <ActionBtn icon={Download} label="Download PDF" busy={busy === 'dl'} disabled={disabled} onClick={() => run('dl', download)} primary />
                    <ActionBtn icon={Eye} label="Preview" busy={busy === 'pv'} disabled={disabled} onClick={() => run('pv', preview)} />
                    <ActionBtn icon={Share2} label="Share PDF" busy={busy === 'sh'} disabled={disabled} onClick={() => run('sh', share)} />
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50">
                        <MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp
                    </a>
                    <a href={mailto}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50">
                        <Mail className="h-4 w-4 text-blue-500" /> Email
                    </a>
                    <button
                        onClick={async () => { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50">
                        <Copy className="h-4 w-4 text-gray-400" /> {copied ? 'Copied' : 'Copy text'}
                    </button>
                </div>
                <p className="text-[11px] text-gray-400 leading-snug">
                    WhatsApp and Email open with a short message
                    {!data.doctor.phone && ' (no phone saved for this doctor — pick the contact yourself)'} — attach the downloaded PDF, or use <b>Share PDF</b> on a phone to send the file directly.
                </p>
            </div>
        </div>
    );
}

function ActionBtn({
    icon: Icon, label, onClick, busy, disabled, primary,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; busy: boolean; disabled: boolean; primary?: boolean }) {
    return (
        <button onClick={onClick} disabled={busy || disabled}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm disabled:opacity-40 ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
        </button>
    );
}

const money = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function normalisePhone(raw?: string | null) {
    const digits = (raw || '').replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return '';
    return digits.length === 10 ? `91${digits}` : digits;
}

/** Short plain-text digest used for WhatsApp / email / clipboard. */
function summaryText(d: Detail): string {
    const t = d.totals;
    const live = d.payments.filter((p) => !p.voided_at);
    const last = live[live.length - 1];
    const patients = new Set(d.lines.map((l) => l.patient_id)).size;
    return [
        `${d.org.name} — Doctor payout invoice`,
        `Dr. ${d.doctor.name.replace(/^dr\.?\s*/i, '')} · ${d.statement.statement_number || ''} (${fmtIstDate(d.statement.invoice_date)})`,
        `Bills ${fmtIstDate(d.statement.period_start)} – ${fmtIstDate(d.statement.period_end)} · ${d.lines.length} bill(s), ${patients} patient(s)`,
        `Gross: ${money(t.gross)}`,
        `TDS (${rate2(d.statement.tds_rate_percent)}%): -${money(t.tds)}`,
        `Net payable: ${money(t.net)}`,
        `Paid: ${money(t.paid)} · Balance: ${money(t.balance)}`,
        last ? `Last payment: ${money(last.amount)} on ${fmtIstDateTime(last.paid_at)}${last.payment_mode ? ` via ${last.payment_mode}` : ''}${last.reference ? ` (ref ${last.reference})` : ''}` : '',
    ].filter(Boolean).join('\n');
}
