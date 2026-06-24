// Renders a Purchase Order / Purchase Invoice as a printable supplier-style
// tax-invoice (matches the distributor bill format pharmacists are used to:
// Sr | Qty | Pack | Particulars | HSN | Batch | Exp | MRP | Rate | Dis% | GST% |
// Taxable | CGST | SGST | IGST | Amount, with a totals footer + amount in words).
import type { PharmacyBranding } from '@/app/lib/pharmacy-branding';

export interface PurchasePrintLine {
    name: string;
    pack?: string | null;
    hsn?: string | null;
    batch?: string | null;
    expiry?: string | null;
    mrp?: number | null;
    qty: number;
    rate: number;
    disPct?: number | null;
    gstPct?: number | null;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    amount: number;
}

export interface PurchasePrintOpts {
    kind: 'PURCHASE ORDER' | 'PURCHASE INVOICE';
    docNumber: string;
    docDate: Date | string;
    dueDate?: Date | string | null;
    status?: string | null;
    notes?: string | null;
    buyer: PharmacyBranding;
    supplier: { name: string; gstin?: string | null; address?: string | null; phone?: string | null };
    lines: PurchasePrintLine[];
}

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n: number) => Number(n || 0).toFixed(2);
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function numberToWords(n: number): string {
    if (!n || n === 0) return 'Zero Rupees Only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function below(num: number): string {
        if (num === 0) return '';
        if (num < 20) return ones[num] + ' ';
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' ';
        return ones[Math.floor(num / 100)] + ' Hundred ' + below(num % 100);
    }
    const rupees = Math.floor(n);
    const paise = Math.round((n - rupees) * 100);
    let w = '';
    if (rupees >= 10000000) { w += below(Math.floor(rupees / 10000000)) + 'Crore '; }
    if (rupees >= 100000) { w += below(Math.floor((rupees % 10000000) / 100000)) + 'Lakh '; }
    if (rupees >= 1000) { w += below(Math.floor((rupees % 100000) / 1000)) + 'Thousand '; }
    w += below(rupees % 1000);
    w = w.trim() + ' Rupees';
    if (paise > 0) w += ' and ' + below(paise).trim() + ' Paise';
    return w + ' Only';
}

