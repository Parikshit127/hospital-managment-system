import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import {
    getBillBranding,
    letterheadBackgroundHtml,
    letterheadCss,
    printButtonHtml,
    type BillBranding,
} from '@/app/lib/bill-branding';

const ALLOWED_STAFF_ROLES = ['admin', 'receptionist', 'doctor', 'opd_manager', 'nurse'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;

        const { patientId } = await params;
        if (!patientId) {
            return NextResponse.json({ error: 'Invalid patient id' }, { status: 400 });
        }

        // Optional ?appointmentId= picks a specific visit; otherwise use the latest.
        const apptIdParam = req.nextUrl.searchParams.get('appointmentId');

        const patient = await prisma.oPD_REG.findFirst({
            where: { patient_id: patientId, organizationId: auth.context.organizationId },
            include: {
                corporate: { select: { company_name: true } },
            },
        });
        if (!patient) {
            return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
        }

        const appointment = apptIdParam
            ? await prisma.appointments.findFirst({
                  where: { appointment_id: apptIdParam, patient_id: patientId },
              })
            : await prisma.appointments.findFirst({
                  where: { patient_id: patientId },
                  orderBy: { appointment_date: 'desc' },
              });

        const branding = await getBillBranding(auth.context.organizationId);
        const html = renderOpdSlipHtml(patient, appointment, branding);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('opd registration-slip route error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function esc(s: any): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ymdt(d: Date | string | null | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function field(label: string, value: any, span = 1): string {
    const v = value === null || value === undefined || value === '' ? '' : esc(value);
    return `
    <div style="grid-column: span ${span}; padding: 2px 0;">
        <div style="font-size:8px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px;">${esc(label)}</div>
        <div style="border-bottom:1px solid #9ca3af;min-height:14px;font-size:11px;font-weight:600;color:#111827;padding:1px 2px;">${v || '&nbsp;'}</div>
    </div>`;
}

function sectionHeader(title: string, accent: string): string {
    return `<div style="background:${accent};color:#fff;padding:4px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px 0;border-radius:3px;">${esc(title)}</div>`;
}

function renderOpdSlipHtml(patient: any, appt: any, b: BillBranding): string {
    const accent = b.accentColor || '#1e3a6e';
    const visitDate = ymdt(appt?.appointment_date) || ymdt(new Date());
    const tokenOrAppt = appt?.appointment_id || '';
    const dept = appt?.department || patient.department || '';
    const doctor = appt?.doctor_name || '';
    const visitType = appt?.status || 'New';
    const reason = appt?.reason_for_visit || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>OPD Registration Slip — ${esc(patient.full_name)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; font-size: 11px; }
        ${letterheadCss(b)}
        .slip-container { max-width: 800px; margin: 0 auto; padding: 0 50px; position: relative; z-index: 1; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 18px; }
        .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px 18px; }
        .sig-block { border-top:1px solid #6b7280;padding-top:4px;font-size:9px;color:#6b7280;text-align:center;margin-top:30px; }
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(b)}
    ${printButtonHtml(b, 'OPD Registration Slip — UHID ' + (patient.patient_id || ''))}

    <table class="print-layout-table">
        <thead><tr><td class="print-layout-header-spacer"></td></tr></thead>
        <tbody><tr><td>
            <div class="slip-container">

                <!-- Title strip -->
                <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid ${accent};padding-bottom:8px;margin-bottom:14px;">
                    <div>
                        <h1 style="font-size:16px;font-weight:900;color:${accent};letter-spacing:1px;">OPD REGISTRATION SLIP</h1>
                        <p style="font-size:9px;color:#6b7280;margin-top:2px;">Out-Patient Department</p>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:9px;color:#6b7280;">UHID</div>
                        <div style="font-size:13px;font-weight:800;color:${accent};font-family:monospace;">${esc(patient.patient_id)}</div>
                        <div style="font-size:9px;color:#6b7280;margin-top:4px;">Visit Date &amp; Time</div>
                        <div style="font-size:11px;font-weight:700;">${esc(visitDate)}</div>
                    </div>
                </div>

                ${sectionHeader('Patient', accent)}
                <div class="grid-3">
                    ${field('Full Name', `${patient.title ? patient.title + ' ' : ''}${patient.full_name || ''}`, 2)}
                    ${field('Age', patient.age)}
                </div>
                <div class="grid-4" style="margin-top:4px;">
                    ${field('Sex', patient.gender)}
                    ${field('Mobile', patient.phone)}
                    ${field('Blood Group', patient.blood_group)}
                    ${field('Email', patient.email)}
                </div>
                <div class="grid-2" style="margin-top:4px;">
                    ${field('Address', patient.address, 2)}
                </div>

                ${sectionHeader('Visit', accent)}
                <div class="grid-4">
                    ${field('OPD / Token No.', tokenOrAppt || '')}
                    ${field('Department', dept)}
                    ${field('Consulting Doctor', doctor)}
                    ${field('Visit Type', visitType)}
                </div>
                <div class="grid-2" style="margin-top:4px;">
                    ${field('Chief Complaint', reason, 2)}
                </div>

                ${sectionHeader('Payer & Payment', accent)}
                <div class="grid-4">
                    ${field('Payment Mode', patient.patient_type)}
                    ${field('Corporate Sponsor', patient.corporate?.company_name)}
                    ${field('Consultation Fee (₹)', '')}
                    ${field('Receipt No.', '')}
                </div>

                ${sectionHeader('Validity & Notes', accent)}
                <div class="grid-3">
                    ${field('Valid for Follow-up Till', '')}
                    ${field('Next Appointment', '')}
                    ${field('Special Notes', patient.allergies ? 'Allergy: ' + patient.allergies : '')}
                </div>

                <div class="grid-2" style="margin-top:30px;">
                    <div class="sig-block">Patient Signature</div>
                    <div class="sig-block">Counter Staff (Name &amp; Signature)</div>
                </div>

                <p style="font-size:8.5px;color:#9ca3af;text-align:center;margin-top:18px;">
                    Please carry this slip for follow-up visits and at the time of consultation. ${esc(b.hospitalName)}.
                </p>
            </div>
        </td></tr></tbody>
        <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
    </table>
</body>
</html>`;
}
