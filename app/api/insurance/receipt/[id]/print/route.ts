import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding, fmtBillDate } from '@/app/lib/bill-branding';

// Printable acknowledgement for a TPA / insurance receipt: the payer settlement
// on hospital letterhead, with the bill-wise split of what was applied.
// Opens in a new tab with a Print button (browser "Save as PDF"), matching the
// rest of the app's print routes.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({});
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { id } = await params;
        const receiptId = parseInt(id);
        if (isNaN(receiptId)) return NextResponse.json({ error: 'Invalid receipt ID' }, { status: 400 });

        const receipt = await prisma.insuranceReceipt.findFirst({
            where: { id: receiptId, organizationId },
            include: {
                provider: { select: { provider_name: true, provider_code: true } },
                corporate: { select: { company_name: true } },
                allocations: {
                    include: {
                        invoice: {
                            select: {
                                invoice_number: true, net_amount: true,
                                patient: { select: { full_name: true, patient_id: true } },
                            },
                        },
                    },
                    orderBy: { id: 'asc' },
                },
            },
        });
        if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

        // A reversed receipt is still printable — it is part of the audit trail —
        // but it must never read as proof of payment, so pull the reversal's
        // reason and timestamp to state plainly why it is void.
        let reversal: { reason: string; at: Date | null } | null = null;
        if (receipt.status === 'Reversed') {
            const log = await prisma.system_audit_logs.findFirst({
                where: {
                    organizationId, entity_type: 'insurance_receipt',
                    entity_id: String(receipt.id), action: 'insurance_receipt_reversed',
                },
                orderBy: { created_at: 'desc' },
                select: { details: true, created_at: true },
            });
            let reason = '';
            try { reason = log?.details ? (JSON.parse(log.details).reason || '') : ''; } catch { /* ignore */ }
            reversal = { reason, at: log?.created_at ?? null };
        }

        const branding = await getBillBranding(organizationId);
        return new NextResponse(receiptHTML(receipt, branding, reversal), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Insurance receipt print error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate receipt' }, { status: 500 });
    }
}

