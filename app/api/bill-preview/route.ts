import { NextRequest, NextResponse } from 'next/server';
import { requireRoleAndTenant } from '@/backend/tenant';
import {
    getBillBranding,
    letterheadBackgroundHtml,
    letterheadCss,
    inlineHeaderHtml,
    billFooterHtml,
    printButtonHtml,
} from '@/app/lib/bill-branding';
import { getBillSections } from '@/app/lib/bill-sections';

export async function GET(req: NextRequest) {
    try {
        const { organizationId } = await requireRoleAndTenant(['admin']);
        const type = req.nextUrl.searchParams.get('type') || 'invoice';

        const branding = await getBillBranding(organizationId);
        const sections = await getBillSections(organizationId, type);

        const html = generatePreviewHTML(branding, sections, type);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Preview failed' }, { status: 500 });
    }
}

function generatePreviewHTML(branding: any, sections: any, type: string): string {
    const typeLabel = type.split('_').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ');
    const useLetterhead = type === 'invoice' || type === 'discharge_summary';
    const today = new Date().toLocaleDateString('en-GB');

    const rightHtml = `
        <h2 style="font-size:16px;font-weight:800;color:${branding.accentColor};">SAMPLE ${typeLabel.toUpperCase()}</h2>
        <p style="font-size:12px;font-weight:700;color:${branding.accentColor};">INV-PREVIEW-001</p>
        <p style="font-size:10px;color:#6b7280;">Date: ${today}</p>
        <p style="font-size:10px;color:#6b7280;">GSTIN: ${branding.gstin}</p>
    `;

    const patientHtml = sections.showPatientInfo ? `
        <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:20px;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                <p style="font-size:12px;"><strong>Name:</strong> John Doe</p>
                <p style="font-size:12px;"><strong>UHID:</strong> HOSP-00001</p>
                <p style="font-size:12px;"><strong>Age/Gender:</strong> 45 / Male</p>
                <p style="font-size:12px;"><strong>Phone:</strong> +91 98765 43210</p>
                <p style="font-size:12px;"><strong>Doctor:</strong> Dr. Sample Doctor</p>
                <p style="font-size:12px;"><strong>Department:</strong> General Medicine</p>
            </div>
        </div>` : '';

    const itemsHtml = sections.showLineItems ? `
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead><tr style="background:#f3f4f6;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:#6b7280;">Description</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:#6b7280;">Qty</th>
                <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;">Rate</th>
                <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;">Total</th>
            </tr></thead>
            <tbody>
                <tr><td style="padding:6px 12px;font-size:11px;border-bottom:1px solid #f3f4f6;">Consultation Fee</td><td style="padding:6px 12px;font-size:11px;text-align:center;border-bottom:1px solid #f3f4f6;">1</td><td style="padding:6px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;">500.00</td><td style="padding:6px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;">500.00</td></tr>
                <tr><td style="padding:6px 12px;font-size:11px;border-bottom:1px solid #f3f4f6;">Blood Test - CBC</td><td style="padding:6px 12px;font-size:11px;text-align:center;border-bottom:1px solid #f3f4f6;">1</td><td style="padding:6px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;">350.00</td><td style="padding:6px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;">350.00</td></tr>
                <tr><td style="padding:6px 12px;font-size:11px;border-bottom:1px solid #f3f4f6;">X-Ray Chest PA</td><td style="padding:6px 12px;font-size:11px;text-align:center;border-bottom:1px solid #f3f4f6;">1</td><td style="padding:6px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;">800.00</td><td style="padding:6px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;">800.00</td></tr>
            </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
            <table style="width:320px;border-collapse:collapse;">
                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Subtotal</td><td style="padding:5px 12px;font-size:12px;text-align:right;">₹1,650.00</td></tr>
                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">CGST (9%)</td><td style="padding:5px 12px;font-size:12px;text-align:right;">₹148.50</td></tr>
                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">SGST (9%)</td><td style="padding:5px 12px;font-size:12px;text-align:right;">₹148.50</td></tr>
                <tr style="border-top:2px solid #1f2937;"><td style="padding:8px 12px;font-size:14px;font-weight:800;">Net Amount</td><td style="padding:8px 12px;font-size:14px;text-align:right;font-weight:800;">₹1,947.00</td></tr>
            </table>
        </div>` : '';

    const amountWordsHtml = sections.showAmountInWords ? `
        <div style="background:#f0fdf4;border-radius:6px;padding:10px 14px;margin-bottom:16px;">
            <p style="font-size:11px;color:#059669;"><strong>Amount in Words:</strong> Rupees One Thousand Nine Hundred Forty Seven Only</p>
        </div>` : '';

    if (useLetterhead) {
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Preview - ${typeLabel}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
    ${letterheadCss(branding)}
    .watermark { color: ${branding.accentColor}; }
</style>
</head><body>
    ${letterheadBackgroundHtml(branding)}
    <div class="watermark">PREVIEW</div>
    ${printButtonHtml(branding, 'This is a preview with sample data')}
    <table class="print-layout-table">
        <thead><tr><td class="print-layout-header-spacer"></td></tr></thead>
        <tbody><tr><td>
            <div class="bill-container">
                <div style="display:flex;justify-content:flex-end;border-bottom:2px solid ${branding.accentColor};padding-bottom:12px;margin-bottom:20px;">
                    <div style="text-align:right;">${rightHtml}</div>
                </div>
                ${patientHtml}
                ${itemsHtml}
                ${amountWordsHtml}
                ${sections.showFooter ? billFooterHtml(branding) : ''}
            </div>
        </td></tr></tbody>
        <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
    </table>
</body></html>`;
    }

    // Non-letterhead preview (inline header)
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Preview - ${typeLabel}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
    @media print { body { margin: 0; } .no-print { display: none !important; } }
</style>
</head><body>
    ${printButtonHtml(branding, 'This is a preview with sample data')}
    <div style="max-width:800px;margin:0 auto;padding:30px;">
        ${inlineHeaderHtml(branding, rightHtml)}
        ${patientHtml}
        ${itemsHtml}
        ${amountWordsHtml}
        ${sections.showFooter ? billFooterHtml(branding) : ''}
    </div>
</body></html>`;
}
