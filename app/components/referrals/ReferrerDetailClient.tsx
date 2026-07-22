'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, FileText, Plus, Check, Trash2, Wallet } from 'lucide-react';
import {
    getReferrerDetail,
    createPayoutStatement,
    markStatementPaid,
    discardStatement,
} from '@/app/actions/referral-actions';

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN');

const CATEGORY_LABEL: Record<string, string> = {
    staff: 'Staff', affiliate: 'Affiliate', interpreter: 'Interpreter', rmp: 'RMP', others: 'Others',
};
const STATUS_BADGE: Record<string, string> = {
    accrued: 'bg-amber-100 text-amber-700',
    included_in_statement: 'bg-blue-100 text-blue-700',
    paid: 'bg-emerald-100 text-emerald-700',
    void: 'bg-gray-100 text-gray-400',
    draft: 'bg-amber-100 text-amber-700',
    finalized: 'bg-blue-100 text-blue-700',
};

export default function ReferrerDetailClient({ referrerId, basePath }: { referrerId: string; basePath: string }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'patients' | 'ledger' | 'statements'>('patients');

    const load = async () => {
        setLoading(true);
        const res = await getReferrerDetail(referrerId);
        if (res.success) setData(res.data);
        setLoading(false);
    };
    useEffect(() => {
        load();
    }, [referrerId]);

    if (loading) {
        return (
            <div className="p-10 text-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin inline" /> Loading...
            </div>
        );
    }
    if (!data) {
        return <div className="p-10 text-center text-gray-400">Referrer not found.</div>;
    }

    const r = data.referrer;
    const totalAccrued = data.commissions
        .filter((c: any) => c.status !== 'void')
        .reduce((s: number, c: any) => s + c.commission_amount, 0);
    const totalPaid = data.commissions
        .filter((c: any) => c.status === 'paid')
        .reduce((s: number, c: any) => s + c.commission_amount, 0);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
                <ArrowLeft className="h-4 w-4" /> All referrers
            </Link>

            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-800">{r.name}</h1>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">
                            {CATEGORY_LABEL[r.category] || r.category}
                        </span>
                        {r.phone && <span>{r.phone}</span>}
                        {r.email && <span>{r.email}</span>}
                    </div>
                </div>
                <div className="flex items-start gap-5">
                    <div className="text-right">
                        <div className="text-[10px] uppercase text-gray-400 font-black">Outstanding</div>
                        <div className="text-xl font-black text-gray-800">{inr(totalAccrued - totalPaid)}</div>
                        <div className="text-[11px] text-gray-400">
                            {inr(totalAccrued)} accrued · {inr(totalPaid)} paid
                        </div>
                    </div>
                    {/* Entry point to the patient-wise consultant-charge worksheet. */}
                    <Link
                        href={`${basePath}/${referrerId}/statement`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 shadow-sm"
                    >
                        <Wallet className="h-4 w-4" /> Raise Consultant Invoice
                    </Link>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
                {(['patients', 'ledger', 'statements'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-bold capitalize ${
                            tab === t ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500'
                        }`}
                    >
                        {t === 'ledger' ? 'Commission ledger' : t}
                    </button>
                ))}
            </div>

            {tab === 'patients' && <PatientsTab patients={data.patients} />}
            {tab === 'ledger' && <LedgerTab commissions={data.commissions} />}
            {tab === 'statements' && (
                <StatementsTab referrerId={referrerId} statements={data.statements} onChange={load} />
            )}
        </div>
    );
}

function PatientsTab({ patients }: { patients: any[] }) {
    if (!patients.length) return <Empty text="No patients referred yet." />;
    return (
        <Table head={['Patient', 'UHID', 'Phone', 'Registered', 'Commission earned']}>
            {patients.map((p) => (
                <tr key={p.patient_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-bold text-gray-800">{p.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.patient_id}</td>
                    <td className="px-4 py-3 text-gray-500">{p.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 text-right font-bold">{inr(p.commission_earned)}</td>
                </tr>
            ))}
        </Table>
    );
}

function LedgerTab({ commissions }: { commissions: any[] }) {
    if (!commissions.length) return <Empty text="No commission accrued yet." />;
    return (
        <Table head={['Invoice', 'Type', 'Collected base', 'Rate', 'Commission', 'Status', 'Date']}>
            {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500">#{c.invoice_id}</td>
                    <td className="px-4 py-3 text-gray-500">{c.invoice_type}</td>
                    <td className="px-4 py-3 text-right">{inr(c.eligible_base)}</td>
                    <td className="px-4 py-3 text-right">{c.rate_applied ? `${c.rate_applied}%` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">{inr(c.commission_amount)}</td>
                    <td className="px-4 py-3">
                        <Badge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(c.accrued_at)}</td>
                </tr>
            ))}
        </Table>
    );
}

function StatementsTab({
    referrerId,
    statements,
    onChange,
}: {
    referrerId: string;
    statements: any[];
    onChange: () => void;
}) {
    const [showCreate, setShowCreate] = useState(false);
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payFor, setPayFor] = useState<any | null>(null);

    const create = async () => {
        if (!start || !end) {
            setError('Pick a date range');
            return;
        }
        setBusy(true);
        setError(null);
        const res = await createPayoutStatement({ referrer_id: referrerId, period_start: start, period_end: end });
        setBusy(false);
        if (!res.success) {
            setError(res.error || 'Failed');
            return;
        }
        setShowCreate(false);
        setStart('');
        setEnd('');
        onChange();
    };

    return (
        <div>
            <div className="flex justify-end mb-3">
                <button
                    onClick={() => setShowCreate((s) => !s)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600"
                >
                    <Plus className="h-4 w-4" /> New statement
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">From</label>
                        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="block px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">To</label>
                        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="block px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <button onClick={create} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-500 text-white font-bold text-sm disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
                    </button>
                    {error && <span className="text-sm text-red-500">{error}</span>}
                    <p className="w-full text-[11px] text-gray-400">Pulls all accrued commissions in the range into a draft statement.</p>
                </div>
            )}

            {!statements.length ? (
                <Empty text="No statements yet." />
            ) : (
                <Table head={['Period', 'Total', 'Status', 'Paid', 'Reference', 'Actions']}>
                    {statements.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-gray-600">
                                {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold">{inr(s.total_commission)}</td>
                            <td className="px-4 py-3">
                                <Badge status={s.status} />
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                                {s.paid_amount != null ? `${inr(s.paid_amount)} · ${s.paid_at ? fmtDate(s.paid_at) : ''}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{s.payment_reference || '—'}</td>
                            <td className="px-4 py-3 text-right">
                                <div className="flex items-center gap-3 justify-end">
                                    {s.status !== 'paid' && (
                                        <>
                                            <button
                                                onClick={() => setPayFor(s)}
                                                className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold hover:underline"
                                            >
                                                <Check className="h-3.5 w-3.5" /> Mark paid
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    await discardStatement(s.id);
                                                    onChange();
                                                }}
                                                className="text-gray-400 hover:text-red-500"
                                                title="Discard (release lines)"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                    <PrintButton statement={s} />
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            )}

            {payFor && <MarkPaidModal statement={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); onChange(); }} />}
        </div>
    );
}

