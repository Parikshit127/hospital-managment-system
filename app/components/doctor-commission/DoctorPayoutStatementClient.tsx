'use client';

/**
 * DoctorPayoutStatementClient
 * ---------------------------
 * Doctor invoicing worksheet.
 *
 * Lists every patient a doctor is attributable for — as the bill's attending /
 * consulting doctor, or as the "Rendered by" doctor on individual line items —
 * grouped one card per patient. The biller ticks the patients (or individual
 * bills) to include and raises a doctor invoice for exactly that subset: pick 15
 * of 20 patients and the invoice, its totals and its printout cover only those 15.
 *
 * Visibility is driven by the BILLS, not by the commission ledger, so patients
 * appear even when no commission rate is configured (the common case) — in that
 * situation the payout column is ₹0 and a banner says so, instead of the page
 * wrongly reporting that there is nothing to invoice.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Loader2, CheckCircle2, Wallet, Printer, Search, Users,
    FileText, AlertTriangle, ChevronDown, ChevronRight, Lock, Stethoscope, Filter, RotateCcw, X, Clock,
} from 'lucide-react';
import { getDoctorStatementWorkload, createDoctorInvoiceForBills } from '@/app/actions/doctor-commission-actions';
import { applyBillEdit, invoiceTotals, PAYMENT_MODES, type BillEdit } from '@/app/lib/doctor-invoice-calc';
import { fmtIstDate, fmtIstDateTime } from '@/app/lib/ist';

const inr = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
/** Blended per-service rates rarely land on a whole number — keep them readable. */
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;

type Bill = {
    invoice_id: number;
    invoice_number: string;
    invoice_type: string;
    status: string;
    created_at: string;
    bill_net: number;
    bill_paid: number;
    doctor_net: number;
    doctor_collected: number;
    attribution: 'attending' | 'rendered' | 'both';
    rendered_services: string[];
    services: Array<{ item_id: number | null; name: string; net: number; collected: number; rate: number; amount: number; base_rate?: number | null }>;
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
    total_net: number;
    total_collected: number;
    total_commission: number;
    selectable_count: number;
};

type Data = {
    doctor: { id: string; name: string; specialty?: string | null };
    org: { name: string; address: string | null; phone: string | null; license_no: string | null };
    config: { commission_type: string; flat_percent: number | null; is_active: boolean } | null;
    default_percent: number;
    default_tds_percent: number;
    commission_configured: boolean;
    patients: Patient[];
    totals: { patients: number; bills: number; net: number; collected: number; commission: number };
    awaiting_payment: { count: number; amount: number };
};

const INVOICE_TYPES = ['all', 'OPD', 'IPD', 'Pharmacy', 'Lab', 'Procedure'];

