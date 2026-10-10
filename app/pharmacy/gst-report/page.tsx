'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { DateField } from '@/app/components/ui/DateField';
import { SkeletonCard } from '@/app/components/ui/Skeleton';
import {
    Receipt, FileSpreadsheet, Loader2, AlertTriangle, ShieldCheck, Info, CheckCircle2, XCircle,
} from 'lucide-react';
import { getPharmacyGstReport, type PharmacyGstReport, type GstIssue } from '@/app/actions/pharmacy-gst-actions';

type Preset = 'this' | 'last' | 'custom';
type Tab = 'summary' | 'sales' | 'purchases' | 'ipd' | 'fix' | 'issues';

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });

function rangeFor(preset: Preset, from: string, to: string) {
    const now = new Date();
    if (preset === 'this') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
    if (preset === 'last') return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) };
    return { from, to };
}

const SEV: Record<GstIssue['severity'], { label: string; cls: string }> = {
    high: { label: 'Fix before filing', cls: 'bg-red-50 text-red-700 border-red-200' },
    medium: { label: 'Review', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    info: { label: 'Note', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return <th className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, bold, className = '' }: { children: React.ReactNode; right?: boolean; bold?: boolean; className?: string }) {
    return <td className={`px-3 py-2 text-xs text-gray-800 ${right ? 'text-right tabular-nums' : ''} ${bold ? 'font-bold' : ''} ${className}`}>{children}</td>;
}
function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-black text-gray-900">{title}</h3>
                {note && <p className="text-[11px] text-gray-500 mt-0.5">{note}</p>}
            </div>
            <div className="overflow-x-auto">{children}</div>
        </div>
    );
}