const n = (v: any) => Number(v || 0);
const inr = (v: any) => `₹${n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Indian-system amount in words (same convention as the deposit/bill receipts).
function numberToWords(amount: number): string {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x: number): string => x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? ' ' + a[x % 10] : ''}`;
    const three = (x: number): string => x > 99 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x);
    let num = Math.floor(Math.abs(amount));
    if (num === 0) return 'Rupees Zero Only';
    const parts: string[] = [];
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    if (crore) parts.push(`${three(crore)} Crore`);
    if (lakh) parts.push(`${three(lakh)} Lakh`);
    if (thousand) parts.push(`${three(thousand)} Thousand`);
    if (num) parts.push(three(num));
    const paise = Math.round((Math.abs(amount) - Math.floor(Math.abs(amount))) * 100);
    return `Rupees ${parts.join(' ')}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

function receiptHTML(r: any, b: any, reversal?: { reason: string; at: Date | null } | null): string {
    const accent = b.accentColor || '#1e3a6e';
    const payer = r.provider?.provider_name || r.corporate?.company_name || '—';
    const isReversed = r.status === 'Reversed';

    // The receipt's total_amount is the bank credit; TDS is withheld by the payer
    // out of the settled amount, so gross settled = credit + TDS.
    const credited = n(r.total_amount);
    const serviceCharge = n(r.service_charge);
    const allocs = r.allocations || [];
    const totDisallowed = allocs.reduce((s: number, a: any) => s + n(a.disallowed_amount), 0);

    // Prefer the per-bill figures over the header summary: they are what was
    // actually posted to the invoices, and older receipts can carry a header
    // tds_total that no longer agrees with its lines. A printed document must
    // tie to the table printed beneath it.
    const lineTds = allocs.reduce((s: number, a: any) => s + n(a.tds_amount), 0);
    const lineCash = allocs.reduce((s: number, a: any) => s + n(a.allocated_amount), 0);
    const tds = allocs.length ? lineTds : n(r.tds_total);
    const grossSettled = allocs.length ? lineCash + lineTds : credited + tds + serviceCharge;

    const rows = allocs.map((a: any, i: number) => {
        const cash = n(a.allocated_amount);
        const t = n(a.tds_amount);
        const d = n(a.disallowed_amount);
        return `<tr>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;">${i + 1}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;font-family:monospace;">${esc(a.invoice?.invoice_number || '—')}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;">${esc(a.invoice?.patient?.full_name || '—')}<br><span style="color:#9ca3af;font-size:9px;font-family:monospace;">${esc(a.invoice?.patient?.patient_id || '')}</span></td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(a.invoice?.net_amount)}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(cash + t)}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(t)}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;font-weight:700;">${inr(cash)}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;color:#e11d48;">${d ? inr(d) : '—'}</td>
        </tr>`;
    }).join('');

    const kv = (label: string, value: string, strong = false) => `
        <tr>
            <td style="padding:5px 0;font-size:11px;color:#6b7280;white-space:nowrap;">${esc(label)}</td>
            <td style="padding:5px 0 5px 14px;font-size:${strong ? '13px' : '11.5px'};color:#111827;font-weight:${strong ? 800 : 600};">${value}</td>
        </tr>`;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Insurance Receipt ${esc(r.receipt_number)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:#fff}
/* Watermark must survive printing, hence the colour-adjust hints. */
.void-mark{position:fixed;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-24deg);
  font-size:104px;font-weight:900;letter-spacing:10px;color:rgba(220,38,38,.13);
  border:9px solid rgba(220,38,38,.13);padding:10px 46px;border-radius:16px;
  pointer-events:none;z-index:999;white-space:nowrap;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{.no-print{display:none!important}@page{size:A4;margin:12mm}}
</style></head>
<body>
${isReversed ? '<div class="void-mark">REVERSED</div>' : ''}
<div style="max-width:820px;margin:0 auto;padding:28px;">
${isReversed ? `
    <div style="border:2px solid #dc2626;background:#fef2f2;border-radius:10px;padding:12px 16px;margin-bottom:18px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <p style="font-size:16px;font-weight:800;color:#b91c1c;letter-spacing:.5px;">THIS RECEIPT HAS BEEN REVERSED — NOT VALID AS PROOF OF PAYMENT</p>
        <p style="font-size:11.5px;color:#7f1d1d;margin-top:4px;">
            The settlement was undone: the bill(s) below were returned to outstanding and the payment entries voided.
            ${reversal?.at ? `Reversed on ${esc(fmtBillDate(reversal.at))}.` : ''}
        </p>
        ${reversal?.reason ? `<p style="font-size:11.5px;color:#7f1d1d;margin-top:3px;"><strong>Reason:</strong> ${esc(reversal.reason)}</p>` : ''}
        <p style="font-size:11px;color:#7f1d1d;margin-top:4px;">Retained for audit only. The figures below record what was reversed.</p>
    </div>` : ''}
    <div class="no-print" style="text-align:right;margin-bottom:14px;">
        <button onclick="window.print()" style="padding:10px 24px;background:${accent};color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Print / Save PDF</button>
    </div>

    <!-- Letterhead -->
    <div style="border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div>
            ${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="" onerror="this.style.display='none'" style="height:50px;max-width:200px;object-fit:contain;margin-bottom:8px;display:block;" />` : ''}
            <h1 style="font-size:21px;font-weight:800;color:${accent};">${esc(b.hospitalName)}</h1>
            ${b.hospitalAddress ? `<p style="font-size:11px;color:#6b7280;max-width:340px;">${esc(b.hospitalAddress)}</p>` : ''}
            <p style="font-size:11px;color:#6b7280;">${b.hospitalPhone ? `Phone: ${esc(b.hospitalPhone)}` : ''}${b.hospitalPhone && b.hospitalEmail ? ' | ' : ''}${b.hospitalEmail ? `Email: ${esc(b.hospitalEmail)}` : ''}</p>
            ${b.gstin && b.gstin !== 'N/A' ? `<p style="font-size:11px;color:#6b7280;">GSTIN: ${esc(b.gstin)}</p>` : ''}
        </div>
        <div style="text-align:right;">
            <div style="display:inline-block;border:2px solid ${accent};border-radius:8px;padding:8px 14px;">
                <p style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Insurance Receipt</p>
                <p style="font-size:15px;font-weight:800;color:${accent};font-family:monospace;">${esc(r.receipt_number)}</p>
            </div>
            <p style="font-size:11px;color:#6b7280;margin-top:6px;">Date: ${esc(fmtBillDate(r.receipt_date))}</p>
        </div>
    </div>

    <!-- Payer + instrument -->
    <div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:16px;">
        <table style="border-collapse:collapse;">
            ${kv('Received From', `<span style="font-weight:800;">${esc(payer)}</span>${r.provider?.provider_code ? ` <span style="color:#9ca3af;font-family:monospace;font-size:10px;">(${esc(r.provider.provider_code)})</span>` : ''}`)}
            ${kv('Payer Type', r.payer_type === 'tpa_insurance' ? 'TPA / Insurance' : 'Corporate')}
            ${kv('Status', isReversed
                ? `<span style="color:#b91c1c;font-weight:800;">REVERSED — VOID</span>`
                : esc(String(r.status || '').replace(/([a-z])([A-Z])/g, '$1 $2')))}
        </table>
        <table style="border-collapse:collapse;">
            ${kv('Instrument', esc(r.instrument || '—'))}
            ${kv('Reference / UTR', `<span style="font-family:monospace;">${esc(r.reference_number || '—')}</span>`)}
            ${kv('Amount Credited', inr(credited), true)}
        </table>
    </div>

    <!-- Settlement summary -->
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:16px;background:#f9fafb;">
        <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${accent};margin-bottom:8px;">Settlement Summary</p>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
            <tr>
                <td style="padding:3px 0;color:#6b7280;">Gross settled by payer</td>
                <td style="padding:3px 0;text-align:right;font-weight:700;">${inr(grossSettled)}</td>
                <td style="padding:3px 0 3px 28px;color:#6b7280;">TDS withheld</td>
                <td style="padding:3px 0;text-align:right;font-weight:700;">${inr(tds)}</td>
            </tr>
            <tr>
                <td style="padding:3px 0;color:#6b7280;">TPA service charge</td>
                <td style="padding:3px 0;text-align:right;font-weight:700;">${inr(serviceCharge)}</td>
                <td style="padding:3px 0 3px 28px;color:#6b7280;">Disallowed / short-pay</td>
                <td style="padding:3px 0;text-align:right;font-weight:700;color:#e11d48;">${inr(totDisallowed)}</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;">
                <td style="padding:6px 0 0;color:#111827;font-weight:800;">Amount credited to bank</td>
                <td style="padding:6px 0 0;text-align:right;font-weight:800;color:${accent};font-size:13px;">${inr(credited)}</td>
                <td style="padding:6px 0 0 28px;color:#6b7280;">Unmapped balance</td>
                <td style="padding:6px 0 0;text-align:right;font-weight:700;">${inr(r.unmapped_amount)}</td>
            </tr>
        </table>
        <p style="font-size:10.5px;color:#6b7280;margin-top:8px;font-style:italic;">${esc(numberToWords(credited))}</p>
    </div>

    <!-- Bill-wise application -->
    <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${accent};margin-bottom:6px;">Applied To Bills</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
            <tr style="background:${accent};color:#fff;">
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:left;">SR</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:left;">Bill No</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:left;">Patient</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:right;">Bill Amount</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:right;">Settled</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:right;">TDS</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:right;">In Bank</th>
                <th style="padding:7px 8px;border:1px solid ${accent};font-size:10px;text-align:right;">Disallowed</th>
            </tr>
        </thead>
        <tbody>
            ${rows || `<tr><td colspan="8" style="padding:18px;text-align:center;color:#9ca3af;border:1px solid #e5e7eb;font-size:11px;">This receipt is not yet mapped to any bill.</td></tr>`}
        </tbody>
        ${allocs.length ? `<tfoot>
            <tr style="background:#f1f5f9;font-weight:800;">
                <td colspan="3" style="padding:7px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">TOTAL</td>
                <td style="padding:7px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(allocs.reduce((s: number, a: any) => s + n(a.invoice?.net_amount), 0))}</td>
                <td style="padding:7px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(grossSettled)}</td>
                <td style="padding:7px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(lineTds)}</td>
                <td style="padding:7px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;">${inr(lineCash)}</td>
                <td style="padding:7px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:right;color:#e11d48;">${inr(totDisallowed)}</td>
            </tr>
        </tfoot>` : ''}
    </table>

    <p style="font-size:10px;color:#6b7280;margin-bottom:22px;">Settled = amount the payer allowed against the bill (TDS is withheld from it, so In Bank = Settled − TDS).</p>

    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px;">
        <p style="font-size:10px;color:${isReversed ? '#b91c1c' : '#9ca3af'};">${isReversed
            ? 'REVERSED — retained for audit only, not valid as proof of payment.'
            : 'Computer-generated receipt — no signature required unless stamped.'}</p>
        <div style="text-align:center;">
            <div style="height:38px;"></div>
            <p style="border-top:1px solid #9ca3af;padding-top:5px;font-size:11px;font-weight:700;min-width:190px;">${esc(b.signatureName || 'Authorised Signatory')}</p>
            <p style="font-size:10px;color:#6b7280;">${esc(b.signatureTitle || 'Insurance / TPA Desk')} — ${esc(b.hospitalName)}</p>
        </div>
    </div>

    ${b.footerText ? `<div style="border-top:1px solid #e5e7eb;margin-top:22px;padding-top:10px;text-align:center;"><p style="font-size:10px;color:#9ca3af;">${esc(b.footerText)}</p></div>` : ''}
</div>
</body></html>`;
}
