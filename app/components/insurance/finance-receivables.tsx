'use client';

/**
 * Finance / receivables tabs for the unified TPA & Insurance module.
 * Rendered inside the existing /insurance dashboard (and therefore on
 * /admin/finance/tpa-insurance too). Each tab is self-contained and loads its
 * own data via the insurance receivables server actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Inbox, Loader2, RefreshCw, IndianRupee, Clock, XCircle, FileWarning,
  ArrowDownToLine, AlertTriangle, Plus, X, Printer, Download, Undo2, History, Pencil,
} from 'lucide-react';
import { getTpaDeskDashboard, getInsuranceOutstanding, getBillWiseSanction, getPatientWiseOutstanding } from '@/app/actions/insurance-aging-actions';
import { getHospitalBillingInfo } from '@/app/actions/admin-actions';
import {
  getInsuranceReceiptSummary, listInsuranceReceipts,
  allocateReceipt, getPendingAdvices, recordAndAllocateReceipt, reverseInsuranceReceipt,
  getInsuranceReceiptHistory, searchInvoicesForInsuranceReceipt, updateInsuranceReceipt,
} from '@/app/actions/insurance-receipts-actions';
import { applyAvailableDepositToInvoice } from '@/app/actions/deposit-actions';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

// Hospital identity for report letterheads. Fetched once per page load and
// shared, so each tab doesn't re-query it.
let hospitalCache: any = null;
function useHospital() {
  const [hospital, setHospital] = useState<any>(hospitalCache);
  useEffect(() => {
    if (hospitalCache) return;
    getHospitalBillingInfo().then((r: any) => {
      if (r?.success && r.data) { hospitalCache = r.data; setHospital(r.data); }
    }).catch(() => { /* letterhead is cosmetic — never block the report */ });
  }, []);
  return hospital;
}
const INPUT = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Has this patient's money actually come in from the payer?
//   pending  — nothing received yet
//   partial  — part received, a balance is still due
//   received — nothing left outstanding
// Deliberately keyed off cash received (not claim status), because a claim can
// read "approved" for weeks before a single rupee arrives.
type ReceiptState = 'pending' | 'partial' | 'received';
function receiptState(r: any): ReceiptState {
  const received = Number(r.received || 0);
  const outstanding = Number(r.outstanding || 0);
  if (received <= 0) return 'pending';
  return outstanding > 0.01 ? 'partial' : 'received';
}
const RECEIPT_LABEL: Record<ReceiptState, string> = {
  pending: 'Pending', partial: 'Part received', received: 'Received',
};
const RECEIPT_PILL: Record<ReceiptState, string> = {
  pending: 'bg-rose-100 text-rose-700',
  partial: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
};

// A column definition shared by the on-screen export paths: `val` returns the
// RAW value (number stays a number) so Excel can sum it, while the print path
// formats it for display.
type ExportCol = { header: string; val: (r: any) => string | number; num?: boolean; width?: number; nowrap?: boolean };

// Export to a real .xlsx rather than CSV. CSV carried no column widths, so Excel
// collapsed the money columns to "#####", and it had no way to say what the
// report was. This writes a titled sheet with sized columns and numeric cells.
async function downloadXlsx(opts: {
  filename: string; sheetName: string; title: string; hospital?: string;
  meta: string[]; cols: ExportCol[]; rows: any[]; totals?: (string | number)[];
}) {
  const XLSX = await import('xlsx');
  const { title, hospital, meta, cols, rows, totals } = opts;
  const width = cols.length;
  const pad = (arr: (string | number)[]) => [...arr, ...Array(Math.max(0, width - arr.length)).fill('')];

  // Title block so anyone opening the file knows what it is and how it was filtered.
  const aoa: (string | number)[][] = [];
  if (hospital) aoa.push(pad([hospital]));
  aoa.push(pad([title]));
  meta.filter(Boolean).forEach((m) => aoa.push(pad([m])));
  aoa.push(pad([`Generated: ${new Date().toLocaleString('en-GB')}`]));
  aoa.push(pad([]));
  const headerRowIdx = aoa.length;
  aoa.push(cols.map((c) => c.header));
  rows.forEach((r) => aoa.push(cols.map((c) => c.val(r))));
  if (totals) aoa.push(pad(totals));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 4) }));
  // Title lines span the full table width so they read as a heading.
  ws['!merges'] = aoa.slice(0, headerRowIdx).map((_, i) => ({ s: { r: i, c: 0 }, e: { r: i, c: width - 1 } }));

  // Money cells: real numbers with a thousands separator, so they stay summable
  // in Excel. (Fonts/fills are deliberately not set — cell styling is a no-op in
  // the open-source SheetJS build, so it would be dead code.)
  const range = XLSX.utils.decode_range(ws['!ref'] as string);
  for (let R = headerRowIdx + 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && typeof cell.v === 'number' && cols[C]?.num) cell.z = '#,##0.00';
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName.slice(0, 31));
  XLSX.writeFile(wb, opts.filename);
}

// Open a print-ready page for a table in a new tab and trigger the print dialog
// (the browser's "Save as PDF" is the PDF path, same as the rest of the app).
function printTable(opts: {
  title: string; subtitle?: string; meta?: string[];
  headers: string[]; align?: ('left' | 'right')[];
  rows: (string | number)[][]; footer?: (string | number)[];
  hospital?: any; nowrap?: boolean[];
}) {
  const { title, subtitle, meta = [], headers, align = [], rows, footer, hospital, nowrap = [] } = opts;
  const at = (i: number) => align[i] === 'right' ? 'right' : 'left';
  // Identifiers and money must never be broken across lines — wrapping them was
  // what made every row three lines tall and the sheet look cramped.
  const wrapCss = (i: number) => (nowrap[i] || align[i] === 'right') ? 'white-space:nowrap;' : '';
  // Hospital letterhead — these reports go out to payers and auditors, so they
  // have to carry the hospital's identity, not just a bare table.
  const letterhead = hospital?.name ? `
<div style="border-bottom:3px solid #1e3a6e;padding-bottom:10px;margin-bottom:14px;">
  <h1 style="font-size:19px;font-weight:800;color:#1e3a6e;">${esc(hospital.name)}</h1>
  ${hospital.address ? `<p style="font-size:10.5px;color:#6b7280;">${esc(hospital.address)}</p>` : ''}
  <p style="font-size:10.5px;color:#6b7280;">${hospital.phone ? `Phone: ${esc(hospital.phone)}` : ''}${hospital.phone && hospital.email ? ' | ' : ''}${hospital.email ? `Email: ${esc(hospital.email)}` : ''}${hospital.organization_gstin ? ` | GSTIN: ${esc(hospital.organization_gstin)}` : ''}</p>
</div>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;padding:24px}
h1{font-size:19px;font-weight:800}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #e5e7eb;padding:7px 9px;font-size:11px;line-height:1.35}
thead th{background:#1e3a6e;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:9.5px}
tfoot td{background:#eef2f7;font-weight:800}
tbody tr:nth-child(even){background:#fafbfc}
thead{display:table-header-group}
tr{page-break-inside:avoid}
@media print{.no-print{display:none!important}@page{size:A4 landscape;margin:10mm}}
</style></head><body>
<div class="no-print" style="text-align:right;margin-bottom:10px;">
  <button onclick="window.print()" style="padding:9px 22px;background:#1e3a6e;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Print / Save PDF</button>
</div>
${letterhead}
<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
  <div>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p style="font-size:12px;color:#6b7280;margin-top:2px;">${esc(subtitle)}</p>` : ''}
    ${meta.length ? `<p style="font-size:10.5px;color:#6b7280;margin-top:5px;">${meta.map(esc).join(' &nbsp;·&nbsp; ')}</p>` : ''}
  </div>
  <p style="font-size:10px;color:#9ca3af;white-space:nowrap;">Generated: ${esc(new Date().toLocaleString('en-GB'))}</p>
