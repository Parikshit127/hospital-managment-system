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
  ArrowDownToLine, AlertTriangle, Plus, X,
} from 'lucide-react';
import { getTpaDeskDashboard, getInsuranceOutstanding, getBillWiseSanction } from '@/app/actions/insurance-aging-actions';
import {
  getInsuranceReceiptSummary, listInsuranceReceipts,
  allocateReceipt, getPendingAdvices, recordAndAllocateReceipt,
} from '@/app/actions/insurance-receipts-actions';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
const INPUT = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agingDays, setAgingDays] = useState(60);
  const [providerId, setProviderId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getInsuranceOutstanding({ payer_type: 'tpa_insurance', agingDays, provider_id: providerId ? Number(providerId) : undefined }).then((r: any) => { if (r?.success) setData(r.data); }).finally(() => setLoading(false));
  }, [agingDays, providerId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-sm font-bold text-gray-600">Insurance Outstanding — aging threshold</span>
        <input type="number" value={agingDays} onChange={(e) => setAgingDays(Number(e.target.value) || 60)} className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm" />
        <span className="text-sm text-gray-600">days</span>
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All payers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
        </select>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {loading ? <Spinner /> : !data ? <Empty msg="No data" /> : (
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
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSURANCE RECEIPTS
// ─────────────────────────────────────────────────────────────────────────────
export function InsuranceReceipts({ providers }: { providers: any[] }) {
  const [summary, setSummary] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [allocFor, setAllocFor] = useState<any>(null);
  const [providerId, setProviderId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getInsuranceReceiptSummary(),
      listInsuranceReceipts({ payer_type: 'tpa_insurance', provider_id: providerId ? Number(providerId) : undefined }),
    ])
      .then(([s, r]: any[]) => { if (s?.success) setSummary(s.data); if (r?.success) setReceipts(r.data); })
      .finally(() => setLoading(false));
  }, [providerId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-gray-700">Insurance Summary</h3>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Receipt
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-gray-600">
            <tr>
              <th className="px-4 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Insurance / TPA</th>
              <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Total Receipts</th>
              <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Receipt Amount</th>
              <th className="px-4 py-2.5 text-right font-black text-[11px] uppercase tracking-wider">Pending Advices</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.map((s: any) => (
              <tr key={s.provider_id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-bold text-gray-800">{s.provider_name}</td>
                <td className="px-4 py-2.5 text-right">{s.total_receipts}</td>
                <td className="px-4 py-2.5 text-right">{fmt(s.total_receipt_amount)}</td>
                <td className="px-4 py-2.5 text-right">{s.pending_advices > 0 ? <span className="text-amber-600 font-bold">{s.pending_advices}</span> : 0}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setAllocFor({ provider_id: s.provider_id, provider_name: s.provider_name })}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-blue-700">RECEIPT</button>
                </td>
              </tr>
            ))}
            {summary.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No payers</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-sm font-black text-gray-700">Recent Receipts</h3>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="ml-auto rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All payers</option>
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipts.map((r: any) => {
                const disallowed = Math.max(0, Number(r.claim_amount || 0) - Number(r.sanctioned_amount || 0));
                return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{r.receipt_number}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-GB') : '-'}</td>
                  <td className="px-3 py-2.5 text-gray-800">{r.provider?.provider_name || r.corporate?.company_name || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[180px] truncate" title={(r.patients || []).join(', ')}>
                    {r.patients?.length ? r.patients.join(', ') : <span className="text-gray-300">Unallocated</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{r.reference_number}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900">{fmt(r.total_amount)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.claim_amount) ? fmt(r.claim_amount) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.sanctioned_amount) ? fmt(r.sanctioned_amount) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.tds_total) ? fmt(r.tds_total) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{Number(r.service_charge) ? fmt(r.service_charge) : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-rose-600">{disallowed ? fmt(disallowed) : '—'}</td>
                  <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                </tr>
              );})}
              {receipts.length === 0 && <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No receipts yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewReceiptModal providers={providers} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {allocFor && <AllocateModal payer={allocFor} onClose={() => setAllocFor(null)} onSaved={() => { setAllocFor(null); load(); }} />}
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

  // ── Patient-bill mapping (merged in from the old separate "Allocate" step) ──
  const [advices, setAdvices] = useState<any[]>([]);
  const [advLoading, setAdvLoading] = useState(false);
  // The biller enters only the cash RECEIVED per bill. TDS (10%) and the
  // disallowed/written-off remainder are derived, so recording a receipt fully
  // settles the bill:  Bill (claimed from TPA) = Received + TDS + Disallowed.
  const [received, setReceived] = useState<Record<number, string>>({});

  // Load this payer's approved bills awaiting receipt whenever the payer changes.
  useEffect(() => {
    if (!form.provider_id) { setAdvices([]); setReceived({}); return; }
    setAdvLoading(true); setReceived({});
    getPendingAdvices(Number(form.provider_id))
      .then((r: any) => { if (r?.success) setAdvices(r.data || []); })
      .finally(() => setAdvLoading(false));
  }, [form.provider_id]);

  const num = (v: string) => Number(v) || 0;
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const TDS_RATE = 0.10;

  // Bill = amount claimed from / due from the TPA for this bill (tpa_payable).
  const rowCalc = (a: any) => {
    const bill = Number(a.tpa_payable || 0);
    const rcv = num(received[a.id]);
    const tds = round2(rcv * TDS_RATE);
    const disallowed = round2(Math.max(0, bill - rcv - tds));
    const invalid = rcv > 0 && rcv + tds - bill > 0.01; // received (+10% TDS) can't exceed the bill
    return { bill, rcv, tds, disallowed, invalid };
  };

  const rows = advices.map((a: any) => ({ a, ...rowCalc(a) }));
  const active = rows.filter((r) => r.rcv > 0);
  const totalBill = round2(active.reduce((s, r) => s + r.bill, 0));
  const totalReceived = round2(active.reduce((s, r) => s + r.rcv, 0));
  const totalTds = round2(active.reduce((s, r) => s + r.tds, 0));
  const totalDisallowed = round2(active.reduce((s, r) => s + r.disallowed, 0));
  const anyInvalid = rows.some((r) => r.invalid);

  const manualReceived = num(form.manual_received); // fallback when the payer has no mapped bills yet
  const hasAdvices = advices.length > 0;
  const receiptTotal = hasAdvices ? totalReceived : manualReceived;
  const canSave = !!form.provider_id && !!form.reference_number && !anyInvalid && receiptTotal > 0;

  const save = async () => {
    setError(''); setPartialMsg(''); setSaving(true);
    const payload = active.map((r) => ({
      invoice_id: r.a.id,
      allocated_amount: r.rcv,
      disallowed_amount: r.disallowed,
      tds_amount: r.tds,
    }));

    const res: any = await recordAndAllocateReceipt({
      payer_type: 'tpa_insurance', provider_id: Number(form.provider_id),
      instrument: form.instrument, reference_number: form.reference_number,
      receipt_date: form.receipt_date,
      total_amount: receiptTotal,
      claim_amount: totalBill, sanctioned_amount: totalBill, tds_amount: totalTds, service_charge: 0,
      remarks: form.remarks,
      lines: payload,
    });
    setSaving(false);
    if (!res?.success) { setError(res?.error || 'Failed to create receipt'); return; }
    if (res.allocationError) {
      // Money is safely recorded; only the mapping failed. Keep the modal open with
      // a clear amber notice instead of silently closing.
      setPartialMsg(`Receipt ${res.receipt_number} saved, but mapping to bills failed: ${res.allocationError}. The money is recorded (unallocated) — map it via the RECEIPT button.`);
      return;
    }
    onSaved();
  };

  return (
    <Modal title="Record Insurance Receipt" onClose={onClose} wide>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {partialMsg && <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{partialMsg}</div>}
      <div className="space-y-3">
        <Field label="Insurance / TPA">
          <select value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })} className={INPUT} disabled={!!defaultProviderId}>
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
          <Field label="Reference / UTR"><input className={INPUT} value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} /></Field>
          <Field label="Receipt Date"><input type="date" className={INPUT} value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} /></Field>
        </div>

        {/* Map to patient bills — enter Received; TDS (10%) and Disallowed are derived */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">Map to Patient Bills</p>
            <p className="text-[10px] text-gray-500">Bill = Received + TDS (10%) + Disallowed</p>
          </div>
          {!form.provider_id ? (
            <p className="text-xs text-gray-400">Select a payer to see its approved bills awaiting receipt.</p>
          ) : advLoading ? (
            <div className="py-3"><Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-400" /></div>
          ) : !hasAdvices ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-600">No approved bills for this payer yet — record the money as unallocated and map it later via the RECEIPT button.</p>
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
                      <th className="px-2 py-1.5 text-right font-bold text-[11px]">TDS (10%)</th>
                      <th className="px-2 py-1.5 text-right font-bold text-[11px]">Disallowed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(({ a, bill, rcv, tds, disallowed, invalid }) => (
                      <tr key={a.id} className={invalid ? 'bg-red-50' : ''}>
                        <td className="px-2 py-1 font-mono text-[11px]">{a.invoice_number}</td>
                        <td className="px-2 py-1 text-xs">{a.patient?.full_name || a.patient_id}</td>
                        <td className="px-2 py-1 text-right text-xs font-semibold">{fmt(bill)}</td>
                        <td className="px-2 py-1">
                          <input type="number" className={`w-24 rounded border px-1.5 py-0.5 text-right text-xs ${invalid ? 'border-red-400' : 'border-gray-300'}`}
                            value={received[a.id] || ''} onChange={(e) => setReceived((p) => ({ ...p, [a.id]: e.target.value }))} />
                        </td>
                        <td className="px-2 py-1 text-right text-xs text-gray-500">{rcv > 0 ? fmt(tds) : '—'}</td>
                        <td className="px-2 py-1 text-right text-xs text-rose-600">{rcv > 0 ? fmt(disallowed) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {anyInvalid && <p className="text-[11px] text-red-600">Received + 10% TDS cannot exceed the bill amount — reduce the received value.</p>}
              {totalReceived > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
                  <span>Bill <strong>{fmt(totalBill)}</strong></span>
                  <span>Received <strong className="text-gray-900">{fmt(totalReceived)}</strong></span>
                  <span>TDS <strong>{fmt(totalTds)}</strong></span>
                  <span>Disallowed <strong className="text-rose-600">{fmt(totalDisallowed)}</strong></span>
                  <span className="text-green-600 font-bold">· bill fully settled</span>
                </div>
              )}
            </>
          )}
        </div>

        <Field label="Remarks"><input className={INPUT} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
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
      listInsuranceReceipts({ payer_type: 'tpa_insurance', provider_id: payer.provider_id, status: 'Open' }),
    ]).then(([a, r]: any[]) => {
      if (a?.success) setAdvices(a.data);
      if (r?.success) { setReceipts(r.data); if (r.data?.[0]) setReceiptId(String(r.data[0].id)); }
    }).finally(() => setLoading(false));
  }, [payer.provider_id]);

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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getBillWiseSanction({
      provider_id: providerId ? Number(providerId) : undefined,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then((r: any) => { if (r?.success) setData(r.data); }).finally(() => setLoading(false));
  }, [providerId, search, from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All payers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
        </select>
        <input placeholder="Search bill / claim #" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {loading ? <Spinner /> : !data ? <Empty msg="No data" /> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Bill #</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Patient</th>
                <th className="px-3 py-2.5 text-left font-black text-[11px] uppercase tracking-wider">Claim #</th>
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
              {data.rows.map((r: any) => (
                <tr key={r.invoice_id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.invoice_number}</td>
                  <td className="px-3 py-2">{r.patient_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.claim_number || '-'}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.claim_amount)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.sanctioned)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.received)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.tds)}</td>
                  <td className="px-3 py-2 text-right">{r.short_pay > 0 ? <span className="text-red-600">{fmt(r.short_pay)}</span> : fmt(r.short_pay)}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(r.outstanding)}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No bills</td></tr>}
            </tbody>
            <tfoot className="bg-slate-100 font-black text-gray-800">
              <tr>
                <td className="px-3 py-2.5" colSpan={3}>TOTAL</td>
                <td className="px-3 py-2.5 text-right">{fmt(data.totals.claim_amount)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(data.totals.sanctioned)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(data.totals.received)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(data.totals.tds)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(data.totals.short_pay)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(data.totals.outstanding)}</td>
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
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-white p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
