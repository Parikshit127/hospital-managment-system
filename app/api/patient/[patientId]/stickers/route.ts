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

        const branding = await getBillBranding(organizationId);

        // Get sticker count from query param (default 8)
        const url = new URL(req.url);
        const count = Math.min(Math.max(parseInt(url.searchParams.get('count') || '8'), 1), 16);

        const html = generateStickerHTML(patient, admission, branding, count);
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Sticker generation error:', error);
        return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
    }
}

function generateStickerHTML(patient: any, admission: any, branding: any, count: number) {
    const name = (patient.title ? patient.title + ' ' : '') + (patient.full_name || '-');
    const uhid = patient.patient_id || '-';
    const age = patient.age || '-';
    const gender = (patient.gender || '-').charAt(0).toUpperCase();
    const phone = patient.phone || '-';
    const category = 'PAYING';
    const isIPD = !!admission;

    const admDate = isIPD && admission.admission_date
        ? new Date(admission.admission_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + new Date(admission.admission_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : new Date(patient.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const ipdNo = isIPD ? admission.admission_id : '';
    const doctorName = isIPD ? (admission.doctor_name || '-') : '';
    const dateLabel = isIPD ? 'DOA' : 'Reg. Date';

    // Build barcode using Code 128 pattern via CSS/SVG
    // We'll use a simple barcode font approach with the UHID
    const barcodeValue = uhid;

    const stickerHtml = `
        <div class="sticker">
            <div class="sticker-content">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div style="font-size:13px;font-weight:900;line-height:1.2;">${name}</div>
                    <div style="font-size:11px;font-weight:700;white-space:nowrap;margin-left:8px;">${age} Y /${gender}</div>
                </div>
                <div style="font-size:10px;margin-top:3px;">MRN : ${uhid}</div>
                <div style="font-size:10px;">${dateLabel}: ${admDate}</div>
                ${isIPD ? `<div style="font-size:10px;">IP No.: ${ipdNo}</div>` : ''}
                ${doctorName ? `<div style="font-size:10px;">Doctor: ${doctorName}</div>` : ''}
                <div style="font-size:10px;">Category: ${category}</div>
                <div style="font-size:10px;">P.No:${phone}</div>
                <div class="barcode-container">
                    <svg class="barcode-svg" id="barcode-template"></svg>
                </div>
            </div>
        </div>`;

    const stickers = Array(count).fill(stickerHtml).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Patient Stickers - ${uhid}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; background: #fff; }

        .no-print { padding: 12px; text-align: center; background: #f3f4f6; }
        .no-print button { padding: 8px 24px; background: #333; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin: 0 4px; }

        .sticker-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            max-width: 210mm;
            margin: 0 auto;
            padding: 5mm;
        }

        .sticker {
            width: 95mm;
            height: 55mm;
            border: 0.5px dashed #ccc;
            padding: 4mm;
            overflow: hidden;
            page-break-inside: avoid;
        }

        .sticker-content {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }

        .barcode-container {
            margin-top: auto;
            text-align: center;
            padding-top: 2px;
        }

        .barcode-container svg {
            height: 28px;
            width: 100%;
        }

        @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
            .sticker { border: none; }
            .sticker-grid { padding: 2mm; }
            @page { margin: 5mm; size: A4; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">Print Stickers</button>
        <span style="margin:0 8px;font-size:12px;color:#666;">Sticker count: ${count} | UHID: ${uhid}</span>
        <a href="?count=8" style="font-size:12px;margin:0 4px;">8 stickers</a>
        <a href="?count=10" style="font-size:12px;margin:0 4px;">10 stickers</a>
        <a href="?count=12" style="font-size:12px;margin:0 4px;">12 stickers</a>
    </div>
    <div class="sticker-grid">
        ${stickers}
    </div>
    <script>
        // Generate barcodes after page loads
        document.addEventListener('DOMContentLoaded', function() {
            const stickers = document.querySelectorAll('.sticker');
            stickers.forEach(function(sticker, index) {
                const container = sticker.querySelector('.barcode-container');
                if (container) {
                    const svgId = 'barcode-' + index;
                    container.innerHTML = '<svg id="' + svgId + '"></svg>';
                    try {
                        JsBarcode('#' + svgId, '${barcodeValue}', {
                            format: 'CODE128',
                            width: 1.5,
                            height: 28,
                            displayValue: false,
                            margin: 0,
                        });
                    } catch(e) {
                        container.innerHTML = '<div style="font-family:monospace;font-size:10px;letter-spacing:2px;">${barcodeValue}</div>';
                    }
                }
            });
        });
    </script>
</body>
</html>`;
}
