// Renders a per-patient detailed pharmacy breakup ("Sales Summary") for an IPD
// admission — every dispense (Sale) with its items, batches, expiry and amounts,
// plus patient returns and a summary block. Printable by reception.
// Pure renderer: takes already-fetched data so it has no DB / server imports.
import type { PharmacyBranding } from '@/app/lib/pharmacy-branding';

export interface BreakupLine {
    name: string;
    covered: string;          // 'Y' | 'N'
    expiry: string | null;    // MM/YYYY
    batch: string | null;
    qty: number;
    unit: string;             // PIECE / INJ / PCS / NOS …
    selling: number;          // rate per unit
    amount: number;           // qty * selling
    discount: number;
}

export interface BreakupSale {
    saleNo: string;           // "S.533" or "SR.33"
    isReturn: boolean;
    dateTime: Date | string;
    lines: BreakupLine[];
    total: number;
    totalDiscount: number;
}

export interface BreakupSummary {
    purchased: number;
    returned: number;
    netPurchased: number;
    discount: number;
    billRoundOff: number;
    totalAmount: number;
    patientAmount: number;
    patientPaid: number;
    pending: number;
    companyCredit: number;
}

export interface BreakupPatient {
    name: string;
    regNo: string;
    department: string;
    admissionDate: Date | string | null;
    category: string;
}

export interface BreakupHospital {
    name: string;
    address?: string | null;
}

export interface PharmacyBreakupData {
    hospital: BreakupHospital;
    pharmacy: PharmacyBranding;
    patient: BreakupPatient;
    sales: BreakupSale[];
    summary: BreakupSummary;
}

