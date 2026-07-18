import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import {
    getBillBranding,
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

        // Many OPD patients never went through appointment scheduling — they only
        // have a bill. Fall back to the latest invoice's doctor_name, same as the
        // reception dashboard list (see getRegisteredPatients in reception-actions.ts).
        let doctorName = appointment?.doctor_name || null;
        if (!doctorName) {
            const lastInvoice = await prisma.invoices.findFirst({
                where: { patient_id: patientId },
                orderBy: { created_at: 'desc' },
                select: { doctor_name: true },
            });
            doctorName = lastInvoice?.doctor_name || null;
        }

        const branding = await getBillBranding(auth.context.organizationId);
        const org = await prisma.organization.findUnique({
            where: { id: auth.context.organizationId },
        });

        const html = renderOpdSlipHtml(patient, appointment, branding, org, doctorName);

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

function ageFromDob(dob: string | null | undefined): string {
    if (!dob) return '';
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 ? String(age) : '';
}

function getHospitalDetails(org: any, b: BillBranding) {
    const isAvise = org?.code === 'AVS' || org?.name?.toLowerCase().includes('avise');
    if (isAvise) {
        return {
            name: "AVISE HOSPITAL",
            tagline: "SUPERSPECIALITY",
            unitText: "",
            subTagline: "YOUR LIFE IS PRECIOUS TO US",
            address: "209-P, Sector-38, Gurugram 122001",
            phones: ["+91-124-4939680", "124-4939681", "+91 9110351443", "9717189900"],
            email: "avisehospital@gmail.com",
            website: "www.avisehospital.com",
            logoUrl: b.logoUrl,
            accentColor: "#1e3a6e",
            secondaryColor: "#0f766e"
        };
    } else {
        return {
            name: b.hospitalName || org?.name || "HOSPITAL",
            tagline: b.tagline || "HEALTHCARE SERVICES",
            subTagline: "YOUR HEALTH, OUR PRIORITIES",
            unitText: b.registrationNumber ? `Reg No: ${b.registrationNumber}` : "",
            address: b.hospitalAddress || org?.address || "",
            phones: b.hospitalPhone ? [b.hospitalPhone] : (org?.phone ? [org.phone] : []),
            email: b.hospitalEmail || org?.email || "",
            website: org?.website || "",
            logoUrl: b.logoUrl,
            accentColor: b.accentColor || "#1e3a6e",
            secondaryColor: "#10b981"
        };
    }
}

function renderOpdSlipHtml(patient: any, appt: any, b: BillBranding, org: any, doctorName: string | null): string {
    const hospital = getHospitalDetails(org, b);
    const accent = hospital.accentColor;
    const secondary = hospital.secondaryColor;

    // Formatting date as "24 May 2026, 01:41 PM"
    let visitDate = '';
    const rawDate = appt?.appointment_date || patient.created_at;
    if (rawDate) {
        const dt = new Date(rawDate);
        if (!isNaN(dt.getTime())) {
            visitDate = dt.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
    }

    const tokenOrAppt = appt?.appointment_id || '';
    const doctor = doctorName || '';
    
    const ageVal = patient.age || ageFromDob(patient.date_of_birth) || '';
    const genderVal = patient.gender || '';
    const ageAndGender = [ageVal, genderVal].filter(Boolean).join(', ');

    const logoSrc = hospital.logoUrl || '/logo.jpeg';
    const logoHtml = `<img src="${logoSrc}" alt="${esc(hospital.name)}" style="height:65px;width:auto;display:block;object-fit:contain;" />`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>OPD Slip — ${esc(patient.full_name)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; font-size: 11px; min-height: 100vh; display: flex; flex-direction: column; }
        
        .no-print-bar {
            background: #f3f4f6;
            padding: 12px;
            text-align: center;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .print-btn {
            padding: 8px 24px;
            background: ${accent};
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            transition: all 0.2s;
        }
        .print-btn:hover {
            opacity: 0.95;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        .toggle-label {
            font-size: 12px;
            font-weight: 600;
            color: #374151;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            user-select: none;
        }

        .slip-outer {
            flex-grow: 1;
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px 40px;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        /* Digital Letterhead Header */
        .digital-letterhead-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2.5px solid ${accent};
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        .header-left {
            width: 80px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
        }
        .header-center {
            flex-grow: 1;
            text-align: center;
            padding: 0 16px;
        }
        .hospital-name {
            font-size: 26px;
            font-weight: 900;
            color: ${accent};
            letter-spacing: 1.5px;
            margin: 0;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            text-transform: uppercase;
        }
        .hospital-tagline {
            font-size: 11px;
            font-weight: 800;
            color: ${secondary};
            letter-spacing: 2px;
            margin: 2px 0 4px 0;
            text-transform: uppercase;
        }
        .sub-tagline-bar {
            background: ${accent};
            color: #fff;
            padding: 3px 12px;
            font-size: 9px;
            font-weight: 800;
            display: inline-block;
            border-radius: 4px;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 1.2px;
        }
        .unit-text {
            font-size: 8px;
            color: #6b7280;
            font-weight: 700;
            text-transform: uppercase;
            margin: 0;
        }
        .header-right {
            width: 80px;
            flex-shrink: 0;
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }

        /* Patient Details Grid */
        .patient-card-container {
            border-top: 1.5px solid ${accent};
            border-bottom: 1.5px solid ${accent};
            padding: 10px 0;
            margin-bottom: 20px;
            transition: margin-top 0.2s;
        }
        .patient-details-table {
            width: 100%;
            border-collapse: collapse;
        }
        .patient-details-table td {
            padding: 5px 0;
            vertical-align: top;
            font-size: 11.5px;
        }
        .patient-details-table td.field-label {
            width: 15%;
            font-weight: 700;
            color: #4b5563;
            text-transform: uppercase;
            font-size: 9.5px;
            letter-spacing: 0.5px;
        }
        .patient-details-table td.field-value {
            width: 35%;
            font-weight: 700;
            color: #111827;
        }
        .vitals-row {
            border-top: 1px dashed #9ca3af;
        }
        .vitals-row td {
            padding-top: 10px !important;
        }
        .vitals-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #374151;
            padding-right: 15px;
        }
        .vitals-container span {
            font-weight: 600;
        }

        /* Clinical Writing Area */
        .clinical-writing-area {
            flex-grow: 1;
            min-height: 400px;
            margin-bottom: 40px;
        }

        /* Digital Letterhead Footer */
        .digital-letterhead-footer {
            border-top: 1px solid #d1d5db;
            padding-top: 8px;
            margin-top: auto;
        }
        .footer-contact-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8.5px;
            color: #4b5563;
            font-weight: 700;
            margin-bottom: 6px;
            gap: 8px;
        }
        .contact-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .contact-item svg.icon {
            width: 10px;
            height: 10px;
            fill: none;
            stroke: ${accent};
            stroke-width: 2.5;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .footer-badges-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
        }
        .validity-text {
            font-size: 9px;
            color: #b91c1c;
            font-weight: 800;
        }
        .legal-badge {
            border: 1px solid #b91c1c;
            color: #b91c1c;
            font-size: 8px;
            font-weight: 800;
            padding: 2.5px 7px;
            border-radius: 3px;
            letter-spacing: 0.5px;
        }
        .footer-accent-bar {
            height: 6px;
            background: linear-gradient(90deg, ${accent} 0%, ${secondary} 100%);
            margin-top: 8px;
            border-radius: 2px;
        }

        @media print {
            .no-print {
                display: none !important;
            }
            body {
                margin: 0;
                background: white;
            }
            .slip-outer {
                max-width: 100%;
                padding: 0;
                min-height: 100vh;
            }
            @page {
                margin: 12mm 15mm;
            }
            body.hide-letterhead .digital-letterhead-header,
            body.hide-letterhead .digital-letterhead-footer {
                display: none !important;
            }
            body.hide-letterhead .patient-card-container {
                margin-top: ${220}px;
            }
        }
    </style>
</head>
<body>
    <div class="no-print no-print-bar">
        <button class="print-btn" onclick="window.print()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print OPD Slip
        </button>
        <label class="toggle-label">
            <input type="checkbox" id="toggle-letterhead" checked onchange="document.body.classList.toggle('hide-letterhead', !this.checked)" style="margin:0;width:16px;height:16px;cursor:pointer;" />
            Print digital letterhead
        </label>
    </div>

    <div class="slip-outer">
        <!-- Letterhead Header -->
        <div class="digital-letterhead-header">
            <div class="header-left">
                ${logoHtml}
            </div>
            <div class="header-center">
                <h1 class="hospital-name">${esc(hospital.name)}</h1>
                <p class="hospital-tagline">${esc(hospital.tagline)}</p>
                <div class="sub-tagline-bar">${esc(hospital.subTagline)}</div>
                ${hospital.unitText ? `<p class="unit-text">${esc(hospital.unitText)}</p>` : ''}
            </div>
            <div class="header-right">
            </div>
        </div>

        <!-- Patient details box -->
        <div class="patient-card-container">
            <table class="patient-details-table">
                <tbody>
                    <tr>
                        <td class="field-label">UHID</td>
                        <td class="field-value">: ${esc(patient.patient_id)}</td>
                        <td class="field-label">DATE</td>
                        <td class="field-value">: ${esc(visitDate)}</td>
                    </tr>
                    <tr>
                        <td class="field-label">Patient Name</td>
                        <td class="field-value">: ${esc(patient.title ? patient.title + ' ' : '')}${esc(patient.full_name)}</td>
                        <td class="field-label">Age / Sex</td>
                        <td class="field-value">: ${esc(ageAndGender)}</td>
                    </tr>
                    <tr>
                        <td class="field-label">Mobile No.</td>
                        <td class="field-value">: ${esc(patient.phone)}</td>
                        <td class="field-label">Consultant</td>
                        <td class="field-value">: ${esc(doctor || 'Self / Walk-in')}</td>
                    </tr>
                    <tr>
                        <td class="field-label">Address</td>
                        <td class="field-value" colspan="3">: ${esc(patient.address)}</td>
                    </tr>
                    <tr class="vitals-row">
                        <td colspan="4">
                            <div class="vitals-container">
                                <span>B.P. : _________________</span>
                                <span>Temp : _________________</span>
                                <span>Weight : _________________</span>
                                <span>SpO2 : _________________</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Large writing area for the doctor's prescription -->
        <div class="clinical-writing-area"></div>

        <!-- Letterhead Footer -->
        <div class="digital-letterhead-footer">
            <div class="footer-contact-row">
                <div class="contact-item">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span>${esc(hospital.phones.join(', '))}</span>
                </div>
                <div class="contact-item">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>${esc(hospital.address)}</span>
                </div>
                <div class="contact-item">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span>${esc(hospital.email)}</span>
                    ${hospital.website ? `
                    <span style="margin: 0 4px; color:#9ca3af;">|</span>
                    <svg class="icon" viewBox="0 0 24 24" style="stroke-width:2.2;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <span>${esc(hospital.website)}</span>` : ''}
                </div>
            </div>
            <div class="footer-badges-row">
                <div class="validity-text">पर्चा केवल 7 दिन के लिए मान्य है। / Valid for 7 days only.</div>
                <div class="legal-badge">NOT VALID FOR MEDICO LEGAL PURPOSE</div>
            </div>
            <div class="footer-accent-bar"></div>
        </div>
    </div>
</body>
</html>`;
}
