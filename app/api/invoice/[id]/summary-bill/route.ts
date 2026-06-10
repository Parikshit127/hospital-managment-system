import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding, letterheadBackgroundHtml, letterheadCss, billFooterHtml, printButtonHtml, type BillBranding } from '@/app/lib/bill-branding';
import { getBillSections } from '@/app/lib/bill-sections';
import { formatDoctorName } from '@/app/lib/format-name';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { id: rawId } = await params;
        const invoiceId = parseInt(rawId, 10);
        if (isNaN(invoiceId)) return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });

        // ?detailed=true lists individual line items (medications) under each
        // category; default shows only per-category totals + grand total.
        const detailed = new URL(req.url).searchParams.get('detailed') === 'true';

        const invoice = await prisma.invoices.findFirst({
            where: { id: invoiceId, organizationId: auth.context.organizationId },
            include: {
                items: true,
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true, department: true } },
                payments: { where: { status: { not: 'Reversed' } } },
                credit_notes: { where: { status: 'Approved' }, orderBy: { created_at: 'desc' } },
            },
        });
        if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

        let admission: any = null;
        if (invoice.admission_id) {
            admission = await prisma.admissions.findFirst({
                where: { admission_id: invoice.admission_id },
                include: {
                    ward: { select: { ward_name: true } },
                    bed: { select: { bed_id: true } },
                },
            });
        }

        const org = await prisma.organization.findUnique({
            where: { id: auth.context.organizationId },
            include: { branding: true },
        });

        // Doctor for OPD/Pharmacy bills: prefer the doctor recorded on the invoice
        // itself, then the patient's latest appointment. Never fall back to
        // patient.department — that's a specialty label, not a doctor name
        // (it was rendering as e.g. "Dr. senior urologist").
        let opdDoctor = (invoice as any).doctor_name || '';
        if (!opdDoctor && !invoice.admission_id && invoice.patient_id) {
            const apt = await prisma.appointments.findFirst({
                where: { patient_id: invoice.patient_id, organizationId: auth.context.organizationId },
                orderBy: { appointment_date: 'desc' },
                select: { doctor_name: true },
            });
            opdDoctor = apt?.doctor_name || '';
        }

        // Fetch TPA/Insurance provider name if applicable
        let tpaProviderName = '';
        if (invoice.tpa_provider_id) {
            const tpa = await prisma.insurance_providers.findUnique({ where: { id: invoice.tpa_provider_id } });
            tpaProviderName = tpa?.provider_name || '';
        }
        if (!tpaProviderName && invoice.billing_patient_type === 'tpa_insurance') {
            const policy = await prisma.insurance_policies.findFirst({
                where: { patient_id: invoice.patient_id },
                include: { provider: { select: { provider_name: true } } },
            });
            tpaProviderName = (policy as any)?.provider?.provider_name || '';
        }

        const branding = await getBillBranding(auth.context.organizationId);
        const sections = await getBillSections(auth.context.organizationId, 'invoice');

        const deposits = invoice.patient_id
            ? await prisma.patientDeposit.findMany({
                where: {
                    patient_id: invoice.patient_id,
                    OR: [
                        { applied_to_invoice: invoiceId },
                        ...(invoice.admission_id ? [{ admission_id: invoice.admission_id }] : []),
                    ],
                },
            })
            : [];

        const html = generateSummaryBillHTML(invoice, admission, org, deposits, branding, sections, opdDoctor, tpaProviderName, detailed);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Invoice summary bill error:', error);
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
    return 'Rupees ' + convert(Math.floor(n)) + ' Only';
}

