import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { verifySignedReportToken } from '@/app/lib/signed-url';
import { getBillBranding, inlineHeaderHtml, type BillBranding } from '@/app/lib/bill-branding';
import { computeLabFlag, parseLeadingNumber, rangeText } from '@/app/lib/lab/flag';

const ALLOWED_STAFF_ROLES = ['admin', 'doctor', 'lab_technician', 'receptionist', 'finance', 'ipd_manager', 'nurse'];

// Reference range for this test + the patient's prior results (for the trend).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchReportExtras(order: any, organizationId: string) {
    const testInfo = await prisma.lab_test_inventory.findFirst({
        where: { test_name: order.test_type, organizationId },
        select: { normal_range_min: true, normal_range_max: true, critical_value_low: true, critical_value_high: true, unit: true },
    });
    const history = await prisma.lab_orders.findMany({
        where: { patient_id: order.patient_id, test_type: order.test_type, status: 'Completed', organizationId, barcode: { not: order.barcode } },
        select: { result_value: true, created_at: true },
        orderBy: { created_at: 'desc' },
        take: 5,
    });
    return { testInfo, history };
}

export async function GET(req: NextRequest) {
    try {
        // Signed token access (patient portal signed URLs — 15-min expiry)
        const signedToken = req.nextUrl.searchParams.get('token');
        if (signedToken) {
            const verified = verifySignedReportToken(signedToken);
            if (!verified) {
                return NextResponse.json(
                    { error: 'Link expired or invalid. Please generate a new report link.' },
                    { status: 403 },
                );
            }

            const order = await prisma.lab_orders.findFirst({
                where: { barcode: verified.barcode, organizationId: verified.organizationId },
            });

            if (!order) {
                return NextResponse.json({ error: 'Lab order not found' }, { status: 404 });
            }

            const patient = await prisma.oPD_REG.findFirst({
                where: { patient_id: order.patient_id, organizationId: verified.organizationId },
                select: { full_name: true, patient_id: true, phone: true, age: true, gender: true },
            });

            const branding = await getBillBranding(verified.organizationId);
            const extras = await fetchReportExtras(order, verified.organizationId);
            return renderLabReport(order, patient, verified.barcode, branding, extras.testInfo, extras.history);
        }

        // Standard auth-based access (staff + patient portal)
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const barcode = req.nextUrl.searchParams.get('barcode');
        if (!barcode) {
            return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
        }

        const order = await prisma.lab_orders.findFirst({
            where: {
                barcode,
                organizationId: auth.context.organizationId,
            },
        });

        if (!order) {
            return NextResponse.json({ error: 'Lab order not found' }, { status: 404 });
        }

        if (auth.context.kind === 'patient' && order.patient_id !== auth.context.session.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const patient = await prisma.oPD_REG.findFirst({
            where: {
                patient_id: order.patient_id,
                organizationId: auth.context.organizationId,
            },
            select: { full_name: true, patient_id: true, phone: true, age: true, gender: true },
        });

        const branding = await getBillBranding(auth.context.organizationId);
        const extras = await fetchReportExtras(order, auth.context.organizationId);
        return renderLabReport(order, patient, barcode, branding, extras.testInfo, extras.history);
    } catch (error) {
        console.error('Lab PDF Error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLabReport(order: any, patient: any, barcode: string, branding: BillBranding, testInfo?: any, history?: any[]): NextResponse {
    const patientName = patient?.full_name || 'Unknown';
    const orderDate = order.created_at
        ? new Date(order.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

    // Reference range + auto-flag for the result value
    const refText = testInfo ? rangeText(testInfo) : null;
    const numericResult = parseLeadingNumber(order.result_value);
    const flag = numericResult != null && testInfo ? computeLabFlag(numericResult, testInfo) : null;
    const flagColor = flag
        ? (flag.level === 'critical' ? '#b91c1c' : flag.level === 'high' ? '#b45309' : flag.level === 'low' ? '#1d4ed8' : '#065f46')
        : '#6b7280';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Lab Report - ${patientName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; padding: 24px; max-width: 800px; margin: 0 auto; }
        @media print { body { margin: 0; padding: 16px; } .no-print { display: none !important; } }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #ea580c; padding-bottom: 16px; }
        .header h1 { font-size: 18px; font-weight: 900; color: #ea580c; }
        .header p { font-size: 10px; color: #6b7280; margin-top: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; background: #f9fafb; padding: 12px; border-radius: 8px; }
        .info-item label { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-item p { font-size: 12px; font-weight: 600; color: #1f2937; margin-top: 2px; }
        .result-box { background: #fff7ed; border: 1px solid #99f6e4; border-radius: 8px; padding: 16px; margin-top: 20px; }
        .result-box h3 { font-size: 10px; font-weight: 800; color: #ea580c; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .result-value { font-size: 16px; font-weight: 900; color: #1f2937; }
        .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
        .status-completed { background: #d1fae5; color: #065f46; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;">
        <button onclick="window.print()" style="padding:8px 24px;background:#ea580c;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;">
            Print / Download PDF
        </button>
    </div>

    ${inlineHeaderHtml(branding, `<h1 style="font-size:18px;font-weight:900;color:${branding.accentColor};">Laboratory Report</h1><p style="font-size:10px;color:#6b7280;margin-top:4px;">${branding.hospitalName} — Pathology Department</p>`)}


    <div class="info-grid">
        <div class="info-item">
            <label>Patient Name</label>
            <p>${patientName}</p>
        </div>
        <div class="info-item">
            <label>Patient ID</label>
            <p>${patient?.patient_id || 'N/A'}</p>
        </div>
        <div class="info-item">
            <label>Age / Gender</label>
            <p>${patient?.age || 'N/A'} / ${patient?.gender || 'N/A'}</p>
        </div>
        <div class="info-item">
            <label>Barcode</label>
            <p>${barcode}</p>
        </div>
        <div class="info-item">
            <label>Test Type</label>
            <p>${order.test_type}</p>
        </div>
        <div class="info-item">
            <label>Order Date</label>
            <p>${orderDate}</p>
        </div>
        <div class="info-item">
            <label>Status</label>
            <p><span class="status ${order.status === 'Completed' ? 'status-completed' : 'status-pending'}">${order.status}</span></p>
        </div>
        <div class="info-item">
            <label>Referring Doctor</label>
            <p>${order.doctor_id || 'N/A'}</p>
        </div>
    </div>

    ${order.result_value ? `
    <div class="result-box">
        <h3>Test Result</h3>
        <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;">
            <div class="result-value">${order.result_value}</div>
            ${flag ? `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:800;background:${flagColor}1a;color:${flagColor};border:1px solid ${flagColor}55;">${flag.label}</span>` : ''}
        </div>
        ${refText ? `<p style="font-size:11px;color:#6b7280;margin-top:8px;">Reference range: <b style="color:#374151;">${refText}</b></p>` : ''}
    </div>
    ` : `
    <div style="text-align:center;padding:24px;color:#9ca3af;">
        <p style="font-weight:700;">Results Pending</p>
        <p style="font-size:10px;margin-top:4px;">This test is still being processed.</p>
    </div>
    `}

    ${history && history.length ? `
    <div style="margin-top:20px;">
        <h3 style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Previous Results — ${order.test_type}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="text-align:left;color:#9ca3af;">
                <th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">Date</th>
                <th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">Result</th>
            </tr></thead>
            <tbody>
            ${history.map((h: any) => `<tr>
                <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${h.created_at ? new Date(h.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : ''}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;color:#374151;font-weight:600;">${h.result_value || '-'}</td>
            </tr>`).join('')}
            </tbody>
        </table>
    </div>
    ` : ''}

    <div class="footer">
        ${order.result_value ? `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
            <div style="border-top:1px solid #9ca3af;width:180px;text-align:center;padding-top:4px;">
                <p style="font-size:10px;font-weight:700;color:#374151;">Verified by: ${order.assigned_technician_id || 'Pathology Department'}</p>
                <p style="font-size:9px;color:#9ca3af;">${branding.hospitalName}</p>
            </div>
        </div>` : ''}
        <p style="font-size:9px;color:#9ca3af;">Reference ranges may vary by method and laboratory. Please correlate clinically.</p>
        <p style="margin-top:4px;">Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
    </div>
</body>
</html>`;

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
