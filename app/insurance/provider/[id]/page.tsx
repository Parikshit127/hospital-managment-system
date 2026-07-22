'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
    Shield, Building2, Users, Loader2, ArrowLeft, ExternalLink, Search, BedDouble,
    Plus, Download, FileText, Receipt, Printer,
} from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getInsuranceProviders, getPatientsByProvider, getInsuranceClaims } from '@/app/actions/insurance-actions';
import { listInsuranceReceipts } from '@/app/actions/insurance-receipts-actions';
import { getInsuranceOutstanding, getBillWiseSanction } from '@/app/actions/insurance-aging-actions';
import { NewReceiptModal } from '@/app/components/insurance/finance-receivables';
import TpaProfileModal from '@/app/components/ipd/TpaProfileModal';

const fmtMoney = (n: number | null | undefined) =>
    n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

type Tab = 'patients' | 'receipts' | 'outstanding' | 'claims' | 'sanction';
const TABS: { k: Tab; l: string }[] = [
    { k: 'patients', l: 'Patients' },
    { k: 'receipts', l: 'Receipts' },
    { k: 'outstanding', l: 'Outstanding' },
    { k: 'claims', l: 'Claims' },
    { k: 'sanction', l: 'Bill-wise Sanction' },
];

export default function InsuranceProviderDetailPage() {
    const params = useParams();
    const pathname = usePathname();
    const providerId = Number(params.id);
    const baseHref = pathname?.startsWith('/admin/finance/tpa-insurance')
        ? '/admin/finance/tpa-insurance' : '/insurance';

    const [provider, setProvider] = useState<any>(null);
    const [tab, setTab] = useState<Tab>('patients');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [search, setSearch] = useState('');
    const [showNewReceipt, setShowNewReceipt] = useState(false);
    const [tpaModalPatient, setTpaModalPatient] = useState<{ id: string; name: string } | null>(null);

    const [patients, setPatients] = useState<any[]>([]);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [outstanding, setOutstanding] = useState<any>(null);
    const [claims, setClaims] = useState<any[]>([]);
    const [sanction, setSanction] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Provider header (once).
    useEffect(() => {
        getInsuranceProviders().then((r: any) => {
            if (r.success) setProvider((r.data || []).find((p: any) => p.id === providerId) || null);
        });
    }, [providerId]);

    const loadTab = useCallback(async () => {
        if (Number.isNaN(providerId)) return;
        setLoading(true);
        const range = { from: from || undefined, to: to || undefined };
        try {
            if (tab === 'patients') {
                const r: any = await getPatientsByProvider(providerId);
                if (r.success) setPatients(r.data || []);
            } else if (tab === 'receipts') {
                const r: any = await listInsuranceReceipts({ payer_type: 'tpa_insurance', provider_id: providerId, ...range });
                if (r.success) setReceipts(r.data || []);
            } else if (tab === 'outstanding') {
                const r: any = await getInsuranceOutstanding({ payer_type: 'tpa_insurance', provider_id: providerId });
                if (r.success) setOutstanding(r.data || null);
            } else if (tab === 'claims') {
                const r: any = await getInsuranceClaims({ provider_id: providerId, limit: 500 });
                if (r.success) setClaims(r.data || []);
            } else if (tab === 'sanction') {
                const r: any = await getBillWiseSanction({ provider_id: providerId, ...range });
                if (r.success) setSanction(r.data || null);
            }
        } catch (err) {
            console.error('Provider tab load error:', err);
        }
        setLoading(false);
    }, [providerId, tab, from, to]);

    useEffect(() => { loadTab(); }, [loadTab]);

    const exportXlsx = (rows: any[], name: string) => {
        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, `${(provider?.provider_name || 'provider').replace(/\s+/g, '-')}-${name}.xlsx`);
    };

    const coverLetterHref = `/api/insurance/provider/${providerId}/cover-letter${from || to ? `?from=${from}&to=${to}` : ''}`;

    return (
        <AppShell pageTitle={provider?.provider_name || 'Insurance Provider'} pageIcon={<Shield className="h-5 w-5" />} onRefresh={loadTab} refreshing={loading}>
            <div className="max-w-7xl mx-auto space-y-5">
                <Link href={baseHref} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Providers
                </Link>

                {/* Provider header */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-blue-500/10 rounded-xl"><Building2 className="h-6 w-6 text-blue-500" /></div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-black text-gray-900 truncate">{provider?.provider_name || 'Insurance Provider'}</h2>
                            <p className="text-[11px] text-gray-400 font-mono">
                                {provider?.provider_code || '—'}
                                {provider?.contact_phone ? ` · ${provider.contact_phone}` : ''}
                                {provider?.contact_email ? ` · ${provider.contact_email}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href={coverLetterHref} target="_blank"
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                            <FileText className="h-4 w-4" /> Cover Letter
                        </Link>
                        <button onClick={() => setShowNewReceipt(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors">
                            <Receipt className="h-4 w-4" /> New Receipt
                        </button>
                    </div>
                </div>

                {/* Tabs + date range */}
                <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex flex-wrap gap-1.5">
                        {TABS.map(t => (
                            <button key={t.k} onClick={() => setTab(t.k)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t.k ? 'bg-blue-500/20 text-blue-600 border border-blue-500/30' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-900'}`}>
                                {t.l}
                            </button>
                        ))}
                    </div>
                    {(tab === 'receipts' || tab === 'claims' || tab === 'sanction') && (
                        <div className="flex items-center gap-2">
                            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}
                                className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-700 focus:outline-none focus:border-blue-500" title="From" />
                            <span className="text-gray-300">–</span>
                            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}
                                className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-700 focus:outline-none focus:border-blue-500" title="To" />
                            {(from || to) && (
                                <button onClick={() => { setFrom(''); setTo(''); }} className="px-2.5 py-2 text-xs font-bold text-gray-500 hover:text-gray-900">Clear</button>
                            )}
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
                ) : (
                    <>
                        {tab === 'patients' && <PatientsTab patients={patients} search={search} setSearch={setSearch} onExport={() => exportXlsx(patients.map(p => ({ Patient: p.full_name, UHID: p.patient_id, Phone: p.phone, Policy: p.policy_number, Status: p.policy_status, Coverage: Number(p.coverage_limit || 0), Remaining: Number(p.remaining_limit || 0), Admitted: p.is_admitted ? 'Yes' : 'No' })), 'patients')} onViewPatient={(p: any) => setTpaModalPatient({ id: p.patient_id, name: p.full_name })} />}
                        {tab === 'receipts' && <ReceiptsTab receipts={receipts} onExport={() => exportXlsx(receipts.map(r => ({ Receipt: r.receipt_number, Date: fmtDate(r.receipt_date), Ref: r.reference_number, Received: Number(r.total_amount || 0), Claim: Number(r.claim_amount || 0), Sanctioned: Number(r.sanctioned_amount || 0), TDS: Number(r.tds_total || 0), 'Service Charge': Number(r.service_charge || 0), Disallowed: Math.max(0, Number(r.claim_amount || 0) - Number(r.sanctioned_amount || 0)), Status: r.status })), 'receipts')} />}
                        {tab === 'outstanding' && <OutstandingTab data={outstanding} />}
                        {tab === 'claims' && <ClaimsTab claims={claims} onExport={() => exportXlsx(claims.map(c => ({ Claim: c.claim_number, Patient: c.policy?.patient?.full_name, Invoice: c.invoice?.invoice_number, Claimed: Number(c.claimed_amount || 0), Sanctioned: Number(c.sanctioned_amount ?? c.approved_amount ?? 0), Settled: Number(c.settled_amount || 0), TDS: Number(c.tds_amount || 0), Status: c.status, Submitted: fmtDate(c.submitted_at) })), 'claims')} />}
                        {tab === 'sanction' && <SanctionTab data={sanction} onExport={() => exportXlsx((sanction?.rows || []).map((r: any) => ({ Invoice: r.invoice_number, Date: fmtDate(r.bill_date), Patient: r.patient_name, Claim: r.claim_amount, Sanctioned: r.sanctioned, Received: r.received, TDS: r.tds, 'Short Pay': r.short_pay, Outstanding: r.outstanding, Status: r.status })), 'bill-wise-sanction')} />}
                    </>
                )}
            </div>

            {showNewReceipt && (
                <NewReceiptModal providers={provider ? [provider] : []} defaultProviderId={providerId}
                    onClose={() => setShowNewReceipt(false)} onSaved={() => { setShowNewReceipt(false); if (tab === 'receipts') loadTab(); }} />
            )}

            {tpaModalPatient && (
                <TpaProfileModal open onClose={() => setTpaModalPatient(null)}
                    patientId={tpaModalPatient.id} patientName={tpaModalPatient.name} />
            )}
        </AppShell>
    );
}

