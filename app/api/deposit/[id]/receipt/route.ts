import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getSignedDownloadUrl } from '@/app/lib/s3';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({});
        if (!auth.ok) return auth.response;

        const { id } = await params;
        const depositId = parseInt(id);
        if (isNaN(depositId)) {
            return NextResponse.json({ error: 'Invalid deposit ID' }, { status: 400 });
        }

        const deposit = await prisma.patientDeposit.findFirst({
            where: { id: depositId, organizationId: auth.context.organizationId },
        });

        if (!deposit) {
            return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
        }

        const [patient, org] = await Promise.all([
            prisma.oPD_REG.findFirst({
                where: { patient_id: deposit.patient_id, organizationId: auth.context.organizationId },
                select: { full_name: true, patient_id: true, phone: true, age: true, gender: true },
            }),
            prisma.organization.findUnique({
                where: { id: auth.context.organizationId },
                include: { branding: true },
            }),
        ]);

        const logoKey = org?.branding?.logo_url || org?.logo_url || '';
        let logoSignedUrl = '';
        if (logoKey) {
            if (logoKey.startsWith('/') || logoKey.startsWith('http')) {
                logoSignedUrl = logoKey;
            } else {
                try { logoSignedUrl = await getSignedDownloadUrl(logoKey, 3600); } catch {}
            }
        }

        const html = generateDepositReceiptHTML(deposit, patient, org, logoSignedUrl);
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Deposit receipt generation error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate receipt' }, { status: 500 });
    }
}

