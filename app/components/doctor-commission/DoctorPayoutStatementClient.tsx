'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, Wallet, Printer } from 'lucide-react';
import { getDoctorPayoutPending, settleDoctorCommissions } from '@/app/actions/doctor-commission-actions';

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN');

type Line = {
    id: string;
    invoice_id: number;
    invoice_number: string;
    invoice_type: string;
    patient_name: string;
    eligible_base: number;
    rate_applied: number;
    commission_amount: number;
    accrued_at: string;
};

type Org = { name: string; address: string | null; phone: string | null; license_no: string | null };

type Data = {
    doctor: { id: string; name: string; specialty?: string | null };
    org: Org;
    config: { commission_type: string; flat_percent: number | null; is_active: boolean } | null;
    lines: Line[];
    pending_total: number;
};

export default function DoctorPayoutStatementClient({ doctorId, basePath }: { doctorId: string; basePath: string }) {
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [reference, setReference] = useState('');
    const [mode, setMode] = useState('Bank Transfer');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const res = await getDoctorPayoutPending(doctorId);
        if (res.success && res.data) {
            setData(res.data as Data);
            setSelected(new Set());
        } else {
            setError(res.error || 'Failed to load');
        }
        setLoading(false);
    };
    useEffect(() => {
        load();
    }, [doctorId]);

    const lines = data?.lines ?? [];
    const allSelected = lines.length > 0 && selected.size === lines.length;

    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const toggleAll = () =>
        setSelected((prev) => (prev.size === lines.length ? new Set() : new Set(lines.map((l) => l.id))));

    const selectedTotal = useMemo(
        () => lines.filter((l) => selected.has(l.id)).reduce((s, l) => s + l.commission_amount, 0),
        [lines, selected],
    );

    const clearSelected = async () => {
        if (!selected.size) return;
        setBusy(true);
        setError(null);
        setDone(null);
        const res = await settleDoctorCommissions({
            doctorId,
            commissionIds: Array.from(selected),
            payment_mode: mode,
            payment_reference: reference || undefined,
        });
        setBusy(false);
        if (!res.success) {
            setError(res.error || 'Failed to settle');
            return;
        }
        setDone(`Settled ${res.data?.settledCount} invoice(s) · ${inr(res.data?.total ?? 0)} paid out.`);
        setReference('');
        await load();
    };

    if (loading) {
        return (
            <div className="p-10 text-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin inline" /> Loading payout statement…
            </div>
        );
    }
    if (!data) return <div className="p-10 text-center text-gray-400">{error || 'Doctor not found.'}</div>;

    const d = data.doctor;
    const printedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    return (
        <div className="p-6 max-w-6xl mx-auto print:p-0 print:max-w-none">
            {/* ── Formal document header — only rendered on print ───────────────── */}
            <div className="hidden print:block mb-5 border-b-2 border-gray-900 pb-3">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-black text-black leading-tight">{data.org.name}</h1>
                        {data.org.address && <p className="text-[11px] text-gray-700">{data.org.address}</p>}
                        {(data.org.phone || data.org.license_no) && (
                            <p className="text-[11px] text-gray-700">
                                {[data.org.phone && `Ph: ${data.org.phone}`, data.org.license_no && `License No: ${data.org.license_no}`]
                                    .filter(Boolean)
                                    .join('  ·  ')}
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                        <div className="text-[9px] uppercase tracking-[0.2em] font-black text-gray-500">Doctor Payout</div>
                        <div className="text-base font-black text-black">Payout Settlement Statement</div>
                        <div className="text-[11px] text-gray-700">Generated: {printedAt}</div>
                    </div>
                </div>
                <div className="mt-3 flex items-end justify-between text-[12px] text-gray-800">
                    <div>
                        <span className="font-black text-black">Doctor:</span> {d.name}
                        {d.specialty ? ` — ${d.specialty}` : ''}
                        {data.config?.commission_type === 'flat_percent' && data.config.flat_percent != null && (
                            <span> · Flat {data.config.flat_percent}%</span>
                        )}
                    </div>
                    <div>
                        <span className="font-black text-black">Total payable:</span> {inr(data.pending_total)} ·{' '}
                        {lines.length} invoice(s)
                    </div>
                </div>
            </div>

            <Link
                href={`${basePath}/${doctorId}`}
                className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 print:hidden"
            >
                <ArrowLeft className="h-4 w-4" /> Back to doctor
            </Link>

            {/* ── Interactive web header — hidden on print ─────────────────────── */}
            <div className="flex items-start justify-between mb-6 print:hidden">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-indigo-500" /> Payout Statement
                    </h1>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <span className="font-bold text-gray-700">{d.name}</span>
                        {d.specialty && <span>· {d.specialty}</span>}
                        {data.config?.commission_type === 'flat_percent' && data.config.flat_percent != null && (
                            <span className="text-[11px] text-indigo-500 font-bold">Flat {data.config.flat_percent}%</span>
                        )}
                    </div>
                </div>
                <div className="flex items-start gap-4">
                    <div className="text-right">
                        <div className="text-[10px] uppercase text-gray-400 font-black">Pending payout</div>
                        <div className="text-xl font-black text-gray-800">{inr(data.pending_total)}</div>
                        <div className="text-[11px] text-gray-400">{lines.length} unpaid invoice(s)</div>
                    </div>
                    {lines.length > 0 && (
                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50"
                        >
                            <Printer className="h-4 w-4" /> Print
                        </button>
                    )}
                </div>
            </div>

            {done && (
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-700 print:hidden">
                    <CheckCircle2 className="h-4 w-4" /> {done}
                </div>
            )}
            {error && (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-600 print:hidden">
                    {error}
                </div>
            )}

            {lines.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                    No unpaid invoices — everything is settled. 🎉
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden print:rounded-none print:border-0">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-black print:bg-white print:text-black print:border-b print:border-gray-400">
                            <tr>
                                <th className="px-4 py-3 text-left w-10 print:hidden">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleAll}
                                        aria-label="Select all invoices"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left">Invoice</th>
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-left">Patient</th>
                                <th className="px-4 py-3 text-right">Collected base</th>
                                <th className="px-4 py-3 text-right">Rate</th>
                                <th className="px-4 py-3 text-right">Commission</th>
                                <th className="px-4 py-3 text-left">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 print:divide-gray-200">
                            {lines.map((l) => {
                                const isSel = selected.has(l.id);
                                return (
                                    <tr
                                        key={l.id}
                                        onClick={() => toggle(l.id)}
                                        className={`cursor-pointer print:cursor-auto print:!bg-white ${isSel ? 'bg-indigo-50/60' : 'hover:bg-gray-50/50'}`}
                                    >
                                        <td className="px-4 py-3 print:hidden" onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" checked={isSel} onChange={() => toggle(l.id)} aria-label={`Select ${l.invoice_number}`} />
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 print:text-black">{l.invoice_number}</td>
                                        <td className="px-4 py-3 text-gray-500 print:text-black">{l.invoice_type}</td>
                                        <td className="px-4 py-3 font-bold text-gray-800 print:text-black">{l.patient_name || '—'}</td>
                                        <td className="px-4 py-3 text-right print:text-black">{inr(l.eligible_base)}</td>
                                        <td className="px-4 py-3 text-right print:text-black">{l.rate_applied ? `${l.rate_applied}%` : '—'}</td>
                                        <td className="px-4 py-3 text-right font-bold print:text-black">{inr(l.commission_amount)}</td>
                                        <td className="px-4 py-3 text-gray-500 print:text-black">{fmtDate(l.accrued_at)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {/* Print-only grand total row (checkboxes/selection don't exist on paper) */}
                        <tfoot className="hidden print:table-footer-group">
                            <tr className="border-t-2 border-gray-800 font-black text-black">
                                <td className="px-4 py-3" colSpan={5}>
                                    Total payable ({lines.length} invoice{lines.length === 1 ? '' : 's'})
                                </td>
                                <td className="px-4 py-3 text-right">{inr(data.pending_total)}</td>
                                <td className="px-4 py-3"></td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Print-only signature block */}
                    <div className="hidden print:flex justify-between mt-16 px-4 text-[12px] text-gray-800">
                        <div className="border-t border-gray-700 pt-1 w-48 text-center">Prepared by</div>
                        <div className="border-t border-gray-700 pt-1 w-48 text-center">Authorised signatory</div>
                    </div>

                    {/* Dynamic summary footer — interactive, hidden on print */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4 print:hidden">
                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={mode}
                                onChange={(e) => setMode(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                {['Bank Transfer', 'Cash', 'UPI', 'Cheque', 'Other'].map((m) => (
                                    <option key={m}>{m}</option>
                                ))}
                            </select>
                            <input
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder="Reference / txn id (optional)"
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-56"
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-[10px] uppercase text-gray-400 font-black">
                                    {selected.size} selected
                                </div>
                                <div className="text-lg font-black text-gray-800">{inr(selectedTotal)}</div>
                            </div>
                            <button
                                onClick={clearSelected}
                                disabled={busy || selected.size === 0}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Clear Selected Invoices
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