function ExportBtn({ onExport }: { onExport: () => void }) {
    return (
        <button onClick={onExport} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Export
        </button>
    );
}

const TH = 'px-3 py-2.5 text-left text-[10px] font-black text-gray-500 uppercase tracking-wide';
const THR = 'px-3 py-2.5 text-right text-[10px] font-black text-gray-500 uppercase tracking-wide';

function Card({ children }: { children: React.ReactNode }) {
    return <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden"><div className="overflow-x-auto">{children}</div></div>;
}
function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
    return <tr><td colSpan={cols} className="py-14 text-center text-sm font-bold text-gray-300">{msg}</td></tr>;
}

function PatientsTab({ patients, search, setSearch, onExport, onViewPatient }: any) {
    const q = search.trim().toLowerCase();
    const rows = !q ? patients : patients.filter((pt: any) =>
        (pt.full_name || '').toLowerCase().includes(q) || (pt.patient_id || '').toLowerCase().includes(q) || (pt.policy_number || '').toLowerCase().includes(q));
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="relative max-w-md flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, UHID, policy…"
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <ExportBtn onExport={onExport} />
            </div>
            <Card>
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                        <th className={TH}>SR</th><th className={TH}>Patient</th><th className={TH}>UHID</th><th className={TH}>Policy No.</th><th className={TH}>Status</th><th className={THR}>Coverage</th><th className={THR}>Remaining</th><th className={TH}>Admitted</th><th className={TH}>Action</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.length === 0 ? <EmptyRow cols={9} msg="No patients covered by this provider" /> : rows.map((pt: any, i: number) => (
                            <tr key={pt.patient_id} className="hover:bg-gray-50">
                                <td className="px-3 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                                <td className="px-3 py-3 font-bold text-gray-900">{pt.full_name}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-600">{pt.patient_id}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-600">{pt.policy_number || '—'}</td>
                                <td className="px-3 py-3"><span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${pt.policy_status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>{pt.policy_status || '—'}</span></td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(pt.coverage_limit)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(pt.remaining_limit)}</td>
                                <td className="px-3 py-3">{pt.is_admitted ? <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 uppercase"><BedDouble className="h-3 w-3" /> Admitted</span> : <span className="text-gray-300">—</span>}</td>
                                <td className="px-3 py-3">
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => onViewPatient(pt)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                                            <Shield className="h-3 w-3" /> TPA Details
                                        </button>
                                        <Link href={`/reception/patient/${pt.patient_id}`} title="Patient chart"
                                            className="inline-flex items-center p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}

function ReceiptsTab({ receipts, onExport }: any) {
    return (
        <div className="space-y-3">
            <div className="flex justify-end"><ExportBtn onExport={onExport} /></div>
            <Card>
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                        <th className={TH}>Receipt #</th><th className={TH}>Date</th><th className={TH}>Ref No</th><th className={THR}>Received</th><th className={THR}>Claim</th><th className={THR}>Sanctioned</th><th className={THR}>TDS</th><th className={THR}>Svc Chg</th><th className={THR}>Disallowed</th><th className={TH}>Status</th><th className={TH}></th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {receipts.length === 0 ? <EmptyRow cols={11} msg="No receipts in this period" /> : receipts.map((r: any) => {
                            const disallowed = Math.max(0, Number(r.claim_amount || 0) - Number(r.sanctioned_amount || 0));
                            return (
                                <tr key={r.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-3 font-mono text-xs text-gray-700">{r.receipt_number}</td>
                                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.receipt_date)}</td>
                                    <td className="px-3 py-3 font-mono text-xs text-gray-600">{r.reference_number}</td>
                                    <td className="px-3 py-3 text-right font-bold text-gray-900">{fmtMoney(r.total_amount)}</td>
                                    <td className="px-3 py-3 text-right text-gray-600">{Number(r.claim_amount) ? fmtMoney(r.claim_amount) : '—'}</td>
                                    <td className="px-3 py-3 text-right text-gray-600">{Number(r.sanctioned_amount) ? fmtMoney(r.sanctioned_amount) : '—'}</td>
                                    <td className="px-3 py-3 text-right text-gray-600">{Number(r.tds_total) ? fmtMoney(r.tds_total) : '—'}</td>
                                    <td className="px-3 py-3 text-right text-gray-600">{Number(r.service_charge) ? fmtMoney(r.service_charge) : '—'}</td>
                                    <td className="px-3 py-3 text-right text-rose-600">{disallowed ? fmtMoney(disallowed) : '—'}</td>
                                    <td className="px-3 py-3"><span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 text-gray-600">{r.status}</span></td>
                                    <td className="px-3 py-3">
                                        <a href={`/api/insurance/receipt/${r.id}/print`} target="_blank" rel="noopener noreferrer" title="Print receipt"
                                            className="inline-flex items-center p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                                            <Printer className="h-3.5 w-3.5" />
                                        </a>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}

function OutstandingTab({ data }: any) {
    const row = data?.rows?.[0];
    const cards = [
        { l: `Below ${data?.agingDays ?? 60} Days`, v: row?.below, tone: 'text-amber-600' },
        { l: `Above ${data?.agingDays ?? 60} Days`, v: row?.above, tone: 'text-rose-600' },
        { l: 'Unmapped Receipt', v: row?.unmapped_receipt, tone: 'text-blue-600' },
        { l: 'Total Outstanding', v: row?.balance, tone: 'text-gray-900' },
    ];
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(c => (
                <div key={c.l} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{c.l}</p>
                    <p className={`text-2xl font-black mt-1 ${c.tone}`}>{fmtMoney(c.v || 0)}</p>
                </div>
            ))}
            <p className="col-span-full text-[11px] text-gray-400">{row ? `${row.bill_count} open bill(s) for this provider.` : 'No outstanding for this provider.'}</p>
        </div>
    );
}

function ClaimsTab({ claims, onExport }: any) {
    return (
        <div className="space-y-3">
            <div className="flex justify-end"><ExportBtn onExport={onExport} /></div>
            <Card>
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                        <th className={TH}>Claim #</th><th className={TH}>Patient</th><th className={TH}>Invoice</th><th className={THR}>Claimed</th><th className={THR}>Sanctioned</th><th className={THR}>Settled</th><th className={THR}>TDS</th><th className={TH}>Status</th><th className={TH}>Submitted</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {claims.length === 0 ? <EmptyRow cols={9} msg="No claims in this period" /> : claims.map((c: any) => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="px-3 py-3 font-mono text-xs text-gray-700">{c.claim_number}</td>
                                <td className="px-3 py-3 font-bold text-gray-900">{c.policy?.patient?.full_name || '—'}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-600">{c.invoice?.invoice_number || '—'}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(c.claimed_amount)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(c.sanctioned_amount ?? c.approved_amount)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(c.settled_amount)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{Number(c.tds_amount) ? fmtMoney(c.tds_amount) : '—'}</td>
                                <td className="px-3 py-3"><span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 text-gray-600">{c.status}</span></td>
                                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(c.submitted_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}

function SanctionTab({ data, onExport }: any) {
    const rows = data?.rows || [];
    const t = data?.totals;
    return (
        <div className="space-y-3">
            <div className="flex justify-end"><ExportBtn onExport={onExport} /></div>
            <Card>
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                        <th className={TH}>Invoice</th><th className={TH}>Date</th><th className={TH}>Patient</th><th className={THR}>Claim</th><th className={THR}>Sanctioned</th><th className={THR}>Received</th><th className={THR}>TDS</th><th className={THR}>Short Pay</th><th className={THR}>Outstanding</th><th className={TH}>Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.length === 0 ? <EmptyRow cols={10} msg="No bills in this period" /> : rows.map((r: any) => (
                            <tr key={r.invoice_id} className="hover:bg-gray-50">
                                <td className="px-3 py-3 font-mono text-xs text-gray-700">{r.invoice_number}</td>
                                <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.bill_date)}</td>
                                <td className="px-3 py-3 font-bold text-gray-900">{r.patient_name}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(r.claim_amount)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(r.sanctioned)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(r.received)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{Number(r.tds) ? fmtMoney(r.tds) : '—'}</td>
                                <td className="px-3 py-3 text-right text-rose-600">{Number(r.short_pay) ? fmtMoney(r.short_pay) : '—'}</td>
                                <td className="px-3 py-3 text-right font-bold text-gray-900">{fmtMoney(r.outstanding)}</td>
                                <td className="px-3 py-3"><span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 text-gray-600">{r.status || '—'}</span></td>
                            </tr>
                        ))}
                    </tbody>
                    {t && rows.length > 0 && (
                        <tfoot><tr className="bg-slate-50 border-t-2 border-gray-200 font-black text-gray-900">
                            <td className="px-3 py-3" colSpan={3}>Total</td>
                            <td className="px-3 py-3 text-right">{fmtMoney(t.claim_amount)}</td>
                            <td className="px-3 py-3 text-right">{fmtMoney(t.sanctioned)}</td>
                            <td className="px-3 py-3 text-right">{fmtMoney(t.received)}</td>
                            <td className="px-3 py-3 text-right">{fmtMoney(t.tds)}</td>
                            <td className="px-3 py-3 text-right text-rose-600">{fmtMoney(t.short_pay)}</td>
                            <td className="px-3 py-3 text-right">{fmtMoney(t.outstanding)}</td>
                            <td className="px-3 py-3"></td>
                        </tr></tfoot>
                    )}
                </table>
            </Card>
        </div>
    );
}
