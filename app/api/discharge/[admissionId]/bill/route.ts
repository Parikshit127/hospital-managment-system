import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { admissionId } = await params;

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId: auth.context.organizationId },
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true, address: true } },
                ward: { select: { ward_name: true, ward_type: true } },
                bed: { select: { bed_id: true } },
            },
        });

        if (!admission) return NextResponse.json({ error: 'Admission not found' }, { status: 404 });

        const invoice = await prisma.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
            include: {
                items: { orderBy: { created_at: 'asc' } },
                payments: { where: { status: { not: 'Reversed' } }, orderBy: { created_at: 'desc' } },
            },
            orderBy: { created_at: 'desc' },
        });

        if (!invoice) return NextResponse.json({ error: 'No invoice found' }, { status: 404 });

        const org = await prisma.organization.findUnique({
            where: { id: auth.context.organizationId },
        });

        const deposits = await prisma.patientDeposit.findMany({
            where: { patient_id: admission.patient_id },
        });

        const isFinal = admission.status === 'Discharged';
        const html = generateDischargeBillHTML(admission, invoice, org, deposits, isFinal);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Discharge bill error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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

function generateDischargeBillHTML(admission: any, invoice: any, org: any, deposits: any[], isFinal: boolean) {
    const patient = admission.patient || {};
    const items = invoice.items || [];
    const payments = invoice.payments || [];

    const hospitalName = org?.name || 'Hospital';
    const hospitalAddress = org?.address || '';
    const gstin = org?.registration_number || 'N/A';

    const admissionDate = new Date(admission.admission_date).toLocaleDateString('en-IN');
    const dischargeDate = admission.discharge_date ? new Date(admission.discharge_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
    const los = Math.max(1, Math.ceil((new Date(admission.discharge_date || new Date()).getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)));

    const total = Number(invoice.total_amount || 0);
    const totalDiscount = Number(invoice.total_discount || 0);
    const totalTax = Number(invoice.total_tax || 0);
    const net = Number(invoice.net_amount || 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_due || 0);

    // Group items
    const categoryMap: Record<string, { items: any[]; total: number }> = {};
    for (const item of items) {
        const cat = item.service_category || item.department || 'Other';
        if (!categoryMap[cat]) categoryMap[cat] = { items: [], total: 0 };
        categoryMap[cat].items.push(item);
        categoryMap[cat].total += Number(item.net_price) + Number(item.tax_amount || 0);
    }

    let itemRows = '';
    for (const [cat, data] of Object.entries(categoryMap)) {
        itemRows += `<tr style="background:#f0fdf4;"><td colspan="7" style="padding:5px 12px;font-size:11px;font-weight:700;color:#059669;">${cat} — ${data.total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>`;
        for (const item of data.items) {
            itemRows += `<tr>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;">${item.description}</td>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#9ca3af;">${item.hsn_sac_code || '-'}</td>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;text-align:center;">${item.quantity}</td>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;text-align:right;">${Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;text-align:center;">${Number(item.tax_rate || 0)}%</td>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;text-align:right;">${Number(item.tax_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;text-align:right;font-weight:600;">${(Number(item.net_price) + Number(item.tax_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>`;
        }
    }

    const depositTotal = deposits.reduce((s, d) => s + Number(d.applied_amount || 0), 0);

    const paymentRows = payments.map((p: any) => `<tr>
        <td style="padding:4px 12px;font-size:10px;">${p.receipt_number}</td>
        <td style="padding:4px 12px;font-size:10px;">${p.payment_method}</td>
        <td style="padding:4px 12px;font-size:10px;text-align:right;">${Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:4px 12px;font-size:10px;">${new Date(p.created_at).toLocaleDateString('en-IN')}</td>
    </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${isFinal ? 'FINAL' : 'INTERIM'} BILL - ${admission.admission_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        @media print { body { margin: 0; } .no-print { display: none !important; } .watermark { opacity: 0.06; } }
        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; font-weight: 900; color: ${isFinal ? '#059669' : '#f59e0b'}; opacity: 0.04; pointer-events: none; z-index: 0; }
    </style>
</head>
<body>
    <div class="watermark">${isFinal ? 'FINAL BILL' : 'INTERIM'}</div>

    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:#059669;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Print / Download PDF</button>
    </div>

    <div style="max-width:800px;margin:0 auto;padding:30px;position:relative;z-index:1;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;border-bottom:3px solid #059669;padding-bottom:14px;margin-bottom:20px;">
            <div>
                <h1 style="font-size:22px;font-weight:900;color:#059669;">${hospitalName}</h1>
                <p style="font-size:10px;color:#6b7280;">${hospitalAddress}</p>
                <p style="font-size:10px;color:#9ca3af;">GSTIN: ${gstin}</p>
            </div>
            <div style="text-align:right;">
                <h2 style="font-size:16px;font-weight:800;color:${isFinal ? '#059669' : '#f59e0b'};">${isFinal ? 'FINAL BILL' : 'INTERIM BILL'}</h2>
                <p style="font-size:12px;font-weight:700;">${invoice.invoice_number}</p>
                <p style="font-size:10px;color:#6b7280;">Date: ${new Date().toLocaleDateString('en-IN')}</p>
            </div>
        </div>

        <!-- Patient & Admission -->
        <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;">
                <p style="font-size:11px;"><strong>Patient:</strong> ${patient.full_name}</p>
                <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id}</p>
                <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                <p style="font-size:11px;"><strong>Admission ID:</strong> ${admission.admission_id}</p>
                <p style="font-size:11px;"><strong>Doctor:</strong> ${admission.doctor_name || '-'}</p>
                <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
                <p style="font-size:11px;"><strong>Admitted:</strong> ${admissionDate}</p>
                <p style="font-size:11px;"><strong>Discharged:</strong> ${isFinal ? dischargeDate : 'N/A'}</p>
                <p style="font-size:11px;"><strong>LOS:</strong> ${los} day(s)</p>
                <p style="font-size:11px;"><strong>Diagnosis:</strong> ${admission.diagnosis || '-'}</p>
            </div>
        </div>

        <!-- Charges -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
            <thead><tr style="background:#f3f4f6;">
                <th style="padding:6px 12px;text-align:left;font-size:9px;font-weight:800;color:#6b7280;">Description</th>
                <th style="padding:6px 12px;text-align:left;font-size:9px;font-weight:800;color:#6b7280;">SAC/HSN</th>
                <th style="padding:6px 12px;text-align:center;font-size:9px;font-weight:800;color:#6b7280;">Qty</th>
                <th style="padding:6px 12px;text-align:right;font-size:9px;font-weight:800;color:#6b7280;">Rate</th>
                <th style="padding:6px 12px;text-align:center;font-size:9px;font-weight:800;color:#6b7280;">GST%</th>
                <th style="padding:6px 12px;text-align:right;font-size:9px;font-weight:800;color:#6b7280;">GST Amt</th>
                <th style="padding:6px 12px;text-align:right;font-size:9px;font-weight:800;color:#6b7280;">Total</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
        </table>

        <!-- Totals -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
            <table style="width:300px;border-collapse:collapse;">
                <tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">Subtotal</td><td style="padding:4px 12px;font-size:11px;text-align:right;">${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                ${totalDiscount > 0 ? `<tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">Discount</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#dc2626;">-${totalDiscount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                ${totalTax > 0 ? `<tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">Total GST</td><td style="padding:4px 12px;font-size:11px;text-align:right;">${totalTax.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                <tr style="border-top:2px solid #1f2937;"><td style="padding:6px 12px;font-size:13px;font-weight:800;">Net Amount</td><td style="padding:6px 12px;font-size:13px;text-align:right;font-weight:800;">${net.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                ${depositTotal > 0 ? `<tr><td style="padding:4px 12px;font-size:11px;color:#7c3aed;">Deposits Applied</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#7c3aed;">-${depositTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                <tr><td style="padding:4px 12px;font-size:11px;color:#059669;">Total Paid</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#059669;">${paid.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                ${balance > 0 ? `<tr style="background:#fef2f2;"><td style="padding:6px 12px;font-size:12px;font-weight:800;color:#dc2626;">Balance Due</td><td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:800;color:#dc2626;">${balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : `<tr style="background:#f0fdf4;"><td style="padding:6px 12px;font-size:12px;font-weight:800;color:#059669;">FULLY PAID</td><td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:800;color:#059669;">&#10003;</td></tr>`}
            </table>
        </div>

        <div style="background:#f0fdf4;border-radius:6px;padding:8px 14px;margin-bottom:14px;">
            <p style="font-size:10px;color:#059669;"><strong>Amount in Words:</strong> ${numberToWords(net)}</p>
        </div>

        ${payments.length > 0 ? `
        <div style="margin-bottom:14px;">
            <h3 style="font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Payments</h3>
            <table style="width:100%;border-collapse:collapse;background:#f9fafb;">
                <thead><tr>
                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:#6b7280;">Receipt</th>
                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:#6b7280;">Method</th>
                    <th style="padding:4px 12px;font-size:9px;text-align:right;color:#6b7280;">Amount</th>
                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:#6b7280;">Date</th>
                </tr></thead>
                <tbody>${paymentRows}</tbody>
            </table>
        </div>` : ''}

        <div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:16px;">
            <div style="display:flex;justify-content:space-between;">
                <p style="font-size:9px;color:#9ca3af;">Terms: Payment due on receipt.</p>
                <div style="text-align:right;">
                    <p style="font-size:9px;color:#6b7280;margin-bottom:28px;">Authorized Signatory</p>
                    <p style="font-size:9px;border-top:1px solid #d1d5db;padding-top:3px;color:#9ca3af;">For ${hospitalName}</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}
