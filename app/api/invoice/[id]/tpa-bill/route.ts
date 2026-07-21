/**
 * app/api/invoice/[id]/tpa-bill/route.ts — TPA / Insurance Claim Bill
 * ─────────────────────────────────────────────────────────────────────────────
 * The patient-facing summary bill (../summary-bill) shows what the PATIENT owes.
 * This route renders the *other* bill a hospital needs for an insured patient:
 * a claim bill ADDRESSED TO THE TPA / INSURER, showing the ACTUAL treatment
 * amount being claimed (gross charges), the patient co-pay carved out, and the
 * net amount the TPA must settle.
 *
 * "Actual amount" here = the real, full treatment charges (net of discount) that
 * the hospital is billing the insurer for — NOT the patient's net payable (which
 * is often ₹0 in a cashless claim). This is the document submitted to the TPA.
 *
 * It reuses the same branding/letterhead/totals helpers as every other bill so
 * the look and the numbers stay consistent across the system.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import {
    getBillBranding,
    letterheadBackgroundHtml,
    letterheadCss,
    billFooterHtml,
    printButtonHtml,
    fmtBillDate,
    fmtBillDateTime,
    deriveInvoiceTotals,
    deriveTpaStatusPill,
    type BillBranding,
} from '@/app/lib/bill-branding';
import { formatDoctorName } from '@/app/lib/format-name';
import { isSemiDischarged } from '@/app/lib/admission-status';

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

        const invoice = await prisma.invoices.findFirst({
            where: { id: invoiceId, organizationId: auth.context.organizationId },
            include: {
                items: true,
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true, department: true } },
                payments: { where: { status: { not: 'Reversed' } } },
                credit_notes: { where: { status: { in: ['Approved', 'Applied'] } }, orderBy: { created_at: 'desc' } },
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

        // ── Resolve the insurer / TPA the claim is addressed to ────────────────
        // Prefer the provider explicitly attached to the invoice; otherwise fall
        // back to the patient's active insurance policy.
        let tpaProviderName = '';
        let policyNumber = '';
        if (invoice.tpa_provider_id) {
            const tpa = await prisma.insurance_providers.findUnique({ where: { id: invoice.tpa_provider_id } });
            tpaProviderName = tpa?.provider_name || '';
        }
        const policy = await prisma.insurance_policies.findFirst({
            where: { patient_id: invoice.patient_id },
            include: { provider: { select: { provider_name: true } } },
            orderBy: { created_at: 'desc' },
        });
        if (!tpaProviderName) tpaProviderName = (policy as any)?.provider?.provider_name || '';
        policyNumber = (policy as any)?.policy_number || '';

        // Pre-auth number (cashless approval reference), if one was raised.
        let preAuthNumber = '';
        if (invoice.pre_auth_id) {
            const preAuth = await (prisma as any).insurancePreAuth.findFirst({
                where: { OR: [{ id: invoice.pre_auth_id }, { pre_auth_number: invoice.pre_auth_id }] },
            }).catch(() => null);
            preAuthNumber = preAuth?.pre_auth_number || invoice.pre_auth_id || '';
        }

        const branding = await getBillBranding(auth.context.organizationId);

        const html = generateTpaBillHTML(invoice, admission, branding, tpaProviderName, policyNumber, preAuthNumber);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('TPA claim bill error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function numberToWords(n: number): string {
    const rupees = Math.abs(Math.floor(n || 0));
    if (rupees === 0) return 'Zero';
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
    return (n < 0 ? 'Minus ' : '') + 'Rupees ' + convert(rupees) + ' Only';
}

function generateTpaBillHTML(
    invoice: any,
    admission: any,
    branding: BillBranding,
    tpaProviderName: string,
    policyNumber: string,
    preAuthNumber: string,
) {
    const patient = invoice.patient || {};
    const items = invoice.items || [];
    const gstin = branding.gstin;
    const isIPD = !!admission;
    const billColor = '#7c3aed'; // violet — distinguishes the TPA copy from the patient bill
    const billDate = fmtBillDate(invoice.created_at);

    // ── The amounts ────────────────────────────────────────────────────────────
    // `net` is the ACTUAL bill amount (gross − discount + tax), recomputed from the
    // line items so it always matches the charges shown.
    const { gross: total, discount: totalDiscount, net, tpaApproved, tpaReceived } = deriveInvoiceTotals(invoice);

    // Patient co-pay / non-payable portion carved out of the actual amount. When the
    // split hasn't been set on the invoice yet (e.g. a fresh draft), assume a fully
    // cashless claim — the whole actual amount is claimed from the TPA.
    // ── Full settlement waterfall ───────────────────────────────────────────────
    // A partial sanction / partial payment has several numbers a biller must see,
    // not just the approved figure: what the insurer APPROVED, what it DISALLOWED
    // (short-pay), the TDS it deducted, what we've RECEIVED, and the BALANCE still
    // recoverable. All are derived from the invoice's stored TPA settlement fields
    // so this matches Bill-Wise Sanction exactly.
    const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const tpaDisallowedAtSettlement = Number(invoice.tpa_disallowed_amount || 0); // short-pay recorded on receipt
    const tpaTds = Number(invoice.tpa_tds_amount || 0);

    // Amount claimed from the TPA. `tpa_payable` starts at the approved amount and
    // is drawn down as the claim settles, so once settlement has begun we reconstruct
    // the stable baseline (payable + everything already accounted == approved) rather
    // than letting the "claimed" headline shrink to the outstanding balance. Falls
    // back to the net-minus-copay claim when the insurer hasn't approved yet — the
    // original behaviour for fresh drafts, so existing bills are unchanged.
    const patientCopay = Number(invoice.patient_payable || 0);
    const claimedFromTpa = tpaApproved > 0
        ? round2(Number(invoice.tpa_payable || 0) + tpaReceived + tpaDisallowedAtSettlement + tpaTds)
        : (Number(invoice.tpa_payable || 0) > 0 ? Number(invoice.tpa_payable) : Math.max(0, net - patientCopay));

    const tpaBalance = tpaApproved > 0
        ? Math.max(0, Number(invoice.tpa_payable || 0))
        : Math.max(0, round2(tpaApproved - tpaReceived - tpaDisallowedAtSettlement - tpaTds));
    const claimStatus = String(invoice.tpa_claim_status || '');
    // Show the full settlement waterfall only once the insurer has actually
    // responded. A claim that is merely submitted / under review shows an
    // "awaiting approval" note instead of a misleading "Approved 0.00" row.
    const insurerResponded = tpaApproved > 0 || tpaReceived > 0 || tpaDisallowedAtSettlement > 0
        || tpaTds > 0 || ['approved', 'partially_settled', 'settled', 'rejected'].includes(claimStatus);

    const tpaPill = deriveTpaStatusPill(invoice.tpa_claim_status, tpaApproved, tpaReceived);
    const pillColors: Record<string, { bg: string; fg: string; border: string }> = {
        green: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
        amber: { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
        red:   { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
        gray:  { bg: '#f3f4f6', fg: '#374151', border: '#d1d5db' },
        blue:  { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
    };
    const tpaPillStyle = pillColors[tpaPill.color] || pillColors.gray;

    // ── Stay / admission details ────────────────────────────────────────────────
    let admissionDate = '';
    let dischargeDate = '';
    let los = 0;
    if (admission) {
        admissionDate = fmtBillDateTime(admission.admission_date);
        dischargeDate = admission.discharge_date ? fmtBillDateTime(admission.discharge_date) : '';
        los = Math.max(1, Math.ceil(
            (new Date(admission.discharge_date || new Date()).getTime() -
                new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        ));
    }

    // ── Line items grouped by service category (actual charges) ─────────────────
    const fmtDate = fmtBillDate;
    const categoryMap: Record<string, any[]> = {};
    for (const item of items) {
        const cat = item.service_category || item.department || 'Other';
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(item);
    }
    let detailRows = '';
    for (const [cat, catItems] of Object.entries(categoryMap)) {
        const catTotal = catItems.reduce((s: number, i: any) => s + Number(i.net_price || 0), 0);
        detailRows += `<tr style="background:#f0f0f0;">
            <td colspan="5" style="padding:5px 8px;font-size:11px;font-weight:700;">${cat}</td>
            <td style="padding:5px 8px;font-size:11px;font-weight:700;text-align:right;">Total Rs. ${catTotal.toFixed(2)}/-</td>
        </tr>`;
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

    // "Bill To" = the insurer/TPA. The patient is the beneficiary, shown separately.
    const billToHTML = `
        <p style="font-size:11px;"><strong>Insurer / TPA:</strong> ${tpaProviderName || 'Not specified'}</p>
        ${policyNumber ? `<p style="font-size:11px;"><strong>Policy No.:</strong> ${policyNumber}</p>` : ''}
        ${invoice.tpa_claim_number ? `<p style="font-size:11px;"><strong>Claim No.:</strong> ${invoice.tpa_claim_number}</p>` : ''}
        ${preAuthNumber ? `<p style="font-size:11px;"><strong>Pre-Auth No.:</strong> ${preAuthNumber}</p>` : ''}
        <p style="font-size:11px;"><strong>Claim Status:</strong> <span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:9999px;background:${tpaPillStyle.bg};color:${tpaPillStyle.fg};border:1px solid ${tpaPillStyle.border};">${tpaPill.label}</span></p>
    `;

    let beneficiaryHTML = `
        <p style="font-size:11px;"><strong>Patient (Beneficiary):</strong> ${patient.full_name || '-'}</p>
        <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id || '-'}</p>
        <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
        <p style="font-size:11px;"><strong>Phone:</strong> ${patient.phone || '-'}</p>
    `;
    if (isIPD) {
        const semi = isSemiDischarged(admission);
        beneficiaryHTML += `
            <p style="font-size:11px;"><strong>Admission ID:</strong> ${admission.admission_id}</p>
            <p style="font-size:11px;"><strong>Doctor:</strong> ${formatDoctorName(admission.doctor_name) || '-'}</p>
            <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
            <p style="font-size:11px;"><strong>Admitted:</strong> ${admissionDate}</p>
            <p style="font-size:11px;"><strong>${semi ? 'Discharge Date &amp; Time' : 'Discharged'}:</strong> ${dischargeDate || '—'}</p>
            ${semi ? `<p style="font-size:11px;"><strong>Status:</strong> <span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:9999px;background:#fef3c7;color:#b45309;border:1px solid #fde68a;">SEMI DISCHARGED — awaiting TPA approval</span></p>` : ''}
            <p style="font-size:11px;"><strong>LOS:</strong> ${los} day(s)</p>
            <p style="font-size:11px;"><strong>Diagnosis:</strong> ${admission.diagnosis || '-'}</p>
        `;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>TPA CLAIM BILL${invoice.invoice_number ? ` - ${invoice.invoice_number}` : ''}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        ${letterheadCss(branding)}
        .watermark { color: ${billColor}; }
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(branding)}
    <div class="watermark">TPA CLAIM</div>
    ${printButtonHtml(branding, 'TPA / Insurance claim bill' + (invoice.invoice_number ? ' for ' + invoice.invoice_number : ''))}
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
                        <h2 style="font-size:16px;font-weight:800;color:${billColor};">TPA / INSURANCE CLAIM BILL</h2>
                        <p style="font-size:12px;font-weight:700;color:${branding.accentColor};">${invoice.invoice_number || '—'}</p>
                        <p style="font-size:10px;color:#6b7280;">Type: <strong>${invoice.invoice_type || 'OPD'}</strong></p>
                        <p style="font-size:10px;color:#6b7280;">Date: ${billDate}</p>
                    </div>
                </div>

                <!-- Bill To (insurer) + Beneficiary (patient) -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:12px;">
                        <p style="font-size:10px;font-weight:800;color:${billColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Bill To</p>
                        ${billToHTML}
                    </div>
                    <div style="background:#f9fafb;border-radius:8px;padding:12px;">
                        <p style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Beneficiary</p>
                        ${beneficiaryHTML}
                    </div>
                </div>

                <!-- Actual charges -->
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
                </table>

                <!-- Claim amount summary — leads with the ACTUAL amount -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:8px;border:2px solid ${billColor};">
                    <tr style="background:#f5f3ff;">
                        <td style="padding:8px;font-size:12px;font-weight:800;color:${billColor};">ACTUAL BILL AMOUNT</td>
                        <td style="padding:8px;font-size:14px;font-weight:800;text-align:right;color:${billColor};">Rs. ${net.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 8px;font-size:11px;border-top:1px solid #e5e7eb;">Less: Patient Co-pay / Non-Payable</td>
                        <td style="padding:6px 8px;font-size:11px;text-align:right;border-top:1px solid #e5e7eb;">${patientCopay.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px;font-size:12px;font-weight:800;border-top:1px solid #000;">AMOUNT CLAIMED FROM TPA</td>
                        <td style="padding:8px;font-size:13px;font-weight:800;text-align:right;border-top:1px solid #000;">Rs. ${claimedFromTpa.toFixed(2)}</td>
                    </tr>
                </table>
                <p style="font-size:11px;margin-bottom:12px;"><strong>In words:</strong> ${numberToWords(claimedFromTpa)} (claimed)</p>

                ${insurerResponded ? `
                <!-- Full settlement waterfall — the complete story of a partial sanction / partial payment -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #f59e0b;">
                    <thead>
                        <tr style="background:#fef3c7;">
                            <th colspan="2" style="padding:6px 8px;text-align:left;font-size:11px;font-weight:800;color:#92400e;border-bottom:1px solid #f59e0b;">CLAIM SETTLEMENT SUMMARY</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="padding:4px 8px;font-size:11px;width:230px;font-weight:700;">Bill Amount (Claimed from TPA)</td><td style="padding:4px 8px;font-size:11px;font-weight:700;text-align:right;">${claimedFromTpa.toFixed(2)}</td></tr>
                        <tr style="background:#f0fdf4;"><td style="padding:4px 8px;font-size:11px;font-weight:700;">Received from TPA</td><td style="padding:4px 8px;font-size:11px;font-weight:700;text-align:right;color:#166534;">${tpaReceived.toFixed(2)}</td></tr>
                        ${tpaTds > 0 ? `<tr><td style="padding:4px 8px;font-size:11px;color:#991b1b;">Less: TDS deducted by TPA (10%)</td><td style="padding:4px 8px;font-size:11px;text-align:right;color:#991b1b;">${tpaTds.toFixed(2)}</td></tr>` : ''}
                        ${tpaDisallowedAtSettlement > 0 ? `<tr><td style="padding:4px 8px;font-size:11px;color:#991b1b;">Less: Disallowed / written off</td><td style="padding:4px 8px;font-size:11px;text-align:right;color:#991b1b;">${tpaDisallowedAtSettlement.toFixed(2)}</td></tr>` : ''}
                        <tr style="border-top:1px solid #000;"><td style="padding:6px 8px;font-size:12px;font-weight:800;">Balance Recoverable from TPA</td><td style="padding:6px 8px;font-size:12px;font-weight:800;text-align:right;color:${tpaBalance > 0.01 ? '#92400e' : '#166534'};">${tpaBalance.toFixed(2)}</td></tr>
                    </tbody>
                </table>
                <p style="font-size:9px;color:#9ca3af;margin-bottom:10px;">Disallowed / short-paid amounts are the portion the insurer will not settle. Recover from the patient or write off per policy; they are not part of the balance recoverable from the TPA.</p>` : `
                <p style="font-size:10px;color:#6b7280;margin-bottom:12px;padding:6px 8px;background:#f9fafb;border:1px dashed #d1d5db;border-radius:6px;">Claim not yet submitted or awaiting insurer approval — settlement figures will appear here once the TPA responds.</p>`}

                <p style="font-size:10px;text-align:right;color:#666;margin-bottom:10px;">(All figures are in Rupees (INR) only)</p>
                <p style="font-size:9px;color:#9ca3af;margin-bottom:10px;">This is the hospital's claim bill addressed to the insurer/TPA, reflecting the actual treatment charges. The patient's own bill is issued separately.</p>
                ${billFooterHtml(branding)}
            </div>
        </td></tr></tbody>
        <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
    </table>
</body>
</html>`;
}
