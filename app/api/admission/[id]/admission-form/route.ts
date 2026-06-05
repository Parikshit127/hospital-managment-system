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

const ALLOWED_STAFF_ROLES = ['admin', 'receptionist', 'doctor', 'ipd_manager', 'nurse'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;

        const { id: admissionId } = await params;
        if (!admissionId) {
            return NextResponse.json({ error: 'Invalid admission id' }, { status: 400 });
        }

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId: auth.context.organizationId },
            include: {
                patient: {
                    include: {
                        corporate: { select: { company_name: true, contact_phone: true } },
                        insurance_policies: {
                            include: { provider: { select: { provider_name: true } } },
                            orderBy: { created_at: 'desc' },
                            take: 1,
                        },
                    },
                },
                ward: { select: { ward_name: true, ward_type: true, cost_per_day: true } },
                bed: { select: { bed_id: true, bed_category: true } },
            },
        });
        if (!admission) {
            return NextResponse.json({ error: 'Admission not found' }, { status: 404 });
        }

        const branding = await getBillBranding(auth.context.organizationId);
        const html = renderAdmissionFormHtml(admission, branding);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('admission-form route error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function esc(s: any): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ymd(d: Date | string | null | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function ymdt(d: Date | string | null | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

// Field with optional pre-filled value. Empty fields render as an underline so
// staff can hand-write the value before handing the form to the patient.
function field(label: string, value: any, span = 1): string {
    const v = value === null || value === undefined || value === '' ? '' : esc(value);
    return `
    <div style="grid-column: span ${span}; padding: 2px 0;">
        <div style="font-size:8px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px;">${esc(label)}</div>
        <div style="border-bottom:1px solid #9ca3af;min-height:14px;font-size:11px;font-weight:600;color:#111827;padding:1px 2px;">${v || '&nbsp;'}</div>
    </div>`;
}

function checkRow(label: string, checked = false): string {
    const mark = checked ? '☑' : '☐';
    return `<div style="font-size:10px;color:#1f2937;line-height:1.5;">${mark} ${esc(label)}</div>`;
}

function sectionHeader(title: string, accent: string): string {
    return `<div style="background:${accent};color:#fff;padding:5px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px 0;border-radius:3px;">${esc(title)}</div>`;
}

function renderAdmissionFormHtml(admission: any, b: BillBranding): string {
    const p = admission.patient || {};
    const ward = admission.ward || {};
    const bed = admission.bed || {};
    const policy = p.insurance_policies?.[0];
    const corp = p.corporate;

    const accent = b.accentColor || '#1e3a6e';

    const admDate = ymdt(admission.admission_date);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>IPD Admission Form — ${esc(p.full_name || admission.admission_id)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; font-size: 11px; }
        ${letterheadCss(b)}
        .form-container { max-width: 800px; margin: 0 auto; padding: 0 50px; position: relative; z-index: 1; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 18px; }
        .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px 18px; }
        .consent-box { border:1px solid #d1d5db;padding:10px 12px;border-radius:4px;background:#fafafa;margin-bottom:8px; }
        .sig-block { border-top:1px solid #6b7280;padding-top:4px;font-size:9px;color:#6b7280;text-align:center;margin-top:30px; }
        h3.section { font-size:11px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px 0;padding-bottom:3px;border-bottom:1.5px solid ${accent}; }
        @media print {
            .form-container { padding: 0 50px; }
        }
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(b)}
    ${printButtonHtml(b, 'IPD Patient Admission Form — UHID ' + (p.patient_id || ''))}

    <table class="print-layout-table">
        <thead><tr><td class="print-layout-header-spacer"></td></tr></thead>
        <tbody><tr><td>
            <div class="form-container">

                <!-- Title strip -->
                <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid ${accent};padding-bottom:8px;margin-bottom:14px;">
                    <div>
                        <h1 style="font-size:18px;font-weight:900;color:${accent};letter-spacing:1px;">PATIENT ADMISSION FORM</h1>
                        <p style="font-size:9px;color:#6b7280;margin-top:2px;">In-Patient Department — for internal records</p>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:9px;color:#6b7280;">IPD No.</div>
                        <div style="font-size:12px;font-weight:800;color:${accent};font-family:monospace;">${esc(admission.admission_id)}</div>
                        <div style="font-size:9px;color:#6b7280;margin-top:4px;">Admission Date</div>
                        <div style="font-size:11px;font-weight:700;">${esc(admDate)}</div>
                    </div>
                </div>

                ${sectionHeader('1. Admission Identifiers', accent)}
                <div class="grid-4">
                    ${field('UHID / MRD No.', p.patient_id)}
                    ${field('IPD No.', admission.admission_id)}
                    ${field('Admission Date & Time', admDate)}
                    ${field('Department / Unit', p.department || admission.line_of_treatment)}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Ward / Room Type', ward.ward_name || ward.ward_type)}
                    ${field('Bed No.', bed.bed_id)}
                    ${field('Patient Class', admission.patient_class || admission.billing_category)}
                </div>

                ${sectionHeader('2. Patient Demographics', accent)}
                <div class="grid-3">
                    ${field('Full Name', `${p.title ? p.title + ' ' : ''}${p.full_name || ''}`, 2)}
                    ${field('Age', p.age)}
                </div>
                <div class="grid-4" style="margin-top:4px;">
                    ${field('Sex', p.gender)}
                    ${field('Date of Birth', p.date_of_birth)}
                    ${field('Blood Group', p.blood_group)}
                    ${field('Marital Status', p.marital_status)}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Religion', '')}
                    ${field('Occupation', '')}
                    ${field('Nationality', p.race ? 'Foreign' : 'Indian')}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Aadhaar / ABHA ID', p.aadhar_card || p.abha_number)}
                    ${field('PAN', p.pan_number)}
                    ${field('FRRO (if foreigner)', p.frro_number)}
                </div>

                ${sectionHeader('3. Contact & Address', accent)}
                <div class="grid-2">
                    ${field('Address', p.address, 2)}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Mobile No.', p.phone)}
                    ${field('Alt. Mobile', '')}
                    ${field('Email', p.email)}
                </div>

                ${sectionHeader('4. Next of Kin / Guardian & Emergency Contact', accent)}
                <div class="grid-3">
                    ${field('Name', p.emergency_contact_name)}
                    ${field('Relationship', p.emergency_contact_relation)}
                    ${field('Mobile No.', p.emergency_contact_phone)}
                </div>
                <div class="grid-2" style="margin-top:4px;">
                    ${field('Address', '', 2)}
                </div>

                ${sectionHeader('5. Mode & Source of Admission', accent)}
                <div class="grid-4">
                    ${field('Admission Type', admission.admission_type)}
                    ${field('Admission Category', admission.admission_category)}
                    ${field('Admission Source', admission.admission_source)}
                    ${field('Code Status', admission.code_status)}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Referred by (Doctor)', '')}
                    ${field('Referring Hospital', '')}
                    ${field('MLC No. (if applicable)', admission.case_fir_number)}
                </div>
                <div style="margin-top:6px;display:flex;gap:14px;font-size:10px;">
                    ${checkRow('Medico-Legal Case', !!admission.case_fir_number || admission.case_is_police_report)}
                    ${checkRow('RTA', !!admission.case_is_rta)}
                    ${checkRow('Substance Abuse', !!admission.case_is_substance_abuse)}
                    ${checkRow('Police Report Filed', !!admission.case_is_police_report)}
                </div>

                ${sectionHeader('6. Attending Doctor', accent)}
                <div class="grid-3">
                    ${field('Admitting Doctor', admission.doctor_name, 2)}
                    ${field('Reg. No.', '')}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Attending Doctor ID', admission.attending_doctor_id)}
                    ${field('Department', p.department)}
                    ${field('Expected Discharge', ymd(admission.expected_discharge_date))}
                </div>

                ${sectionHeader('7. Payer & Financial Category', accent)}
                <div class="grid-4">
                    ${field('Payment Mode', p.patient_type)}
                    ${field('Corporate Sponsor', corp?.company_name)}
                    ${field('Corporate Card No.', p.corporate_card_number)}
                    ${field('Insurance / TPA Provider', policy?.provider?.provider_name)}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Policy / Member No.', policy?.policy_number)}
                    ${field('Pre-Auth No.', '')}
                    ${field('Patient Category', p.patient_category)}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Room Tariff (₹/day)', ward.cost_per_day ? Number(ward.cost_per_day).toLocaleString('en-IN') : '')}
                    ${field('Estimated Package (₹)', '')}
                    ${field('Advance / Deposit (₹)', '')}
                </div>
                <div class="grid-3" style="margin-top:4px;">
                    ${field('Deposit Mode (Cash/Card/UPI/NEFT)', '')}
                    ${field('Receipt No.', '')}
                    ${field('Counselled By', '')}
                </div>

                ${sectionHeader('8. ID Proof / KYC', accent)}
                <div class="grid-3">
                    ${field('ID Type (Aadhaar/PAN/Voter/DL/Passport)', '')}
                    ${field('ID Number', p.aadhar_card || p.pan_number)}
                    ${field('Copy Attached (Y/N)', '')}
                </div>

                ${sectionHeader('9. Belongings & Valuables', accent)}
                <div style="border:1px solid #d1d5db;padding:8px;border-radius:4px;font-size:10px;color:#6b7280;min-height:36px;">
                    Items handed over: ____________________________________________________________ <br/>
                    Custodian (Name & Sign): _________________________________________________ &nbsp; Date/Time: _________________
                </div>

                ${sectionHeader('10. Consent & Acknowledgements', accent)}
                <div class="consent-box">
                    <p style="font-weight:700;font-size:10px;margin-bottom:4px;">General Consent for Admission & Treatment</p>
                    <p style="font-size:10px;line-height:1.5;color:#374151;">
                        I, the undersigned, voluntarily consent to admission, examination, investigation and routine
                        treatment at ${esc(b.hospitalName)}. I understand the proposed line of treatment and that
                        outcomes cannot be guaranteed. Separate informed consent will be obtained for any surgical
                        procedure, blood transfusion, or high-risk intervention.
                    </p>
                </div>
                <div class="consent-box">
                    <p style="font-weight:700;font-size:10px;margin-bottom:4px;">Financial Counselling Acknowledgement</p>
                    <p style="font-size:10px;line-height:1.5;color:#374151;">
                        Room tariff, estimated package and the hospital's billing policy have been explained to me.
                        I agree to settle all dues as per the hospital's policy and understand that the final bill
                        may vary from the initial estimate based on the actual treatment provided.
                    </p>
                </div>
                <div class="consent-box">
                    <p style="font-weight:700;font-size:10px;margin-bottom:4px;">Information Sharing & Patient Rights</p>
                    <p style="font-size:10px;line-height:1.5;color:#374151;">
                        I authorise the hospital to share my medical and billing information with my insurer / TPA /
                        corporate sponsor as required for cashless or reimbursement processing. I have been informed
                        of my Patient Rights and Responsibilities and the grievance redressal mechanism.
                    </p>
                </div>
                <div style="margin-top:6px;font-size:10px;">
                    Preferred Language of Communication: <strong>${esc(p.preferred_language || 'English')}</strong>
                </div>

                ${sectionHeader('11. Signatures', accent)}
                <div class="grid-3" style="margin-top:30px;">
                    <div class="sig-block">Patient / Guardian<br/>(Name, Relation &amp; Signature)</div>
                    <div class="sig-block">Admitting Officer<br/>(Name &amp; Signature)</div>
                    <div class="sig-block">Admitting Doctor<br/>(Name, Reg. No. &amp; Signature)</div>
                </div>
                <div class="grid-2" style="margin-top:18px;">
                    <div class="sig-block">Witness<br/>(Name &amp; Signature)</div>
                    <div class="sig-block">Date &amp; Time</div>
                </div>

                <p style="font-size:8.5px;color:#9ca3af;text-align:center;margin-top:18px;">
                    This is a controlled document. Retain in the patient's medical record for the statutory retention period.
                    Computer-generated form — ${esc(b.hospitalName)}.
                </p>
            </div>
        </td></tr></tbody>
        <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
    </table>
</body>
</html>`;
}
