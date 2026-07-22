'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileUser, Search, Printer, Loader2, AlertTriangle } from 'lucide-react';
import { searchPatientsForReport, getSinglePatientReport } from '@/app/actions/single-patient-report-actions';

function money(n: any) {
    return Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}
function dt(v: any) {
    return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function d(v: any) {
    return v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest">{title}</h3>
                <span className="text-[10px] font-bold text-gray-400">{count} record{count === 1 ? '' : 's'}</span>
            </div>
            {count === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400">Nothing on record.</p>
            ) : (
                <div className="overflow-x-auto">{children}</div>
            )}
        </div>
    );
}

const th = 'px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest';
const td = 'px-4 py-2 text-xs text-gray-700';

export default function SinglePatientReportPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (query.trim().length < 2 || selected) { setResults([]); return; }
        let cancelled = false;
        setSearching(true);
        const t = setTimeout(async () => {
            const res = await searchPatientsForReport(query);
            if (cancelled) return;
            setResults(res.success ? res.data : []);
            setSearching(false);
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query, selected]);

    const loadReport = useCallback(async (patientId: string) => {
        setLoading(true);
        setError(null);
        setReport(null);
        const res = await getSinglePatientReport(patientId);
        if (res.success) setReport(res.data);
        else setError(res.error || 'Failed to load report');
        setLoading(false);
    }, []);

    function pick(p: any) {
        setSelected(p.patient_id);
        setQuery(`${p.full_name} (${p.patient_id})`);
        setResults([]);
        loadReport(p.patient_id);
    }

    function reset() {
        setSelected(null);
        setQuery('');
        setReport(null);
        setError(null);
    }

    const s = report?.summary;

    return (
        <AppShell pageTitle="Single Patient Report" pageIcon={<FileUser className="h-5 w-5" />}>
            <div className="space-y-5">
                {/* Search */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 print:hidden">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Find patient</label>
                    <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelected(null); }}
                            placeholder="Search by UHID, name or phone…"
                            className="w-full pl-10 pr-24 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400/20"
                        />
                        {selected && (
                            <button onClick={reset}
                                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] font-bold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">
                                Clear
                            </button>
                        )}
                    </div>
                    {searching && <p className="mt-2 text-xs text-gray-400">Searching…</p>}
                    {results.length > 0 && (
                        <div className="mt-2 border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-auto">
                            {results.map((p: any) => (
                                <button key={p.patient_id} onClick={() => pick(p)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition">
                                    <span className="text-sm font-bold text-gray-900">{p.full_name}</span>
                                    <span className="ml-2 text-xs font-mono text-gray-500">{p.patient_id}</span>
                                    <span className="ml-2 text-xs text-gray-400">
                                        {[p.age && `${p.age}y`, p.gender, p.phone].filter(Boolean).join(' · ')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs font-medium">
                        <AlertTriangle className="h-4 w-4" /> {error}
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Building report…
                    </div>
                )}

                {report && !loading && (
                    <>
                        {/* Header */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900">{report.patient.full_name}</h2>
                                    <p className="text-xs text-gray-500 font-mono mt-0.5">{report.patient.patient_id}</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-1 mt-4 text-xs">
                                        <div><span className="text-gray-400">Age / Gender:</span> <span className="font-bold">{report.patient.age ?? '—'} / {report.patient.gender ?? '—'}</span></div>
                                        <div><span className="text-gray-400">Phone:</span> <span className="font-bold">{report.patient.phone || '—'}</span></div>
                                        <div><span className="text-gray-400">Registered:</span> <span className="font-bold">{d(report.patient.created_at)}</span></div>
                                        <div><span className="text-gray-400">Type:</span> <span className="font-bold capitalize">{String(report.patient.patient_type || 'cash').replace('_', ' ')}</span></div>
                                    </div>
                                </div>
                                <button onClick={() => window.print()}
                                    className="print:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 shrink-0">
                                    <Printer className="h-3.5 w-3.5" /> Print
                                </button>
                            </div>
                        </div>

                        {/* Financial summary */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            {[
                                ['Total Billed', money(s.total_billed), 'text-gray-900'],
                                ['Paid', money(s.total_paid), 'text-emerald-600'],
                                ['Outstanding', money(s.outstanding), 'text-rose-600'],
                                ['Refunded', money(s.refunded), 'text-amber-600'],
                                ['Deposits', money(s.deposit_collected), 'text-blue-600'],
                                ['Deposit Available', money(s.deposit_available), 'text-teal-600'],
                            ].map(([label, value, cls]) => (
                                <div key={String(label)} className="bg-white border border-gray-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                                    <p className={`text-lg font-black mt-1 ${cls}`}>{value}</p>
                                </div>
                            ))}
                        </div>

                        <Section title="Invoices & Payments" count={report.invoices.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Invoice</th><th className={th}>Date</th><th className={th}>Type</th>
                                    <th className={th}>Net</th><th className={th}>Paid</th><th className={th}>Balance</th>
                                    <th className={th}>Status</th><th className={th}>Receipts</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.invoices.map((i: any) => (
                                        <tr key={i.id}>
                                            <td className={`${td} font-mono`}>{i.invoice_number || `#${i.id}`}</td>
                                            <td className={td}>{d(i.created_at)}</td>
                                            <td className={td}>{i.invoice_type || '—'}</td>
                                            <td className={`${td} font-bold`}>{money(i.net_amount)}</td>
                                            <td className={td}>{money(i.paid_amount)}</td>
                                            <td className={`${td} ${Number(i.balance_due) > 0 ? 'text-rose-600 font-bold' : ''}`}>{money(i.balance_due)}</td>
                                            <td className={td}>{i.status}</td>
                                            <td className={`${td} text-[10px] text-gray-500`}>
                                                {i.payments.length
                                                    ? i.payments.map((p: any) => `${p.receipt_number} (${p.payment_method})`).join(', ')
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <Section title="IPD Admissions" count={report.admissions.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Admission</th><th className={th}>Admitted</th><th className={th}>Discharged</th>
                                    <th className={th}>Doctor</th><th className={th}>Diagnosis</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.admissions.map((a: any) => (
                                        <tr key={a.admission_id}>
                                            <td className={`${td} font-mono`}>{a.admission_id}</td>
                                            <td className={td}>{dt(a.admission_date)}</td>
                                            <td className={td}>{a.discharge_date ? dt(a.discharge_date) : '—'}</td>
                                            <td className={td}>{a.doctor_name || '—'}</td>
                                            <td className={td}>{a.diagnosis || '—'}</td>
                                            <td className={td}>{a.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <Section title="OPD Visits" count={report.appointments.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Date</th><th className={th}>Doctor</th>
                                    <th className={th}>Department</th><th className={th}>Reason</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.appointments.map((a: any) => (
                                        <tr key={a.appointment_id}>
                                            <td className={td}>{d(a.appointment_date)}</td>
                                            <td className={td}>{a.doctor_name || '—'}</td>
                                            <td className={td}>{a.department || '—'}</td>
                                            <td className={td}>{a.reason_for_visit || '—'}</td>
                                            <td className={td}>{a.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <Section title="Deposits" count={report.deposits.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Deposit</th><th className={th}>Date</th><th className={th}>Amount</th>
                                    <th className={th}>Applied</th><th className={th}>Method</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.deposits.map((x: any) => (
                                        <tr key={x.id}>
                                            <td className={`${td} font-mono`}>{x.deposit_number}</td>
                                            <td className={td}>{d(x.created_at)}</td>
                                            <td className={`${td} font-bold`}>{money(x.amount)}</td>
                                            <td className={td}>{money(x.applied_amount)}</td>
                                            <td className={td}>{x.payment_method}</td>
                                            <td className={td}>{x.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <Section title="Refunds" count={report.refunds.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Date</th><th className={th}>Amount</th>
                                    <th className={th}>Refunded Via</th><th className={th}>Reason</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.refunds.map((r: any) => (
                                        <tr key={r.id}>
                                            <td className={td}>{d(r.created_at)}</td>
                                            <td className={`${td} font-bold text-rose-600`}>{money(r.amount)}</td>
                                            <td className={td}>{r.payment_method || '—'}</td>
                                            <td className={td}>{r.reason}</td>
                                            <td className={td}>{r.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <Section title="Lab Orders" count={report.labOrders.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Date</th><th className={th}>Order</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.labOrders.map((l: any, i: number) => (
                                        <tr key={l.id ?? i}>
                                            <td className={td}>{d(l.created_at)}</td>
                                            <td className={`${td} font-mono`}>{l.order_id ?? l.id}</td>
                                            <td className={td}>{l.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <Section title="Pharmacy Indents" count={report.indents.length}>
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className={th}>Indent</th><th className={th}>Date</th>
                                    <th className={th}>Items</th><th className={th}>Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.indents.map((o: any) => (
                                        <tr key={o.id}>
                                            <td className={`${td} font-mono`}>{o.indent_number || `IND-${o.id}`}</td>
                                            <td className={td}>{dt(o.created_at)}</td>
                                            <td className={td}>{o.items?.length ?? 0}</td>
                                            <td className={td}>{o.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    </>
                )}
            </div>
        </AppShell>
    );
}
