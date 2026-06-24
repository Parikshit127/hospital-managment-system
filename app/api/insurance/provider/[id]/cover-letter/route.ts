import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getSignedDownloadUrl } from '@/app/lib/s3';

// Printable claim-submission cover letter for a TPA / insurance provider.
// Lists the provider's outstanding TPA bills (optionally within a date range)
// with their claim amounts and a total, on the hospital letterhead. Opens in a
// new tab with a Print button (save-as-PDF from the browser).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({});
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { id } = await params;
        const providerId = parseInt(id);
        if (isNaN(providerId)) return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });

        const url = new URL(req.url);
        const from = url.searchParams.get('from') || '';
        const to = url.searchParams.get('to') || '';

        const where: any = {
            organizationId,
            billing_patient_type: 'tpa_insurance',
            tpa_provider_id: providerId,
            tpa_payable: { gt: 0 },
        };
        if (from || to) {
            where.created_at = {};
            if (from) where.created_at.gte = new Date(from);
            if (to) where.created_at.lte = new Date(`${to}T23:59:59.999`);
        }

        const [provider, org, invoices] = await Promise.all([
            prisma.insurance_providers.findFirst({ where: { id: providerId, organizationId } }),
            prisma.organization.findUnique({ where: { id: organizationId }, include: { branding: true } }),
            prisma.invoices.findMany({
                where,
                select: {
                    id: true, invoice_number: true, created_at: true,
                    tpa_claim_number: true, tpa_payable: true, net_amount: true,
                    patient: { select: { full_name: true, patient_id: true } },
                },
                orderBy: { created_at: 'asc' },
                take: 2000,
            }),
        ]);

        if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

        let logoSignedUrl = '';
        const logoKey = org?.branding?.logo_url || org?.logo_url || '';
        if (logoKey) {
            if (logoKey.startsWith('/') || logoKey.startsWith('http')) logoSignedUrl = logoKey;
            else { try { logoSignedUrl = await getSignedDownloadUrl(logoKey, 3600); } catch {} }
        }

        const html = coverLetterHTML({ provider, org, invoices, logoSignedUrl, from, to });
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error: any) {
        console.error('Cover letter generation error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate cover letter' }, { status: 500 });
    }
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const d = (x: any) => x ? new Date(x).toLocaleDateString('en-GB') : '';

