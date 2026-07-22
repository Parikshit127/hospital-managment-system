'use client';

/**
 * ConsultantChargeStatementClient
 * -------------------------------
 * Consultant-charge worksheet — the referrer counterpart of the doctor invoicing
 * worksheet. Lists every patient this consultant referred, grouped one card per
 * patient, with each bill and the services behind it. The biller ticks the
 * patients (or individual bills) to include and raises a consultant invoice for
 * exactly that subset: pick 15 of 20 and the invoice, its totals and its printout
 * cover only those 15.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, Loader2, CheckCircle2, Wallet, Printer, Search, Users,
    FileText, AlertTriangle, ChevronDown, ChevronRight, Lock, Filter,
} from 'lucide-react';
import { getConsultantWorkload, createConsultantInvoiceForBills } from '@/app/actions/consultant-charge-actions';
import { fmtIstDate, fmtIstDateTime } from '@/app/lib/ist';

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;

type Service = { name: string; net: number; collected: number; rate: number; amount: number };
type Bill = {
    invoice_id: number;
    invoice_number: string;
    invoice_type: string;
    status: string;
    created_at: string;
    bill_net: number;
    bill_paid: number;
    collected: number;
    services: Service[];
    rate_applied: number;
    commission_amount: number;
    commission_status: string | null;
    locked: boolean;
};
type Patient = {
    patient_id: string;
    patient_name: string;
    phone: string | null;
    bills: Bill[];
    visit_count: number;
    last_visit: string | null;
    total_collected: number;
    total_commission: number;
    selectable_count: number;
};
type Data = {
    referrer: { id: string; name: string; category?: string | null };
    org: { name: string; address: string | null; phone: string | null; license_no: string | null };
    commission_type: string;
    commission_configured: boolean;
    patients: Patient[];
    totals: { patients: number; bills: number; collected: number; commission: number };
};

const INVOICE_TYPES = ['all', 'OPD', 'IPD', 'Pharmacy', 'Lab', 'Procedure'];

export default function ConsultantChargeStatementClient({
    referrerId,
    basePath,
}: {
    referrerId: string;
    basePath: string;
}) {
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [reference, setReference] = useState('');
    const [mode, setMode] = useState('Bank Transfer');
    const [markPaid, setMarkPaid] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [invoiceType, setInvoiceType] = useState('all');
    const [settlement, setSettlement] = useState('pending');
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');

    const load = async () => {
        setLoading(true);
        const res = await getConsultantWorkload(referrerId, {
            from: from || undefined,
            to: to || undefined,
            invoice_type: invoiceType,
            settlement,
            search: appliedSearch || undefined,
        });
        if (res.success && res.data) {
            setData(res.data as unknown as Data);
            setSelected(new Set());
        } else {
            setError(res.error || 'Failed to load');
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [referrerId, from, to, invoiceType, settlement, appliedSearch]);

    const patients = data?.patients ?? [];
    const selectableBills = useMemo(() => patients.flatMap((p) => p.bills.filter((b) => !b.locked)), [patients]);
    const allSelected = selectableBills.length > 0 && selected.size === selectableBills.length;

    const toggleBill = (id: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const togglePatient = (p: Patient) =>
        setSelected((prev) => {
            const next = new Set(prev);
            const ids = p.bills.filter((b) => !b.locked).map((b) => b.invoice_id);
            const isFull = ids.length > 0 && ids.every((id) => next.has(id));
            ids.forEach((id) => (isFull ? next.delete(id) : next.add(id)));
            return next;
        });

    const toggleAll = () =>
        setSelected((prev) =>
            prev.size === selectableBills.length ? new Set() : new Set(selectableBills.map((b) => b.invoice_id)),
        );

    const toggleExpand = (pid: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(pid) ? next.delete(pid) : next.add(pid);
            return next;
        });

    const selection = useMemo(() => {
        const rows = patients
            .map((p) => ({ ...p, bills: p.bills.filter((b) => selected.has(b.invoice_id)) }))
            .filter((p) => p.bills.length > 0);
        const bills = rows.flatMap((p) => p.bills);
        return {
            patients: rows,
            billCount: bills.length,
            collected: bills.reduce((s, b) => s + b.collected, 0),
            commission: bills.reduce((s, b) => s + b.commission_amount, 0),
        };
    }, [patients, selected]);

    const raiseInvoice = async () => {
        if (!selected.size) return;
        setBusy(true);
        setError(null);
        setDone(null);
        const res = await createConsultantInvoiceForBills({
            referrerId,
            invoiceIds: Array.from(selected),
            payment_mode: mode,
            payment_reference: reference || undefined,
            mark_paid: markPaid,
        });
        setBusy(false);
        if (!res.success) {
            setError(res.error || 'Failed to raise consultant invoice');
            return;
        }
        const d = res.data as any;
        setDone(
            `Consultant invoice ${d.statementNumber} raised — ${d.billCount} bill(s), ${inr(d.total)}` +
                (d.skipped ? ` · ${d.skipped} skipped (already invoiced)` : ''),
        );
        setReference('');
        await load();
    };

    if (loading && !data) {
        return (
            <div className="p-10 text-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin inline" /> Loading consultant charges…
            </div>
        );
    }
    if (!data) return <div className="p-10 text-center text-gray-400">{error || 'Consultant not found.'}</div>;

    const r = data.referrer;
    const printedAt = fmtIstDateTime(new Date());
    const printPatients = selection.patients.length ? selection.patients : patients;
    const printTotals = selection.patients.length
        ? { collected: selection.collected, commission: selection.commission, bills: selection.billCount }
        : { collected: data.totals.collected, commission: data.totals.commission, bills: data.totals.bills };

    return (
        <div className="p-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
            {/* ══ PRINT DOCUMENT — only the selected patients ═══════════════════ */}
            <div className="hidden print:block">
                <div className="mb-4 border-b-2 border-gray-900 pb-3 flex items-start justify-between">
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
                        <div className="text-[9px] uppercase tracking-[0.2em] font-black text-gray-500">Consultant Charges</div>
                        <div className="text-base font-black text-black">Consultant Charge Invoice</div>
                        <div className="text-[11px] text-gray-700">Generated: {printedAt}</div>
                    </div>
                </div>

                <div className="mb-3 flex items-end justify-between text-[12px] text-gray-800">
                    <div>
                        <div>
                            <span className="font-black text-black">Consultant:</span> {r.name}
                            {r.category ? ` — ${r.category}` : ''}
                        </div>
                        {(from || to) && (
                            <div>
                                <span className="font-black text-black">Period:</span> {from ? fmtIstDate(from) : '—'} to{' '}
                                {to ? fmtIstDate(to) : '—'}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <div>
                            <span className="font-black text-black">Patients:</span> {printPatients.length} ·{' '}
                            <span className="font-black text-black">Bills:</span> {printTotals.bills}
                        </div>
                        <div>
                            <span className="font-black text-black">Total payable:</span> {inr(printTotals.commission)}
                        </div>
                    </div>
                </div>

                <table className="w-full text-[11px] border-collapse">
                    <thead>
                        <tr className="border-y border-gray-500 text-left">
                            <th className="py-1.5 pr-2">#</th>
                            <th className="py-1.5 pr-2">Patient</th>
                            <th className="py-1.5 pr-2">UHID</th>
                            <th className="py-1.5 pr-2">Bill No.</th>
                            <th className="py-1.5 pr-2">Type</th>
                            <th className="py-1.5 pr-2">Date</th>
                            <th className="py-1.5 pr-2 text-right">Collected</th>
                            <th className="py-1.5 pr-2 text-right">Rate</th>
                            <th className="py-1.5 text-right">Payable</th>
                        </tr>
                    </thead>
                    <tbody>
                        {printPatients.map((p, pi) =>
                            p.bills.map((b, bi) => (
                                <React.Fragment key={b.invoice_id}>
                                    <tr className="border-b border-gray-200">
                                        <td className="py-1 pr-2">{bi === 0 ? pi + 1 : ''}</td>
                                        <td className="py-1 pr-2 font-bold">{bi === 0 ? p.patient_name || '—' : ''}</td>
                                        <td className="py-1 pr-2">{bi === 0 ? p.patient_id : ''}</td>
                                        <td className="py-1 pr-2">{b.invoice_number}</td>
                                        <td className="py-1 pr-2">{b.invoice_type}</td>
                                        <td className="py-1 pr-2">{fmtIstDate(b.created_at)}</td>
                                        <td className="py-1 pr-2 text-right">{inr(b.collected)}</td>
                                        <td className="py-1 pr-2 text-right">{b.rate_applied ? `${round2(b.rate_applied)}%` : '—'}</td>
                                        <td className="py-1 text-right font-bold">{inr(b.commission_amount)}</td>
                                    </tr>
                                    {(b.services || []).map((s, si) => (
                                        <tr key={`${b.invoice_id}-s${si}`} className="text-[10px] text-gray-600">
                                            <td />
                                            <td className="py-0.5 pr-2" colSpan={4}>
                                                ↳ {s.name}
                                            </td>
                                            <td />
                                            <td className="py-0.5 pr-2 text-right">{inr(s.collected)}</td>
                                            <td className="py-0.5 pr-2 text-right">{s.rate ? `${round2(s.rate)}%` : '—'}</td>
                                            <td className="py-0.5 text-right">{inr(s.amount)}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )),
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-gray-800 font-black">
                            <td className="py-2" colSpan={6}>
                                TOTAL — {printPatients.length} patient(s), {printTotals.bills} bill(s)
                            </td>
                            <td className="py-2 text-right">{inr(printTotals.collected)}</td>
                            <td />
                            <td className="py-2 text-right">{inr(printTotals.commission)}</td>
                        </tr>
                    </tfoot>
                </table>

                <div className="flex justify-between mt-16 text-[12px] text-gray-800">
                    <div className="border-t border-gray-700 pt-1 w-48 text-center">Prepared by</div>
                    <div className="border-t border-gray-700 pt-1 w-48 text-center">Consultant&apos;s signature</div>
                    <div className="border-t border-gray-700 pt-1 w-48 text-center">Authorised signatory</div>
                </div>
            </div>

            {/* ══ INTERACTIVE WORKSHEET ════════════════════════════════════════ */}
            <div className="print:hidden">
                <Link
                    href={`${basePath}/${referrerId}`}
                    className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to consultant
                </Link>

                <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            <Wallet className="h-6 w-6 text-teal-500" /> Consultant Charges
                        </h1>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <span className="font-bold text-gray-700">{r.name}</span>
                            {r.category && <span>· {r.category}</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => window.print()}
                        disabled={patients.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 disabled:opacity-40"
                    >
                        <Printer className="h-4 w-4" />
                        Print {selection.patients.length ? `${selection.patients.length} selected` : 'all'}
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    {[
                        { label: 'Patients', value: String(data.totals.patients), icon: Users, tone: 'text-teal-500' },
                        { label: 'Bills', value: String(data.totals.bills), icon: FileText, tone: 'text-blue-500' },
                        { label: 'Collected', value: inr(data.totals.collected), icon: Wallet, tone: 'text-emerald-500' },
                        { label: 'Payable', value: inr(data.totals.commission), icon: CheckCircle2, tone: 'text-violet-500' },
                    ].map((c) => (
                        <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase text-gray-400 font-black">
                                <c.icon className={`h-3.5 w-3.5 ${c.tone}`} /> {c.label}
                            </div>
                            <div className="text-xl font-black text-gray-800 mt-1">{c.value}</div>
                        </div>
                    ))}
                </div>

                {!data.commission_configured && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            No charge rate is configured for this consultant, so every <b>Payable</b> figure below is ₹0.
                            The patients and bills are still correct — set a rate on the consultant&apos;s profile to compute the payout.
                        </span>
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
                    <div className="flex items-center gap-2 text-[10px] uppercase text-gray-400 font-black mb-3">
                        <Filter className="h-3.5 w-3.5" /> Filters
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">From</span>
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">To</span>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">Bill type</span>
                            <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                                {INVOICE_TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">Status</span>
                            <select value={settlement} onChange={(e) => setSettlement(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                                <option value="pending">Not yet invoiced</option>
                                <option value="invoiced">Already invoiced</option>
                                <option value="all">All</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <span className="text-[10px] uppercase text-gray-400 font-black">Search</span>
                            <div className="relative">
                                <Search className="h-4 w-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && setAppliedSearch(search)}
                                    onBlur={() => setAppliedSearch(search)}
                                    placeholder="Patient name, UHID or bill no."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                        </label>
                        {(from || to || invoiceType !== 'all' || settlement !== 'pending' || appliedSearch) && (
                            <button
                                onClick={() => { setFrom(''); setTo(''); setInvoiceType('all'); setSettlement('pending'); setSearch(''); setAppliedSearch(''); }}
                                className="px-3 py-2 text-sm font-bold text-gray-500 hover:text-gray-700"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {done && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> {done}
                    </div>
                )}
                {error && (
                    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-600">{error}</div>
                )}

                {loading ? (
                    <div className="p-10 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading…</div>
                ) : patients.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                        No patients found for this consultant with the current filters.
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableBills.length === 0} aria-label="Select all patients" />
                            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-black">
                                Select all · {patients.length} patient(s), {selectableBills.length} selectable bill(s)
                            </span>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {patients.map((p) => {
                                const ids = p.bills.filter((b) => !b.locked).map((b) => b.invoice_id);
                                const selCount = ids.filter((id) => selected.has(id)).length;
                                const isFull = ids.length > 0 && selCount === ids.length;
                                const isPartial = selCount > 0 && !isFull;
                                const isOpen = expanded.has(p.patient_id);

                                return (
                                    <div key={p.patient_id} className={isFull || isPartial ? 'bg-teal-50/40' : ''}>
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={isFull}
                                                ref={(el) => { if (el) el.indeterminate = isPartial; }}
                                                onChange={() => togglePatient(p)}
                                                disabled={ids.length === 0}
                                                aria-label={`Select ${p.patient_name}`}
                                            />
                                            <button onClick={() => toggleExpand(p.patient_id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                                                {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-800 truncate">
                                                        {p.patient_name || '—'}
                                                        {ids.length === 0 && (
                                                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-black text-gray-400">
                                                                <Lock className="h-3 w-3" /> all invoiced
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-gray-400">
                                                        {p.patient_id} · {p.visit_count} bill(s)
                                                        {p.last_visit && ` · last ${fmtIstDate(p.last_visit)}`}
                                                    </div>
                                                </div>
                                            </button>
                                            <div className="hidden sm:block text-right shrink-0">
                                                <div className="text-[10px] uppercase text-gray-400 font-black">Collected</div>
                                                <div className="text-sm font-bold text-gray-700">{inr(p.total_collected)}</div>
                                            </div>
                                            <div className="text-right shrink-0 w-28">
                                                <div className="text-[10px] uppercase text-gray-400 font-black">Payable</div>
                                                <div className="text-sm font-black text-gray-800">{inr(p.total_commission)}</div>
                                            </div>
                                        </div>

                                        {isOpen && (
                                            <div className="px-4 pb-3 pl-12">
                                                <table className="w-full text-xs">
                                                    <thead className="text-[10px] uppercase text-gray-400 font-black">
                                                        <tr>
                                                            <th className="py-2 w-8" />
                                                            <th className="py-2 text-left">Bill</th>
                                                            <th className="py-2 text-left">Services</th>
                                                            <th className="py-2 text-left">Date</th>
                                                            <th className="py-2 text-right">Collected</th>
                                                            <th className="py-2 text-right">Payable</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {p.bills.map((b) => (
                                                            <tr key={b.invoice_id} className={b.locked ? 'opacity-50' : ''}>
                                                                <td className="py-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selected.has(b.invoice_id)}
                                                                        onChange={() => toggleBill(b.invoice_id)}
                                                                        disabled={b.locked}
                                                                        aria-label={`Select ${b.invoice_number}`}
                                                                    />
                                                                </td>
                                                                <td className="py-2">
                                                                    <div className="font-bold text-gray-700">{b.invoice_number}</div>
                                                                    <div className="text-gray-400">{b.invoice_type}</div>
                                                                </td>
                                                                <td className="py-2">
                                                                    {(b.services || []).length === 0 ? (
                                                                        <span className="text-gray-300">—</span>
                                                                    ) : (
                                                                        <div className="space-y-0.5">
                                                                            {b.services.map((s, si) => (
                                                                                <div key={si} className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                                                                    <span className="max-w-[180px] truncate" title={s.name}>{s.name}</span>
                                                                                    <span className="text-gray-300">·</span>
                                                                                    <span className={`font-bold ${s.rate ? 'text-teal-600' : 'text-gray-300'}`}>@{round2(s.rate)}%</span>
                                                                                    <span className="text-gray-300">=</span>
                                                                                    <span className="font-bold text-gray-600">{inr(s.amount)}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {b.locked && (
                                                                        <div className="text-[10px] text-gray-400 mt-1 inline-flex items-center gap-1">
                                                                            <Lock className="h-3 w-3" /> {b.commission_status === 'paid' ? 'paid' : 'on a draft invoice'}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="py-2 text-gray-500">{fmtIstDate(b.created_at)}</td>
                                                                <td className="py-2 text-right text-gray-600">{inr(b.collected)}</td>
                                                                <td className="py-2 text-right font-bold text-gray-800">{inr(b.commission_amount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                                    {['Bank Transfer', 'Cash', 'UPI', 'Cheque', 'Other'].map((m) => <option key={m}>{m}</option>)}
                                </select>
                                <input
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="Reference / txn id (optional)"
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-52"
                                />
                                <label className="flex items-center gap-2 text-sm text-gray-600 font-bold">
                                    <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                                    Mark as paid
                                </label>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] uppercase text-gray-400 font-black">
                                        {selection.patients.length} patient(s) · {selection.billCount} bill(s)
                                    </div>
                                    <div className="text-lg font-black text-gray-800">{inr(selection.commission)}</div>
                                </div>
                                <button
                                    onClick={raiseInvoice}
                                    disabled={busy || selected.size === 0}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                    Raise Consultant Invoice
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