function numberToWords(n: number): string {
    if (n === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convert(num: number): string {
        if (num < 20) return ones[num];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
        if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
        if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
        return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    }

    const rupees = Math.floor(n);
    const paise = Math.round((n - rupees) * 100);
    let result = 'Rupees ' + convert(rupees);
    if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
    return result + ' Only';
}

function generateDepositReceiptHTML(deposit: any, patient: any, org: any, logoSignedUrl = '') {
    const amount = Number(deposit.amount || 0);
    const depositDate = deposit.created_at
        ? new Date(deposit.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        : '';

    const hospitalName = org?.name || 'Hospital';
    const hospitalAddress = org?.address || '';
    const hospitalPhone = org?.phone || '';
    const hospitalEmail = org?.email || '';
    const gstin = org?.registration_number || '';
    const primaryColor = org?.branding?.primary_color || '#10b981';

    const available = amount - Number(deposit.applied_amount || 0) - Number(deposit.refunded_amount || 0);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Deposit Receipt ${deposit.deposit_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div style="max-width: 700px; margin: 0 auto; padding: 32px;">
        <!-- Print Button -->
        <div class="no-print" style="text-align:right;margin-bottom:16px;">
            <button onclick="window.print()" style="padding:10px 24px;background:${primaryColor};color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">
                Print Receipt
            </button>
        </div>

        <!-- Header -->
        <div style="border-bottom:3px solid ${primaryColor};padding-bottom:20px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    ${logoSignedUrl ? `<img src="${logoSignedUrl}" alt="${hospitalName}" style="height:56px;max-width:200px;object-fit:contain;margin-bottom:8px;display:block;" />` : ''}
                    <h1 style="font-size:22px;font-weight:800;color:${primaryColor};margin-bottom:4px;">${hospitalName}</h1>
                    ${hospitalAddress ? `<p style="font-size:11px;color:#6b7280;max-width:280px;">${hospitalAddress}</p>` : ''}
                    <p style="font-size:11px;color:#6b7280;">
                        ${hospitalPhone ? `Phone: ${hospitalPhone}` : ''}${hospitalPhone && hospitalEmail ? ' | ' : ''}${hospitalEmail ? `Email: ${hospitalEmail}` : ''}
                    </p>
                    ${gstin ? `<p style="font-size:11px;color:#6b7280;">GSTIN: ${gstin}</p>` : ''}
                </div>
                <div style="text-align:right;">
                    <h2 style="font-size:18px;font-weight:800;color:#1f2937;margin-bottom:4px;">DEPOSIT RECEIPT</h2>
                    <p style="font-size:13px;font-weight:700;color:${primaryColor};font-family:monospace;">${deposit.deposit_number}</p>
                    <p style="font-size:11px;color:#6b7280;margin-top:4px;">${depositDate}</p>
                </div>
            </div>
        </div>

        <!-- Patient Details -->
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:24px;">
            <table style="width:100%;">
                <tr>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;font-weight:600;width:140px;">Patient Name</td>
                    <td style="padding:4px 16px;font-size:13px;font-weight:700;">${patient?.full_name || '-'}</td>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;font-weight:600;width:100px;">UHID</td>
                    <td style="padding:4px 16px;font-size:13px;font-family:monospace;">${deposit.patient_id}</td>
                </tr>
                <tr>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;font-weight:600;">Phone</td>
                    <td style="padding:4px 16px;font-size:13px;">${patient?.phone || '-'}</td>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;font-weight:600;">Age / Gender</td>
                    <td style="padding:4px 16px;font-size:13px;">${patient?.age || '-'} / ${patient?.gender || '-'}</td>
                </tr>
                ${deposit.admission_id ? `<tr>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;font-weight:600;">Admission ID</td>
                    <td style="padding:4px 16px;font-size:13px;font-family:monospace;" colspan="3">${deposit.admission_id}</td>
                </tr>` : ''}
            </table>
        </div>

        <!-- Deposit Details -->
        <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <div style="background:${primaryColor};padding:10px 16px;">
                <h3 style="font-size:13px;font-weight:700;color:#fff;">Deposit Details</h3>
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="padding:8px 16px;font-size:12px;color:#6b7280;font-weight:600;width:180px;border-bottom:1px solid #f3f4f6;">Payment Method</td>
                    <td style="padding:8px 16px;font-size:12px;font-weight:600;border-bottom:1px solid #f3f4f6;">${deposit.payment_method}</td>
                </tr>
                ${deposit.payment_ref ? `<tr>
                    <td style="padding:8px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #f3f4f6;">Reference</td>
                    <td style="padding:8px 16px;font-size:12px;border-bottom:1px solid #f3f4f6;font-family:monospace;">${deposit.payment_ref}</td>
                </tr>` : ''}
                <tr>
                    <td style="padding:8px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #f3f4f6;">Collected By</td>
                    <td style="padding:8px 16px;font-size:12px;border-bottom:1px solid #f3f4f6;">${deposit.collected_by || '-'}</td>
                </tr>
                <tr>
                    <td style="padding:8px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #f3f4f6;">Status</td>
                    <td style="padding:8px 16px;font-size:12px;border-bottom:1px solid #f3f4f6;">
                        <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46;">${deposit.status}</span>
                    </td>
                </tr>
                ${deposit.notes ? `<tr>
                    <td style="padding:8px 16px;font-size:12px;color:#6b7280;font-weight:600;">Notes</td>
                    <td style="padding:8px 16px;font-size:12px;">${deposit.notes}</td>
                </tr>` : ''}
            </table>
        </div>

        <!-- Amount Box -->
        <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="font-size:12px;color:#6b7280;font-weight:600;margin-bottom:4px;">DEPOSIT AMOUNT RECEIVED</p>
            <p style="font-size:32px;font-weight:800;color:#065f46;">&#8377;${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p style="font-size:11px;color:#6b7280;margin-top:6px;font-style:italic;">${numberToWords(amount)}</p>
        </div>

        <!-- Balance Summary -->
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:24px;">
            <h4 style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">Deposit Summary</h4>
            <table style="width:100%;">
                <tr>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;">Total Deposited</td>
                    <td style="padding:4px 16px;font-size:12px;text-align:right;font-weight:600;">&#8377;${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;">Applied to Bills</td>
                    <td style="padding:4px 16px;font-size:12px;text-align:right;font-weight:600;color:#d97706;">&#8377;${Number(deposit.applied_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                    <td style="padding:4px 16px;font-size:12px;color:#6b7280;">Refunded</td>
                    <td style="padding:4px 16px;font-size:12px;text-align:right;font-weight:600;color:#d97706;">&#8377;${Number(deposit.refunded_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr style="border-top:1px solid #e5e7eb;">
                    <td style="padding:6px 16px;font-size:12px;font-weight:700;color:#374151;">Available Balance</td>
                    <td style="padding:6px 16px;font-size:13px;text-align:right;font-weight:800;color:${available > 0 ? '#059669' : '#6b7280'};">&#8377;${available.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
            </table>
        </div>

        <!-- Footer -->
        <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;">
            <p style="font-size:11px;color:#9ca3af;">This is a computer-generated deposit receipt and does not require a signature.</p>
            <p style="font-size:11px;color:#9ca3af;margin-top:4px;">${hospitalName}${hospitalPhone ? ` | ${hospitalPhone}` : ''}${hospitalEmail ? ` | ${hospitalEmail}` : ''}</p>
        </div>
    </div>
</body>
</html>`;
}