function coverLetterHTML({ provider, org, invoices, logoSignedUrl, from, to }: any) {
    const hospitalName = org?.name || 'Hospital';
    const hospitalAddress = org?.address || '';
    const hospitalPhone = org?.phone || '';
    const hospitalEmail = org?.email || '';
    const gstin = org?.registration_number || '';
    const primary = org?.branding?.primary_color || '#2563eb';
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    const total = invoices.reduce((s: number, i: any) => s + Number(i.tpa_payable || 0), 0);
    const period = from || to ? `${from ? d(from) : '…'} to ${to ? d(to) : '…'}` : 'All outstanding';

    const rows = invoices.map((inv: any, i: number) => `
        <tr>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;">${i + 1}</td>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;font-family:monospace;">${esc(inv.invoice_number)}</td>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;">${d(inv.created_at)}</td>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;">${esc(inv.patient?.full_name || '')}<br><span style="color:#9ca3af;font-size:10px;font-family:monospace;">${esc(inv.patient?.patient_id || '')}</span></td>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;font-family:monospace;">${esc(inv.tpa_claim_number || '—')}</td>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;text-align:right;">${inr(inv.tpa_payable)}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Claim Cover Letter — ${esc(provider.provider_name)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI', Arial, sans-serif; color:#1f2937; background:#fff; }
@media print { .no-print { display:none !important; } }
</style>
</head>
<body>
<div style="max-width:820px;margin:0 auto;padding:32px;">
    <div class="no-print" style="text-align:right;margin-bottom:16px;">
        <button onclick="window.print()" style="padding:10px 24px;background:${primary};color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Print / Save PDF</button>
    </div>

    <!-- Letterhead -->
    <div style="border-bottom:3px solid ${primary};padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
            ${logoSignedUrl ? `<img src="${esc(logoSignedUrl)}" alt="${esc(hospitalName)}" style="height:52px;max-width:200px;object-fit:contain;margin-bottom:8px;display:block;" />` : ''}
            <h1 style="font-size:22px;font-weight:800;color:${primary};">${esc(hospitalName)}</h1>
            ${hospitalAddress ? `<p style="font-size:11px;color:#6b7280;max-width:320px;">${esc(hospitalAddress)}</p>` : ''}
            <p style="font-size:11px;color:#6b7280;">${hospitalPhone ? `Phone: ${esc(hospitalPhone)}` : ''}${hospitalPhone && hospitalEmail ? ' | ' : ''}${hospitalEmail ? `Email: ${esc(hospitalEmail)}` : ''}</p>
            ${gstin ? `<p style="font-size:11px;color:#6b7280;">GSTIN: ${esc(gstin)}</p>` : ''}
        </div>
        <div style="text-align:right;font-size:11px;color:#6b7280;">Date: ${today}</div>
    </div>

    <!-- Addressee -->
    <div style="margin-bottom:18px;font-size:13px;line-height:1.6;">
        <p style="font-weight:700;">To,</p>
        <p style="font-weight:700;">${esc(provider.provider_name)}</p>
        ${provider.address ? `<p style="color:#4b5563;">${esc(provider.address)}</p>` : ''}
        ${provider.contact_email ? `<p style="color:#4b5563;">${esc(provider.contact_email)}</p>` : ''}
    </div>

    <p style="font-size:13px;font-weight:700;margin-bottom:12px;">Subject: Submission of insurance claim bills for settlement (${esc(period)})</p>

    <p style="font-size:13px;line-height:1.7;margin-bottom:16px;">Dear Sir/Madam,</p>
    <p style="font-size:13px;line-height:1.7;margin-bottom:18px;">
        Please find enclosed the following ${invoices.length} bill(s) submitted for claim settlement under the cashless/reimbursement arrangement.
        We request you to process the same and remit the sanctioned amount at the earliest.
    </p>

    <!-- Bills table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <thead>
            <tr style="background:${primary};color:#fff;">
                <th style="padding:8px 10px;border:1px solid ${primary};font-size:11px;text-align:left;">SR</th>
                <th style="padding:8px 10px;border:1px solid ${primary};font-size:11px;text-align:left;">Invoice No</th>
                <th style="padding:8px 10px;border:1px solid ${primary};font-size:11px;text-align:left;">Date</th>
                <th style="padding:8px 10px;border:1px solid ${primary};font-size:11px;text-align:left;">Patient</th>
                <th style="padding:8px 10px;border:1px solid ${primary};font-size:11px;text-align:left;">Claim No</th>
                <th style="padding:8px 10px;border:1px solid ${primary};font-size:11px;text-align:right;">Claim Amount</th>
            </tr>
        </thead>
        <tbody>
            ${rows || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af;border:1px solid #e5e7eb;">No outstanding bills for this provider in the selected period.</td></tr>`}
        </tbody>
        <tfoot>
            <tr style="background:#f9fafb;font-weight:800;">
                <td colspan="5" style="padding:9px 10px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">Total</td>
                <td style="padding:9px 10px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">${inr(total)}</td>
            </tr>
        </tfoot>
    </table>

    <p style="font-size:13px;line-height:1.7;margin-bottom:28px;">Kindly acknowledge receipt of this submission. For any clarification, please contact our TPA/billing desk.</p>

    <div style="margin-top:36px;font-size:13px;">
        <p>Yours faithfully,</p>
        <p style="margin-top:28px;font-weight:700;">For ${esc(hospitalName)}</p>
        <p style="color:#6b7280;font-size:11px;">(Authorised Signatory — Insurance / TPA Desk)</p>
    </div>

    <div style="border-top:1px solid #e5e7eb;margin-top:28px;padding-top:12px;text-align:center;">
        <p style="font-size:10px;color:#9ca3af;">Computer-generated cover letter · ${esc(hospitalName)}</p>
    </div>
</div>
</body>
</html>`;
}