function generateSummaryBillHTML(invoice: any, admission: any, org: any, deposits: any[], branding: BillBranding, sections: any, opdDoctor: string = '', tpaProviderName: string = '', detailed: boolean = false) {
    const patient = invoice.patient || {};
    const items = invoice.items || [];

    const gstin = branding.gstin;
    const isIPD = !!admission;
    const isFinal = invoice.status === 'Paid' || invoice.status === 'Final' || admission?.status === 'Discharged';
    const billType = isIPD ? (isFinal ? 'SUMMARY BILL' : 'INTERIM SUMMARY') : 'TAX INVOICE';
    const billColor = isFinal ? branding.accentColor : '#f97316';
    const invoiceDate = new Date(invoice.created_at).toLocaleDateString('en-IN');

    let admissionDate = '';
    let dischargeDate = '';
    let los = 0;
    const fmtDateTime = (d: any) => d
        ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
        : '-';
    if (admission) {
        admissionDate = fmtDateTime(admission.admission_date);
        dischargeDate = admission.discharge_date
            ? fmtDateTime(admission.discharge_date)
            : fmtDateTime(new Date());
        los = Math.max(1, Math.ceil(
            (new Date(admission.discharge_date || new Date()).getTime() -
                new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        ));
    }

    // Determine patient category from billing_patient_type
    const billingType = invoice.billing_patient_type || 'cash';
    let patientCategory = 'Cash / Self-Pay';
    if (billingType === 'tpa_insurance') patientCategory = 'TPA / Insurance';
    else if (billingType === 'corporate') patientCategory = 'Corporate';

    const total = Number(invoice.total_amount || 0);
    const totalDiscount = Number(invoice.total_discount || 0);
    const totalTax = Number(invoice.total_tax || 0);
    const net = Number(invoice.net_amount || 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_due || 0);

    // Group items by service_category for MEDNET-style detail rows
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
    const categoryMap: Record<string, any[]> = {};
    for (const item of items) {
        const cat = item.service_category || item.department || 'Other';
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(item);
    }

    // Build MEDNET-style detail rows with category headers and individual items
    let detailRows = '';
    for (const [cat, catItems] of Object.entries(categoryMap)) {
        const catTotal = catItems.reduce((s: number, i: any) => s + Number(i.net_price || 0), 0);
        detailRows += `<tr style="background:#f0f0f0;">
            <td colspan="5" style="padding:5px 8px;font-size:11px;font-weight:700;">${cat}</td>
            <td style="padding:5px 8px;font-size:11px;font-weight:700;text-align:right;">Total Rs. ${catTotal.toFixed(2)}/-</td>
        </tr>`;
        // Summary mode collapses only the bulky Pharmacy list to a single total;
        // every other category (Packages, consultations, procedures, lab, services)
        // stays itemized so the actual services are always named on the bill.
        // Detailed mode (?detailed=true) lists everything, including medications.
        const isBulkPharmacy = cat.toLowerCase() === 'pharmacy';
        if (detailed || !isBulkPharmacy) {
            for (const item of catItems) {
                detailRows += `<tr>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;">${fmtDate(item.created_at)}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;">${item.description}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;text-align:right;">${Number(item.unit_price).toFixed(2)}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;">${item.quantity}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;text-align:right;">${Number(item.discount || 0).toFixed(2)}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;text-align:right;">${Number(item.net_price).toFixed(2)}</td>
                </tr>`;
            }
        }
    }

    // Payment rows MEDNET style
    const payments = invoice.payments || [];
    const paymentDetailRows = payments.map((p: any) => `<tr>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #ddd;">${fmtDate(p.created_at)}</td>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #ddd;">Receipt - (${p.receipt_number})</td>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #ddd;">Payment ${p.payment_method} on ${fmtDate(p.created_at)}</td>
        <td style="padding:4px 8px;font-size:11px;text-align:right;border-bottom:1px solid #ddd;">${Number(p.amount).toFixed(2)}</td>
    </tr>`).join('');

    const depositTotal = deposits.reduce((s, d) => s + Number(d.applied_amount || 0), 0);
    const creditNotes = invoice.credit_notes || [];
    const creditNoteTotal = creditNotes.reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0);

    let patientInfoHTML = `
        <p style="font-size:11px;"><strong>Patient:</strong> ${patient.full_name || '-'}</p>
        <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id || '-'}</p>
        <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
        <p style="font-size:11px;"><strong>Phone:</strong> ${patient.phone || '-'}</p>
        <p style="font-size:11px;"><strong>Category:</strong> ${patientCategory}${tpaProviderName ? ` (${tpaProviderName})` : ''}</p>
        ${!isIPD && opdDoctor ? `<p style="font-size:11px;"><strong>Doctor:</strong> ${formatDoctorName(opdDoctor)}</p>` : ''}
    `;
    if (isIPD) {
        patientInfoHTML += `
            <p style="font-size:11px;"><strong>Admission ID:</strong> ${admission.admission_id}</p>
            <p style="font-size:11px;"><strong>Doctor:</strong> ${formatDoctorName(admission.doctor_name) || '-'}</p>
            <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
            <p style="font-size:11px;"><strong>Admitted:</strong> ${admissionDate}</p>
            <p style="font-size:11px;"><strong>Discharged:</strong> ${isFinal ? dischargeDate : 'N/A'}</p>
            <p style="font-size:11px;"><strong>LOS:</strong> ${los} day(s)</p>
            <p style="font-size:11px;"><strong>Diagnosis:</strong> ${admission.diagnosis || '-'}</p>
        `;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${billType} - ${invoice.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        ${letterheadCss(branding)}
        .watermark { color: ${billColor}; }
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(branding)}
    <div class="watermark">${billType}</div>
    ${printButtonHtml(branding, 'Category-level summary bill for ' + invoice.invoice_number)}
    <table class="print-layout-table">
        <thead><tr><td class="print-layout-header-spacer"></td></tr></thead>
        <tbody><tr><td>
            <div class="bill-container">
                <div style="display:flex;justify-content:space-between;border-bottom:2px solid ${branding.accentColor};padding-bottom:12px;margin-bottom:20px;">
                    <div>
                        <p style="font-size:11px;font-weight:700;color:${branding.accentColor};">${branding.hospitalName}${branding.tagline ? ` - ${branding.tagline}` : ''}</p>
                        ${gstin !== 'N/A' ? `<p style="font-size:10px;color:#6b7280;">GST NO.-${gstin}</p>` : ''}
                        <p style="font-size:10px;color:#6b7280;">${branding.hospitalAddress}</p>
                        ${branding.hospitalPhone ? `<p style="font-size:10px;color:#6b7280;">Ph: ${branding.hospitalPhone}</p>` : ''}
                        ${branding.hospitalEmail ? `<p style="font-size:10px;color:#6b7280;">Email: ${branding.hospitalEmail}</p>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <h2 style="font-size:16px;font-weight:800;color:${billColor};">${billType}</h2>
                        <p style="font-size:12px;font-weight:700;color:${branding.accentColor};">${invoice.invoice_number}</p>
                        <p style="font-size:10px;color:#6b7280;">Type: <strong>${invoice.invoice_type || 'OPD'}</strong></p>
                        <p style="font-size:10px;color:#6b7280;">Date: ${invoiceDate}</p>
                    </div>
                </div>
                ${sections.showPatientInfo ? `
                <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${patientInfoHTML}</div>
                </div>` : ''}
                ${sections.showLineItems ? `
                <!-- Detailed Service Table (MEDNET format) -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #999;">
                    <thead>
                        <tr style="background:#eee;">
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Date</th>
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Service Name</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Rate</th>
                            <th style="padding:6px 8px;text-align:center;font-size:10px;border:1px solid #999;">Qty.</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Disc</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Net Amt.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detailRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#999;">No charges</td></tr>'}
                        <tr style="border-top:2px solid #000;font-weight:bold;">
                            <td colspan="3" style="padding:6px 8px;font-size:11px;">Total</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${total.toFixed(2)}</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${totalDiscount.toFixed(2)}</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${(total - totalDiscount).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>` : ''}

                ${payments.length > 0 ? `
                <!-- Payment And Refund -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #999;">
                    <thead>
                        <tr style="background:#eee;">
                            <th colspan="4" style="padding:6px 8px;text-align:left;font-size:11px;font-weight:bold;border:1px solid #999;">Payment And Refund</th>
                        </tr>
                        <tr style="background:#f5f5f5;">
                            <th style="padding:5px 8px;text-align:left;font-size:10px;border:1px solid #999;">Date</th>
                            <th style="padding:5px 8px;text-align:left;font-size:10px;border:1px solid #999;">Receipt / Refund</th>
                            <th style="padding:5px 8px;text-align:left;font-size:10px;border:1px solid #999;">Notes</th>
                            <th style="padding:5px 8px;text-align:right;font-size:10px;border:1px solid #999;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${paymentDetailRows}</tbody>
                </table>` : ''}

                <!-- Amount Summary (MEDNET format with words) -->
                <table style="width:100%;margin-bottom:12px;">
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;width:120px;">Bill Amount :</td><td style="font-size:11px;">${total.toFixed(2)} - ${numberToWords(total)}</td></tr>
                    ${totalDiscount > 0 ? `<tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Discount :</td><td style="font-size:11px;">${totalDiscount.toFixed(2)}</td></tr>` : ''}
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Net Amount :</td><td style="font-size:11px;">${net.toFixed(2)} - ${numberToWords(net)}</td></tr>
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Paid Amount :</td><td style="font-size:11px;">${paid.toFixed(2)} - ${numberToWords(paid)}</td></tr>
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Balance :</td><td style="font-size:11px;">${balance.toFixed(2)} - ${numberToWords(balance)}</td></tr>
                </table>
                <p style="font-size:10px;text-align:right;color:#666;margin-bottom:10px;">(All figures are in Rupees (INR) only)</p>
                ${sections.showFooter ? billFooterHtml(branding) : ''}
            </div>
        </td></tr></tbody>
        <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
    </table>
</body>
</html>`;
}
