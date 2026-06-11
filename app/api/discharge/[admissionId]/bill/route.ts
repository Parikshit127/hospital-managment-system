import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'
import { ensureIPDRoomChargesAccrued } from '@/app/actions/ipd-billing-helpers'
import { getBillBranding, letterheadBackgroundHtml, letterheadCss, billFooterHtml, printButtonHtml, type BillBranding } from '@/app/lib/bill-branding';
import { getBillSections } from '@/app/lib/bill-sections';
import { formatDoctorName } from '@/app/lib/format-name';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { admissionId } = await params;

        // Auto-accrual disabled — room/nursing charges are added manually
        // await ensureIPDRoomChargesAccrued(admissionId).catch(() => null);

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId: auth.context.organizationId },
            include: {
                patient: {
                    select: {
                        full_name: true, patient_id: true, phone: true, age: true, gender: true, address: true,
                        patient_type: true, corporate_id: true,
                        corporate: { select: { company_name: true, company_code: true } },
                    },
                },
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
                credit_notes: { where: { status: 'Approved' }, orderBy: { created_at: 'desc' } },
            },
            orderBy: { created_at: 'desc' },
        });

        if (!invoice) return NextResponse.json({ error: 'No invoice found' }, { status: 404 });

        // Fetch TPA provider name + policy number if applicable.
        // Treat the bill as insurance/TPA when EITHER the invoice OR the patient master says so.
        let tpaProviderName = '';
        let policyNumber = '';
        const invoiceTypeNorm = String(invoice.billing_patient_type || '').toLowerCase();
        const patientTypeNorm = String((admission.patient as any)?.patient_type || '').toLowerCase();
        const isInsuranceBill =
            ['tpa_insurance', 'insurance', 'tpa'].includes(invoiceTypeNorm) ||
            ['tpa_insurance', 'insurance', 'tpa'].includes(patientTypeNorm);

        // Priority 1: invoice-level tpa_provider_id
        if (invoice.tpa_provider_id) {
            const tpa = await prisma.insurance_providers.findUnique({ where: { id: invoice.tpa_provider_id } });
            tpaProviderName = tpa?.provider_name || '';
        }
        // Priority 2: pull from insurance_policies for this patient (covers TPA-tagged patients
        // whose invoice didn't carry the provider id forward)
        if (isInsuranceBill && (!tpaProviderName || !policyNumber)) {
            const policy = await prisma.insurance_policies.findFirst({
                where: { patient_id: admission.patient_id, status: 'Active' },
                orderBy: { created_at: 'desc' },
                include: { provider: { select: { provider_name: true } } },
            }) || await prisma.insurance_policies.findFirst({
                where: { patient_id: admission.patient_id },
                orderBy: { created_at: 'desc' },
                include: { provider: { select: { provider_name: true } } },
            });
            if (!tpaProviderName) tpaProviderName = (policy as any)?.provider?.provider_name || '';
            policyNumber = policy?.policy_number || '';
        }

        const org = await prisma.organization.findUnique({
            where: { id: auth.context.organizationId },
            include: { branding: { select: { logo_url: true, primary_color: true } } },
        });

        const branding = await getBillBranding(auth.context.organizationId);
        const sections = await getBillSections(auth.context.organizationId, 'discharge');

        const deposits = await prisma.patientDeposit.findMany({
            where: { patient_id: admission.patient_id },
        });

        const isFinal = admission.status === 'Discharged';
        const html = generateDischargeBillHTML(admission, invoice, org, deposits, isFinal, branding, sections, tpaProviderName, policyNumber, isInsuranceBill);

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

