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
    type BillBranding,
} from '@/app/lib/bill-branding';
import { getBillSections } from '@/app/lib/bill-sections';
import { formatDoctorName } from '@/app/lib/format-name';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; version: string }> },
) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: false,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { id: rawId, version: rawVersion } = await params;
        const invoiceId = parseInt(rawId, 10);
        const versionNumber = parseInt(rawVersion, 10);
        if (isNaN(invoiceId) || isNaN(versionNumber)) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
        }

        const snapshot = await prisma.invoice_snapshots.findFirst({
            where: {
                invoice_id: invoiceId,
                version_number: versionNumber,
                organizationId: auth.context.organizationId,
            },
        });
        if (!snapshot) {
            return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
        }

        const inv = snapshot.snapshot_data as any;

        // Fetch live invoice for patient_id / admission_id (these never change)
        const liveInvoice = await prisma.invoices.findFirst({
            where: { id: invoiceId, organizationId: auth.context.organizationId },
            select: { patient_id: true, admission_id: true, doctor_name: true },
        });

        const patientId = inv.patient_id || liveInvoice?.patient_id;
        const patient = patientId
            ? await prisma.oPD_REG.findFirst({
                where: { patient_id: patientId },
                select: { full_name: true, patient_id: true, phone: true, age: true, gender: true },
            })
            : null;

        let admission: any = null;
        if (liveInvoice?.admission_id) {
            admission = await prisma.admissions.findFirst({
                where: { admission_id: liveInvoice.admission_id },
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

        const branding = await getBillBranding(auth.context.organizationId);
        const sections = await getBillSections(auth.context.organizationId, 'invoice');

        const html = renderSnapshotBillHTML({
            snapshot: inv,
            patient: patient || { full_name: '—', patient_id: '—', phone: null, age: null, gender: null },
            admission,
            org,
            branding,
            sections,
            versionNumber,
            changedBy: (snapshot as any).changed_by,
            changedAt: (snapshot as any).changed_at,
            changeSummary: (snapshot as any).change_summary,
            opdDoctor: liveInvoice?.doctor_name || '',
        });

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Snapshot bill error:', error);
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

function renderSnapshotBillHTML({
    snapshot,
    patient,
    admission,
    org,
    branding,
    sections,
    versionNumber,
    changedBy,
    changedAt,
    changeSummary,
    opdDoctor,
}: {
    snapshot: any;
    patient: any;
    admission: any;
    org: any;
    branding: BillBranding;
    sections: any;
    versionNumber: number;
    changedBy: string | null;
    changedAt: string | Date;
    changeSummary: string | null;
    opdDoctor: string;
}) {
    const items: any[] = snapshot.items || [];
    const isIPD = !!admission;
    const fmtDate = fmtBillDate;
    const gstin = branding.gstin;

    // Recompute totals from snapshot items (stored values may already be correct)
    const total = items.reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
    const totalDiscount = items.reduce((s: number, i: any) => s + Number(i.discount || 0), 0);
    const net = items.reduce((s: number, i: any) => s + Number(i.net_price), 0);
    const paid = Number(snapshot.paid_amount || 0);
    const balance = net - paid;

    // Group items by service_category/department
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

    const invoiceDate = fmtDate(snapshot.created_at);
    const snapshotDate = fmtBillDateTime(changedAt);

    let patientInfoHTML = `
        <p style="font-size:11px;"><strong>Patient:</strong> ${patient.full_name || '—'}</p>
        <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id || '—'}</p>
        <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '—'} / ${patient.gender || '—'}</p>
        <p style="font-size:11px;"><strong>Phone:</strong> ${patient.phone || '—'}</p>
        ${!isIPD ? `<p style="font-size:11px;"><strong>Doctor:</strong> ${opdDoctor ? formatDoctorName(opdDoctor) : '—'}</p>` : ''}
    `;
    if (isIPD) {
        patientInfoHTML += `
            <p style="font-size:11px;"><strong>Admission ID:</strong> ${admission.admission_id}</p>
            <p style="font-size:11px;"><strong>Doctor:</strong> ${formatDoctorName(admission.doctor_name) || '—'}</p>
            <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '—'} / ${admission.bed?.bed_id || '—'}</p>
            <p style="font-size:11px;"><strong>Admitted:</strong> ${admissionDate}</p>
            ${dischargeDate ? `<p style="font-size:11px;"><strong>Discharged:</strong> ${dischargeDate}</p>` : ''}
            <p style="font-size:11px;"><strong>LOS:</strong> ${los} day(s)</p>
        `;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>HISTORICAL BILL v${versionNumber} - ${snapshot.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        ${letterheadCss(branding)}
        .watermark { color: #d97706; }
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(branding)}
    <div class="watermark">HISTORICAL BILL — VERSION ${versionNumber}</div>
    ${printButtonHtml(branding, `Historical bill v${versionNumber} for ${snapshot.invoice_number}`)}

    <!-- Historical bill banner -->
    <div style="background:#fef3c7;border:2px solid #f59e0b;color:#92400e;padding:10px 16px;margin:0 60px 12px;border-radius:6px;text-align:center;">
        <div style="font-weight:800;font-size:13px;letter-spacing:0.5px;">PREVIOUSLY MODIFIED BILL — VERSION ${versionNumber}</div>
        <div style="font-size:11px;margin-top:4px;">
            This is a historical snapshot. Current bill may differ.
            ${changeSummary ? `<strong>Change:</strong> ${changeSummary}` : ''}
            ${changedBy ? ` &nbsp;·&nbsp; <strong>Modified by:</strong> ${changedBy}` : ''}
            &nbsp;·&nbsp; <strong>Snapshot captured:</strong> ${snapshotDate}
        </div>
    </div>

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
                        <h2 style="font-size:16px;font-weight:800;color:#d97706;">HISTORICAL BILL</h2>
                        <p style="font-size:12px;font-weight:700;color:${branding.accentColor};">${snapshot.invoice_number}</p>
                        <p style="font-size:10px;color:#6b7280;">Version: <strong>${versionNumber}</strong></p>
                        <p style="font-size:10px;color:#6b7280;">Invoice Date: ${invoiceDate}</p>
                        <p style="font-size:10px;color:#6b7280;">Type: <strong>${snapshot.invoice_type || 'OPD'}</strong></p>
                    </div>
                </div>

                ${sections.showPatientInfo ? `
                <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${patientInfoHTML}</div>
                </div>` : ''}

                ${sections.showLineItems ? `
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
                        ${detailRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#999;">No charges in this version</td></tr>'}
                        <tr style="border-top:2px solid #000;font-weight:bold;">
                            <td colspan="3" style="padding:6px 8px;font-size:11px;">Total</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${total.toFixed(2)}</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${totalDiscount.toFixed(2)}</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${(total - totalDiscount).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>` : ''}

                <!-- Amount Summary -->
                <table style="width:100%;margin-bottom:12px;">
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;width:140px;">Bill Amount:</td><td style="font-size:11px;">${total.toFixed(2)} - ${numberToWords(total)}</td></tr>
                    ${totalDiscount > 0 ? `<tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Discount:</td><td style="font-size:11px;">${totalDiscount.toFixed(2)}</td></tr>` : ''}
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Net Amount:</td><td style="font-size:11px;">${net.toFixed(2)} - ${numberToWords(net)}</td></tr>
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Paid Amount:</td><td style="font-size:11px;">${paid.toFixed(2)} - ${numberToWords(paid)}</td></tr>
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Balance:</td><td style="font-size:11px;">${balance.toFixed(2)} - ${numberToWords(balance)}</td></tr>
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