function MarkPaidModal({ statement, onClose, onDone }: { statement: any; onClose: () => void; onDone: () => void }) {
    const [mode, setMode] = useState('Bank Transfer');
    const [reference, setReference] = useState('');
    const [amount, setAmount] = useState(String(statement.total_commission));
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        const res = await markStatementPaid({
            statementId: statement.id,
            payment_mode: mode,
            payment_reference: reference,
            paid_amount: amount,
            notes,
        });
        setBusy(false);
        if (!res.success) {
            setError(res.error || 'Failed');
            return;
        }
        onDone();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-3">
                <h2 className="text-lg font-black text-gray-800">Mark statement paid</h2>
                <div className="space-y-2">
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Paid amount" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                        {['Bank Transfer', 'Cash', 'UPI', 'Cheque', 'Other'].map((m) => (
                            <option key={m}>{m}</option>
                        ))}
                    </select>
                    <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference / txn id" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100">Cancel</button>
                    <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm paid
                    </button>
                </div>
            </div>
        </div>
    );
}

function PrintButton({ statement }: { statement: any }) {
    return (
        <button
            onClick={() => window.print()}
            className="text-gray-400 hover:text-gray-600"
            title="Print / export"
        >
            <FileText className="h-4 w-4" />
        </button>
    );
}

function Badge({ status }: { status: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-500'}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-black">
                    <tr>
                        {head.map((h, i) => (
                            <th key={h} className={`px-4 py-3 ${i === 0 ? 'text-left' : 'text-left'}`}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">{children}</tbody>
            </table>
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">{text}</div>;
}