function generateDischargeBillHTML(admission: any, invoice: any, org: any, deposits: any[], isFinal: boolean, branding: BillBranding, sections: any, tpaProviderName: string = '', policyNumber: string = '', isInsuranceBill: boolean = false) {
    const patient = admission.patient || {};
    const items = invoice.items || [];
    const payments = invoice.payments || [];

    const hospitalName = branding.hospitalName;
    const gstin = branding.gstin;

    const billColor = isFinal ? branding.accentColor : '#f97316';

    const admissionDate = new Date(admission.admission_date).toLocaleDateString('en-IN');
    const dischargeDate = admission.discharge_date ? new Date(admission.discharge_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
    const los = Math.max(1, Math.ceil((new Date(admission.discharge_date || new Date()).getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)));

    const total = Number(invoice.total_amount || 0);
    const totalDiscount = Number(invoice.total_discount || 0);
    const totalTax = Number(invoice.total_tax || 0);
    // Net = gross − discount + tax (live), so it always reflects the current discount.
    const net = total - totalDiscount + totalTax;
    const paid = Number(invoice.paid_amount || 0);
    const balance = net - paid;

    // Consolidate per-day Room + Nursing rows into single summary rows
    const consolidatedItems: any[] = [];
    const roomRows = items.filter((i: any) => i.service_category === 'Room');
    const nursingRows = items.filter((i: any) => i.service_category === 'Nursing');
    const otherRows = items.filter((i: any) => i.service_category !== 'Room' && i.service_category !== 'Nursing');

    if (roomRows.length > 0) {
        const unitPrice = Number(roomRows[0].unit_price);
        const days = roomRows.length;
        const totalPrice = roomRows.reduce((s: number, r: any) => s + Number(r.net_price || 0), 0);
        const taxAmount = roomRows.reduce((s: number, r: any) => s + Number(r.tax_amount || 0), 0);
        const wardName = roomRows[0].description?.split(' - ')[0] || 'Ward';
        consolidatedItems.push({
            ...roomRows[0],
            description: `${wardName} - Room Charge (${days}d × ₹${unitPrice.toLocaleString('en-IN')}/day)`,
            quantity: days,
            unit_price: unitPrice,
            net_price: totalPrice,
            total_price: totalPrice,
            tax_amount: taxAmount,
            service_category: 'Room',
        });
    }

    if (nursingRows.length > 0) {
        const unitPrice = Number(nursingRows[0].unit_price);
        const days = nursingRows.length;
        const totalPrice = nursingRows.reduce((s: number, r: any) => s + Number(r.net_price || 0), 0);
        const taxAmount = nursingRows.reduce((s: number, r: any) => s + Number(r.tax_amount || 0), 0);
        consolidatedItems.push({
            ...nursingRows[0],
            description: `Nursing Charges (${days}d × ₹${unitPrice.toLocaleString('en-IN')}/day)`,
            quantity: days,
            unit_price: unitPrice,
            net_price: totalPrice,
            total_price: totalPrice,
            tax_amount: taxAmount,
            service_category: 'Nursing',
        });
    }

    const displayItems = [...consolidatedItems, ...otherRows];

    // Group display items by category
    const categoryMap: Record<string, { items: any[]; total: number }> = {};
    for (const item of displayItems) {
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

    const creditNotes = invoice.credit_notes || [];
    const creditNoteTotal = creditNotes.reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0);

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
        ${letterheadCss(branding)}
        .watermark { color: ${isFinal ? branding.accentColor : '#f59e0b'}; }
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(branding)}

    <div class="watermark">${isFinal ? 'FINAL BILL' : 'INTERIM'}</div>

    ${printButtonHtml(branding)}

    <table class="print-layout-table">
        <thead>
            <tr>
                <td class="print-layout-header-spacer"></td>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div class="bill-container">
                        <!-- Hospital Header (shown when no letterhead) -->
                        ${!branding.letterheadUrl ? `
                        <div style="text-align:center;margin-bottom:8px;">
                            ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="" style="height:50px;margin-bottom:4px;" />` : ''}
                            <h1 style="font-size:15px;font-weight:bold;margin:0;">${branding.hospitalName}${branding.tagline ? ` - ${branding.tagline}` : ''}</h1>
                            ${gstin !== 'N/A' ? `<p style="font-size:10px;">GST NO.-${gstin}</p>` : ''}
                            <p style="font-size:10px;">${branding.hospitalAddress}</p>
                            ${branding.hospitalPhone ? `<p style="font-size:10px;">Ph: ${branding.hospitalPhone}${branding.hospitalEmail ? ` | Email: ${branding.hospitalEmail}` : ''}</p>` : ''}
                        </div>
                        <hr style="border:none;border-top:2px solid #000;margin:6px 0 10px 0;" />
                        ` : ''}

                        <div style="display:flex;justify-content:space-between;border-bottom:2px solid ${branding.accentColor};padding-bottom:12px;margin-bottom:20px;">
                            <div>
                                <p style="font-size:11px;font-weight:700;color:${branding.accentColor};">${branding.hospitalName}</p>
                                ${gstin !== 'N/A' ? `<p style="font-size:10px;color:#6b7280;">GSTIN: ${gstin}</p>` : ''}
                            </div>
                            <div style="text-align:right;">
                                <h2 style="font-size:16px;font-weight:800;color:${billColor};">${isFinal ? 'FINAL BILL' : 'INTERIM BILL'}</h2>
                                <p style="font-size:12px;font-weight:700;color:${branding.accentColor};">${invoice.invoice_number}</p>
                                <p style="font-size:10px;color:#6b7280;">Type: <strong>${invoice.invoice_type || 'IPD'}</strong></p>
                                <p style="font-size:10px;color:#6b7280;">Date: ${new Date().toLocaleDateString('en-IN')}</p>
                            </div>
                        </div>

                        ${sections.showPatientInfo ? `
                        <!-- Patient & Admission -->
                        <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:16px;">
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;">
                                <p style="font-size:11px;"><strong>Patient:</strong> ${patient.full_name}</p>
                                <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id}</p>
                                <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                                <p style="font-size:11px;"><strong>Admission ID:</strong> ${admission.admission_id}</p>
                                <p style="font-size:11px;"><strong>Doctor:</strong> ${formatDoctorName(admission.doctor_name) || '-'}</p>
                                <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
                                <p style="font-size:11px;"><strong>Admitted:</strong> ${admissionDate}</p>
                                <p style="font-size:11px;"><strong>Discharged:</strong> ${isFinal ? dischargeDate : 'N/A'}</p>
                                <p style="font-size:11px;"><strong>LOS:</strong> ${los} day(s)</p>
                                <p style="font-size:11px;"><strong>Category:</strong> ${(() => {
                                    const inv = String(invoice.billing_patient_type || '').toLowerCase();
                                    const pat = String((admission.patient as any)?.patient_type || '').toLowerCase();
                                    const t = inv || pat;
                                    if (t === 'tpa_insurance' || t === 'insurance' || t === 'tpa') return 'TPA / Insurance';
                                    if (t === 'corporate') return 'Corporate';
                                    return 'Cash / Self-Pay';
                                })()}</p>
                                ${tpaProviderName ? `<p style="font-size:11px;"><strong>TPA/Insurer:</strong> ${tpaProviderName}${policyNumber ? ` &nbsp;|&nbsp; Policy: ${policyNumber}` : ''}</p>` : (isInsuranceBill ? `<p style="font-size:11px;color:#b04a00;"><strong>TPA/Insurer:</strong> (not configured — add via patient registration)</p>` : '')}
                                ${(admission.patient as any)?.corporate ? `<p style="font-size:11px;"><strong>Corporate:</strong> ${(admission.patient as any).corporate.company_name}${(admission.patient as any).corporate.company_code ? ` (${(admission.patient as any).corporate.company_code})` : ''}</p>` : ''}
                                <p style="font-size:11px;"><strong>Diagnosis:</strong> ${admission.diagnosis || '-'}</p>
                            </div>
                        </div>` : ''}

                        ${sections.showLineItems ? `
                        <!-- Charges -->
                        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
                            <thead><tr style="border-y:2px solid ${branding.accentColor};">
                                <th style="padding:6px 12px;text-align:left;font-size:9px;font-weight:800;color:${branding.accentColor};">Description</th>
                                <th style="padding:6px 12px;text-align:left;font-size:9px;font-weight:800;color:${branding.accentColor};">SAC/HSN</th>
                                <th style="padding:6px 12px;text-align:center;font-size:9px;font-weight:800;color:${branding.accentColor};">Qty</th>
                                <th style="padding:6px 12px;text-align:right;font-size:9px;font-weight:800;color:${branding.accentColor};">Rate</th>
                                <th style="padding:6px 12px;text-align:center;font-size:9px;font-weight:800;color:${branding.accentColor};">GST%</th>
                                <th style="padding:6px 12px;text-align:right;font-size:9px;font-weight:800;color:${branding.accentColor};">GST Amt</th>
                                <th style="padding:6px 12px;text-align:right;font-size:9px;font-weight:800;color:${branding.accentColor};">Total</th>
                            </tr></thead>
                            <tbody>${itemRows}</tbody>
                        </table>` : ''}

                        <!-- Totals -->
                        <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
                            <table style="width:300px;border-collapse:collapse;">
                                <tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">Subtotal</td><td style="padding:4px 12px;font-size:11px;text-align:right;">${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ${totalDiscount > 0 ? `<tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">Discount</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#dc2626;">-${totalDiscount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                                ${totalTax > 0 ? `
                                <tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">CGST</td><td style="padding:4px 12px;font-size:11px;text-align:right;">${(totalTax / 2).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                <tr><td style="padding:4px 12px;font-size:11px;color:#6b7280;">SGST</td><td style="padding:4px 12px;font-size:11px;text-align:right;">${(totalTax / 2).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ` : ''}
                                <tr style="border-top:2px solid #1f2937;"><td style="padding:6px 12px;font-size:13px;font-weight:800;">Net Amount</td><td style="padding:6px 12px;font-size:13px;text-align:right;font-weight:800;">${net.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ${creditNoteTotal > 0 ? `<tr><td style="padding:4px 12px;font-size:11px;color:#0891b2;">Credit Notes Applied</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#0891b2;">-${creditNoteTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                                ${depositTotal > 0 ? `<tr><td style="padding:4px 12px;font-size:11px;color:#7c3aed;">Deposits Applied</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#7c3aed;">-${depositTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                                <tr><td style="padding:4px 12px;font-size:11px;color:#059669;">Total Paid</td><td style="padding:4px 12px;font-size:11px;text-align:right;color:#059669;">${paid.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ${balance > 0 ? `<tr style="background:#fef2f2;"><td style="padding:6px 12px;font-size:12px;font-weight:800;color:#dc2626;">Balance Due</td><td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:800;color:#dc2626;">${balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : `<tr style="background:#f0fdf4;"><td style="padding:6px 12px;font-size:12px;font-weight:800;color:#059669;">FULLY PAID</td><td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:800;color:#059669;">&#10003;</td></tr>`}
                            </table>
                        </div>

                        ${sections.showAmountInWords ? `
                        <div style="background:#f0fdf4;border-radius:6px;padding:8px 14px;margin-bottom:14px;">
                            <p style="font-size:10px;color:#059669;"><strong>Amount in Words:</strong> ${numberToWords(net)}</p>
                        </div>` : ''}

                        ${sections.showPaymentHistory && payments.length > 0 ? `
                        <div style="margin-bottom:14px;">
                            <h3 style="font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Payments</h3>
                            <table style="width:100%;border-collapse:collapse;background:#f9fafb;">
                                <thead><tr style="border-bottom:1px solid ${branding.accentColor};">
                                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:${branding.accentColor};">Receipt</th>
                                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:${branding.accentColor};">Method</th>
                                    <th style="padding:4px 12px;font-size:9px;text-align:right;color:${branding.accentColor};">Amount</th>
                                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:${branding.accentColor};">Date</th>
                                </tr></thead>
                                <tbody>${paymentRows}</tbody>
                            </table>
                        </div>` : ''}

                        ${creditNotes.length > 0 ? `
                        <div style="margin-bottom:14px;">
                            <h3 style="font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Credit Notes Applied</h3>
                            <table style="width:100%;border-collapse:collapse;background:#ecfeff;">
                                <thead><tr style="border-bottom:1px solid #0891b2;">
                                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:#0891b2;">CN Number</th>
                                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:#0891b2;">Reason</th>
                                    <th style="padding:4px 12px;font-size:9px;text-align:right;color:#0891b2;">Amount</th>
                                    <th style="padding:4px 12px;font-size:9px;text-align:left;color:#0891b2;">Date</th>
                                </tr></thead>
                                <tbody>${creditNotes.map((c: any) => `<tr>
                                    <td style="padding:4px 12px;font-size:10px;">${c.credit_note_number}</td>
                                    <td style="padding:4px 12px;font-size:10px;">${c.reason || '-'}</td>
                                    <td style="padding:4px 12px;font-size:10px;text-align:right;color:#0891b2;">-${Number(c.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style="padding:4px 12px;font-size:10px;">${new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                                </tr>`).join('')}</tbody>
                            </table>
                        </div>` : ''}

                        ${sections.showFooter ? billFooterHtml(branding) : `
                        <div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:16px;">
                            <div style="display:flex;justify-content:space-between;">
                                <p style="font-size:9px;color:#9ca3af;">Terms: Payment due on receipt.</p>
                                <div style="text-align:right;">
                                    <p style="font-size:9px;color:#6b7280;margin-bottom:28px;">Authorized Signatory</p>
                                    <p style="font-size:9px;border-top:1px solid #d1d5db;padding-top:3px;color:#9ca3af;">For ${hospitalName}</p>
                                </div>
                            </div>
                        </div>`}
                    </div>
                </td>
            </tr>
        </tbody>
        <tfoot>
            <tr>
                <td class="print-layout-footer-spacer"></td>
            </tr>
        </tfoot>
    </table>
</body>
</html>`;
}
