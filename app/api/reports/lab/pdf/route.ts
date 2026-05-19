import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { verifySignedReportToken } from '@/app/lib/signed-url';

const ALLOWED_STAFF_ROLES = ['admin', 'doctor', 'lab_technician', 'receptionist', 'finance', 'ipd_manager', 'nurse'];

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

            return renderLabReport(order, patient, verified.barcode);
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

        return renderLabReport(order, patient, barcode);
    } catch (error) {
        console.error('Lab PDF Error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLabReport(order: any, patient: any, barcode: string): NextResponse {
    const patientName = patient?.full_name || 'Unknown';
    const orderDate = order.created_at
        ? new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

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

    <div class="header">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="267" height="80" style="display:block;margin:0 auto 10px;">
          <text x="10" y="72" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="68" fill="#1e3a6e" letter-spacing="-2">Axten</text>
          <rect x="10" y="80" width="60" height="8" fill="#f97316" rx="2"/>
          <rect x="130" y="80" width="120" height="8" fill="#f97316" rx="2"/>
          <text x="75" y="89" font-family="Arial, sans-serif" font-weight="700" font-size="16" fill="#1e3a6e" letter-spacing="6">HOSPITALS</text>
          <text x="10" y="110" font-family="Arial, sans-serif" font-weight="400" font-size="12" fill="#1e3a6e">A Unit of TAH Global Healthcare Pvt. Ltd.</text>
          <circle cx="360" cy="55" r="48" fill="none" stroke="#1e3a6e" stroke-width="3"/>
          <circle cx="360" cy="55" r="42" fill="none" stroke="#1e3a6e" stroke-width="1"/>
          <rect x="350" y="35" width="20" height="40" fill="none" stroke="#f97316" stroke-width="3" rx="3"/>
          <rect x="340" y="45" width="40" height="20" fill="none" stroke="#f97316" stroke-width="3" rx="3"/>
        </svg>
        <h1>Laboratory Report</h1>
        <p>Axten Hospitals — Pathology Department</p>
    </div>

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
        <div class="result-value">${order.result_value}</div>
    </div>
    ` : `
    <div style="text-align:center;padding:24px;color:#9ca3af;">
        <p style="font-weight:700;">Results Pending</p>
        <p style="font-size:10px;margin-top:4px;">This test is still being processed.</p>
    </div>
    `}

    <div class="footer">
        <p>This is a computer-generated report. No signature required.</p>
        <p style="margin-top:4px;">Generated on ${new Date().toLocaleString('en-IN')}</p>
    </div>
</body>
</html>`;

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