const money = (n: number) => Number(n || 0).toFixed(2);
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function fmtDateTime(d: Date | string | null): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const date = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${date} ${time}`;
}
function fmtDate(d: Date | string | null): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function saleTableHtml(s: BreakupSale): string {
    const rows = s.lines.map((l) => `
        <tr>
          <td class="ic">${esc(l.name)}</td>
          <td class="ce">${esc(l.covered)}</td>
          <td class="ce">${esc(l.expiry || '-')}</td>
          <td class="ce">${esc(l.batch || '-')}</td>
          <td class="ce">${l.qty} ${esc(l.unit)}</td>
          <td class="num">${money(l.selling)}</td>
          <td class="num">${money(l.amount)}</td>
          <td class="num">${money(l.discount)}</td>
        </tr>`).join('');
    const label = s.isReturn ? 'Return' : 'Sales';
    return `
      <div class="sale">
        <div class="sale-head">${label} [${esc(s.saleNo)}] &nbsp; ${esc(fmtDateTime(s.dateTime))}</div>
        <table class="items">
          <thead>
            <tr>
              <th class="ic">Items</th><th class="ce">Covered</th><th class="ce">Expiry Date</th>
              <th class="ce">Batch</th><th class="ce">Quantity</th><th class="num">Selling</th>
              <th class="num">Amount</th><th class="num">Discount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="6" class="tot-lbl">Total</td><td class="num">${money(s.total)}</td><td class="num">${money(s.totalDiscount)}</td></tr>
          </tfoot>
        </table>
      </div>`;
}

export function buildPharmacyBreakupHtml(data: PharmacyBreakupData): string {
    const { hospital, pharmacy, patient, sales, summary } = data;

    const salesHtml = sales.length
        ? sales.map(saleTableHtml).join('')
        : `<div class="empty">No pharmacy dispenses recorded for this patient.</div>`;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pharmacy Breakup — ${esc(patient.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 18px 26px; font-size: 12px; }
  .topbar { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; }
  .hosp { font-size: 15px; font-weight: 800; }
  .pharm { font-size: 11px; color:#333; margin-top:2px; }
  .pharm b { color:#111; }
  .addr { font-size: 10.5px; color:#555; }
  .title { text-align:center; font-size: 14px; font-weight:800; letter-spacing:1px; margin: 8px 0 6px; border-top:2px solid #111; border-bottom:2px solid #111; padding:4px 0; }
  .pinfo { display:grid; grid-template-columns: 1fr 1fr; gap:2px 24px; margin: 6px 0 4px; font-size:11.5px; }
  .pinfo span b { display:inline-block; min-width: 130px; }
  .summary { border:1px solid #999; margin:8px 0 12px; }
  .summary table { width:100%; border-collapse:collapse; font-size:11px; }
  .summary td { padding:3px 8px; border:1px solid #ddd; }
  .summary td.k { color:#555; } .summary td.v { text-align:right; font-weight:700; }
  .sale { margin: 10px 0; page-break-inside: avoid; }
  .sale-head { background:#eef2f7; font-weight:700; padding:4px 8px; border:1px solid #cdd6e0; font-size:11.5px; }
  table.items { width:100%; border-collapse:collapse; font-size:11px; }
  table.items th { background:#f6f7f9; border:1px solid #d8dde3; padding:4px 6px; text-align:left; }
  table.items td { border:1px solid #e6e9ee; padding:3px 6px; vertical-align:top; }
  table.items td.ce, table.items th.ce { text-align:center; }
  table.items td.num, table.items th.num { text-align:right; }
  table.items td.ic { font-weight:600; }
  table.items tfoot td { border-top:2px solid #111; font-weight:800; background:#fafafa; }
  table.items .tot-lbl { text-align:right; }
  .empty { padding:24px; text-align:center; color:#888; border:1px dashed #ccc; }
  .foot { margin-top:18px; display:flex; justify-content:space-between; font-size:10.5px; color:#444; border-top:1px solid #ccc; padding-top:6px; }
  .noprint { margin-bottom:10px; }
  .btn { background:#2563eb; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer; }
  @media print { .noprint { display:none !important; } body { padding: 6px 10px; } }
</style></head>
<body>
  <div class="noprint"><button class="btn" onclick="window.print()">Print</button></div>

  <div class="topbar">
    <div>
      <div class="hosp">${esc(hospital.name)}</div>
      <div class="pharm"><b>${esc(pharmacy.name)}</b> ${esc(pharmacy.division || '')} ${pharmacy.gstin ? '&nbsp; GST : ' + esc(pharmacy.gstin) : ''}</div>
      <div class="addr">${esc(pharmacy.address || hospital.address || '')}</div>
    </div>
  </div>

  <div class="title">PHARMACY SALES SUMMARY</div>

  <div class="pinfo">
    <span><b>Patient Name :</b> ${esc(patient.name)}</span>
    <span><b>Registration No :</b> ${esc(patient.regNo)}</span>
    <span><b>Department Name :</b> ${esc(patient.department || '-')}</span>
    <span><b>Admission Date :</b> ${esc(fmtDate(patient.admissionDate))}</span>
    <span><b>Category :</b> ${esc(patient.category || '-')}</span>
  </div>

  <div class="summary"><table>
    <tr>
      <td class="k">Medicines Purchased</td><td class="v">${money(summary.purchased)}</td>
      <td class="k">Medicines Returned</td><td class="v">${money(summary.returned)}</td>
      <td class="k">Net Purchased</td><td class="v">${money(summary.netPurchased)}</td>
    </tr>
    <tr>
      <td class="k">Discount</td><td class="v">${money(summary.discount)}</td>
      <td class="k">Bill Round Off</td><td class="v">${money(summary.billRoundOff)}</td>
      <td class="k">Total Amount</td><td class="v">${money(summary.totalAmount)}</td>
    </tr>
    <tr>
      <td class="k">Company Credit</td><td class="v">${money(summary.companyCredit)}</td>
      <td class="k">Patient Amount</td><td class="v">${money(summary.patientAmount)}</td>
      <td class="k">Patient Amt Paid</td><td class="v">${money(summary.patientPaid)}</td>
    </tr>
    <tr>
      <td class="k">Pending Amount</td><td class="v">${money(summary.pending)}</td>
      <td class="k"></td><td class="v"></td>
      <td class="k"></td><td class="v"></td>
    </tr>
  </table></div>

  ${salesHtml}

  <div class="foot">
    <span>[Signing Authority]</span>
    <span>**All figures are in Rupees (INR) only</span>
  </div>
</body></html>`;
}