export function buildPurchasePrintHtml(opts: PurchasePrintOpts): string {
    const { kind, buyer, supplier, lines } = opts;
    const fmtDate = (d: Date | string | null | undefined) =>
        d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

    // Totals
    const grossAmt = r2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
    const taxableAmt = r2(lines.reduce((s, l) => s + Number(l.taxable || 0), 0));
    const discAmt = r2(grossAmt - taxableAmt);
    const cgstAmt = r2(lines.reduce((s, l) => s + Number(l.cgst || 0), 0));
    const sgstAmt = r2(lines.reduce((s, l) => s + Number(l.sgst || 0), 0));
    const igstAmt = r2(lines.reduce((s, l) => s + Number(l.igst || 0), 0));
    const grand = r2(lines.reduce((s, l) => s + Number(l.amount || 0), 0));
    const grandRounded = Math.round(grand);
    const roundOff = r2(grandRounded - grand);

    const rows = lines.map((l, i) => `
        <tr>
            <td class="c">${i + 1}</td>
            <td class="c">${esc(l.qty)}</td>
            <td class="c">${esc(l.pack)}</td>
            <td class="l">${esc(l.name)}</td>
            <td class="c">${esc(l.hsn)}</td>
            <td class="c">${esc(l.batch)}</td>
            <td class="c">${esc(l.expiry)}</td>
            <td class="r">${l.mrp != null && l.mrp > 0 ? money(l.mrp) : ''}</td>
            <td class="r">${money(l.rate)}</td>
            <td class="c">${l.disPct ? Number(l.disPct).toFixed(2) : '0'}</td>
            <td class="c">${l.gstPct != null ? Number(l.gstPct).toFixed(0) : '0'}</td>
            <td class="r">${money(l.taxable)}</td>
            <td class="r">${money(l.cgst)}</td>
            <td class="r">${money(l.sgst)}</td>
            <td class="r">${money(l.igst)}</td>
            <td class="r b">${money(l.amount)}</td>
        </tr>`).join('');

    const css = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Segoe UI', Arial, sans-serif; font-size:11px; color:#111; background:#f0f2f5; }
        .toolbar { display:flex; gap:12px; align-items:center; justify-content:center; padding:10px; background:#1e3a6e; }
        .toolbar button { padding:7px 22px; background:#fff; color:#1e3a6e; font-weight:700; border:none; border-radius:6px; cursor:pointer; font-size:12px; }
        .toolbar .ref { font-size:11px; color:#cbd5e1; }
        .page { max-width:1000px; margin:20px auto; background:#fff; padding:24px 26px; box-shadow:0 1px 6px rgba(0,0,0,.08); }
        .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1e3a6e; padding-bottom:10px; margin-bottom:10px; }
        .nm { font-size:18px; font-weight:900; color:#1e3a6e; }
        .sub { font-size:9.5px; color:#6b7280; font-style:italic; }
        .meta { font-size:10px; color:#374151; margin-top:3px; line-height:1.5; }
        .badge { display:inline-block; padding:3px 12px; background:#1e3a6e; color:#fff; font-size:11px; font-weight:800; letter-spacing:.08em; border-radius:3px; }
        .parties { display:flex; gap:16px; margin:10px 0 12px; }
        .party { flex:1; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; }
        .party .t { font-size:8.5px; text-transform:uppercase; letter-spacing:.08em; color:#6b7280; font-weight:800; margin-bottom:3px; }
        .party .v { font-weight:700; font-size:12px; }
        .party .d { font-size:10px; color:#4b5563; line-height:1.5; }
        table.items { width:100%; border-collapse:collapse; }
        table.items th { background:#1e3a6e; color:#fff; font-size:8.5px; text-transform:uppercase; letter-spacing:.03em; padding:6px 4px; border:1px solid #1e3a6e; }
        table.items td { padding:4px 4px; font-size:10px; border:1px solid #e5e7eb; }
        table.items td.c { text-align:center; }
        table.items td.r { text-align:right; }
        table.items td.l { text-align:left; }
        table.items td.b { font-weight:700; }
        table.items tbody tr:nth-child(even) { background:#fafbfc; }
        .totbar { display:flex; justify-content:space-between; margin-top:10px; gap:16px; }
        .words { flex:1; padding:8px 12px; background:#f0f4ff; border-left:3px solid #1e3a6e; font-size:10.5px; }
        .totals { width:280px; }
        .totals .row { display:flex; justify-content:space-between; padding:3px 8px; font-size:11px; }
        .totals .row.grand { background:#1e3a6e; color:#fff; font-weight:900; font-size:14px; padding:7px 8px; border-radius:0 0 4px 4px; }
        .note { font-size:10px; color:#6b7280; margin-top:10px; }
        .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:26px; }
        .sig { text-align:right; }
        .sig-line { border-top:1px solid #9ca3af; width:160px; margin:30px 0 4px auto; }
        .gen { text-align:center; font-size:8px; color:#cbd5e1; margin-top:16px; border-top:1px dashed #e5e7eb; padding-top:8px; }
        @media print {
            @page { size:A4 landscape; margin:8mm; }
            body { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .toolbar { display:none !important; }
            .page { margin:0; box-shadow:none; max-width:none; padding:0; }
            table.items th { background:#1e3a6e !important; color:#fff !important; }
            .totals .row.grand { background:#1e3a6e !important; color:#fff !important; }
            .words { background:#f0f4ff !important; }
        }
    `;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(kind)} ${esc(opts.docNumber)}</title>
<style>${css}</style></head><body>
<div class="toolbar">
    <script>document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('p');if(b)b.onclick=function(){window.print();};var k=document.getElementById('bk');if(k)k.onclick=function(){window.history.back();};});</script>
    <button id="bk" style="background:transparent;color:#cbd5e1;border:1px solid #475569;">Back</button>
    <button id="p">Print / Download PDF</button>
    <span class="ref">${esc(opts.docNumber)}</span>
</div>
<div class="page">
    <div class="head">
        <div>
            <div class="nm">${esc(buyer.name)}</div>
            ${buyer.division ? `<div class="sub">${esc(buyer.division)}</div>` : ''}
            <div class="meta">${esc(buyer.address)}${buyer.gstin ? `<br>GSTIN: ${esc(buyer.gstin)}` : ''}</div>
        </div>
        <div style="text-align:right;">
            <span class="badge">${esc(kind)}</span>
            <div class="meta">
                ${esc(kind === 'PURCHASE ORDER' ? 'PO No' : 'Invoice No')}: <strong>${esc(opts.docNumber)}</strong><br>
                Date: <strong>${fmtDate(opts.docDate)}</strong>
                ${opts.dueDate ? `<br>Due: <strong>${fmtDate(opts.dueDate)}</strong>` : ''}
                ${opts.status ? `<br>Status: <strong>${esc(opts.status)}</strong>` : ''}
            </div>
        </div>
    </div>

    <div class="parties">
        <div class="party">
            <div class="t">Supplier</div>
            <div class="v">${esc(supplier.name)}</div>
            <div class="d">${supplier.address ? esc(supplier.address) + '<br>' : ''}${supplier.gstin ? 'GSTIN: ' + esc(supplier.gstin) : ''}${supplier.phone ? (supplier.gstin ? ' · ' : '') + 'Ph: ' + esc(supplier.phone) : ''}</div>
        </div>
    </div>

    <table class="items">
        <thead>
            <tr>
                <th>Sr</th><th>Qty</th><th>Pack</th><th>Particulars</th><th>HSN</th><th>Batch</th><th>Exp</th>
                <th>MRP</th><th>Rate</th><th>Dis%</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Amount</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>

    <div class="totbar">
        <div class="words"><strong>Amount in words:</strong> ${esc(numberToWords(grandRounded))}${opts.notes ? `<div class="note"><strong>Notes:</strong> ${esc(opts.notes)}</div>` : ''}</div>
        <div class="totals">
            <div class="row"><span>Gross Amount</span><span>${money(grossAmt)}</span></div>
            <div class="row"><span>Discount</span><span>-${money(discAmt)}</span></div>
            <div class="row"><span>Taxable Amount</span><span>${money(taxableAmt)}</span></div>
            <div class="row"><span>CGST</span><span>${money(cgstAmt)}</span></div>
            <div class="row"><span>SGST</span><span>${money(sgstAmt)}</span></div>
            ${igstAmt > 0 ? `<div class="row"><span>IGST</span><span>${money(igstAmt)}</span></div>` : ''}
            ${roundOff !== 0 ? `<div class="row"><span>Round Off</span><span>${money(roundOff)}</span></div>` : ''}
            <div class="row grand"><span>Grand Total</span><span>₹${money(grandRounded)}</span></div>
        </div>
    </div>

    <div class="foot">
        <div style="font-size:9px;color:#9ca3af;max-width:340px;">
            This is a computer-generated ${esc(kind.toLowerCase())} and does not require a physical signature.
        </div>
        <div class="sig">
            <div class="sig-line"></div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;">Authorized Signatory</div>
            <div style="font-size:9px;color:#6b7280;">For ${esc(buyer.name)}</div>
        </div>
    </div>
    <div class="gen">${esc(buyer.name)} ${buyer.division ? esc(buyer.division) : ''}</div>
</div>
</body></html>`;
}