</div>
<table>
<thead><tr>${headers.map((h, i) => `<th style="text-align:${at(i)};${wrapCss(i)}">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="text-align:${at(i)};${wrapCss(i)}">${esc(c)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${headers.length}" style="text-align:center;color:#9ca3af;padding:18px;">No rows</td></tr>`}</tbody>
${footer ? `<tfoot><tr>${footer.map((c, i) => `<td style="text-align:${at(i)};${wrapCss(i)}">${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}
</table>
<p style="margin-top:14px;font-size:10px;color:#9ca3af;text-align:center;">Computer-generated report${hospital?.name ? ` · ${esc(hospital.name)}` : ''}</p>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups for this site to print the report.'); return; }
  w.document.write(html);
  w.document.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVABLES DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export function ReceivablesDashboard({ providers = [] }: { providers?: any[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [showOutstanding, setShowOutstanding] = useState(false);
  const [billRows, setBillRows] = useState<any[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    getTpaDeskDashboard({ provider_id: providerId ? Number(providerId) : undefined }).then((r: any) => { if (r?.success) setData(r.data); }).finally(() => setLoading(false));
    setBillsLoading(true);
    getBillWiseSanction({ provider_id: providerId ? Number(providerId) : undefined }).then((r: any) => {
      if (r?.success) setBillRows((r.data?.rows || []).filter((row: any) => Number(row.outstanding) > 0));
    }).finally(() => setBillsLoading(false));
  }, [providerId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!data) return <Empty msg="No receivables data" />;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <h3 className="text-sm font-black text-gray-700">Receivables Desk</h3>
        <div className="flex items-center gap-2">
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All payers</option>
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={IndianRupee} label="Total Outstanding" value={`₹${fmt(data.total_outstanding)}`} tone="teal" sub={`${data.outstanding_bills} bills · click to view`} onClick={() => setShowOutstanding(true)} />
        <KpiCard icon={Clock} label="Pending Advices" value={data.pending_advices} tone="amber" sub="approved, awaiting receipt" />
        <KpiCard icon={ArrowDownToLine} label="Unmapped Receipts" value={`₹${fmt(data.unmapped_receipts)}`} tone="blue" sub="received, not allocated" />
        <KpiCard icon={XCircle} label="Denied to Action" value={data.denied_to_action} tone="red" />
        <KpiCard icon={FileWarning} label="Short-Pay Pending" value={`₹${fmt(data.short_pay_pending_amount)}`} tone="amber" sub={`${data.short_pay_pending_count} items`} />
        <KpiCard icon={AlertTriangle} label="Queries Pending" value={data.queries_pending} tone="red" />
        <KpiCard icon={Inbox} label="Submission Backlog" value={data.submission_backlog} tone="slate" sub="submitted, awaiting ack" />
      </div>

      {/* Inline bill list — same data as clicking "Total Outstanding", shown
          directly on the page so it's visible without an extra click. */}
      <div className="mt-5">
        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Outstanding Bills</h4>
        {billsLoading ? <Spinner /> : <BillsTable rows={billRows} emptyMsg="No outstanding bills" />}
      </div>

      {showOutstanding && (
        <OutstandingDrilldownModal providerId={providerId ? Number(providerId) : undefined} onClose={() => setShowOutstanding(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTSTANDING & AGING
// ─────────────────────────────────────────────────────────────────────────────
export function OutstandingAging({ providers = [] }: { providers?: any[] }) {
  const hospital = useHospital();
  const [view, setView] = useState<'payer' | 'patient'>('payer');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agingDays, setAgingDays] = useState(60);
  const [providerId, setProviderId] = useState('');
  const [patientData, setPatientData] = useState<any>(null);
  const [patientLoading, setPatientLoading] = useState(true);
  // Custom bill-date range — an alternative to the aging-bucket view, shared
  // by both TPA-wise and Patient-wise (same underlying bills either way).
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const rangeOpts = useCustomRange ? { from: fromDate || undefined, to: toDate || undefined } : {};

  const load = useCallback(() => {
    setLoading(true);
    getInsuranceOutstanding({ payer_type: 'tpa_insurance', agingDays, provider_id: providerId ? Number(providerId) : undefined, ...rangeOpts }).then((r: any) => { if (r?.success) setData(r.data); }).finally(() => setLoading(false));
    setPatientLoading(true);
    getPatientWiseOutstanding({ provider_id: providerId ? Number(providerId) : undefined, ...rangeOpts }).then((r: any) => { if (r?.success) setPatientData(r.data); }).finally(() => setPatientLoading(false));
  }, [agingDays, providerId, useCustomRange, fromDate, toDate]);
  useEffect(() => { load(); }, [load]);

  const payerLabel = providerId ? (providers.find((p: any) => String(p.id) === providerId)?.provider_name || 'Payer') : 'All payers';
  const COLS: ExportCol[] = [
    { header: 'Company Name', val: (r) => r.payer_name || '', width: 40 },
    { header: 'Opening', val: (r) => Number(r.opening || 0), num: true, width: 15 },
    { header: `Below ${agingDays} Days`, val: (r) => Number(r.below || 0), num: true, width: 17 },
    { header: `Above ${agingDays} Days`, val: (r) => Number(r.above || 0), num: true, width: 17 },
    { header: 'Unmapped Receipt', val: (r) => Number(r.unmapped_receipt || 0), num: true, width: 18 },
    { header: 'Balance', val: (r) => Number(r.balance || 0), num: true, width: 16 },
  ];
  const ALIGN = COLS.map((c) => (c.num ? 'right' : 'left')) as ('left' | 'right')[];
  const rangeLabel = useCustomRange && (fromDate || toDate)
    ? `Range: ${fromDate ? new Date(fromDate).toLocaleDateString('en-GB') : 'start'} – ${toDate ? new Date(toDate).toLocaleDateString('en-GB') : 'today'}`
    : '';
  const metaLines = [
    `Payer: ${payerLabel}`,
    rangeLabel || `Aging threshold: ${agingDays} days`,
    `${data?.rows?.length || 0} payer(s)`,
  ];
  const printRows = () => (data?.rows || []).map((r: any) => COLS.map((c) => (c.num ? fmt(c.val(r) as number) : c.val(r))));
  const totalsRow = () => data ? [
    'TOTAL', Number(data.totals.opening || 0), Number(data.totals.below || 0),
    Number(data.totals.above || 0), Number(data.totals.unmapped_receipt || 0), Number(data.totals.balance || 0),
  ] : undefined;
  const printTotals = () => { const t = totalsRow(); return t && t.map((v, i) => (COLS[i]?.num ? fmt(v as number) : v)); };

  const handlePrint = () => printTable({
    title: 'Insurance Outstanding & Aging',
    subtitle: payerLabel,
    meta: metaLines.slice(1),
    headers: COLS.map((c) => c.header), align: ALIGN,
    nowrap: COLS.map((c) => !!c.nowrap),
    rows: printRows(), footer: printTotals(), hospital,
  });
  const handleExcel = () => downloadXlsx({
    filename: `Insurance-Outstanding-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: 'Outstanding & Aging',
    title: 'Insurance Outstanding & Aging',
    hospital: hospital?.name,
    meta: metaLines,
    cols: COLS, rows: data?.rows || [], totals: totalsRow(),
  });

  // ── Patient-wise view — same underlying bills, one row per bill (not rolled
  // up per payer), with the TPA/insurance name carried on each row.
  const dateStr = (d: any) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
  const PATIENT_COLS: ExportCol[] = [
    { header: 'Patient', val: (r) => r.patient_name || '', width: 26 },
    { header: 'TPA / Insurance', val: (r) => r.provider_name || '', width: 22 },
    { header: 'Bill #', val: (r) => r.invoice_number || '', width: 20 },
    { header: 'Bill Date', val: (r) => dateStr(r.bill_date), width: 14, nowrap: true },
    { header: 'Admission Date', val: (r) => dateStr(r.admission_date), width: 16, nowrap: true },
    { header: 'Discharge Date', val: (r) => dateStr(r.discharge_date), width: 16, nowrap: true },
    { header: 'Bill Amount', val: (r) => Number(r.bill_amount || 0), num: true, width: 15 },
    { header: 'Discount', val: (r) => Number(r.discount || 0), num: true, width: 13 },
    { header: 'Net Bill Amount', val: (r) => Number(r.net_bill_amount || 0), num: true, width: 16 },
    { header: 'Received', val: (r) => Number(r.received || 0), num: true, width: 14 },
    { header: 'Outstanding', val: (r) => Number(r.outstanding || 0), num: true, width: 15 },
  ];
  const PATIENT_ALIGN = PATIENT_COLS.map((c) => (c.num ? 'right' : 'left')) as ('left' | 'right')[];
  const patientMetaLines = [
    `Payer: ${payerLabel}`,
    ...(rangeLabel ? [rangeLabel] : []),
    `${patientData?.rows?.length || 0} bill(s)`,
  ];
  const patientPrintRows = () => (patientData?.rows || []).map((r: any) => PATIENT_COLS.map((c) => (c.num ? fmt(c.val(r) as number) : c.val(r))));
  const patientTotalsRow = () => patientData ? [
    'TOTAL', '', '', '', '', '',
    Number(patientData.totals.bill_amount || 0), Number(patientData.totals.discount || 0),
    Number(patientData.totals.net_bill_amount || 0), Number(patientData.totals.received || 0),
    Number(patientData.totals.outstanding || 0),
  ] : undefined;
  const patientPrintTotals = () => { const t = patientTotalsRow(); return t && t.map((v, i) => (PATIENT_COLS[i]?.num ? fmt(v as number) : v)); };

  const handlePatientPrint = () => printTable({
    title: 'Patient-Wise Outstanding',
    subtitle: payerLabel,
    meta: patientMetaLines.slice(1),
    headers: PATIENT_COLS.map((c) => c.header), align: PATIENT_ALIGN,
    nowrap: PATIENT_COLS.map((c) => !!c.nowrap),
    rows: patientPrintRows(), footer: patientPrintTotals(), hospital,
  });
  const handlePatientExcel = () => downloadXlsx({
    filename: `Patient-Wise-Outstanding-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: 'Patient-Wise Outstanding',
    title: 'Patient-Wise Outstanding',
    hospital: hospital?.name,
    meta: patientMetaLines,
    cols: PATIENT_COLS, rows: patientData?.rows || [], totals: patientTotalsRow(),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex rounded-lg border border-gray-300 p-0.5 bg-gray-50">
          <button onClick={() => setView('payer')}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${view === 'payer' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            TPA-wise
          </button>
          <button onClick={() => setView('patient')}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${view === 'patient' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            Patient-wise
          </button>
        </div>
        {view === 'payer' && !useCustomRange && (<>
          <input type="number" value={agingDays} onChange={(e) => setAgingDays(Number(e.target.value) || 60)} className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm" />
          <span className="text-sm text-gray-600">days aging</span>
        </>)}
        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={useCustomRange} onChange={(e) => setUseCustomRange(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
          Custom Range
        </label>
        {useCustomRange && (<>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        </>)}
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All payers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          {view === 'payer' ? (
            <>
              <button onClick={handleExcel} disabled={!data || data.rows.length === 0} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <button onClick={handlePrint} disabled={!data || data.rows.length === 0} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            </>
          ) : (
            <>
              <button onClick={handlePatientExcel} disabled={!patientData || patientData.rows.length === 0} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <button onClick={handlePatientPrint} disabled={!patientData || patientData.rows.length === 0} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            </>
          )}
          <button onClick={load} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
      </div>

      {view === 'payer' ? (
        loading ? <Spinner /> : !data ? <Empty msg="No data" /> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Company Name</th>
                  <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Opening</th>
                  <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Below {data.agingDays} Days</th>
                  <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Above {data.agingDays} Days</th>
                  <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Unmapped Receipt</th>
                  <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r: any) => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{r.payer_name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{r.opening ? fmt(r.opening) : '-'}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.below)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.above)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.unmapped_receipt)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(r.balance)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No outstanding</td></tr>}
              </tbody>
              <tfoot className="bg-slate-100 font-black text-gray-800">
                <tr>
                  <td className="px-4 py-2.5 text-right">TOTAL</td>
                  <td className="px-4 py-2.5 text-right">{data.totals.opening ? fmt(data.totals.opening) : '-'}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(data.totals.below)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(data.totals.above)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(data.totals.unmapped_receipt)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(data.totals.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      ) : (
        patientLoading ? <Spinner /> : !patientData ? <Empty msg="No data" /> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Patient</th>
                  <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">TPA / Insurance</th>
                  <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Bill #</th>
                  <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Bill Date</th>
                  <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Admission</th>
                  <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Discharge</th>
                  <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Bill Amount</th>
                  <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Discount</th>
                  <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Net Bill</th>
                  <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Received</th>
                  <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(patientData.rows || []).map((r: any) => (
                  <tr key={r.invoice_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-gray-800 font-medium whitespace-nowrap">{r.patient_name}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.provider_name || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{r.invoice_number || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{dateStr(r.bill_date)}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{dateStr(r.admission_date)}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{dateStr(r.discharge_date)}</td>
                    <td className="px-3 py-2.5 text-right">{fmt(r.bill_amount)}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600">{r.discount ? fmt(r.discount) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">{fmt(r.net_bill_amount)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700">{r.received ? fmt(r.received) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-rose-600">{fmt(r.outstanding)}</td>
                  </tr>
                ))}
                {(patientData.rows || []).length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No outstanding</td></tr>}
              </tbody>
              <tfoot className="bg-slate-100 font-black text-gray-800">
                <tr>
                  <td className="px-3 py-2.5 text-right" colSpan={6}>TOTAL</td>
                  <td className="px-3 py-2.5 text-right">{fmt(patientData.totals.bill_amount)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(patientData.totals.discount)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(patientData.totals.net_bill_amount)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(patientData.totals.received)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(patientData.totals.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSURANCE RECEIPTS
// ─────────────────────────────────────────────────────────────────────────────
export function InsuranceReceipts({ providers }: { providers: any[] }) {
  const hospital = useHospital();
  const [summary, setSummary] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  // The per-payer RECEIPT button opens the SAME "Record Insurance Receipt" flow
  // as the New Receipt button — the only difference is the payer arrives
  // pre-selected, so the biller never re-picks a payer they already clicked.
  const [receiptForPayer, setReceiptForPayer] = useState<any>(null);
  // Allocating an already-recorded (unallocated) receipt is a different job and
  // now hangs off the receipt row itself, where the unmapped money is visible.
  const [allocFor, setAllocFor] = useState<any>(null);
  // A wrong receipt (fat-fingered amount, bounced transfer) previously had no
  // undo — the settlement engine has a full reversal routine, but nothing in the
  // UI reached it, so a mistyped figure permanently settled the bill.
  const [reverseFor, setReverseFor] = useState<any>(null);
  const [historyFor, setHistoryFor] = useState<any>(null);
  const [editFor, setEditFor] = useState<any>(null);
  const [providerId, setProviderId] = useState('');
  const [payerSearch, setPayerSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);

  // Recent Receipts table filters — receipt #, ref no, or a patient name, plus
  // status and a receipt-date range. Mirrors the Bill-Wise Sanction filter bar.
  const [rSearch, setRSearch] = useState('');
  const [rDebouncedSearch, setRDebouncedSearch] = useState('');
  const [rStatus, setRStatus] = useState('');
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setRDebouncedSearch(rSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [rSearch]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getInsuranceReceiptSummary(),
      listInsuranceReceipts({
        payer_type: 'tpa_insurance',
        provider_id: providerId ? Number(providerId) : undefined,
        search: rDebouncedSearch || undefined,
        status: rStatus || undefined,
        from: rFrom || undefined,
        to: rTo || undefined,
      }),
    ])
      .then(([s, r]: any[]) => { if (s?.success) setSummary(s.data); if (r?.success) setReceipts(r.data); })
      .finally(() => setLoading(false));
  }, [providerId, rDebouncedSearch, rStatus, rFrom, rTo]);
  useEffect(() => { load(); }, [load]);

  const receiptPayerLabel = providerId ? (providers.find((p: any) => String(p.id) === providerId)?.provider_name || 'Payer') : 'All payers';
  const RECEIPT_COLS: ExportCol[] = [
    { header: 'Receipt #', val: (r) => r.receipt_number || '', width: 20, nowrap: true },
    { header: 'Date', val: (r) => r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-GB') : '', width: 14, nowrap: true },
    { header: 'Payer', val: (r) => r.provider?.provider_name || r.corporate?.company_name || '', width: 32 },
    { header: 'Patient(s)', val: (r) => (r.patients || []).join(', '), width: 28 },
    { header: 'Ref No', val: (r) => r.reference_number || '', width: 20, nowrap: true },
    { header: 'Received', val: (r) => Number(r.total_amount || 0), num: true, width: 15 },
    { header: 'Claim', val: (r) => Number(r.claim_amount || 0), num: true, width: 15 },
    { header: 'Sanctioned', val: (r) => Number(r.sanctioned_amount || 0), num: true, width: 16 },
    { header: 'TDS', val: (r) => Number(r.tds_total || 0), num: true, width: 13 },
    { header: 'Svc Chg', val: (r) => Number(r.service_charge || 0), num: true, width: 13 },
    { header: 'Disallowed', val: (r) => Number(r.disallowed_total ?? Math.max(0, Number(r.claim_amount || 0) - Number(r.sanctioned_amount || 0))), num: true, width: 15 },
    { header: 'Status', val: (r) => r.status || '', width: 16, nowrap: true },
  ];
  const RECEIPT_ALIGN = RECEIPT_COLS.map((c) => (c.num ? 'right' : 'left')) as ('left' | 'right')[];
  const receiptMetaLines = [
    `Payer: ${receiptPayerLabel}`,
    rFrom || rTo ? `Period: ${rFrom || '…'} to ${rTo || '…'}` : 'Period: All dates',
    rStatus ? `Status: ${rStatus}` : 'Status: all',
    `${receipts.length} receipt(s)`,
  ];
  const receiptTotalsRow = () => receipts.length ? [
    'TOTAL', '', '', '', '',
    receipts.reduce((t: number, r: any) => t + Number(r.total_amount || 0), 0),
    receipts.reduce((t: number, r: any) => t + Number(r.claim_amount || 0), 0),
    receipts.reduce((t: number, r: any) => t + Number(r.sanctioned_amount || 0), 0),
    receipts.reduce((t: number, r: any) => t + Number(r.tds_total || 0), 0),
    receipts.reduce((t: number, r: any) => t + Number(r.service_charge || 0), 0),
    receipts.reduce((t: number, r: any) => t + Number(r.disallowed_total ?? Math.max(0, Number(r.claim_amount || 0) - Number(r.sanctioned_amount || 0))), 0),
    '',
  ] : undefined;
  const receiptPrintRows = () => receipts.map((r: any) => RECEIPT_COLS.map((c) => (c.num ? fmt(c.val(r) as number) : c.val(r))));
  const receiptPrintTotals = () => { const t = receiptTotalsRow(); return t && t.map((v, i) => (RECEIPT_COLS[i]?.num ? fmt(v as number) : v)); };

  const handleReceiptPrint = () => printTable({
    title: 'Insurance Receipts',
    subtitle: receiptPayerLabel,
    meta: receiptMetaLines.slice(1),
    headers: RECEIPT_COLS.map((c) => c.header), align: RECEIPT_ALIGN,
    nowrap: RECEIPT_COLS.map((c) => !!c.nowrap),
    rows: receiptPrintRows(), footer: receiptPrintTotals(), hospital,
  });
  const handleReceiptExcel = () => downloadXlsx({
    filename: `Insurance-Receipts-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: 'Insurance Receipts',
    title: 'Insurance Receipts',
    hospital: hospital?.name,
    meta: receiptMetaLines,
    cols: RECEIPT_COLS, rows: receipts, totals: receiptTotalsRow(),
  });

  if (loading) return <Spinner />;

  // Payers awaiting a receipt are the work; payers with nothing pending are
  // reference. Sort the work to the top instead of listing 25 payers
  // alphabetically with the actionable ones scattered among them.
  const q = payerSearch.trim().toLowerCase();
  const visibleSummary = summary
    .filter((s: any) => (!q || String(s.provider_name || '').toLowerCase().includes(q))
      && (!onlyPending || Number(s.pending_advices) > 0))
    .sort((a: any, b: any) =>
      Number(b.pending_advices || 0) - Number(a.pending_advices || 0)
      || String(a.provider_name || '').localeCompare(String(b.provider_name || '')));
  const pendingPayers = summary.filter((s: any) => Number(s.pending_advices) > 0).length;
  const sumTotals = visibleSummary.reduce((t: any, s: any) => ({
    receipts: t.receipts + Number(s.total_receipts || 0),
    amount: t.amount + Number(s.total_receipt_amount || 0),
    advices: t.advices + Number(s.pending_advices || 0),
  }), { receipts: 0, amount: 0, advices: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-sm font-black text-gray-700">Insurance Summary</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input value={payerSearch} onChange={(e) => setPayerSearch(e.target.value)} placeholder="Find payer…"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm w-44" />
          <button onClick={() => setOnlyPending((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${onlyPending ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            Awaiting receipt{pendingPayers ? ` (${pendingPayers})` : ''}
          </button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Receipt
          </button>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-gray-600 sticky top-0 z-10" style={{ boxShadow: 'inset 0 -1px 0 #e5e7eb' }}>
            <tr>
              <th className="px-4 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Insurance / TPA</th>
              <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Total Receipts</th>
              <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Receipt Amount</th>
              <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Pending Advices</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleSummary.map((s: any) => (
              <tr key={s.provider_id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-bold text-gray-800">{s.provider_name}</td>
                <td className="px-4 py-2.5 text-right">{s.total_receipts}</td>
                <td className="px-4 py-2.5 text-right">{fmt(s.total_receipt_amount)}</td>
                <td className="px-4 py-2.5 text-right">{s.pending_advices > 0 ? <span className="text-amber-600 font-bold">{s.pending_advices}</span> : 0}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setReceiptForPayer({ provider_id: s.provider_id, provider_name: s.provider_name })}
                    title={`Record a receipt for ${s.provider_name}`}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-blue-700">RECEIPT</button>
                </td>
              </tr>
            ))}
            {visibleSummary.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                {summary.length === 0 ? 'No payers' : 'No payers match this filter'}
              </td></tr>
            )}
          </tbody>
          {visibleSummary.length > 0 && (
            <tfoot className="bg-slate-100 font-black text-gray-800 sticky bottom-0" style={{ boxShadow: 'inset 0 1px 0 #e5e7eb' }}>
              <tr>
                <td className="px-4 py-2.5">TOTAL{visibleSummary.length !== summary.length ? ` (${visibleSummary.length} of ${summary.length})` : ''}</td>
                <td className="px-4 py-2.5 text-right">{sumTotals.receipts}</td>
                <td className="px-4 py-2.5 text-right">{fmt(sumTotals.amount)}</td>
                <td className="px-4 py-2.5 text-right">{sumTotals.advices}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-sm font-black text-gray-700 mr-1">Recent Receipts</h3>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All payers</option>
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
          <select value={rStatus} onChange={(e) => setRStatus(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All statuses</option>
            {['Open', 'PartiallyAllocated', 'Allocated', 'Reversed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Receipt #, ref no, patient…" value={rSearch} onChange={(e) => setRSearch(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm w-52" />
          <input type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          {(providerId || rStatus || rSearch || rFrom || rTo) && (
            <button onClick={() => { setProviderId(''); setRStatus(''); setRSearch(''); setRFrom(''); setRTo(''); }}
              className="text-xs font-bold text-gray-400 hover:text-gray-700 underline">Clear</button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">{receipts.length} receipt(s)</span>
            <button onClick={handleReceiptExcel} disabled={loading || receipts.length === 0} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button onClick={handleReceiptPrint} disabled={loading || receipts.length === 0} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-gray-600 sticky top-0 z-10" style={{ boxShadow: 'inset 0 -1px 0 #e5e7eb' }}>
              <tr>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Receipt #</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Date</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Payer</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Patient(s)</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Ref No</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Received</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Claim</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Sanctioned</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">TDS</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Svc Chg</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Disallowed</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Status</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipts.map((r: any) => {
                const disallowed = Number(r.disallowed_total ?? Math.max(0, Number(r.claim_amount || 0) - Number(r.sanctioned_amount || 0)));
                const unmapped = Number(r.unmapped_amount || 0);
                return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{r.receipt_number}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-GB') : '-'}</td>
                  <td className="px-3 py-2.5 text-gray-800 max-w-[150px]">
                    <span className="block truncate" title={r.provider?.provider_name || r.corporate?.company_name || ''}>
                      {r.provider?.provider_name || r.corporate?.company_name || '-'}
                    </span>
                  </td>
                  {/* Reversal keeps the allocation rows for audit, so the patient
                      it *was* mapped to still comes back from the server. Showing
                      it plainly read as if the receipt were still applied to that
                      patient, while the same row said "Reversed" and showed the
                      full amount unmapped. Strike it through so it reads as
                      history, not a live allocation. */}
                  <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[180px] truncate"
                    title={r.status === 'Reversed' && r.patients?.length
                      ? `Reversed — was mapped to ${r.patients.join(', ')}`
                      : (r.patients || []).join(', ')}>
                    {!r.patients?.length ? <span className="text-gray-300">Unallocated</span>
                      : r.status === 'Reversed'
                        ? <span className="text-gray-400 line-through">{r.patients.join(', ')}</span>
                        : r.patients.join(', ')}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{r.reference_number}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900">{fmt(r.total_amount)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.claim_amount) ? fmt(r.claim_amount) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.sanctioned_amount) ? fmt(r.sanctioned_amount) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.tds_total) ? fmt(r.tds_total) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.service_charge) ? fmt(r.service_charge) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-rose-600">{disallowed ? fmt(disallowed) : '—'}</td>
                  <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* A reversed receipt still reports its full amount as
                          unmapped, but the engine refuses to allocate it — so
                          offering "Map" here only led to an error. */}
                      {unmapped > 0 && r.provider_id && r.status !== 'Reversed' ? (
                        <button
                          onClick={() => setAllocFor({ provider_id: r.provider_id, provider_name: r.provider?.provider_name || 'Payer', receipt_id: r.id })}
                          title={`₹${fmt(unmapped)} still unmapped — map it to patient bills`}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 whitespace-nowrap">
                          Map ₹{fmt(unmapped)}
                        </button>
                      ) : null}
                      <a href={`/api/insurance/receipt/${r.id}/print`} target="_blank" rel="noopener noreferrer"
                        title="Print receipt"
                        className="inline-flex items-center rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800">
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => setHistoryFor(r)} title="History — who recorded, mapped or reversed this, and why"
                        className="inline-flex items-center rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {r.status !== 'Reversed' && (
                        <button onClick={() => setEditFor(r)}
                          title="Edit this receipt"
                          className="inline-flex items-center rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {r.status !== 'Reversed' && (
                        <button onClick={() => setReverseFor(r)} title="Reverse this receipt"
                          className="inline-flex items-center rounded-lg border border-gray-300 p-1.5 text-gray-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600">
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );})}
              {receipts.length === 0 && <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">No receipts yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewReceiptModal providers={providers} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {receiptForPayer && (
        <NewReceiptModal
          providers={providers}
          defaultProviderId={receiptForPayer.provider_id}
          onClose={() => setReceiptForPayer(null)}
          onSaved={() => { setReceiptForPayer(null); load(); }}
        />
      )}
      {allocFor && <AllocateModal payer={allocFor} onClose={() => setAllocFor(null)} onSaved={() => { setAllocFor(null); load(); }} />}
      {reverseFor && <ReverseReceiptModal receipt={reverseFor} onClose={() => setReverseFor(null)} onDone={() => { setReverseFor(null); load(); }} />}
      {historyFor && <ReceiptHistoryModal receipt={historyFor} onClose={() => setHistoryFor(null)} />}
      {editFor && <EditReceiptModal receipt={editFor} providers={providers} onClose={() => setEditFor(null)} onDone={() => { setEditFor(null); load(); }} />}
    </div>
  );
}

export function NewReceiptModal({ providers, onClose, onSaved, defaultProviderId }: any) {
  const [form, setForm] = useState({
    provider_id: defaultProviderId ? String(defaultProviderId) : '', instrument: 'NEFT', reference_number: '',
    receipt_date: new Date().toISOString().slice(0, 10), manual_received: '', remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [partialMsg, setPartialMsg] = useState(''); // receipt saved but mapping failed → recoverable
  // Saved receipt, kept so the biller can print it immediately instead of
  // hunting for the row afterwards.
  const [saved, setSaved] = useState<{ id: number; number: string } | null>(null);
  // Non-blocking notices from the post-save deposit consumption step — the
  // receipt and bill mapping are already safely recorded by the time these run.
  const [depositNotes, setDepositNotes] = useState<string[]>([]);

  // ── Patient-bill mapping (merged in from the old separate "Allocate" step) ──
  const [advices, setAdvices] = useState<any[]>([]);
  const [advLoading, setAdvLoading] = useState(false);
  // The biller enters the amount the payer SETTLED per bill. TDS (10%) is
  // withheld out of that amount — it is not added on top — so the bank credit is
  // Received − TDS, and the rest of the bill is the disallowed gap:
  //     Bill = Received + Disallowed,  Received = Bank credit + TDS
  // e.g. bill 69,675 with 50,000 received → TDS 5,000, banked 45,000,
  // disallowed 19,675. For each bill the biller also picks what happens to the
  // disallowed gap — write it off, or recover it from the patient.
  const [received, setReceived] = useState<Record<number, string>>({});
  const [dispo, setDispo] = useState<Record<number, 'WriteOff' | 'ToRecover'>>({});
  // TDS defaults to 10% of Received but the biller can override it per bill —
  // payers don't always withhold exactly 10% (slab varies by section/payer).
  // Empty/undefined means "use the computed default".
  const [tdsOverride, setTdsOverride] = useState<Record<number, string>>({});
  // How much of the patient's held deposit to use against this bill's gap.
  // Defaults to whatever's needed to close the gap (never more), but the
  // biller can reduce it — e.g. the deposit is earmarked for something else.
  // Empty/undefined means "use the computed default".
  const [depositUse, setDepositUse] = useState<Record<number, string>>({});

  // Manually-added bills (via the search box below) — merged with the
  // payer's auto-fetched pending advices so the biller isn't limited to only
  // what getPendingAdvices surfaces (it's deliberately strict — see its
  // comment — so a genuine bill can be missing from that list).
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<any[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  // Explains why a picked bill couldn't select its own payer (no insurer on the
  // bill and no active policy on the patient) instead of failing silently.
  const [addNotice, setAddNotice] = useState<string | null>(null);

  // A bill picked from the patient search BEFORE a payer was selected — the
  // payer gets auto-selected from the bill's tpa_provider_id, which triggers
  // the effect below to (re)fetch that payer's pending advices. That fetch
  // would otherwise silently drop the very bill the biller just picked, so it
  // gets queued here and stitched back in once the fetch resolves.
  const pendingAutoAdd = React.useRef<any>(null);

  // Load this payer's approved bills awaiting receipt whenever the payer changes.
  useEffect(() => {
    if (!form.provider_id) { setAdvices([]); setReceived({}); setDispo({}); setTdsOverride({}); setDepositUse({}); return; }
    setAdvLoading(true); setReceived({}); setDispo({}); setTdsOverride({}); setDepositUse({});
    setAddQuery(''); setAddResults([]);
    getPendingAdvices(Number(form.provider_id))
      .then((r: any) => {
        if (!r?.success) return;
        let data = r.data || [];
        const auto = pendingAutoAdd.current;
        if (auto && String(auto.tpa_provider_id) === form.provider_id && !data.some((d: any) => d.id === auto.id)) {
          data = [...data, auto];
        }
        pendingAutoAdd.current = null;
        setAdvices(data);
      })
      .finally(() => setAdvLoading(false));
  }, [form.provider_id]);

  // Debounced search for bills to add to the mapping table. Works with no
  // payer selected yet — it searches across all payers and picking a result
  // selects its payer automatically (see selectSearchResult below).
  useEffect(() => {
    const q = addQuery.trim();
    setAddNotice(null);
    if (q.length < 2) { setAddResults([]); return; }
    setAddSearching(true);
    const t = setTimeout(() => {
      searchInvoicesForInsuranceReceipt(form.provider_id ? Number(form.provider_id) : undefined, q)
        .then((r: any) => {
          if (!r?.success) return;
          const existingIds = new Set(advices.map((a: any) => a.id));
          setAddResults((r.data || []).filter((inv: any) => !existingIds.has(inv.id)));
        })
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [addQuery, form.provider_id, advices]);

  const addBill = (invoice: any) => {
    setAdvices((prev) => (prev.some((a) => a.id === invoice.id) ? prev : [...prev, invoice]));
    setAddQuery(''); setAddResults([]); setAddNotice(null);
  };

  // Called when the biller picks a search result. If a payer is already
  // chosen, this is a plain add. If not, the bill's own payer becomes the
  // receipt's payer — the whole point of searching by patient first.
  const selectSearchResult = (invoice: any) => {
    if (form.provider_id) { addBill(invoice); return; }
    // No payer on the bill and none on the patient's policies either — there's
    // nothing to auto-select, so ask rather than set provider_id to "null".
    if (invoice.tpa_provider_id == null) {
      setAddNotice('This bill has no insurer recorded and the patient has no active policy to take one from — choose the Insurance / TPA above, then pick the bill again.');
      return;
    }
    pendingAutoAdd.current = invoice;
    setAddQuery(''); setAddResults([]); setAddNotice(null);
    setForm((f) => ({ ...f, provider_id: String(invoice.tpa_provider_id) }));
  };

  const num = (v: string) => Number(v) || 0;
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const TDS_RATE = 0.10;

  // Bill = the GROSS hospital bill (net_amount).
  const rowCalc = (a: any) => {
    const bill = Number(a.net_amount || 0);
    const rcv = num(received[a.id]);           // gross settled by the payer
    const tdsRaw = tdsOverride[a.id];
    const tdsIsOverridden = tdsRaw !== undefined && tdsRaw !== '';
    const tds = tdsIsOverridden ? round2(num(tdsRaw)) : round2(rcv * TDS_RATE); // withheld out of `rcv`
    const cash = round2(rcv - tds);            // what actually hits the bank
    // Disallowed is the TPA-side gap (Bill − Received). This is what's
    // recorded against the claim (allocateReceipt's settled+disallowed+tds
    // must sum to Bill) — kept as the raw figure regardless of what the
    // patient has separately covered, so the claim can still reach a clean
    // "settled" status. What the patient already covered is netted out only
    // for what's SHOWN and for how much of it still needs a write-off vs
    // recover decision.
    const disallowed = round2(Math.max(0, bill - rcv));
    const patientPaid = round2(Math.max(0, Number(a.patient_paid || 0)));
    const depositAvailable = round2(Math.max(0, Number(a.deposit_available || 0)));
    // Never defaults to more deposit than is actually needed to close what's
    // left of the gap after the patient's direct payment is accounted for.
    const depositNeeded = round2(Math.max(0, disallowed - patientPaid));
    const depositDefault = round2(Math.min(depositAvailable, depositNeeded));
    const depositRaw = depositUse[a.id];
    const depositChosen = depositRaw !== undefined && depositRaw !== '' ? num(depositRaw) : depositDefault;
    const depositUsed = round2(Math.max(0, Math.min(depositChosen, depositDefault)));
    const disallowedNet = round2(Math.max(0, disallowed - patientPaid - depositUsed));
    // Money the patient already put in (deposit + direct payment) is
    // recovered, not written off — default the disposition accordingly, but
    // still let the biller override it for whatever's genuinely left.
    const disposition: 'WriteOff' | 'ToRecover' = dispo[a.id] || ((patientPaid > 0 || depositUsed > 0) ? 'ToRecover' : 'WriteOff');
    const invalid = (rcv > 0 && rcv - bill > 0.01) // can't settle more than the bill
      || (rcv > 0 && (tds < 0 || tds - rcv > 0.01)); // TDS can't exceed what was received
    return { bill, rcv, tds, cash, disallowed, disallowedNet, patientPaid, depositAvailable, depositDefault, depositUsed, disposition, invalid, tdsIsOverridden };
  };

  const rows = advices.map((a: any) => ({ a, ...rowCalc(a) }));
  const active = rows.filter((r) => r.rcv > 0);
  const totalBill = round2(active.reduce((s, r) => s + r.bill, 0));
  const totalReceived = round2(active.reduce((s, r) => s + r.rcv, 0));
  const totalTds = round2(active.reduce((s, r) => s + r.tds, 0));
  const totalCash = round2(active.reduce((s, r) => s + r.cash, 0));
  const totalDisallowed = round2(active.reduce((s, r) => s + r.disallowed, 0));
  const totalRecover = round2(active.reduce((s, r) => s + (r.disposition === 'ToRecover' ? r.disallowed : 0), 0));
  const totalWriteOff = round2(totalDisallowed - totalRecover);
  const totalPatientPaid = round2(active.reduce((s, r) => s + r.patientPaid, 0));
  const totalDepositUsed = round2(active.reduce((s, r) => s + r.depositUsed, 0));
  const totalNetDisallowed = round2(active.reduce((s, r) => s + r.disallowedNet, 0));
  const anyInvalid = rows.some((r) => r.invalid);

  const manualReceived = num(form.manual_received); // fallback when the payer has no mapped bills yet
  const hasAdvices = advices.length > 0;
  // The receipt's own amount is the BANK CREDIT — TDS never reaches the bank, so
  // it is excluded here. The allocation engine also caps allocated cash at this
  // total, so sending the gross would over-state the receipt.
  const receiptTotal = hasAdvices ? totalCash : manualReceived;
  const canSave = !!form.provider_id && !!form.reference_number.trim() && !anyInvalid && receiptTotal > 0;
  const blockReason =
    !form.provider_id ? 'Select the payer to continue'
      : !form.reference_number.trim() ? 'Enter the reference / UTR number'
        : anyInvalid ? 'Fix the highlighted received amount'
          : receiptTotal <= 0 ? (hasAdvices ? 'Enter the amount received against at least one bill' : 'Enter the amount received')
            : '';

  const save = async () => {
    setError(''); setPartialMsg(''); setSaving(true);
    // allocated_amount is the CASH applied to the bill (a payments row is written
    // for it), with TDS reported separately. cash + tds + disallowed = bill.
    const payload = active.map((r) => ({
      invoice_id: r.a.id,
      allocated_amount: r.cash,
      disallowed_amount: r.disallowed,
      tds_amount: r.tds,
      disposition: r.disposition,
    }));

    const res: any = await recordAndAllocateReceipt({
      payer_type: 'tpa_insurance', provider_id: Number(form.provider_id),
      instrument: form.instrument, reference_number: form.reference_number,
      receipt_date: form.receipt_date,
      total_amount: receiptTotal,
      // Claim = full bill; Sanctioned = what the payer approved = bill − disallowed.
      // Sending both as totalBill made claim−sanctioned = 0, so the Recent Receipts
      // "Disallowed" column always read "—". (Invariant holds: totalBill − totalDisallowed
      // = totalReceived, and sanctioned − tds = totalCash = receiptTotal.)
      claim_amount: totalBill, sanctioned_amount: round2(totalBill - totalDisallowed), tds_amount: totalTds, service_charge: 0,
      remarks: form.remarks,
      settle_gross: true,
      lines: payload,
    });
    setSaving(false);
    if (!res?.success) { setError(res?.error || 'Failed to create receipt'); return; }
    if (res.data?.id) setSaved({ id: res.data.id, number: res.receipt_number || res.data.receipt_number });
    if (res.allocationError) {
      // Money is safely recorded; only the mapping failed. Keep the modal open with
      // a clear amber notice instead of silently closing.
      setPartialMsg(`Receipt ${res.receipt_number} saved, but mapping to bills failed: ${res.allocationError}. The money is recorded (unallocated) — map it via the RECEIPT button.`);
      return;
    }

    // Bills are now settled with the TPA. For any bill where the biller chose
    // to close the remaining gap from a held deposit, consume it now — the
    // receipt itself is unaffected either way, so a deposit hiccup here is
    // reported but never blocks the save.
    const withDeposit = active.filter((r) => r.depositUsed > 0.01);
    if (withDeposit.length) {
      const notes: string[] = [];
      for (const r of withDeposit) {
        const dep: any = await applyAvailableDepositToInvoice(r.a.patient_id, r.a.id, r.depositUsed);
        if (!dep?.success) {
          notes.push(`${r.a.invoice_number}: deposit not applied — ${dep?.error || 'unknown error'}.`);
        } else if (round2(Number(dep.applied || 0)) + 0.01 < r.depositUsed) {
          notes.push(`${r.a.invoice_number}: only ${fmt(dep.applied)} of ${fmt(r.depositUsed)} deposit could be applied (balance changed).`);
        }
      }
      if (notes.length) setDepositNotes(notes);
    }
    // Fully saved: hold the modal open on a short confirmation so the receipt can
    // be printed straight away. If we somehow have no id to print, just close.
    if (!res.data?.id) onSaved();
  };

  // Fully-saved confirmation: print now, or close.
  if (saved && !partialMsg) {
    return (
      <Modal title="Receipt Recorded" onClose={onSaved}>
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-bold text-emerald-800">Receipt {saved.number} saved.</p>
            <p className="mt-0.5 text-xs text-emerald-700">
              {fmt(receiptTotal)} credited{hasAdvices ? ` · ${active.length} bill(s) settled` : ' · unallocated'}
              {totalTds > 0 ? ` · TDS ${fmt(totalTds)} withheld by the payer` : ''}
              {totalDepositUsed > 0 ? ` · ${fmt(totalDepositUsed)} settled from deposit` : ''}
            </p>
          </div>
          {depositNotes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-amber-800">Deposit application needs a look:</p>
              {depositNotes.map((n, i) => <p key={i} className="text-xs text-amber-700">{n}</p>)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onSaved} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold">Done</button>
            <a href={`/api/insurance/receipt/${saved.id}/print`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Printer className="h-4 w-4" /> Print Receipt
            </a>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Record Insurance Receipt" onClose={onClose} wide>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {partialMsg && <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{partialMsg}</div>}
      <div className="space-y-3">
        <Field label="Insurance / TPA *">
          <select value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })}
            className={`${INPUT} ${defaultProviderId ? 'bg-gray-50 font-bold text-gray-700' : ''}`} disabled={!!defaultProviderId}>
            <option value="">Select payer…</option>
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Instrument">
            <select value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} className={INPUT}>
              {['NEFT', 'RTGS', 'Cheque', 'UPI', 'Other'].map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Reference / UTR *"><input className={INPUT} placeholder="UTR / cheque no." value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} /></Field>
          <Field label="Receipt Date"><input type="date" className={INPUT} value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} /></Field>
        </div>

        {/* Map to patient bills — enter Received; TDS (10%) and Disallowed are derived */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">Map to Patient Bills</p>
            <p className="text-[10px] text-gray-500">Bill = Received + Disallowed &nbsp;·&nbsp; TDS (10%) is deducted <em>from</em> Received &nbsp;·&nbsp; Disallowed is net of Patient Paid &amp; Deposit</p>
          </div>
          {/* Search a patient/bill first — works with no payer chosen yet.
              Picking a result selects its payer for you, so the biller
              doesn't have to already know which TPA/insurer it is. Once a
              payer is set this also covers the old "add a missed bill" case,
              since getPendingAdvices only surfaces approved/partially_settled
              claims with a payable balance. */}
          <div className="relative">
            <input
              placeholder={form.provider_id ? 'Search patient name, UHID or bill # to add…' : 'Search patient name, UHID or bill # — its payer will be selected for you…'}
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              className={INPUT}
            />
            {addSearching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
            {addResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-auto">
                {addResults.map((inv: any) => (
                  <button key={inv.id} type="button" onClick={() => selectSearchResult(inv)}
                    className="flex w-full items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-blue-50">
                    <span className="font-mono">{inv.invoice_number}</span>
                    <span className="flex-1 truncate px-2">{inv.patient?.full_name || inv.patient_id}</span>
                    {!form.provider_id && (
                      <span className="truncate max-w-[160px] text-[10px] font-bold text-blue-600">
                        {providers.find((p: any) => String(p.id) === String(inv.tpa_provider_id))?.provider_name
                          || (inv.tpa_provider_id == null ? 'No payer on bill' : '—')}
                        {/* The insurer came from the patient's policy, not the bill
                            — worth saying so before it gets picked as the payer. */}
                        {inv.payer_from_policy && <span className="font-normal text-gray-400"> · from policy</span>}
                      </span>
                    )}
                    <span className="font-semibold">₹{fmt(inv.net_amount)}</span>
                  </button>
                ))}
              </div>
            )}
            {addQuery.trim().length >= 2 && !addSearching && addResults.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-400">No matching bill found.</p>
            )}
            {addNotice && <p className="mt-1 text-[11px] font-semibold text-amber-600">{addNotice}</p>}
          </div>

          {!form.provider_id ? (
            <p className="text-xs text-gray-400">Select a payer above, or search a patient/bill — picking one selects its payer automatically.</p>
          ) : (
            <>
              {advLoading ? (
                <div className="py-3"><Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-400" /></div>
              ) : !hasAdvices ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600">No approved bills for this payer yet — search above to add one, or record the money as unallocated and map it later via the RECEIPT button.</p>
                  <Field label="Amount Received *"><input type="number" className={INPUT} value={form.manual_received} onChange={(e) => setForm({ ...form, manual_received: e.target.value })} /></Field>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white max-h-[30vh]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-bold text-[11px]">Bill #</th>
                          <th className="px-2 py-1.5 text-left font-bold text-[11px]">Patient</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">Bill Amount</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">Received</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">TDS</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">In Bank</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">Patient Paid</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">Deposit</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[11px]">Disallowed</th>
                          <th className="px-2 py-1.5 text-left font-bold text-[11px]">Disallowed gap →</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map(({ a, bill, rcv, tds, cash, disallowed, disallowedNet, patientPaid, depositAvailable, depositUsed, disposition, invalid, tdsIsOverridden }) => (
                          <tr key={a.id} className={invalid ? 'bg-red-50' : ''}>
                            <td className="px-2 py-1 font-mono text-[11px] whitespace-nowrap">{a.invoice_number}</td>
                            <td className="px-2 py-1 text-xs whitespace-nowrap">{a.patient?.full_name || a.patient_id}</td>
                            <td className="px-2 py-1 text-right text-xs font-semibold">{fmt(bill)}</td>
                            <td className="px-2 py-1">
                              <input type="number" className={`w-24 rounded border px-1.5 py-0.5 text-right text-xs ${invalid ? 'border-red-400' : 'border-gray-300'}`}
                                value={received[a.id] || ''} onChange={(e) => setReceived((p) => ({ ...p, [a.id]: e.target.value }))} />
                            </td>
                            <td className="px-2 py-1">
                              <input type="number" disabled={rcv <= 0}
                                title={tdsIsOverridden ? 'Overridden — clear to go back to the 10% default' : 'Defaults to 10% of Received — edit to override'}
                                className={`w-20 rounded border px-1.5 py-0.5 text-right text-xs disabled:bg-gray-50 disabled:text-gray-300 ${invalid ? 'border-red-400' : tdsIsOverridden ? 'border-blue-400 bg-blue-50/60' : 'border-gray-300'}`}
                                placeholder={rcv > 0 ? fmt(round2(rcv * TDS_RATE)) : '0.00'}
                                value={tdsOverride[a.id] ?? ''}
                                onChange={(e) => setTdsOverride((p) => ({ ...p, [a.id]: e.target.value }))} />
                            </td>
                            <td className="px-2 py-1 text-right text-xs font-semibold text-gray-700">{rcv > 0 ? fmt(cash) : '—'}</td>
                            <td className="px-2 py-1 text-right text-xs text-gray-500" title="Already paid directly on this bill (cash/card/deposit already applied)">
                              {patientPaid > 0 ? fmt(patientPaid) : '—'}
                            </td>
                            <td className="px-2 py-1">
                              {depositAvailable > 0 ? (
                                <input type="number" title={`₹${fmt(depositAvailable)} held — pre-filled to close the gap, edit to use less`}
                                  className="w-20 rounded border border-blue-300 bg-blue-50/60 px-1.5 py-0.5 text-right text-xs"
                                  placeholder={fmt(depositUsed)}
                                  value={depositUse[a.id] ?? ''}
                                  onChange={(e) => setDepositUse((p) => ({ ...p, [a.id]: e.target.value }))} />
                              ) : <span className="text-gray-300 text-[11px]">—</span>}
                            </td>
                            <td className="px-2 py-1 text-right text-xs text-rose-600"
                              title={rcv > 0 && (patientPaid > 0 || depositUsed > 0) ? `Raw gap ${fmt(disallowed)} − Patient Paid ${fmt(patientPaid)} − Deposit ${fmt(depositUsed)}` : undefined}>
                              {rcv > 0 ? fmt(disallowedNet) : '—'}
                            </td>
                            <td className="px-2 py-1">
                              {rcv > 0 && disallowed > 0 ? (
                                <select className="rounded border border-gray-300 px-1 py-0.5 text-[11px]"
                                  value={disposition} onChange={(e) => setDispo((p) => ({ ...p, [a.id]: e.target.value as 'WriteOff' | 'ToRecover' }))}>
                                  <option value="WriteOff">Write off</option>
                                  <option value="ToRecover">Recover from patient</option>
                                </select>
                              ) : <span className="text-gray-300 text-[11px]">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {anyInvalid && <p className="text-[11px] text-red-600">Received cannot exceed the bill amount — reduce the received value.</p>}
                  {totalReceived > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
                      <span>Bill <strong>{fmt(totalBill)}</strong></span>
                      <span>Received <strong className="text-gray-900">{fmt(totalReceived)}</strong></span>
                      <span>TDS <strong>{fmt(totalTds)}</strong></span>
                      <span>In bank <strong className="text-gray-900">{fmt(totalCash)}</strong></span>
                      {totalPatientPaid > 0 && <span>Patient paid <strong>{fmt(totalPatientPaid)}</strong></span>}
                      {totalDepositUsed > 0 && <span>Deposit used <strong className="text-blue-700">{fmt(totalDepositUsed)}</strong></span>}
                      <span>Disallowed <strong className="text-rose-600">{fmt(totalNetDisallowed)}</strong></span>
                      {totalWriteOff > 0 && <span>· written off <strong>{fmt(totalWriteOff)}</strong></span>}
                      {totalRecover > 0 && <span>· from patient <strong className="text-amber-700">{fmt(totalRecover)}</strong></span>}
                      <span className="text-green-600 font-bold">· bill settled</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <Field label="Remarks"><input className={INPUT} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {/* Say WHY Save is greyed out instead of leaving the biller guessing. */}
        {!partialMsg && !canSave && <span className="mr-auto text-[11px] font-bold text-amber-600">{blockReason}</span>}
        {partialMsg && saved && (
          <a href={`/api/insurance/receipt/${saved.id}/print`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">
            <Printer className="h-4 w-4" /> Print Receipt
          </a>
        )}
        <button onClick={partialMsg ? onSaved : onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold">{partialMsg ? 'Close' : 'Cancel'}</button>
        {!partialMsg && (
          <button onClick={save} disabled={saving || !canSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Receipt'}
          </button>
        )}
      </div>
    </Modal>
  );
}

// Audit trail for a receipt. A correction spans more than one row — reverse, then
// re-record the same UTR — so this shows every receipt ever booked under this
// reference alongside one timeline of who did what, when, and why.
const ACTION_LABEL: Record<string, string> = {
  insurance_receipt_created: 'Receipt recorded',
  insurance_receipt_allocated: 'Mapped to patient bills',
  insurance_receipt_reversed: 'Reversed',
};
const ACTION_TONE: Record<string, string> = {
  insurance_receipt_created: 'bg-blue-100 text-blue-700',
  insurance_receipt_allocated: 'bg-emerald-100 text-emerald-700',
  insurance_receipt_reversed: 'bg-rose-100 text-rose-700',
};

// Edit a recorded receipt. What is editable depends on whether the money has
// already been mapped onto bills: an unmapped receipt is just a note of a bank
// credit and can be corrected wholesale, but once it is allocated the amount,
// TDS and payer are baked into invoice balances, payment rows and posted GL, so
// those are read-only here and Reverse is the correct tool. The server enforces
// the same rule — this only mirrors it so the reason is visible before saving.
function EditReceiptModal({ receipt, providers, onClose, onDone }: {
  receipt: Record<string, any>;
  providers: { id: number; provider_name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const allocated = Number(receipt.allocated_amount || 0) > 0 || receipt.status === 'Allocated' || receipt.status === 'PartiallyAllocated';
  const [form, setForm] = useState({
    instrument: receipt.instrument || 'NEFT',
    reference_number: receipt.reference_number || '',
    receipt_date: receipt.receipt_date ? new Date(receipt.receipt_date).toISOString().slice(0, 10) : '',
    remarks: receipt.remarks || '',
    claim_amount: String(Number(receipt.claim_amount || 0) || ''),
    sanctioned_amount: String(Number(receipt.sanctioned_amount || 0) || ''),
    service_charge: String(Number(receipt.service_charge || 0) || ''),
    total_amount: String(Number(receipt.total_amount || 0) || ''),
    tds_amount: String(Number(receipt.tds_total || 0) || ''),
    provider_id: receipt.provider_id ? String(receipt.provider_id) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await updateInsuranceReceipt({
        receipt_id: receipt.id,
        instrument: form.instrument,
        reference_number: form.reference_number,
        receipt_date: form.receipt_date,
        remarks: form.remarks,
        claim_amount: form.claim_amount === '' ? 0 : Number(form.claim_amount),
        sanctioned_amount: form.sanctioned_amount === '' ? 0 : Number(form.sanctioned_amount),
        service_charge: form.service_charge === '' ? 0 : Number(form.service_charge),
        // Only sent when they can actually be applied, so an untouched allocated
        // receipt never trips the server's "already mapped" refusal.
        ...(allocated ? {} : {
          total_amount: form.total_amount === '' ? undefined : Number(form.total_amount),
          tds_amount: form.tds_amount === '' ? 0 : Number(form.tds_amount),
          ...(receipt.payer_type === 'tpa_insurance' && form.provider_id ? { provider_id: Number(form.provider_id) } : {}),
        }),
      });
      if (res.success) onDone();
      else setError(('error' in res && res.error) || 'Could not save the changes');
    } catch (e) {
      setError((e as Error)?.message || 'Could not save the changes');
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const label = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500";

  return (
    <Modal title={`Edit receipt ${receipt.receipt_number}`} onClose={onClose} wide>
      {allocated && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs font-semibold text-amber-800">
            This receipt is already mapped to bills. Reference, date, instrument, remarks and the
            settlement-advice breakdown can be corrected here. To change the received amount, TDS or
            payer, use <strong>Reverse</strong> first &mdash; that unwinds the bills, payment entries
            and ledger together.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Reference / UTR</label>
          <input className={field} value={form.reference_number}
            onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
        </div>
        <div>
          <label className={label}>Instrument</label>
          <select className={field} value={form.instrument}
            onChange={(e) => setForm({ ...form, instrument: e.target.value })}>
            {['NEFT', 'RTGS', 'Cheque', 'UPI', 'Other'].map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Receipt date</label>
          <input type="date" className={field} value={form.receipt_date}
            onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} />
        </div>
        {receipt.payer_type === 'tpa_insurance' && (
          <div>
            <label className={label}>Payer{allocated && ' (locked)'}</label>
            <select className={field} value={form.provider_id} disabled={allocated}
              onChange={(e) => setForm({ ...form, provider_id: e.target.value })}>
              <option value="">Select payer…</option>
              {(providers || []).map((p) => (
                <option key={p.id} value={p.id}>{p.provider_name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={label}>Claim amount</label>
          <input type="number" step="0.01" className={field} value={form.claim_amount}
            onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} />
        </div>
        <div>
          <label className={label}>Sanctioned amount</label>
          <input type="number" step="0.01" className={field} value={form.sanctioned_amount}
            onChange={(e) => setForm({ ...form, sanctioned_amount: e.target.value })} />
        </div>
        <div>
          <label className={label}>Service charge</label>
          <input type="number" step="0.01" className={field} value={form.service_charge}
            onChange={(e) => setForm({ ...form, service_charge: e.target.value })} />
        </div>
        <div>
          <label className={label}>TDS{allocated && ' (locked)'}</label>
          <input type="number" step="0.01" className={field} value={form.tds_amount} disabled={allocated}
            onChange={(e) => setForm({ ...form, tds_amount: e.target.value })} />
        </div>
        <div>
          <label className={label}>Received amount{allocated && ' (locked)'}</label>
          <input type="number" step="0.01" className={field} value={form.total_amount} disabled={allocated}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Remarks</label>
          <input className={field} value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Every change is recorded field-by-field in this receipt&rsquo;s History.
      </p>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold">Cancel</button>
        <button onClick={save} disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

function ReceiptHistoryModal({ receipt, onClose }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getInsuranceReceiptHistory(receipt.id)
      .then((r: any) => { if (r?.success) setData(r.data); })
      .finally(() => setLoading(false));
  }, [receipt.id]);

  const when = (d: any) => d ? new Date(d).toLocaleString('en-GB') : '—';

  return (
    <Modal title={`History — reference ${receipt.reference_number}`} onClose={onClose} wide>
      {loading ? <Spinner /> : !data ? <Empty msg="No history" /> : (
        <div className="space-y-5">
          {data.chain.length > 1 && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              This reference has been recorded <strong>{data.chain.length} times</strong> — a reversal releases the
              reference so the corrected receipt can reuse the real UTR. All of them are listed below.
            </p>
          )}

          <div>
            <h4 className="mb-2 text-[11px] font-black uppercase tracking-wider text-gray-500">Receipts under this reference</h4>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-[11px]">Receipt #</th>
                    <th className="px-3 py-2 text-left font-bold text-[11px]">Date</th>
                    <th className="px-3 py-2 text-left font-bold text-[11px]">Payer</th>
                    <th className="px-3 py-2 text-right font-bold text-[11px]">Amount</th>
                    <th className="px-3 py-2 text-right font-bold text-[11px]">Mapped</th>
                    <th className="px-3 py-2 text-left font-bold text-[11px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.chain.map((c: any) => (
                    <tr key={c.id} className={c.id === receipt.id ? 'bg-blue-50/50' : ''}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {c.receipt_number}{c.id === receipt.id && <span className="ml-1 text-[10px] font-bold text-blue-600">(this one)</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{c.receipt_date ? new Date(c.receipt_date).toLocaleDateString('en-GB') : '—'}</td>
                      <td className="px-3 py-2 text-xs">{c.provider?.provider_name || c.corporate?.company_name || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmt(c.total_amount)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{fmt(c.allocated_amount)}</td>
                      <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-[11px] font-black uppercase tracking-wider text-gray-500">Timeline</h4>
            {data.events.length === 0 ? <Empty msg="No recorded actions" /> : (
              <ol className="space-y-2">
                {data.events.map((e: any) => (
                  <li key={e.id} className="rounded-xl border border-gray-200 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTION_TONE[e.action] || 'bg-gray-100 text-gray-600'}`}>
                        {ACTION_LABEL[e.action] || e.action.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-gray-500">{e.receipt_number}</span>
                      <span className="ml-auto text-[11px] text-gray-400">{when(e.at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      by <strong className="text-gray-800">{e.by}</strong>{e.role ? ` (${e.role})` : ''}
                    </p>
                    {e.reason && (
                      <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">
                        <span className="font-bold">Reason:</span> {e.reason}
                      </p>
                    )}
                    {e.action === 'insurance_receipt_reversed' && e.details?.cash_undone != null && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        Pulled back {fmt(e.details.cash_undone)} across {e.details.allocations_undone} bill(s)
                        {Number(e.details.tds_undone) ? `, TDS ${fmt(e.details.tds_undone)}` : ''}
                      </p>
                    )}
                    {e.action === 'insurance_receipt_allocated' && e.details && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        {fmt(e.details.cash)} mapped across {e.details.lines} bill(s)
                        {Number(e.details.tds) ? `, TDS ${fmt(e.details.tds)}` : ''}
                      </p>
                    )}
                    {e.action === 'insurance_receipt_created' && e.details && (
                      <p className="mt-1 text-[11px] text-gray-500">Amount {fmt(e.details.total)}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold">Close</button>
      </div>
    </Modal>
  );
}

// Undo a receipt: unwinds the bill's settlement, voids the payment rows and
// posts reversing GL entries. Destructive, so it demands a typed reason (the
// server action rejects a blank one) and spells out what will be undone.
function ReverseReceiptModal({ receipt, onClose, onDone }: any) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const run = async () => {
    setError(''); setBusy(true);
    const res: any = await reverseInsuranceReceipt(receipt.id, reason.trim());
    setBusy(false);
    if (!res?.success) { setError(res?.error || 'Reversal failed'); return; }
    if (res.glWarnings?.length) { setWarnings(res.glWarnings); return; }
    onDone();
  };

  if (warnings.length) {
    return (
      <Modal title="Receipt Reversed — with warnings" onClose={onDone}>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">The receipt was reversed, but some ledger entries could not be unwound:</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          <p className="text-xs text-gray-500">Pass this to accounts — the bill and payment are already reversed.</p>
          <div className="flex justify-end"><button onClick={onDone} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Close</button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Reverse receipt ${receipt.receipt_number}`} onClose={onClose}>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
          <p className="font-bold">This will undo the settlement.</p>
          <p className="mt-1">
            The bill(s) go back to <strong>approved / awaiting receipt</strong>, the payment entries are voided,
            any write-off is cancelled, and reversing entries are posted to the ledger.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <div><span className="text-gray-400">Payer:</span> <strong>{receipt.provider?.provider_name || receipt.corporate?.company_name || '—'}</strong></div>
          <div><span className="text-gray-400">Amount credited:</span> <strong>{fmt(receipt.total_amount)}</strong></div>
          <div><span className="text-gray-400">Reference:</span> <span className="font-mono">{receipt.reference_number}</span></div>
          {receipt.patients?.length ? <div><span className="text-gray-400">Patient(s):</span> {receipt.patients.join(', ')}</div> : null}
        </div>
        <Field label="Reason *">
          <input className={INPUT} autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. wrong amount entered, payment bounced" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold">Cancel</button>
        <button onClick={run} disabled={busy || !reason.trim()}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reverse Receipt'}
        </button>
      </div>
    </Modal>
  );
}

function AllocateModal({ payer, onClose, onSaved }: any) {
  const [advices, setAdvices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptId, setReceiptId] = useState('');
  const [lines, setLines] = useState<Record<number, { allocated: string; disallowed: string; tds: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getPendingAdvices(payer.provider_id),
      // Any receipt with money still unmapped is allocatable — not just status
      // 'Open'. A PartiallyAllocated receipt still has a balance to map.
      listInsuranceReceipts({ payer_type: 'tpa_insurance', provider_id: payer.provider_id }),
    ]).then(([a, r]: any[]) => {
      if (a?.success) setAdvices(a.data);
      if (r?.success) {
        // Money still to map AND actually allocatable — a reversed receipt keeps
        // its unmapped balance on paper but can never be allocated again.
        r = { ...r, data: (r.data || []).filter((x: any) => Number(x.unmapped_amount || 0) > 0 && x.status !== 'Reversed') };
        setReceipts(r.data);
        // Opened from a specific receipt row → pre-select that receipt; otherwise
        // fall back to the most recent open one.
        const preset = payer.receipt_id && r.data?.some((x: any) => x.id === payer.receipt_id) ? payer.receipt_id : r.data?.[0]?.id;
        if (preset) setReceiptId(String(preset));
      }
    }).finally(() => setLoading(false));
  }, [payer.provider_id, payer.receipt_id]);

  const setLine = (id: number, field: 'allocated' | 'disallowed' | 'tds', val: string) =>
    setLines((p) => {
      const line = p[id] ?? { allocated: '', disallowed: '', tds: '' };
      return { ...p, [id]: { ...line, [field]: val } };
    });

  const save = async () => {
    setError('');
    if (!receiptId) { setError('Select a receipt to allocate from'); return; }
    const payload = Object.entries(lines)
      .map(([invId, v]) => ({
        invoice_id: Number(invId),
        allocated_amount: Number(v.allocated || 0),
        disallowed_amount: Number(v.disallowed || 0),
        tds_amount: Number(v.tds || 0),
        is_partial: true,
      }))
      .filter((l) => l.allocated_amount + l.disallowed_amount + l.tds_amount > 0);
    if (payload.length === 0) { setError('Enter at least one allocation amount'); return; }
    setSaving(true);
    const res: any = await allocateReceipt({ receipt_id: Number(receiptId), lines: payload });
    setSaving(false);
    if (res?.success) onSaved(); else setError(res?.error || 'Allocation failed');
  };

  return (
    <Modal title={`Allocate Receipt — ${payer.provider_name}`} wide onClose={onClose}>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading ? <Spinner /> : (
        <>
          <Field label="Receipt (unallocated)">
            <select value={receiptId} onChange={(e) => setReceiptId(e.target.value)} className={INPUT}>
              <option value="">Select receipt…</option>
              {receipts.map((r: any) => <option key={r.id} value={r.id}>{r.receipt_number} · ₹{fmt(r.unmapped_amount)} unmapped</option>)}
            </select>
          </Field>
          {receipts.length === 0 && <p className="text-sm text-amber-600 mt-1">No open receipts. Create one first via “New Receipt”.</p>}

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 max-h-[40vh]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-gray-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Bill #</th>
                  <th className="px-3 py-2 text-left font-bold">Patient</th>
                  <th className="px-3 py-2 text-right font-bold">Approved</th>
                  <th className="px-3 py-2 text-right font-bold">Due</th>
                  <th className="px-3 py-2 text-right font-bold">Received</th>
                  <th className="px-3 py-2 text-right font-bold">Disallowed</th>
                  <th className="px-3 py-2 text-right font-bold">TDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {advices.map((a: any) => (
                  <tr key={a.id}>
                    <td className="px-3 py-1.5 font-mono text-xs">{a.invoice_number}</td>
                    <td className="px-3 py-1.5">{a.patient?.full_name || a.patient_id}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(a.tpa_approved_amount)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(a.tpa_payable)}</td>
                    <td className="px-3 py-1.5"><input className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs" value={lines[a.id]?.allocated || ''} onChange={(e) => setLine(a.id, 'allocated', e.target.value)} /></td>
                    <td className="px-3 py-1.5"><input className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs" value={lines[a.id]?.disallowed || ''} onChange={(e) => setLine(a.id, 'disallowed', e.target.value)} /></td>
                    <td className="px-3 py-1.5"><input className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs" value={lines[a.id]?.tds || ''} onChange={(e) => setLine(a.id, 'tds', e.target.value)} /></td>
                  </tr>
                ))}
                {advices.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No approved bills awaiting receipt</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Allocate & Post'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BILL-WISE SANCTION
// ─────────────────────────────────────────────────────────────────────────────
export function BillWiseSanction({ providers }: { providers: any[] }) {
  const hospital = useHospital();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // "Whose receipt has come in and whose is still due" — the claim status column
  // answers a different question (where the claim is in its lifecycle), so this
  // tracks the money itself.
  const [receiptFilter, setReceiptFilter] = useState<'' | 'pending' | 'partial' | 'received'>('');

  // Typing in the search box used to fire a query per keystroke; debounce it so
  // a bill number can be typed out without hammering the server.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    getBillWiseSanction({
      provider_id: providerId ? Number(providerId) : undefined,
      search: debouncedSearch || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then((r: any) => { if (r?.success) setData(r.data); }).finally(() => setLoading(false));
  }, [providerId, debouncedSearch, status, from, to]);
  useEffect(() => { load(); }, [load]);

  const payerLabel = providerId ? (providers.find((p: any) => String(p.id) === providerId)?.provider_name || 'Payer') : 'All payers';
  const periodLabel = from || to ? `${from || '…'} to ${to || '…'}` : 'All dates';

  const allRows: any[] = data?.rows || [];
  const counts = {
    pending: allRows.filter((r) => receiptState(r) === 'pending').length,
    partial: allRows.filter((r) => receiptState(r) === 'partial').length,
    received: allRows.filter((r) => receiptState(r) === 'received').length,
  };
  const rows = receiptFilter ? allRows.filter((r) => receiptState(r) === receiptFilter) : allRows;
  // Totals follow what's on screen, so a filtered view adds up to what it shows.
  const totals = rows.reduce((t: any, r: any) => ({
    claim_amount: t.claim_amount + Number(r.claim_amount || 0),
    sanctioned: t.sanctioned + Number(r.sanctioned || 0),
    received: t.received + Number(r.received || 0),
    tds: t.tds + Number(r.tds || 0),
    short_pay: t.short_pay + Number(r.short_pay || 0),
    outstanding: t.outstanding + Number(r.outstanding || 0),
  }), { claim_amount: 0, sanctioned: 0, received: 0, tds: 0, short_pay: 0, outstanding: 0 });

  const COLS: ExportCol[] = [
    { header: 'Bill #', val: (r) => r.invoice_number || '', width: 22, nowrap: true },
    { header: 'Patient', val: (r) => r.patient_name || '', width: 26 },
    { header: 'Payer', val: (r) => r.provider_name || 'Unmapped', width: 34 },
    { header: 'Receipt', val: (r) => RECEIPT_LABEL[receiptState(r)], width: 15, nowrap: true },
    { header: 'Claim Amt', val: (r) => Number(r.claim_amount || 0), num: true, width: 15 },
    { header: 'Sanctioned', val: (r) => Number(r.sanctioned || 0), num: true, width: 15 },
    { header: 'Received', val: (r) => Number(r.received || 0), num: true, width: 15 },
    { header: 'TDS', val: (r) => Number(r.tds || 0), num: true, width: 13 },
    { header: 'Short-Pay', val: (r) => Number(r.short_pay || 0), num: true, width: 14 },
    { header: 'Outstanding', val: (r) => Number(r.outstanding || 0), num: true, width: 15 },
    { header: 'Claim Status', val: (r) => String(r.status || '').replace(/_/g, ' '), width: 17, nowrap: true },
  ];
  const ALIGN = COLS.map((c) => (c.num ? 'right' : 'left')) as ('left' | 'right')[];
  const metaLines = [
    `Payer: ${payerLabel}`,
    `Period: ${periodLabel}`,
    receiptFilter ? `Receipt state: ${RECEIPT_LABEL[receiptFilter]} only` : 'Receipt state: all',
    `${rows.length} bill(s) — pending ${counts.pending}, part received ${counts.partial}, received ${counts.received}`,
  ];
  // Print gets display-formatted text; Excel gets the raw numbers above.
  const printRows = () => rows.map((r: any) => COLS.map((c) => (c.num ? fmt(c.val(r) as number) : c.val(r))));
  const totalsRow = () => data ? [
    'TOTAL', '', '', '',
    totals.claim_amount, totals.sanctioned, totals.received,
    totals.tds, totals.short_pay, totals.outstanding, '',
  ] : undefined;
  const printTotals = () => { const t = totalsRow(); return t && t.map((v, i) => (COLS[i]?.num ? fmt(v as number) : v)); };

  const handlePrint = () => printTable({
    title: 'Bill-Wise Sanction Report',
    subtitle: payerLabel,
    meta: metaLines.slice(1),
    headers: COLS.map((c) => c.header), align: ALIGN,
    nowrap: COLS.map((c) => !!c.nowrap),
    rows: printRows(), footer: printTotals(), hospital,
  });

  const handleExcel = () => downloadXlsx({
    filename: `Bill-Wise-Sanction-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: 'Bill-Wise Sanction',
    title: 'Bill-Wise Sanction Report',
    hospital: hospital?.name,
    meta: metaLines,
    cols: COLS, rows, totals: totalsRow(),
  });

  const busy = loading || !data || rows.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All payers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          {['not_submitted', 'submitted', 'under_review', 'approved', 'partially_settled', 'settled', 'rejected'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input placeholder="Search bill / claim #" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        {(providerId || status || search || from || to || receiptFilter) && (
          <button onClick={() => { setProviderId(''); setStatus(''); setSearch(''); setFrom(''); setTo(''); setReceiptFilter(''); }}
            className="text-xs font-bold text-gray-400 hover:text-gray-700 underline">Clear</button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {data && <span className="text-xs font-bold text-gray-400">{rows.length} bill(s)</span>}
          <button onClick={handleExcel} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button onClick={handlePrint} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button onClick={load} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
      </div>

      {/* Whose money has come in, and whose hasn't — click to show only those. */}
      {data && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {([
            ['', 'All', allRows.length, 'border-gray-300 bg-white text-gray-600'],
            ['pending', 'Receipt pending', counts.pending, 'border-rose-300 bg-rose-50 text-rose-700'],
            ['partial', 'Part received', counts.partial, 'border-amber-300 bg-amber-50 text-amber-700'],
            ['received', 'Received', counts.received, 'border-emerald-300 bg-emerald-50 text-emerald-700'],
          ] as const).map(([key, label, count, tone]) => (
            <button key={key} onClick={() => setReceiptFilter(key as any)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-all ${tone} ${receiptFilter === key ? 'ring-2 ring-blue-400 ring-offset-1' : 'opacity-80 hover:opacity-100'}`}>
              {label} <span className="ml-0.5 font-black">{count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : !data ? <Empty msg="No data" /> : (
        // Capped height + sticky header: with 50+ bills the column headings used
        // to scroll away, leaving a wall of unlabelled numbers.
        <div className="max-h-[65vh] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-gray-600 sticky top-0 z-10" style={{ boxShadow: 'inset 0 -1px 0 #e5e7eb' }}>
              <tr>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Bill #</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Patient</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Payer</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Receipt</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Claim Amt</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Sanctioned</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Received</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">TDS</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Short-Pay</th>
                <th className="px-3 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Outstanding</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r: any) => (
                <tr key={r.invoice_id} className="hover:bg-slate-50">
                  {/* Bill numbers and patient names are identifiers — wrapping
                      them across three lines made every row three rows tall. */}
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.invoice_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.patient_name}</td>
                  {/* An approved bill with no payer attached can never be
                      receipted — call it out rather than showing a blank cell. */}
                  <td className="px-3 py-2 max-w-[150px]">{r.provider_name
                    ? <span className="text-gray-700 block truncate" title={r.provider_name}>{r.provider_name}</span>
                    : <span className="text-amber-600 font-bold text-xs">Unmapped</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${RECEIPT_PILL[receiptState(r)]}`}>
                      {RECEIPT_LABEL[receiptState(r)]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.claim_amount)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.sanctioned)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.received)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.tds)}</td>
                  <td className="px-3 py-2 text-right">{r.short_pay > 0 ? <span className="text-red-600">{fmt(r.short_pay)}</span> : fmt(r.short_pay)}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(r.outstanding)}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                  {allRows.length > 0 && receiptFilter ? `No bills with receipt "${RECEIPT_LABEL[receiptFilter]}"` : 'No bills'}
                </td></tr>
              )}
            </tbody>
            {/* Totals pinned to the bottom of the scroll box — otherwise you
                have to scroll past every bill to see what they add up to. */}
            <tfoot className="bg-slate-100 font-black text-gray-800 sticky bottom-0" style={{ boxShadow: 'inset 0 1px 0 #e5e7eb' }}>
              <tr>
                <td className="px-3 py-2.5" colSpan={4}>TOTAL</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.claim_amount)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.sanctioned)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.received)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.tds)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.short_pay)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.outstanding)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
function Spinner() { return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>; }
function Empty({ msg }: { msg: string }) { return <div className="py-12 text-center text-sm text-gray-400">{msg}</div>; }
function Field({ label, children }: any) { return <label className="block"><span className="mb-1 block text-xs font-bold text-gray-600">{label}</span>{children}</label>; }
function KpiCard({ icon: Icon, label, value, tone = 'slate', sub, onClick }: any) {
  const tones: any = {
    slate: 'bg-slate-50 text-slate-700', teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-left w-full ${onClick ? 'hover:border-blue-300 hover:shadow-md transition-all cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
        <span className={`rounded-lg p-1.5 ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 text-xl font-black text-gray-900">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </Tag>
  );
}

// Drill-down for the "Total Outstanding" KPI: every TPA bill that still has a
// balance due from the payer, reusing the same data Bill-Wise Sanction shows.
function OutstandingDrilldownModal({ providerId, onClose }: { providerId?: number; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getBillWiseSanction({ provider_id: providerId }).then((r: any) => {
      if (r?.success) setRows((r.data?.rows || []).filter((row: any) => Number(row.outstanding) > 0));
    }).finally(() => setLoading(false));
  }, [providerId]);

  return (
    <Modal title="Total Outstanding — Bills" onClose={onClose} wide>
      {loading ? <Spinner /> : <BillsTable rows={rows} emptyMsg="No outstanding bills" />}
    </Modal>
  );
}

// Shared by the modal above and the inline list on the Receivables Desk tab,
// so both stay visually identical without duplicating the table markup.
function BillsTable({ rows, emptyMsg }: { rows: any[]; emptyMsg: string }) {
  if (rows.length === 0) return <Empty msg={emptyMsg} />;
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-gray-600 sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wider">Bill #</th>
            <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wider">Patient</th>
            <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wider">Provider</th>
            <th className="px-3 py-2 text-right font-black text-[11px] uppercase tracking-wider">Approved</th>
            <th className="px-3 py-2 text-right font-black text-[11px] uppercase tracking-wider">Received</th>
            <th className="px-3 py-2 text-right font-black text-[11px] uppercase tracking-wider">Outstanding</th>
            <th className="px-3 py-2 text-left font-black text-[11px] uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r: any) => (
            <tr key={r.invoice_id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-xs">{r.invoice_number}</td>
              <td className="px-3 py-2">{r.patient_name}</td>
              <td className="px-3 py-2 text-gray-500">{r.provider_name || 'Unmapped'}</td>
              <td className="px-3 py-2 text-right">{fmt(r.sanctioned)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.received)}</td>
              <td className="px-3 py-2 text-right font-bold text-teal-700">{fmt(r.outstanding)}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function StatusPill({ status }: { status: string }) {
  const map: any = {
    settled: 'bg-green-100 text-green-700', partially_settled: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700', submitted: 'bg-slate-100 text-slate-600',
    under_review: 'bg-slate-100 text-slate-600', rejected: 'bg-red-100 text-red-700',
    not_submitted: 'bg-gray-100 text-gray-500', Open: 'bg-blue-100 text-blue-700',
    PartiallyAllocated: 'bg-amber-100 text-amber-700', Allocated: 'bg-green-100 text-green-700', Reversed: 'bg-red-100 text-red-700',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${map[status] || 'bg-gray-100 text-gray-500'}`}>{String(status || '').replace(/_/g, ' ')}</span>;
}
function Modal({ title, children, onClose, wide }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {/* max-h + scroll: the receipt/allocation modals carry tables and used to
          run off the bottom of shorter laptop screens, hiding the Save button. */}
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
