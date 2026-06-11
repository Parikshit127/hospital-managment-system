import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding } from '@/app/lib/bill-branding';

const ALLOWED_STAFF_ROLES = ['admin', 'receptionist', 'doctor', 'ipd_manager', 'nurse'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;

        const { patientId } = await params;
        const organizationId = auth.context.organizationId;

        const patient = await prisma.oPD_REG.findFirst({
            where: { patient_id: patientId, organizationId },
        });
        if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

        // Check if patient has an active admission (IPD)
        const admission = await prisma.admissions.findFirst({
            where: { patient_id: patientId, organizationId, status: 'Admitted' },
            include: { ward: true, bed: true },
        });

        // Get latest appointment to find the doctor (for OPD)
        const latestAppointment = await prisma.appointments.findFirst({
            where: { patient_id: patientId, organizationId },
            orderBy: { appointment_date: 'desc' },
            select: { doctor_name: true, department: true },
        });

        const branding = await getBillBranding(organizationId);

        const html = generateStickerHTML(patient, admission, latestAppointment, branding);
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Sticker generation error:', error);
        return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
    }
}

function generateStickerHTML(patient: any, admission: any, appointment: any, branding: any) {
    const name = (patient.title ? patient.title + ' ' : '') + (patient.full_name || '-');
    const uhid = patient.patient_id || '-';
    const age = patient.age || '-';
    const gender = (patient.gender || '-').charAt(0).toUpperCase();
    const phone = patient.phone || '-';
    const category = 'PAYING';
    const isIPD = !!admission;

    const admDate = isIPD && admission.admission_date
        ? new Date(admission.admission_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + new Date(admission.admission_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : new Date(patient.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const ipdNo = isIPD ? admission.admission_id : '';
    const doctorName = isIPD
        ? (admission.doctor_name || '-')
        : (appointment?.doctor_name || patient.department || '-');
    const dateLabel = isIPD ? 'DOA' : 'Date';

    const barcodeValue = uhid;

    // ST-24 format: 64mm x 34mm, 3 columns x 8 rows = 24 stickers per A4
    const stickerHtml = `
        <div class="sticker">
            <div style="font-size:8px;font-weight:900;line-height:1.1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${name}</div>
            <div style="font-size:7px;margin-top:1px;">MRN : ${uhid} <span style="float:right;">${age} Y /${gender}</span></div>
            <div style="font-size:7px;">${dateLabel}: ${admDate}</div>
            ${isIPD ? `<div style="font-size:7px;">IP No.: ${ipdNo}</div>` : ''}
            <div style="font-size:7px;">Doctor: ${doctorName}</div>
            <div style="font-size:7px;">Category: ${category} <span style="float:right;">P.No:${phone}</span></div>
            <div class="barcode-container">
                <svg></svg>
            </div>
        </div>`;

    const stickers = Array(24).fill(stickerHtml).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Stickers - ${uhid}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; background: #fff; }

        .no-print { padding: 10px; text-align: center; background: #f3f4f6; }
        .no-print button { padding: 8px 24px; background: #333; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }

        .sticker-grid {
            display: grid;
            grid-template-columns: repeat(3, 64mm);
            grid-template-rows: repeat(8, 34mm);
            gap: 0;
            width: 210mm;
            height: 297mm;
            margin: 0 auto;
            padding: 4.5mm 7mm;
        }

        .sticker {
            width: 64mm;
            height: 34mm;
            padding: 2mm 3mm;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }

        .barcode-container {
            margin-top: auto;
            text-align: center;
        }

        .barcode-container svg {
            height: 16px;
            width: 90%;
        }

        @media screen {
            .sticker { border: 0.5px dashed #ddd; }
        }

        @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
            @page { margin: 0; size: A4; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">Print 24 Stickers (ST-24 A4)</button>
        <span style="margin-left:12px;font-size:12px;color:#666;">UHID: ${uhid} | 64mm x 34mm x 24</span>
    </div>
    <div class="sticker-grid">
        ${stickers}
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.sticker').forEach(function(sticker, i) {
                var container = sticker.querySelector('.barcode-container');
                if (container) {
                    var svgId = 'bc-' + i;
                    container.innerHTML = '<svg id="' + svgId + '"></svg>';
                    try {
                        JsBarcode('#' + svgId, '${barcodeValue}', {
                            format: 'CODE128',
                            width: 1,
                            height: 16,
                            displayValue: false,
                            margin: 0,
                        });
                    } catch(e) {
                        container.innerHTML = '<div style="font-size:7px;font-family:monospace;">${barcodeValue}</div>';
                    }
                }
            });
        });
    <\/script>
</body>
</html>`;
}
