import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

export async function GET(req: NextRequest) {
    try {
        const barcode = req.nextUrl.searchParams.get('barcode');
        if (!barcode) {
            return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
        }

        const order = await prisma.lab_orders.findUnique({
            where: { barcode },
        });

        if (!order) {
            return NextResponse.json({ error: 'Lab order not found' }, { status: 404 });
        }

        const patient = await prisma.oPD_REG.findUnique({
            where: { patient_id: order.patient_id },
            select: { full_name: true, patient_id: true, phone: true, age: true, gender: true },
        });

        const patientName = patient?.full_name || 'Unknown';
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Lab Report - ${patientName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; padding: 24px; max-width: 800px; margin: 0 auto; }
        @media print { body { margin: 0; padding: 16px; } .no-print { display: none !important; } }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0d9488; padding-bottom: 16px; }
        .header h1 { font-size: 18px; font-weight: 900; color: #0d9488; }
        .header p { font-size: 10px; color: #6b7280; margin-top: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; background: #f9fafb; padding: 12px; border-radius: 8px; }
        .info-item label { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-item p { font-size: 12px; font-weight: 600; color: #1f2937; margin-top: 2px; }
        .result-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 16px; margin-top: 20px; }
        .result-box h3 { font-size: 10px; font-weight: 800; color: #0d9488; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .result-value { font-size: 16px; font-weight: 900; color: #1f2937; }
        .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
        .status-completed { background: #d1fae5; color: #065f46; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;">
        <button onclick="window.print()" style="padding:8px 24px;background:#0d9488;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;">
            Print / Download PDF
        </button>
    </div>

    <div class="header">
        <h1>Laboratory Report</h1>
        <p>Hospital OS - Pathology Department</p>
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
    } catch (error) {
        console.error('Lab PDF Error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