const ATTRIBUTION_BADGE: Record<Bill['attribution'], { label: string; cls: string }> = {
    attending: { label: 'Attending', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    rendered: { label: 'Rendered by', cls: 'bg-violet-50 text-violet-600 border-violet-200' },
    both: { label: 'Attending + Rendered', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
};

export default function DoctorPayoutStatementClient({ doctorId, basePath }: { doctorId: string; basePath: string }) {
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const router = useRouter();
    // Unsaved per-bill changes made on this screen, keyed by invoice id. They only
    // become real when the invoice is created.
    const [edits, setEdits] = useState<Record<number, BillEdit>>({});
    const [bulkRate, setBulkRate] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [tdsPercent, setTdsPercent] = useState(10);
    const tdsTouched = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [invoiceType, setInvoiceType] = useState('all');
    const [settlement, setSettlement] = useState('pending');
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');

    const load = async () => {
        setLoading(true);
        const res = await getDoctorStatementWorkload(doctorId, {
            from: from || undefined,
            to: to || undefined,
            invoice_type: invoiceType,
            settlement,
            search: appliedSearch || undefined,
        });
        if (res.success && res.data) {
            const loaded = res.data as unknown as Data;
            setData(loaded);
            setSelected(new Set());
            setEdits({});
            if (!tdsTouched.current) setTdsPercent(loaded.default_tds_percent);
        } else {
            setError(res.error || 'Failed to load');
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doctorId, from, to, invoiceType, settlement, appliedSearch]);

    const patients = data?.patients ?? [];

    /** Every bill the biller is allowed to put on an invoice. */
    const selectableBills = useMemo(
        () => patients.flatMap((p) => p.bills.filter((b) => !b.locked)),
        [patients],
    );
    const allSelected = selectableBills.length > 0 && selected.size === selectableBills.length;

    const toggleBill = (id: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    /** Ticking a patient takes/drops ALL of that patient's selectable bills at once. */
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

    /** What a bill will pay once the biller's unsaved edits are applied. */
    const effOf = useCallback(
        (b: Bill) => {
            const e = edits[b.invoice_id];
            if (!e) return { amount: b.commission_amount, services: b.services, changed: false };
            const a = applyBillEdit(b.commission_amount, b.services as any, e);
            return { amount: a.final, services: a.services as Bill['services'], changed: a.adjusted };
        },
        [edits],
    );

    const patchEdit = (id: number, p: Partial<BillEdit>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
    const resetEdit = (id: number) =>
        setEdits((prev) => {
            const n = { ...prev };
            delete n[id];
            return n;
        });

    /** Same rate on every ticked bill — "pay this doctor 40% on everything here". */
    const applyBulkRate = () => {
        const r = Number(bulkRate);
        if (!(r >= 0 && r <= 100) || !selected.size) return;
        setEdits((prev) => {
            const n = { ...prev };
            for (const b of patients.flatMap((p) => p.bills)) {
                if (selected.has(b.invoice_id)) n[b.invoice_id] = { ...n[b.invoice_id], amount: round2((b.doctor_collected * r) / 100) };
            }
            return n;
        });
    };

    /** The chosen subset — this is what totals, the printout and the invoice all use. */
    const selection = useMemo(() => {
        const rows = patients
            .map((p) => ({ ...p, bills: p.bills.filter((b) => selected.has(b.invoice_id)) }))
            .filter((p) => p.bills.length > 0);
        const bills = rows.flatMap((p) => p.bills);
        const commission = round2(bills.reduce((s, b) => s + effOf(b).amount, 0));
        const tds = round2((commission * tdsPercent) / 100);
        return {
            patients: rows,
            billCount: bills.length,
            changedCount: bills.filter((b) => effOf(b).changed).length,
            net: bills.reduce((s, b) => s + b.doctor_net, 0),
            collected: bills.reduce((s, b) => s + b.doctor_collected, 0),
            commission,
            tds,
            netPayable: round2(commission - tds),
        };
    }, [patients, selected, tdsPercent, effOf]);

    const createInvoice = async (v: CreateValues) => {
        if (!selected.size) return;
        setBusy(true);
        setError(null);
        const chosen = patients.flatMap((p) => p.bills).filter((b) => selected.has(b.invoice_id));
        const res = await createDoctorInvoiceForBills({
            doctorId,
            invoiceIds: chosen.map((b) => b.invoice_id),
            tds_rate_percent: v.tds,
            adjustment_amount: v.adjustment || undefined,
            adjustment_note: v.adjustmentNote || undefined,
            notes: v.notes || undefined,
            invoice_date: v.invoiceDate || undefined,
            edits: chosen
                .filter((b) => edits[b.invoice_id])
                .map((b) => ({ invoiceId: b.invoice_id, amount: edits[b.invoice_id].amount, rates: edits[b.invoice_id].rates, note: edits[b.invoice_id].note })),
            ...(v.recordNow
                ? {
                      mark_paid: true,
                      paid_amount: v.payAmount || undefined,
                      paid_at: v.payWhen ? new Date(v.payWhen).toISOString() : undefined,
                      payment_mode: v.payMode,
                      payment_reference: v.payRef || undefined,
                  }
                : {}),
        });
        setBusy(false);
        if (!res.success) {
            setError(res.error || 'Failed to raise doctor invoice');
            return;
        }
        const d = res.data as any;
        // Straight to the invoice: review it, pay it, send it.
        router.push(`${basePath}/${doctorId}/invoices/${d.statementId}`);
    };

    if (loading && !data) {
        return (
            <div className="p-10 text-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin inline" /> Loading doctor invoicing…
            </div>
        );
    }
    if (!data) return <div className="p-10 text-center text-gray-400">{error || 'Doctor not found.'}</div>;

    const d = data.doctor;
    const printedAt = fmtIstDateTime(new Date());
    // Nothing ticked yet → the printout falls back to everything on screen.
    const printPatients = selection.patients.length ? selection.patients : patients;
    const printBills = printPatients.flatMap((p) => p.bills);
    const printCommission = round2(printBills.reduce((sum, b) => sum + effOf(b).amount, 0));
    const printTds = round2((printCommission * tdsPercent) / 100);
    const printTotals = {
        net: printBills.reduce((sum, b) => sum + b.doctor_net, 0),
        collected: printBills.reduce((sum, b) => sum + b.doctor_collected, 0),
        commission: printCommission,
        bills: printBills.length,
        tds: printTds,
        netPayable: round2(printCommission - printTds),
    };

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
                        <div className="text-[9px] uppercase tracking-[0.2em] font-black text-gray-500">Doctor Invoice</div>
                        <div className="text-base font-black text-black">Professional Fee Statement</div>
                        <div className="text-[11px] text-gray-700">Generated: {printedAt}</div>
                    </div>
                </div>

                <div className="mb-3 flex items-end justify-between text-[12px] text-gray-800">
                    <div>
                        <div>
                            <span className="font-black text-black">Doctor:</span> {d.name}
                            {d.specialty ? ` — ${d.specialty}` : ''}
                        </div>
                        {(from || to) && (
                            <div>
                                <span className="font-black text-black">Period:</span>{' '}
                                {from ? fmtIstDate(from) : '—'} to {to ? fmtIstDate(to) : '—'}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <div>
                            <span className="font-black text-black">Patients:</span> {printPatients.length} ·{' '}
                            <span className="font-black text-black">Bills:</span> {printTotals.bills}
                        </div>
                        <div>
                            <span className="font-black text-black">Gross commission:</span> {inr(printTotals.commission)}
                        </div>
                        <div>
                            <span className="font-black text-black">TDS ({tdsPercent}%):</span> −{inr(printTotals.tds)}
                        </div>
                        <div className="text-sm font-black">
                            <span className="text-black">Net payable:</span> {inr(printTotals.netPayable)}
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
                            <th className="py-1.5 pr-2 text-right">Attributed</th>
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
                                        <td className="py-1 pr-2 text-right">{inr(b.doctor_net)}</td>
                                        <td className="py-1 pr-2 text-right">{inr(b.doctor_collected)}</td>
                                        <td className="py-1 pr-2 text-right">{b.rate_applied ? `${round2(b.rate_applied)}%` : '—'}</td>
                                        <td className="py-1 text-right font-bold">{inr(effOf(b).amount)}</td>
                                    </tr>
                                    {/* Named services behind this bill, each with the rate that applied —
                                        so the doctor can see exactly what they are being paid for. */}
                                    {effOf(b).services.map((s, si) => (
                                        <tr key={`${b.invoice_id}-s${si}`} className="text-[10px] text-gray-600">
                                            <td />
                                            <td className="py-0.5 pr-2" colSpan={4}>
                                                ↳ {s.name}
                                            </td>
                                            <td />
                                            <td className="py-0.5 pr-2 text-right">{inr(s.net)}</td>
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
                            <td className="py-2 text-right">{inr(printTotals.net)}</td>
                            <td className="py-2 text-right">{inr(printTotals.collected)}</td>
                            <td />
                            <td className="py-2 text-right">{inr(printTotals.commission)}</td>
                        </tr>
                        <tr>
                            <td className="pt-1 text-[10px] text-gray-500" colSpan={9}>
                                TDS ({tdsPercent}%): −{inr(printTotals.tds)}
                            </td>
                        </tr>
                        <tr className="font-black">
                            <td className="pt-0.5" colSpan={9}>
                                NET PAYABLE: {inr(printTotals.netPayable)}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                <div className="flex justify-between mt-16 text-[12px] text-gray-800">
                    <div className="border-t border-gray-700 pt-1 w-48 text-center">Prepared by</div>
                    <div className="border-t border-gray-700 pt-1 w-48 text-center">Doctor&apos;s signature</div>
                    <div className="border-t border-gray-700 pt-1 w-48 text-center">Authorised signatory</div>
                </div>
            </div>

            {/* ══ INTERACTIVE WORKSHEET ════════════════════════════════════════ */}
            <div className="print:hidden">
                <Link
                    href={`${basePath}/${doctorId}`}
                    className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to doctor
                </Link>

                <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            <Wallet className="h-6 w-6 text-indigo-500" /> Doctor Invoicing
                        </h1>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <span className="font-bold text-gray-700">{d.name}</span>
                            {d.specialty && <span>· {d.specialty}</span>}
                            {data.config?.is_active && data.config.commission_type === 'flat_percent' && data.config.flat_percent != null && (
                                <span className="text-[11px] text-indigo-500 font-bold">Flat {data.config.flat_percent}%</span>
                            )}
                            {!data.config?.is_active && data.default_percent > 0 && (
                                <span className="text-[11px] text-gray-400 font-bold">Org default {data.default_percent}%</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                    <Link
                        href={`${basePath}/${doctorId}/invoices`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50"
                    >
                        <FileText className="h-4 w-4" />
                        Invoices &amp; payments
                    </Link>
                    <button
                        onClick={() => window.print()}
                        disabled={patients.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 disabled:opacity-40"
                    >
                        <Printer className="h-4 w-4" />
                        Print {selection.patients.length ? `${selection.patients.length} selected` : 'all'}
                    </button>
                    </div>
                </div>

                {/* Summary strip */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    {[
                        { label: 'Patients', value: String(data.totals.patients), icon: Users, tone: 'text-indigo-500' },
                        { label: 'Bills', value: String(data.totals.bills), icon: FileText, tone: 'text-blue-500' },
                        { label: 'Collected (doctor share)', value: inr(data.totals.collected), icon: Wallet, tone: 'text-emerald-500' },
                        { label: 'Payable', value: inr(data.totals.commission), icon: Stethoscope, tone: 'text-violet-500' },
                        {
                            label: 'Invoiced, awaiting payment',
                            value: inr(data.awaiting_payment?.amount ?? 0),
                            icon: Clock,
                            tone: 'text-amber-500',
                            href: `${basePath}/${doctorId}/invoices`,
                        },
                    ].map((c) => {
                        const body = (
                            <>
                                <div className="flex items-center gap-2 text-[10px] uppercase text-gray-400 font-black">
                                    <c.icon className={`h-3.5 w-3.5 ${c.tone}`} /> {c.label}
                                </div>
                                <div className="text-xl font-black text-gray-800 mt-1">{c.value}</div>
                            </>
                        );
                        return c.href ? (
                            <Link key={c.label} href={c.href} className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-amber-300">
                                {body}
                            </Link>
                        ) : (
                            <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                                {body}
                            </div>
                        );
                    })}
                </div>

                {!data.commission_configured && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            No commission rate is configured for this doctor and the organisation default is 0%, so every
                            <b> Payable</b> figure below is ₹0. The patients and bills are still correct — set a rate on the
                            doctor&apos;s profile (or an org default) to compute the payout.
                        </span>
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
                    <div className="flex items-center gap-2 text-[10px] uppercase text-gray-400 font-black mb-3">
                        <Filter className="h-3.5 w-3.5" /> Filters
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">From</span>
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">To</span>
                            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">Bill type</span>
                            <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                                {INVOICE_TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase text-gray-400 font-black">Status</span>
                            <select value={settlement} onChange={(e) => setSettlement(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
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

                {error && (
                    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-600">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="p-10 text-center text-gray-400">
                        <Loader2 className="h-5 w-5 animate-spin inline" /> Loading…
                    </div>
                ) : patients.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                        No patients found for this doctor with the current filters.
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                disabled={selectableBills.length === 0}
                                aria-label="Select all patients"
                            />
                            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-black">
                                Select all · {patients.length} patient(s), {selectableBills.length} selectable bill(s)
                            </span>
                            <div className="ml-auto flex items-center gap-3">
                                {selected.size > 0 && (
                                    <div className="flex items-center gap-1.5" title="Set the same payout % on every ticked bill">
                                        <span className="text-[10px] uppercase text-gray-400 font-black">Set rate</span>
                                        <input
                                            type="number" min={0} max={100} step="0.1" value={bulkRate}
                                            onChange={(e) => setBulkRate(e.target.value)}
                                            placeholder="%"
                                            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right"
                                        />
                                        <button onClick={applyBulkRate} disabled={bulkRate === ''}
                                            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-100 disabled:opacity-40">
                                            Apply to {selected.size}
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={() => setExpanded(expanded.size ? new Set() : new Set(patients.map((p) => p.patient_id)))}
                                    className="text-xs font-bold text-indigo-600 hover:underline"
                                >
                                    {expanded.size ? 'Collapse all' : 'Expand all'}
                                </button>
                            </div>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {patients.map((p) => {
                                const ids = p.bills.filter((b) => !b.locked).map((b) => b.invoice_id);
                                const selCount = ids.filter((id) => selected.has(id)).length;
                                const isFull = ids.length > 0 && selCount === ids.length;
                                const isPartial = selCount > 0 && !isFull;
                                const isOpen = expanded.has(p.patient_id);

                                return (
                                    <div key={p.patient_id} className={isFull || isPartial ? 'bg-indigo-50/40' : ''}>
                                        {/* Patient row */}
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={isFull}
                                                ref={(el) => { if (el) el.indeterminate = isPartial; }}
                                                onChange={() => togglePatient(p)}
                                                disabled={ids.length === 0}
                                                aria-label={`Select ${p.patient_name}`}
                                            />
                                            <button
                                                onClick={() => toggleExpand(p.patient_id)}
                                                className="flex-1 flex items-center gap-3 text-left min-w-0"
                                            >
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
                                                <div className="text-sm font-black text-gray-800">
                                                    {inr(p.bills.reduce((sum, b) => sum + (b.locked ? b.commission_amount : effOf(b).amount), 0))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Per-bill breakdown */}
                                        {isOpen && (
                                            <div className="px-4 pb-3 pl-12">
                                                <table className="w-full text-xs">
                                                    <thead className="text-[10px] uppercase text-gray-400 font-black">
                                                        <tr>
                                                            <th className="py-2 w-8" />
                                                            <th className="py-2 text-left">Bill</th>
                                                            <th className="py-2 text-left">Attribution</th>
                                                            <th className="py-2 text-left">Date</th>
                                                            <th className="py-2 text-right">Attributed</th>
                                                            <th className="py-2 text-right">Collected</th>
                                                            <th className="py-2 text-right">Payable</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {p.bills.map((b) => {
                                                            const badge = ATTRIBUTION_BADGE[b.attribution];
                                                            const eff = effOf(b);
                                                            const e = edits[b.invoice_id];
                                                            const editable = !b.locked;
                                                            return (
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
                                                                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-black ${badge.cls}`}>
                                                                            {badge.label}
                                                                        </span>
                                                                        {/* What the doctor is being paid for, and at what rate. */}
                                                                        {eff.services.length > 0 && (
                                                                            <div className="mt-1 space-y-0.5">
                                                                                {eff.services.map((s, si) => (
                                                                                    <div key={si} className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                                                                        <span className="max-w-[200px] truncate" title={s.name}>{s.name}</span>
                                                                                        <span className="text-gray-300">·</span>
                                                                                        <span>{inr(s.collected)}</span>
                                                                                        {editable && s.item_id != null ? (
                                                                                            <span className="inline-flex items-center gap-0.5">
                                                                                                @<input
                                                                                                    type="number" min={0} max={100} step="0.1"
                                                                                                    value={round2(s.rate)}
                                                                                                    onChange={(ev) =>
                                                                                                        patchEdit(b.invoice_id, {
                                                                                                            amount: undefined,
                                                                                                            rates: { ...(e?.rates ?? {}), [String(s.item_id)]: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) },
                                                                                                        })
                                                                                                    }
                                                                                                    className={`w-12 px-1 py-0.5 border rounded text-right font-bold ${s.base_rate != null ? 'border-amber-300 text-amber-600' : 'border-gray-200 text-indigo-500'}`}
                                                                                                    aria-label={`Rate for ${s.name}`}
                                                                                                />%
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className={`font-bold ${s.rate ? 'text-indigo-500' : 'text-gray-300'}`}>
                                                                                                @{round2(s.rate)}%
                                                                                            </span>
                                                                                        )}
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
                                                                    <td className="py-2 text-right text-gray-600">{inr(b.doctor_net)}</td>
                                                                    <td className="py-2 text-right text-gray-600">{inr(b.doctor_collected)}</td>
                                                                    <td className="py-2 text-right">
                                                                        {editable ? (
                                                                            <div className="inline-flex flex-col items-end gap-0.5">
                                                                                <div className="inline-flex items-center gap-1">
                                                                                    <span className="text-gray-400">₹</span>
                                                                                    <input
                                                                                        type="number" min={0} step="0.01"
                                                                                        value={e?.amount != null ? e.amount : round2(eff.amount)}
                                                                                        onChange={(ev) => patchEdit(b.invoice_id, { amount: ev.target.value === '' ? 0 : Number(ev.target.value) })}
                                                                                        className={`w-24 px-2 py-1 border rounded-lg text-right font-bold ${eff.changed ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-800'}`}
                                                                                        aria-label={`Payable for ${b.invoice_number}`}
                                                                                    />
                                                                                    {e && (
                                                                                        <button onClick={() => resetEdit(b.invoice_id)} title="Reset to computed" className="text-gray-400 hover:text-indigo-600">
                                                                                            <RotateCcw className="h-3.5 w-3.5" />
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                {eff.changed && <span className="text-[10px] text-amber-600 font-bold">was {inr(b.commission_amount)}</span>}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="font-bold text-gray-800">{inr(b.commission_amount)}</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Action bar — everything here reflects the SELECTION, not the full list */}
                        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50/95 backdrop-blur px-4 py-4">
                            <div className="text-sm text-gray-500">
                                {selected.size === 0 ? (
                                    <span>Tick the patients or bills to pay this doctor for. You can change any amount or rate before creating the invoice.</span>
                                ) : (
                                    <span>
                                        <b className="text-gray-700">{selection.patients.length}</b> patient(s) · <b className="text-gray-700">{selection.billCount}</b> bill(s)
                                        {selection.changedCount > 0 && <span className="text-amber-600 font-bold"> · {selection.changedCount} edited</span>}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-xs text-gray-400">
                                        {inr(selection.commission)} gross − {inr(selection.tds)} TDS ({tdsPercent}%)
                                    </div>
                                    <div className="text-lg font-black text-gray-800">{inr(selection.netPayable)} net</div>
                                </div>
                                <button
                                    onClick={() => { setError(null); setCreateOpen(true); }}
                                    disabled={busy || selected.size === 0}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <FileText className="h-4 w-4" />
                                    Review &amp; create invoice
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {createOpen && (
                <CreateInvoiceModal
                    doctorName={d.name}
                    patientCount={selection.patients.length}
                    billCount={selection.billCount}
                    changedCount={selection.changedCount}
                    lineAmounts={selection.patients.flatMap((p) => p.bills.map((b) => effOf(b).amount))}
                    defaultTds={tdsPercent}
                    busy={busy}
                    error={error}
                    onClose={() => setCreateOpen(false)}
                    onSubmit={(v) => { tdsTouched.current = true; setTdsPercent(v.tds); return createInvoice(v); }}
                />
            )}
        </div>
    );
}

type CreateValues = {
    tds: number;
    adjustment: number;
    adjustmentNote: string;
    notes: string;
    invoiceDate: string;
    recordNow: boolean;
    payAmount: number;
    payWhen: string;
    payMode: string;
    payRef: string;
};

const localNow = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function CreateInvoiceModal({
    doctorName, patientCount, billCount, changedCount, lineAmounts, defaultTds, busy, error, onClose, onSubmit,
}: {
    doctorName: string; patientCount: number; billCount: number; changedCount: number; lineAmounts: number[];
    defaultTds: number; busy: boolean; error: string | null; onClose: () => void; onSubmit: (v: CreateValues) => void | Promise<void>;
}) {
    const [tds, setTds] = useState(defaultTds);
    const [adj, setAdj] = useState('');
    const [adjNote, setAdjNote] = useState('');
    const [notes, setNotes] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(localNow().slice(0, 10));
    const [recordNow, setRecordNow] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payWhen, setPayWhen] = useState(localNow());
    const [payMode, setPayMode] = useState<string>('Bank Transfer');
    const [payRef, setPayRef] = useState('');

    const t = invoiceTotals(lineAmounts, Number(adj) || 0, tds);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-black text-gray-800">Create doctor invoice</h2>
                        <p className="text-xs text-gray-400">
                            {doctorName} · {patientCount} patient(s), {billCount} bill(s)
                            {changedCount > 0 && ` · ${changedCount} edited`}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase text-gray-400 font-black">Invoice date</span>
                        <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase text-gray-400 font-black">TDS %</span>
                        <input type="number" min={0} max={100} step={0.1} value={tds}
                            onChange={(e) => setTds(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase text-gray-400 font-black">Adjustment ₹ (+ / −)</span>
                        <input type="number" step="0.01" value={adj} onChange={(e) => setAdj(e.target.value)} placeholder="0"
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase text-gray-400 font-black">Adjustment reason</span>
                        <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="bonus, advance recovered…"
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                </div>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice notes (optional, printed for the doctor)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />

                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm space-y-1">
                    <Row l="Bills subtotal" v={inr(t.lines)} />
                    {t.adjustment !== 0 && <Row l="Adjustment" v={(t.adjustment > 0 ? '+' : '') + inr(t.adjustment)} />}
                    <Row l={`TDS (${tds}%)`} v={'−' + inr(t.tds)} muted />
                    <div className="flex justify-between border-t border-gray-200 pt-1 font-black text-gray-800">
                        <span>Net payable</span><span>{inr(t.net)}</span>
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
                    <input type="checkbox" checked={recordNow} onChange={(e) => { setRecordNow(e.target.checked); if (e.target.checked && !payAmount) setPayAmount(String(t.net)); }} />
                    Also record a payment now
                </label>
                {recordNow && (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-400 font-bold">Amount paid (₹)</span>
                            <input type="number" min={0} step="0.01" value={payAmount} placeholder={String(t.net)} onChange={(e) => setPayAmount(e.target.value)}
                                className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm font-bold bg-white" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-400 font-bold">Paid on</span>
                            <input type="datetime-local" value={payWhen} max={localNow()} onChange={(e) => setPayWhen(e.target.value)}
                                className="px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white" />
                        </label>
                        <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                        </select>
                        <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference / txn id"
                            className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                        <p className="col-span-2 text-[11px] text-gray-400">Part payments are fine — the rest stays as balance due on the invoice.</p>
                    </div>
                )}

                {error && <p className="text-sm font-bold text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm hover:bg-gray-100">Cancel</button>
                    <button
                        disabled={busy || t.net < 0}
                        onClick={() => onSubmit({
                            tds, adjustment: Number(adj) || 0, adjustmentNote: adjNote, notes, invoiceDate,
                            recordNow, payAmount: Number(payAmount) || 0, payWhen, payMode, payRef,
                        })}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Create invoice
                    </button>
                </div>
            </div>
        </div>
    );
}

function Row({ l, v, muted }: { l: string; v: string; muted?: boolean }) {
    return (
        <div className={`flex justify-between ${muted ? 'text-gray-400' : 'text-gray-600'}`}>
            <span>{l}</span><span>{v}</span>
        </div>
    );
}