export default function PharmacyGstReportPage() {
    const [preset, setPreset] = useState<Preset>('last');
    const [customFrom, setCustomFrom] = useState(fmt(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)));
    const [customTo, setCustomTo] = useState(fmt(new Date()));
    const [tab, setTab] = useState<Tab>('summary');
    const [result, setResult] = useState<{ key: string; report: PharmacyGstReport | null; error: string } | null>(null);
    const [exporting, setExporting] = useState(false);

    const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);
    const key = `${range.from}|${range.to}`;

    useEffect(() => {
        if (!range.from || !range.to) return;
        let cancelled = false;
        getPharmacyGstReport({ from: range.from, to: range.to }).then((res) => {
            if (cancelled) return;
            setResult(res.success ? { key, report: res.report, error: '' } : { key, report: null, error: res.error });
        }).catch((e: Error) => { if (!cancelled) setResult({ key, report: null, error: e?.message || 'Failed to load' }); });
        return () => { cancelled = true; };
    }, [key, range.from, range.to]);

    // Loading is derived: the last result belongs to a different period than the one selected.
    const loading = result?.key !== key;
    const report = loading ? null : result?.report ?? null;
    const error = loading ? '' : result?.error ?? '';

    const high = report?.issues.filter((i) => i.severity === 'high').length || 0;
    const medium = report?.issues.filter((i) => i.severity === 'medium').length || 0;

    const exportExcel = async () => {
        if (!report) return;
        setExporting(true);
        try {
            const xlsxModule = await import('xlsx');
            const XLSX: any = (xlsxModule as any).default ?? xlsxModule;
            const wb = XLSX.utils.book_new();
            const add = (name: string, rows: any[]) => {
                const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data for this period' }]);
                const cols = Object.keys(rows[0] || { Note: '' });
                ws['!cols'] = cols.map((c) => ({ wch: Math.min(40, Math.max(c.length + 2, ...rows.map((r) => String(r[c] ?? '').length + 2))) }));
                XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
            };
            const m = report.meta; const g = report.gstr3b; const s = report.sales; const p = report.purchases;

            add('GSTR-3B', [
                { Table: '3.1(a) Outward taxable supplies', Taxable: g.t31a.taxable, IGST: g.t31a.igst, CGST: g.t31a.cgst, SGST: g.t31a.sgst },
                { Table: '3.1(c) Nil-rated / exempt outward', Taxable: g.t31c.taxable, IGST: 0, CGST: 0, SGST: 0 },
                { Table: '4(A)(5) ITC available - all other', Taxable: '', IGST: g.t4A5.igst, CGST: g.t4A5.cgst, SGST: g.t4A5.sgst },
                { Table: '4(B)(1) ITC reversed - Sec 17(5) write-offs (estimate)', Taxable: '', IGST: g.t4B1.igst, CGST: g.t4B1.cgst, SGST: g.t4B1.sgst },
                { Table: '4(B)(2) ITC reversed - others / supplier returns (estimate)', Taxable: '', IGST: g.t4B2.igst, CGST: g.t4B2.cgst, SGST: g.t4B2.sgst },
                { Table: '4(C) Net ITC', Taxable: '', IGST: g.netItc.igst, CGST: g.netItc.cgst, SGST: g.netItc.sgst },
                { Table: 'Tax payable (liability)', Taxable: '', IGST: g.liability.igst, CGST: g.liability.cgst, SGST: g.liability.sgst },
                { Table: 'Payable in cash after ITC (Rule 88A)', Taxable: '', IGST: g.cashPayable.igst, CGST: g.cashPayable.cgst, SGST: g.cashPayable.sgst },
                { Table: 'ITC carried forward', Taxable: '', IGST: g.carryForward.igst, CGST: g.carryForward.cgst, SGST: g.carryForward.sgst },
                { Table: `GSTIN ${m.gstin} | ${m.from} to ${m.to}`, Taxable: '', IGST: '', CGST: '', SGST: '' },
            ]);
            add('GSTR1 T7 B2CS', s.net.byRate.filter((r) => r.rate > 0).map((r) => ({
                'Place of Supply': m.placeOfSupply, Type: 'OE', Rate: r.rate, 'Taxable Value': r.taxable, 'Integrated Tax': r.igst, 'Central Tax': r.cgst, 'State/UT Tax': r.sgst, Cess: 0,
            })));
            add('GSTR1 T8 Nil-exempt', [{ 'Nil rated - intra-state to unregistered': s.net.byRate.filter((r) => r.rate === 0).reduce((a, r) => a + r.taxable, 0) }]);
            add('GSTR1 T12 HSN', s.hsn.map((h) => ({
                HSN: h.hsn, Description: h.description, UQC: h.uqc, 'Total Quantity': h.qty, 'Total Value': h.totalValue, Rate: h.rate,
                'Taxable Value': h.taxable, 'Integrated Tax': h.igst, 'Central Tax': h.cgst, 'State/UT Tax': h.sgst, Cess: 0,
            })));
            add('GSTR1 T13 Documents', s.documents.series.map((d) => ({
                Series: d.prefix, 'From': d.first, 'To': d.last, 'Total Issued': d.issued, Cancelled: d.cancelled, 'Missing numbers': d.missing.join(', '),
            })));
            add('Sales Register', s.invoices.map((i) => ({
                'Invoice No': i.invoiceNo, Date: dmy(i.date), Channel: i.channel, Status: i.status, Discount: i.discount,
                'Taxable Value': i.taxable, CGST: i.cgst, SGST: i.sgst, IGST: i.igst, 'Invoice Value': i.total,
            })));
            add('Credit Notes', s.creditNotes.rows.map((c) => ({
                'CN No': c.cnNo, Date: dmy(c.date), 'Original Invoice': c.originalInvoice, Status: c.status,
                'Taxable Value': c.taxable, CGST: c.cgst, SGST: c.sgst, IGST: c.igst, Total: c.total, Reason: c.reason,
            })));
            add('Purchase Register', p.rows.map((r) => ({
                'Invoice No': r.invoiceNo, Date: dmy(r.date), Supplier: r.vendor, GSTIN: r.gstin, 'GSTIN OK': r.gstinOk ? 'Yes' : `No - ${r.gstinNote}`,
                Status: r.status, 'Taxable Value': r.taxable, IGST: r.igst, CGST: r.cgst, SGST: r.sgst, 'Invoice Value': r.total,
                'ITC claimable': r.itcEligible ? 'Yes' : 'No', Flags: r.flags.join('; '),
            })));
            add('ITC Reversals', report.reversals.rows.map((r) => ({
                Date: dmy(r.date), Type: r.kind === 'writeoff' ? 'Write-off 17(5)(h)' : 'Supplier return', Medicine: r.medicine, Batch: r.batch, Supplier: r.vendor,
                Qty: r.qty, 'GST %': r.rate, 'Taxable Value': r.taxable, IGST: r.igst, CGST: r.cgst, SGST: r.sgst,
            })));
            add('Fix Master Data', report.masterFixes.map((f) => ({
                Medicine: f.medicine, 'Qty sold': f.qty, 'Sold value': f.soldValue, 'Current GST %': f.currentRate, 'Current HSN': f.currentHsn,
                'Suggested GST %': f.suggestedRate ?? '', 'Suggested HSN': f.suggestedHsn, 'Suggestion source': f.source,
            })));
            add('Issues', report.issues.map((i) => ({
                Severity: SEV[i.severity].label, Code: i.code, Issue: i.title, Count: i.count, Amount: i.amount ?? '', Detail: i.detail, Examples: i.refs.join(' | '),
            })));
            XLSX.writeFile(wb, `pharmacy-gst-${m.from}-to-${m.to}.xlsx`);
        } finally {
            setExporting(false);
        }
    };

    const TABS: Array<{ id: Tab; label: string }> = [
        { id: 'summary', label: 'GSTR-3B Summary' },
        { id: 'sales', label: 'Sales — GSTR-1' },
        { id: 'purchases', label: `Purchases — ITC${report ? ` (${report.purchases.rows.length})` : ''}` },
        { id: 'ipd', label: 'IPD Dispensing' },
        { id: 'fix', label: `Fix Master Data${report ? ` (${report.masterFixes.length})` : ''}` },
        { id: 'issues', label: `Issues${report ? ` (${high + medium})` : ''}` },
    ];

    return (
        <AppShell pageTitle="Pharmacy GST Report" pageIcon={<Receipt className="h-5 w-5" />}>
            <div className="space-y-4">
                {/* Filters */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
                        {([['last', 'Last month'], ['this', 'This month'], ['custom', 'Custom']] as const).map(([id, label]) => (
                            <button key={id} onClick={() => setPreset(id)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg ${preset === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
                        ))}
                    </div>
                    {preset === 'custom' && (
                        <>
                            <label className="text-xs font-bold text-gray-500">From <DateField value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="ml-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" /></label>
                            <label className="text-xs font-bold text-gray-500">To <DateField value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="ml-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" /></label>
                        </>
                    )}
                    <span className="text-xs text-gray-500">{range.from} → {range.to}</span>
                    <button onClick={exportExcel} disabled={!report || exporting}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Export Excel (all tables)
                    </button>
                </div>

                {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">{error}</div>}
                {loading && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>}

                {!loading && report && (
                    <>
                        {/* Identity + readiness */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
                            <div>
                                <p className="text-sm font-black text-gray-900">{report.meta.pharmacyName}</p>
                                <p className="text-[11px] text-gray-500 max-w-md">{report.meta.address || 'Address not configured'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">GSTIN</p>
                                <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                                    {report.meta.gstin || 'Not set'}
                                    {report.meta.gstin && (report.meta.gstinValid ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />)}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Place of supply</p>
                                <p className="text-sm font-bold text-gray-900">{report.meta.placeOfSupply}</p>
                            </div>
                            <button onClick={() => setTab('issues')}
                                className={`ml-auto flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${high ? 'bg-red-50 border-red-200 text-red-700' : medium ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                {high || medium ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                {high ? `${high} issue(s) to fix before filing` : medium ? `${medium} item(s) to review` : 'No blocking issues found'}
                            </button>
                        </div>

                        {/* KPI row */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[
                                { label: 'Output GST (net of credit notes)', value: inr(report.sales.net.total.tax), sub: `on ${inr(report.sales.net.total.taxable)} sales` },
                                { label: 'Input tax credit (eligible)', value: inr(report.purchases.itc.total), sub: report.purchases.itcAtRisk ? `${inr(report.purchases.itcAtRisk)} at risk` : 'all supplier GSTINs valid' },
                                { label: 'GST payable in cash', value: inr(report.gstr3b.cashTotal), sub: 'after ITC utilisation' },
                                { label: 'ITC carried forward', value: inr(report.gstr3b.carryForward.cgst + report.gstr3b.carryForward.sgst + report.gstr3b.carryForward.igst), sub: 'unused credit' },
                            ].map((k) => (
                                <div key={k.label} className="bg-white border border-gray-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{k.label}</p>
                                    <p className="text-xl font-black text-gray-900 mt-1">{k.value}</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{k.sub}</p>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 w-fit max-w-full">
                            {TABS.map((t) => (
                                <button key={t.id} onClick={() => setTab(t.id)}
                                    className={`px-3 py-2 text-xs font-bold rounded-lg ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
                            ))}
                        </div>

                        {tab === 'summary' && <SummaryTab r={report} />}
                        {tab === 'sales' && <SalesTab r={report} />}
                        {tab === 'purchases' && <PurchasesTab r={report} />}
                        {tab === 'ipd' && <IpdTab r={report} />}
                        {tab === 'fix' && <FixTab r={report} />}
                        {tab === 'issues' && <IssuesTab r={report} />}
                    </>
                )}
            </div>
        </AppShell>
    );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function SummaryTab({ r }: { r: PharmacyGstReport }) {
    const g = r.gstr3b;
    const row = (label: string, taxable: number | null, h: { igst: number; cgst: number; sgst: number }, bold = false) => (
        <tr className="border-t border-gray-100">
            <Td bold={bold}>{label}</Td>
            <Td right>{taxable == null ? '' : money(taxable)}</Td>
            <Td right>{money(h.igst)}</Td><Td right>{money(h.cgst)}</Td><Td right>{money(h.sgst)}</Td><Td right>0.00</Td>
        </tr>
    );
    return (
        <div className="space-y-4">
            <Card title="GSTR-3B — figures to enter" note="Outward supplies are net of credit notes. ITC reversals are estimates (see Issues).">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Table</Th><Th right>Taxable value</Th><Th right>IGST</Th><Th right>CGST</Th><Th right>SGST/UTGST</Th><Th right>Cess</Th></tr></thead>
                    <tbody>
                        {row('3.1(a) Outward taxable supplies (other than zero rated, nil rated, exempt)', g.t31a.taxable, g.t31a)}
                        {row('3.1(c) Other outward supplies (nil rated, exempt)', g.t31c.taxable, { igst: 0, cgst: 0, sgst: 0 })}
                        {row('4(A)(5) ITC available — all other ITC', null, g.t4A5)}
                        {row('4(B)(1) ITC reversed — Sec 17(5) (expired / damaged write-offs)', null, g.t4B1)}
                        {row('4(B)(2) ITC reversed — others (supplier returns / debit notes)', null, g.t4B2)}
                        {row('4(C) Net ITC available', null, g.netItc, true)}
                    </tbody>
                </table>
            </Card>
            <Card title="Payment of tax" note="Set off per Rule 88A: IGST credit first, CGST/SGST credit only against their own head.">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Item</Th><Th right>IGST</Th><Th right>CGST</Th><Th right>SGST/UTGST</Th></tr></thead>
                    <tbody>
                        {[['Tax payable (output liability)', g.liability], ['To be paid in cash', g.cashPayable], ['ITC carried forward', g.carryForward]].map(([label, h]: any) => (
                            <tr key={label} className="border-t border-gray-100"><Td bold>{label}</Td><Td right>{money(h.igst)}</Td><Td right>{money(h.cgst)}</Td><Td right>{money(h.sgst)}</Td></tr>
                        ))}
                    </tbody>
                </table>
            </Card>
            {r.ipd.netValue + r.ipd.packageConsumedValue > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span><b>{inr(r.ipd.netValue + r.ipd.packageConsumedValue)}</b> of medicines went to in-patients at nil GST and is <b>not</b> in the figures above. Read the IPD Dispensing tab and settle the treatment with your CA before filing.</span>
                </div>
            )}
        </div>
    );
}

function SalesTab({ r }: { r: PharmacyGstReport }) {
    const s = r.sales;
    const nil = s.net.byRate.filter((x) => x.rate === 0).reduce((a, x) => a + x.taxable, 0);
    return (
        <div className="space-y-4">
            <Card title="Table 7 — B2C (small) supplies, rate-wise" note={`Place of supply ${r.meta.placeOfSupply}. Net of credit notes. All pharmacy bills are B2C — no customer GSTIN is captured.`}>
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Rate</Th><Th right>Taxable (sales)</Th><Th right>Credit notes</Th><Th right>Net taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th></tr></thead>
                    <tbody>
                        {s.net.byRate.filter((x) => x.rate > 0).map((x) => {
                            const gross = s.byRate.find((y) => y.rate === x.rate); const cn = s.creditNotes.byRate.find((y) => y.rate === x.rate);
                            return <tr key={x.rate} className="border-t border-gray-100"><Td bold>{x.rate}%</Td><Td right>{money(gross?.taxable || 0)}</Td><Td right>{money(cn?.taxable || 0)}</Td><Td right>{money(x.taxable)}</Td><Td right>{money(x.cgst)}</Td><Td right>{money(x.sgst)}</Td><Td right>{money(x.igst)}</Td></tr>;
                        })}
                        {s.net.byRate.every((x) => x.rate === 0) && <tr><Td className="text-gray-400" >No taxable (&gt;0%) sales in this period</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td></tr>}
                        <tr className="border-t-2 border-gray-200 bg-gray-50"><Td bold>Table 8 — nil rated (0%)</Td><Td>{''}</Td><Td>{''}</Td><Td right bold>{money(nil)}</Td><Td right>0.00</Td><Td right>0.00</Td><Td right>0.00</Td></tr>
                    </tbody>
                </table>
            </Card>
            <Card title="Table 12 — HSN summary" note="Net of credit notes. Use 6-digit HSN if aggregate turnover exceeds ₹5 Cr.">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>HSN</Th><Th>UQC</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th><Th right>Total value</Th></tr></thead>
                    <tbody>
                        {s.hsn.map((h) => (
                            <tr key={`${h.hsn}-${h.rate}`} className="border-t border-gray-100">
                                <Td bold className={h.hsn === 'MISSING' ? 'text-red-600' : ''}>{h.hsn}</Td><Td>{h.uqc}</Td><Td right>{h.qty}</Td><Td right>{h.rate}%</Td>
                                <Td right>{money(h.taxable)}</Td><Td right>{money(h.cgst)}</Td><Td right>{money(h.sgst)}</Td><Td right>{money(h.igst)}</Td><Td right>{money(h.totalValue)}</Td>
                            </tr>
                        ))}
                        {!s.hsn.length && <tr><Td className="text-gray-400">No sales</Td></tr>}
                    </tbody>
                </table>
            </Card>
            <Card title="Table 13 — Documents issued" note="Counter / OPD pharmacy invoices by number series.">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Series</Th><Th>From</Th><Th>To</Th><Th right>Issued</Th><Th right>Cancelled</Th><Th>Missing numbers</Th></tr></thead>
                    <tbody>
                        {s.documents.series.map((d) => (
                            <tr key={d.prefix} className="border-t border-gray-100"><Td>{d.prefix}</Td><Td>{d.first}</Td><Td>{d.last}</Td><Td right>{d.issued}</Td><Td right>{d.cancelled}</Td>
                                <Td className={d.missing.length ? 'text-red-600 font-bold' : 'text-gray-400'}>{d.missing.length ? d.missing.slice(0, 6).join(', ') + (d.missing.length > 6 ? ` +${d.missing.length - 6} more` : '') : 'none'}</Td></tr>
                        ))}
                        {!s.documents.series.length && <tr><Td className="text-gray-400">No invoices</Td></tr>}
                    </tbody>
                </table>
            </Card>
            <Card title="Sales by channel">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Channel</Th><Th right>Invoices</Th><Th right>Taxable</Th><Th right>GST</Th></tr></thead>
                    <tbody>{s.byChannel.map((c) => <tr key={c.channel} className="border-t border-gray-100"><Td bold>{c.channel}</Td><Td right>{c.invoices}</Td><Td right>{money(c.taxable)}</Td><Td right>{money(c.tax)}</Td></tr>)}</tbody>
                </table>
            </Card>
            {s.creditNotes.rows.length > 0 && (
                <Card title={`Credit notes (${s.creditNotes.rows.length})`} note="Patient returns against pharmacy bills; reduce output tax.">
                    <table className="w-full">
                        <thead className="bg-gray-50"><tr><Th>CN no.</Th><Th>Date</Th><Th>Against</Th><Th>Status</Th><Th right>Taxable</Th><Th right>GST</Th><Th right>Total</Th></tr></thead>
                        <tbody>{s.creditNotes.rows.map((c) => (
                            <tr key={c.cnNo} className="border-t border-gray-100"><Td bold>{c.cnNo}</Td><Td>{dmy(c.date)}</Td><Td>{c.originalInvoice}</Td>
                                <Td className={c.status === 'Draft' ? 'text-amber-600 font-bold' : ''}>{c.status}</Td><Td right>{money(c.taxable)}</Td><Td right>{money(c.cgst + c.sgst + c.igst)}</Td><Td right>{money(c.total)}</Td></tr>
                        ))}</tbody>
                    </table>
                </Card>
            )}
            <Card title="Invoice register" note={`${s.invoices.length} invoice(s). Showing the first 100 — the Excel export has all.`}>
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Invoice</Th><Th>Date</Th><Th>Channel</Th><Th>Status</Th><Th right>Discount</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>Value</Th></tr></thead>
                    <tbody>{s.invoices.slice(0, 100).map((i) => (
                        <tr key={i.invoiceNo} className="border-t border-gray-100"><Td bold>{i.invoiceNo}</Td><Td>{dmy(i.date)}</Td><Td>{i.channel}</Td>
                            <Td className={i.status === 'Cancelled' ? 'text-red-600' : ''}>{i.status}</Td><Td right>{money(i.discount)}</Td><Td right>{money(i.taxable)}</Td><Td right>{money(i.cgst)}</Td><Td right>{money(i.sgst)}</Td><Td right>{money(i.total)}</Td></tr>
                    ))}</tbody>
                </table>
            </Card>
        </div>
    );
}

function PurchasesTab({ r }: { r: PharmacyGstReport }) {
    const p = r.purchases;
    return (
        <div className="space-y-4">
            <Card title="ITC by tax head" note="Only invoices that are posted and carry a valid supplier GSTIN. Tax head is decided by supplier state vs pharmacy state.">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th right>IGST</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>Total ITC</Th><Th right>At risk (bad GSTIN)</Th></tr></thead>
                    <tbody><tr className="border-t border-gray-100"><Td right bold>{money(p.itc.igst)}</Td><Td right bold>{money(p.itc.cgst)}</Td><Td right bold>{money(p.itc.sgst)}</Td><Td right bold>{money(p.itc.total)}</Td><Td right className={p.itcAtRisk ? 'text-red-600 font-bold' : ''}>{money(p.itcAtRisk)}</Td></tr></tbody>
                </table>
            </Card>
            <Card title="Purchase register">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Invoice</Th><Th>Date</Th><Th>Supplier</Th><Th>GSTIN</Th><Th right>Taxable</Th><Th right>IGST</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>Value</Th><Th>ITC</Th></tr></thead>
                    <tbody>
                        {p.rows.map((x) => (
                            <tr key={x.invoiceNo} className="border-t border-gray-100 align-top">
                                <Td bold>{x.invoiceNo}{x.flags.length > 0 && <div className="text-[10px] font-normal text-amber-600 max-w-[220px]">{x.flags.join('; ')}</div>}</Td>
                                <Td>{dmy(x.date)}</Td><Td>{x.vendor}</Td>
                                <Td className={x.gstinOk ? '' : 'text-red-600 font-bold'}>{x.gstin || '—'}{!x.gstinOk && x.gstinNote && <div className="text-[10px] font-normal">{x.gstinNote}</div>}</Td>
                                <Td right>{money(x.taxable)}</Td><Td right>{money(x.igst)}</Td><Td right>{money(x.cgst)}</Td><Td right>{money(x.sgst)}</Td><Td right>{money(x.total)}</Td>
                                <Td className={x.itcEligible ? 'text-emerald-600 font-bold' : 'text-gray-400'}>{x.itcEligible ? 'Claim' : x.cgst + x.sgst + x.igst > 0 ? 'Blocked' : 'No tax'}</Td>
                            </tr>
                        ))}
                        {!p.rows.length && <tr><Td className="text-gray-400">No posted purchase invoices in this period</Td></tr>}
                    </tbody>
                </table>
            </Card>
            <Card title="Purchases by GST rate">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Rate</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th></tr></thead>
                    <tbody>{p.byRate.map((x) => <tr key={x.rate} className="border-t border-gray-100"><Td bold>{x.rate}%</Td><Td right>{money(x.taxable)}</Td><Td right>{money(x.cgst)}</Td><Td right>{money(x.sgst)}</Td><Td right>{money(x.igst)}</Td></tr>)}</tbody>
                </table>
            </Card>
            {r.reversals.rows.length > 0 && (
                <Card title="ITC reversals (estimate)" note="Expired/damaged write-offs and supplier returns, at batch cost × catalogue GST rate.">
                    <table className="w-full">
                        <thead className="bg-gray-50"><tr><Th>Date</Th><Th>Type</Th><Th>Medicine</Th><Th>Batch</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Taxable</Th><Th right>GST</Th></tr></thead>
                        <tbody>{r.reversals.rows.map((x, i) => (
                            <tr key={i} className="border-t border-gray-100"><Td>{dmy(x.date)}</Td><Td>{x.kind === 'writeoff' ? 'Write-off' : 'Supplier return'}</Td><Td bold>{x.medicine}</Td><Td>{x.batch}</Td>
                                <Td right>{x.qty}</Td><Td right>{x.rate}%</Td><Td right>{money(x.taxable)}</Td><Td right>{money(x.cgst + x.sgst + x.igst)}</Td></tr>
                        ))}</tbody>
                    </table>
                </Card>
            )}
        </div>
    );
}

function IpdTab({ r }: { r: PharmacyGstReport }) {
    const i = r.ipd;
    return (
        <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl p-4 space-y-1">
                <p className="font-bold">Why this is separate</p>
                <p>Medicines dispensed to admitted patients are billed on the hospital IPD bill and the system forces their GST to 0% (treated as part of exempt healthcare service). These values are <b>not</b> in the GSTR-1 / 3B figures. If the pharmacy is a separate GSTIN from the hospital, they are taxable supplies by the pharmacy; if they stay exempt, ITC on the stock used must be reversed. The &quot;indicative tax&quot; below is catalogue rate × value, for your CA to decide with.</p>
            </div>
            <Card title="Dispensed to in-patients">
                <table className="w-full">
                    <tbody>
                        {[
                            ['Billed on IPD bills (pre-tax)', i.billedValue], ['Returns', -i.returnedValue], ['Net billed to IPD bills', i.netValue],
                            ['Absorbed in IPD packages (consumed, not billed)', i.packageConsumedValue], ['GST already printed on some IPD pharmacy lines', i.billedTax],
                        ].map(([label, v]: any) => <tr key={label} className="border-t border-gray-100"><Td bold>{label}</Td><Td right>{inr(v)}</Td></tr>)}
                    </tbody>
                </table>
            </Card>
            <Card title="Indicative GST if treated as taxable supplies" note="Medicines are matched to the catalogue by name.">
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Catalogue GST rate</Th><Th right>Value</Th><Th right>Indicative GST</Th></tr></thead>
                    <tbody>
                        {i.byRate.map((x) => <tr key={x.rate} className="border-t border-gray-100"><Td bold>{x.rate}%</Td><Td right>{money(x.value)}</Td><Td right>{money(x.indicativeTax)}</Td></tr>)}
                        <tr className="border-t border-gray-100"><Td bold className="text-amber-700">Rate unknown (lump-sum lines such as &quot;PHARMACY MEDICINE CHARGES&quot;, or not in catalogue)</Td><Td right>{money(i.unresolvedValue)}</Td><Td right>—</Td></tr>
                        <tr className="border-t-2 border-gray-200 bg-gray-50"><Td bold>Indicative total</Td><Td>{''}</Td><Td right bold>{inr(i.indicativeTax)}</Td></tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
}

function FixTab({ r }: { r: PharmacyGstReport }) {
    return (
        <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-xs text-gray-700">
                <p><b>{r.catalog.zeroRate.toLocaleString('en-IN')}</b> of <b>{r.catalog.total.toLocaleString('en-IN')}</b> active medicines have GST % = 0 and <b>{r.catalog.noHsn.toLocaleString('en-IN')}</b> have no HSN in the master.
                    Below are the medicines <b>sold in this period</b> with neither set, highest value first, with the GST rate / HSN from their latest purchase bill (or purchase order, if never billed) as a suggestion
                    {r.underBilledEstimate > 0 && <> (GST that would have been added: ≈ <b>{inr(r.underBilledEstimate)}</b>)</>}. Verify each with your CA before applying.</p>
            </div>
            <Card title={`Medicines to set up (${r.masterFixes.length})`}>
                <table className="w-full">
                    <thead className="bg-gray-50"><tr><Th>Medicine</Th><Th right>Qty sold</Th><Th right>Sold value</Th><Th right>Suggested GST %</Th><Th>Suggested HSN</Th><Th>Source</Th></tr></thead>
                    <tbody>
                        {r.masterFixes.slice(0, 200).map((f) => (
                            <tr key={f.medicine} className="border-t border-gray-100"><Td bold>{f.medicine}</Td><Td right>{f.qty}</Td><Td right>{money(f.soldValue)}</Td>
                                <Td right>{f.suggestedRate != null ? `${f.suggestedRate}%` : <span className="text-gray-400">no bill or PO history</span>}</Td><Td>{f.suggestedHsn || '—'}</Td><Td>{f.source || '—'}</Td></tr>
                        ))}
                        {!r.masterFixes.length && <tr><Td className="text-gray-400">Every medicine sold in this period has a GST rate or HSN.</Td></tr>}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}

function IssuesTab({ r }: { r: PharmacyGstReport }) {
    return (
        <div className="space-y-3">
            {r.issues.map((i) => (
                <div key={i.code} className={`border rounded-2xl p-4 ${SEV[i.severity].cls}`}>
                    <div className="flex items-start gap-2">
                        {i.severity === 'info' ? <Info className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                        <div className="min-w-0">
                            <p className="text-sm font-black">{i.title}
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{SEV[i.severity].label}</span></p>
                            <p className="text-xs mt-1 leading-relaxed">{i.detail}</p>
                            {(i.count > 0 || i.amount != null) && (
                                <p className="text-[11px] mt-1 font-bold">{i.count > 0 && `${i.count} record(s)`}{i.amount != null && ` · ${inr(i.amount)}`}</p>
                            )}
                            {i.refs.length > 0 && <p className="text-[11px] mt-1 opacity-80 break-words">e.g. {i.refs.join(' · ')}</p>}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
