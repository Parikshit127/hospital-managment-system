import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding, fmtBillDateTime } from '@/app/lib/bill-branding';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({});
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { id } = await params;
        const refundId = parseInt(id, 10);
        if (isNaN(refundId)) return NextResponse.json({ error: 'Invalid refund ID' }, { status: 400 });

        const refund = await prisma.refund.findFirst({
            where: { id: refundId, organizationId },
        });
        if (!refund) return NextResponse.json({ error: 'Refund not found' }, { status: 404 });

        const invoice = await prisma.invoices.findFirst({
            where: { id: parseInt(refund.invoice_id, 10), organizationId },
            include: {
                patient: {
                    select: {
                        full_name: true,
                        patient_id: true,
                        phone: true,
                        age: true,
                        gender: true,
                    },
                },
            },
        });

        const payment = refund.payment_id
            ? await prisma.payments.findFirst({
                where: { id: parseInt(refund.payment_id, 10), organizationId },
            })
            : null;

        const branding = await getBillBranding(organizationId);
        return new NextResponse(refundReceiptHTML(refund, invoice, payment, branding), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Refund receipt print error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate refund receipt' }, { status: 500 });
    }
}

const n = (v: any) => Number(v || 0);
const inr = (v: any) => '₹' + n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

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

function refundReceiptHTML(refund: any, invoice: any, payment: any, branding: any): string {
    const accent = branding.accentColor || '#1e3a6e';
    const refundNo = 'REF-' + String(refund.id).padStart(5, '0');
    const patientName = invoice?.patient?.full_name || 'Patient';
    const patientId = invoice?.patient?.patient_id || refund.invoice_id || '—';
    const phone = invoice?.patient?.phone || '—';
    const ageGender = [invoice?.patient?.age ? invoice.patient.age + ' Y' : '', invoice?.patient?.gender || ''].filter(Boolean).join(' / ') || '—';
    const refundAmount = n(refund.amount);
    const refundMode = refund.payment_method || 'Cash';
    const originalReceipt = payment?.receipt_number || refund.payment_id || '—';
    const originalInvoice = invoice?.final_bill_number || invoice?.invoice_number || ('INV-' + refund.invoice_id);
    const processedBy = refund.processed_by || 'Staff';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Refund Receipt ${esc(refundNo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #1e293b; background: #f8fafc; line-height: 1.4; }
  .page { max-width: 780px; margin: 20px auto; background: #fff; border-radius: 12px; padding: 32px 36px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
  .btn-print { padding: 9px 20px; background: ${accent}; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${accent}; padding-bottom: 16px; margin-bottom: 20px; }
  .hospital-name { font-size: 22px; font-weight: 800; color: ${accent}; }
  .hospital-meta { font-size: 11px; color: #64748b; margin-top: 3px; max-width: 380px; }
  .badge-voucher { border: 2px solid ${accent}; border-radius: 8px; padding: 8px 16px; text-align: right; background: #f8fafc; }
  .voucher-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: ${accent}; }
  .voucher-no { font-size: 16px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 2px; }
  .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
  .info-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${accent}; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .table-kv { width: 100%; border-collapse: collapse; font-size: 12px; }
  .table-cv td { padding: 4px 0; }
  .table-kv td.label { color: #64748b; width: 42%; }
  .table-kv td.val { color: #0f172a; font-weight: 600; }
  .amount-card { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1.5px solid #86efac; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .amount-label { font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; }
  .amount-val { font-size: 26px; font-weight: 900; color: #15803d; }
  .amount-words { font-size: 11.5px; color: #14532d; font-style: italic; margin-top: 4px; }
  .mode-badge { background: #166534; color: #fff; font-size: 12px; font-weight: 800; padding: 5px 14px; border-radius: 20px; display: inline-block; }
  .details-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 12px; margin-bottom: 28px; background: #fff; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
  .sig-block { text-align: center; min-width: 180px; }
  .sig-line { border-top: 1.5px solid #334155; padding-top: 5px; font-weight: 700; color: #0f172a; }
  @media print {
    body { background: #fff; color: #000; }
    .page { margin: 0; padding: 12mm 14mm; box-shadow: none; border: none; max-width: 100%; }
    .no-print { display: none !important; }
    @page { size: A4 portrait; margin: 8mm; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
<div class="page">
<div class="no-print" style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
  <button class="btn-print" onclick="window.print()">Print Receipt</button>
</div>
<div class="header">
<div>
  ${branding.logoUrl ? `<img src="${esc(branding.logoUrl)}" alt="Logo" style="max-height:48px; max-width:180px; object-fit:contain; margin-bottom:6px; display:block;" />` : ''}
  <h1 class="hospital-name">${esc(branding.hospitalName)}</h1>
<p class="hospital-meta">${esc(branding.hospitalAddress)}</p>
<p class="hospital-meta">${branding.hospitalPhone ? `Phone: ${esc(branding.hospitalPhone)}` : ''}${branding.hospitalEmail ? ` | Email: ${esc(branding.hospitalEmail)}` : ''}</p>
</div>
<div class="badge-voucher">
  <p class="voucher-title">Refund Voucher</p>
  <p class="voucher-no">${esc(refundNo)}</p>
  <p style="font-size:11px;color:#64748b;margin-top:4px;">${esc(fmtBillDateTime(refund.created_at))}</p>
</div>
</div>
<div class="card-grid">
<div class="info-card">
  <p class="info-title">Patient Details</p>
<table class="table-kv">
  <tr><td class="label">Patient Name:</td><td class="val">${esc(patientName)}</td></tr>
  <tr><td class="label">UHID:</td><td class="val" style="font-family:monospace;">${esc(patientId)}</td></tr>
  <tr><td class="label">Phone:</td><td class="val">${esc(phone)}</td></tr>
  <tr><td class="label">Age / Gender:</td><td class="val">${esc(ageGender)}</td></tr>
</table>
</div>
<div class="info-card">
<p class="info-title">Original Bill Details</p>
<table class="table-kv">
  <tr><td class="label">Bill / Invoice No:</td><td class="val" style="font-family:monospace;">${esc(originalInvoice)}</td></tr>
  <tr><td class="label">Original Receipt:</td><td class="val" style="font-family:monospace;">${esc((originalReceipt))}</td></tr>
  <tr><td class="label">Original Mode:</td><td class="val">${esc(payment?.payment_method || '—')}</td></tr>
  <tr><td class="label">Processed By:</td><td class="val">${esc(processedBy)}</td></tr>
</table>
</div>
</div>
<div class="amount-card">
<div>
  <p class="amount-label">Refund Amount Paid</p>
  <p class="amount-val">${inr(refundAmount)}</p>
  <p class="amount-words">${esc(numberToWords(refundAmount))}</p>
</div>
<div style="text-align: right;">
  <p style="font-size:10px; color:#166534; font-weight:800; text-transform:uppercase; margin-bottom:4px;">Refund Payout Mode</p>
  <span class="mode-badge">${esc(refundMode)}</span>
</div>
</div>
<div class="details-box">
  <strong>Reason for Refund:</strong> ${esc(refund.reason || 'Patient overcharge / adjustment')}
</div>
<div class="footer">
<div><br><p>Computer-generated receipt. Retain this copy for your financial records.</p></div>
<div class="sig-block">
  <div style="height: 35px;"></div>
  <p class="sig-line">Authorised Signatory</p>
  <p style="font-size:10px; color:#64748b; margin-top:2px;">Billing / Finance Desk</p>
</div>
</div>
</div>
</body>
</html>`; 
}

