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
            include: { corporate: { select: { company_name: true } } },
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

        // Resolve the payer "Category" shown on the sticker (e.g. MEDI ASSIST / a corporate / CASH).
        const policy = await prisma.insurance_policies.findFirst({
            where: { patient_id: patientId, organizationId },
            orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
            include: { provider: { select: { provider_name: true } } },
        });
        const ptype = String((patient as any).patient_type || '').toLowerCase();
        let category = 'CASH';
        if (['tpa_insurance', 'insurance', 'tpa'].includes(ptype) || policy) {
            category = ((policy as any)?.provider?.provider_name || (policy as any)?.corporate_name || 'TPA / INSURANCE');
        } else if (ptype === 'corporate' || (patient as any).corporate) {
            category = ((patient as any).corporate?.company_name || 'CORPORATE');
        }
        category = category.toUpperCase();

        const branding = await getBillBranding(organizationId);

        const html = generateStickerHTML(patient, admission, latestAppointment, branding, category);
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Sticker generation error:', error);
        return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
    }
}

// Code128-B barcode rendered as a self-contained SVG (no CDN / client JS), so it
// always prints — including on offline label PCs where the old JsBarcode CDN failed.
const CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

function code128Svg(value: string, height = 22, moduleWidth = 1.4): string {
    const START_B = 104, STOP = 106;
    const codes = [START_B];
    let checksum = START_B;
    for (let i = 0; i < value.length; i++) {
        const v = value.charCodeAt(i) - 32; // Code-B: printable ASCII 32..126
        if (v < 0 || v > 94) continue;      // skip anything outside the set
        codes.push(v);
        checksum += v * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(STOP);

    let x = 0;
    let rects = '';
    for (const code of codes) {
        const pat = CODE128_PATTERNS[code];
        let bar = true;
        for (const ch of pat) {
            const w = parseInt(ch, 10) * moduleWidth;
            if (bar) rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
            x += w;
            bar = !bar;
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${x.toFixed(1)}" height="${height}" viewBox="0 0 ${x.toFixed(1)} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges"><g fill="#000">${rects}</g></svg>`;
}

function generateStickerHTML(patient: any, admission: any, appointment: any, branding: any, category: string = 'CASH') {
    const name = (patient.title ? patient.title + ' ' : '') + (patient.full_name || '-');
    const uhid = patient.patient_id || '-';
    const age = patient.age || '-';
    const gender = (patient.gender || '-').charAt(0).toUpperCase();
    const phone = patient.phone || '-';
    const isIPD = !!admission;

    // dd-mm-yyyy hh:mm AM/PM (IST). hourCycle h12 so the noon hour shows 12, not 00.
    const fmtDateTime = (d: any) => {
        const dt = new Date(d);
        const date = dt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        const time = dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h12' }).toUpperCase();
        return `${date} ${time}`;
    };

    const admDate = isIPD && admission.admission_date
        ? fmtDateTime(admission.admission_date)
        : new Date(patient.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

    const ipdNo = isIPD ? admission.admission_id : '';
    const doctorName = isIPD
        ? (admission.doctor_name || '-')
        : (appointment?.doctor_name || patient.department || '-');
    const dateLabel = isIPD ? 'DOA' : 'Date';

    const barcodeValue = uhid;
    const barcodeSvg = code128Svg(barcodeValue);

    // ST-24 format: 64mm x 34mm, 3 columns x 8 rows = 24 stickers per A4
    const stickerHtml = `
        <div class="sticker">
            <div class="st-name">${name}</div>
            <div class="st-row">MRN : ${uhid}</div>
            <div class="st-row">${dateLabel}: ${admDate} <span class="st-age">${age} Y /${gender}</span></div>
            ${isIPD ? `<div class="st-row">IP No.: ${ipdNo}</div>` : ''}
            <div class="st-row">Doctor: ${doctorName}</div>
            <div class="st-row">Category: ${category}</div>
            <div class="st-row">P.No:${phone}</div>
            <div class="barcode-container">
                ${barcodeSvg}
                <div class="st-barcode-val">${barcodeValue}</div>
            </div>
        </div>`;

    const stickers = Array(24).fill(stickerHtml).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Stickers - ${uhid}</title>
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

        .st-name { font-size: 9.5px; font-weight: 900; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.5px; }
        .st-row { font-size: 7.5px; line-height: 1.32; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .st-age { float: right; font-weight: 700; }

        .barcode-container {
            margin-top: auto;
            text-align: center;
        }

        .barcode-container svg {
            height: 22px;
            width: 95%;
            display: block;
            margin: 0 auto;
        }
        .st-barcode-val { font-size: 6.5px; letter-spacing: 0.5px; line-height: 1.1; }

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
</body>
</html>`;
}
