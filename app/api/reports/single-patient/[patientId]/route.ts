import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getSinglePatientReportFor } from '@/app/actions/single-patient-report-actions';
import {
    getBillBranding,
    letterheadCss,
    letterheadBackgroundHtml,
    billFooterHtml,
    printButtonHtml,
    fmtBillDate,
    fmtBillDateTime,
} from '@/app/lib/bill-branding';

/**
 * Printable Single Patient Report.
 *
 * The screen version used `window.print()`, which printed the live app page:
 * the browser injected its own page header, the scrollable panels were clipped
 * to one page, and the sections below the fold never appeared. This renders the
 * whole report as a normal paginated document instead — same approach the
 * discharge bill and OPD slip already use — so every section prints in full.
 */

const ALLOWED_STAFF_ROLES = ['admin', 'receptionist', 'doctor', 'opd_manager', 'nurse', 'finance', 'ipd_manager'];

function esc(s: any): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const money = (n: any) =>
    '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;

        const { patientId } = await params;
        if (!patientId) return NextResponse.json({ error: 'Invalid patient id' }, { status: 400 });

        const res = await getSinglePatientReportFor(patientId, auth.context.organizationId);
        if (!res.success || !res.data) {
            return NextResponse.json({ error: res.error || 'Patient not found' }, { status: 404 });
        }

        const branding = await getBillBranding(auth.context.organizationId);
        const html = render(res.data, branding);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error: any) {
        console.error('single-patient report route error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function section(title: string, count: number, head: string[], bodyRows: string[]): string {
    return `
    <div class="section">
      <div class="section-head">
        <span>${esc(title)}</span>
        <span class="count">${count} record${count === 1 ? '' : 's'}</span>
      </div>
      ${count === 0
            ? `<p class="empty">Nothing on record.</p>`
            : `<table>
               <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
               <tbody>${bodyRows.join('')}</tbody>
             </table>`}
    </div>`;
}

function render(d: any, b: any): string {
    const p = d.patient;
    const s = d.summary;

    const invoiceRows = (d.invoices ?? []).map((i: any) => `
      <tr>
        <td class="mono">${esc(i.invoice_number || `#${i.id}`)}</td>
        <td>${esc(fmtBillDate(i.created_at))}</td>
        <td>${esc(i.invoice_type || '')}</td>
        <td class="num">${money(i.net_amount)}</td>
        <td class="num">${money(i.paid_amount)}</td>
        <td class="num">${money(i.balance_due)}</td>
        <td>${esc(i.status)}</td>
        <td class="small">${esc((i.payments ?? []).map((x: any) => `${x.receipt_number} (${x.payment_method})`).join(', ') || '—')}</td>
      </tr>`);

    const admissionRows = (d.admissions ?? []).map((a: any) => `
      <tr>
        <td class="mono">${esc(a.admission_id)}</td>
        <td>${esc(fmtBillDateTime(a.admission_date))}</td>
        <td>${esc(a.discharge_date ? fmtBillDateTime(a.discharge_date) : '—')}</td>
        <td>${esc(a.doctor_name || '—')}</td>
        <td>${esc(a.diagnosis || '—')}</td>
        <td>${esc(a.status)}</td>
      </tr>`);

    const visitRows = (d.appointments ?? []).map((a: any) => `
      <tr>
        <td>${esc(fmtBillDate(a.appointment_date))}</td>
        <td>${esc(a.doctor_name || '—')}</td>
        <td>${esc(a.department || '—')}</td>
        <td>${esc(a.reason_for_visit || '—')}</td>
        <td>${esc(a.status)}</td>
      </tr>`);

    const depositRows = (d.deposits ?? []).map((x: any) => `
      <tr>
        <td class="mono">${esc(x.deposit_number)}</td>
        <td>${esc(fmtBillDate(x.created_at))}</td>
        <td class="num">${money(x.amount)}</td>
        <td class="num">${money(x.applied_amount)}</td>
        <td>${esc(x.payment_method)}</td>
        <td>${esc(x.status)}</td>
      </tr>`);

    const refundRows = (d.refunds ?? []).map((r: any) => `
      <tr>
        <td>${esc(fmtBillDate(r.created_at))}</td>
        <td class="num">${money(r.amount)}</td>
        <td>${esc(r.payment_method || '—')}</td>
        <td>${esc(r.reason || '')}</td>
        <td>${esc(r.status)}</td>
      </tr>`);

    const labRows = (d.labOrders ?? []).map((l: any) => `
      <tr>
        <td>${esc(fmtBillDate(l.created_at))}</td>
        <td class="mono">${esc(l.order_id ?? l.id)}</td>
        <td>${esc(l.status)}</td>
      </tr>`);

    const indentRows = (d.indents ?? []).map((o: any) => `
      <tr>
        <td class="mono">${esc(o.indent_number || `IND-${o.id}`)}</td>
        <td>${esc(fmtBillDateTime(o.created_at))}</td>
        <td class="num">${(o.items ?? []).length}</td>
        <td>${esc(o.status)}</td>
      </tr>`);

    const tile = (label: string, value: string, cls = '') =>
        `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value ${cls}">${value}</div></div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Single Patient Report — ${esc(p.full_name)} (${esc(p.patient_id)})</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#fff;font-size:11px}
  .page{max-width:900px;margin:0 auto;padding:18px}
  ${letterheadCss(b)}
  h1{font-size:15px;margin-bottom:2px}
  .muted{color:#6b7280}
  .doc-title{text-align:center;font-size:13px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;
             border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:6px 0;margin:12px 0}
  .pt-card{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:10px}
  .pt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 16px;margin-top:6px}
  .pt-grid div{font-size:10.5px}
  .tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:12px}
  .tile{border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px}
  .tile-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280}
  .tile-value{font-size:12px;font-weight:bold;margin-top:2px}
  .pos{color:#047857}.neg{color:#b91c1c}.warn{color:#b45309}
  .section{margin-bottom:12px;break-inside:auto}
  .section-head{display:flex;justify-content:space-between;align-items:center;background:#f3f4f6;
                padding:5px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em}
  .section-head .count{font-weight:normal;color:#6b7280}
  table{width:100%;border-collapse:collapse}
  th{background:#fafafa;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;
     color:#6b7280;padding:4px 8px;border-bottom:1px solid #e5e7eb}
  td{padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:10px;vertical-align:top}
  td.num,th.num{text-align:right}
  .mono{font-family:'Courier New',monospace}
  .small{font-size:9px;color:#6b7280}
  .empty{padding:8px;color:#9ca3af;font-size:10px}
  /* Repeat table headers across pages and never split a row. */
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  @page{size:A4;margin:12mm}
  @media print{
    .no-print{display:none!important}
    body{font-size:10px}
    .page{max-width:none;padding:0}
  }
</style>
</head>
<body>
${letterheadBackgroundHtml(b)}
${printButtonHtml(b, 'Single Patient Report')}
<div class="page">
  <div class="doc-title">Single Patient Report</div>

  <div class="pt-card">
    <h1>${esc(p.full_name)}</h1>
    <div class="muted mono">${esc(p.patient_id)}</div>
    <div class="pt-grid">
      <div><span class="muted">Age / Gender:</span> <strong>${esc(p.age ?? '—')} / ${esc(p.gender ?? '—')}</strong></div>
      <div><span class="muted">Phone:</span> <strong>${esc(p.phone || '—')}</strong></div>
      <div><span class="muted">Registered:</span> <strong>${esc(fmtBillDate(p.created_at))}</strong></div>
      <div><span class="muted">Type:</span> <strong>${esc(String(p.patient_type || 'cash').replace('_', ' '))}</strong></div>
    </div>
  </div>

  <div class="tiles">
    ${tile('Total Billed', money(s.total_billed))}
    ${tile('Paid', money(s.total_paid), 'pos')}
    ${tile('Outstanding', money(s.outstanding), 'neg')}
    ${tile('Refunded', money(s.refunded), 'warn')}
    ${tile('Deposits', money(s.deposit_collected))}
    ${tile('Deposit Available', money(s.deposit_available))}
  </div>

  ${section('Invoices & Payments', (d.invoices ?? []).length,
        ['Invoice', 'Date', 'Type', 'Net', 'Paid', 'Balance', 'Status', 'Receipts'], invoiceRows)}
  ${section('IPD Admissions', (d.admissions ?? []).length,
        ['Admission', 'Admitted', 'Discharged', 'Doctor', 'Diagnosis', 'Status'], admissionRows)}
  ${section('OPD Appointments (scheduled visits only — walk-in bills appear above)', (d.appointments ?? []).length,
        ['Date', 'Doctor', 'Department', 'Reason', 'Status'], visitRows)}
  ${section('Deposits', (d.deposits ?? []).length,
        ['Deposit', 'Date', 'Amount', 'Applied', 'Method', 'Status'], depositRows)}
  ${section('Refunds', (d.refunds ?? []).length,
        ['Date', 'Amount', 'Refunded Via', 'Reason', 'Status'], refundRows)}
  ${section('Lab Orders', (d.labOrders ?? []).length,
        ['Date', 'Order', 'Status'], labRows)}
  ${section('Pharmacy Indents', (d.indents ?? []).length,
        ['Indent', 'Date', 'Items', 'Status'], indentRows)}

  ${billFooterHtml(b)}
</div>
</body>
</html>`;
}
