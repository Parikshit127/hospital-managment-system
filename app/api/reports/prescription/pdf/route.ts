import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';

const ALLOWED_STAFF_ROLES = ['admin', 'doctor', 'pharmacist', 'receptionist', 'finance', 'ipd_manager', 'nurse'];

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const orderId = req.nextUrl.searchParams.get('orderId');
        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        const parsedOrderId = parseInt(orderId);
        if (Number.isNaN(parsedOrderId)) {
            return NextResponse.json({ error: 'Invalid Order ID' }, { status: 400 });
        }

        const order = await prisma.pharmacy_orders.findFirst({
            where: {
                id: parsedOrderId,
                organizationId: auth.context.organizationId,
            },
            include: { items: true },
        });

        if (!order) {
            return NextResponse.json({ error: 'Pharmacy order not found' }, { status: 404 });
        }

        if (auth.context.kind === 'patient' && order.patient_id !== auth.context.session.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const patient = await prisma.oPD_REG.findFirst({
            where: {
                patient_id: order.patient_id,
                organizationId: auth.context.organizationId,
            },
            select: { full_name: true, patient_id: true, age: true, gender: true, phone: true },
        });

        const patientName = patient?.full_name || 'Unknown';
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
        const items = order.items || [];

        const itemsHTML = items.map((item: any, idx: number) => `
            <tr>
                <td style="font-weight:600;">${idx + 1}</td>
                <td style="font-weight:700;">${item.medicine_name}</td>
                <td>${item.dosage || '-'}</td>
                <td>${item.frequency || '-'}</td>
                <td>${item.duration || '-'}</td>
                <td style="text-align:center;">${item.quantity}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Prescription - ${patientName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; padding: 24px; max-width: 800px; margin: 0 auto; }
        @media print { body { margin: 0; padding: 16px; } .no-print { display: none !important; } }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #7c3aed; padding-bottom: 16px; }
        .header h1 { font-size: 18px; font-weight: 900; color: #7c3aed; }
        .header p { font-size: 10px; color: #6b7280; margin-top: 4px; }
        .rx { font-size: 28px; font-weight: 900; color: #7c3aed; margin-bottom: 16px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; background: #f9fafb; padding: 12px; border-radius: 8px; }
        .info-item label { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-item p { font-size: 12px; font-weight: 600; color: #1f2937; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { font-size: 9px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; background: #f9fafb; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
        .signature { margin-top: 32px; text-align: right; }
        .signature-line { border-top: 1px solid #1f2937; width: 200px; margin-left: auto; padding-top: 4px; font-size: 10px; font-weight: 600; }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;">
        <button onclick="window.print()" style="padding:8px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;">
            Print / Download PDF
        </button>
    </div>

    <div class="header">
        <h1>Prescription</h1>
        <p>Hospital OS</p>
    </div>

    <div class="rx">&#8478;</div>

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
            <label>Date</label>
            <p>${orderDate}</p>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th style="text-align:center;">Qty</th>
            </tr>
        </thead>
        <tbody>
            ${itemsHTML || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;">No items</td></tr>'}
        </tbody>
    </table>

    <div class="signature">
        <div class="signature-line">Doctor's Signature</div>
    </div>

    <div class="footer" style="text-align:center;font-size:9px;color:#9ca3af;">
        <p>This is a computer-generated prescription. Generated on ${new Date().toLocaleString('en-IN')}</p>
    </div>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error) {
        console.error('Prescription PDF Error:', error);
        return NextResponse.json({ error: 'Failed to generate prescription' }, { status: 500 });
    }
}
