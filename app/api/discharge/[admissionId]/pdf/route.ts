import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'
import { validateZealthixApiKey } from '@/app/lib/zealthix/auth'

const ALLOWED_STAFF_ROLES = ['admin', 'doctor', 'ipd_manager', 'nurse', 'finance'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        // Check for Zealthix API key first (for external access)
        const apiKeyHeader = req.headers.get('X-Api-Key');
        let organizationId: string | null = null;
        let isApiKeyAuth = false;

        if (apiKeyHeader) {
            // Zealthix API authentication
            const zealthixAuth = await validateZealthixApiKey(req);
            if (zealthixAuth instanceof NextResponse) {
                // API key provided but invalid - return error
                return zealthixAuth;
            }
            organizationId = zealthixAuth.organizationId;
            isApiKeyAuth = true;
        }

        // If not API key auth, use regular authentication
        if (!isApiKeyAuth) {
            const auth = await resolveRouteAuth({
                allowPatient: true,
                allowedStaffRoles: ALLOWED_STAFF_ROLES,
            });
            if (!auth.ok) return auth.response;
            organizationId = auth.context.organizationId;
        }

        const { admissionId } = await params;

        const admission = await prisma.admissions.findFirst({
            where: {
                admission_id: admissionId,
                organizationId: organizationId!,
            },
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true } },
                ward: true,
                bed: true,
            }
        })

        if (!admission) {
            return NextResponse.json({ error: 'Admission not found' }, { status: 404 })
        }

        // Skip patient check for internal requests
        if (!isApiKeyAuth) {
            const auth = await resolveRouteAuth({
                allowPatient: true,
                allowedStaffRoles: ALLOWED_STAFF_ROLES,
            });
            if (auth.ok && auth.context.kind === 'patient' && admission.patient_id !== auth.context.session.id) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
        }

        // Fetch related clinical data
        const [vitals, ehrNotes, labOrders, dischargeSummary] = await Promise.all([
            prisma.vital_signs.findMany({
                where: {
                    patient_id: admission.patient_id,
                    organizationId: organizationId!,
                },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
            prisma.clinical_EHR.findMany({
                where: {
                    patient_id: admission.patient_id,
                    organizationId: organizationId!,
                },
                orderBy: { created_at: 'desc' },
            }),
            prisma.lab_orders.findMany({
                where: {
                    patient_id: admission.patient_id,
                    organizationId: organizationId!,
                },
                orderBy: { created_at: 'desc' },
            }),
            prisma.discharge_summaries.findFirst({
                where: {
                    admission_id: admissionId,
                    organizationId: organizationId!,
                },
                orderBy: { created_at: 'desc' },
            }),
        ])

        const patient = admission.patient || {}
        const admissionDate = admission.admission_date ? new Date(admission.admission_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'
        const dischargeDate = admission.discharge_date ? new Date(admission.discharge_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'
        const daysStayed = admission.discharge_date
            ? Math.ceil((new Date(admission.discharge_date).getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24))
            : Math.ceil((Date.now() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24))

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Discharge Summary - ${patient.full_name || 'Patient'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
        .section { margin-bottom: 16px; }
        .section-title { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
        th { font-weight: 700; color: #6b7280; background: #f9fafb; font-size: 10px; text-transform: uppercase; }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:#7c3aed;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;">
            Print / Download PDF
        </button>
    </div>

    <div style="max-width:800px;margin:0 auto;padding:40px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #7c3aed;padding-bottom:16px;">
            <div>
                <h1 style="font-size:22px;font-weight:900;color:#7c3aed;margin-bottom:2px;">Avani Hospital</h1>
                <p style="font-size:10px;color:#6b7280;">Healthcare Excellence &bull; NABH Accredited</p>
            </div>
            <div style="text-align:right;">
                <h2 style="font-size:18px;font-weight:800;color:#1f2937;">DISCHARGE SUMMARY</h2>
                <p style="font-size:11px;color:#6b7280;">Admission: ${admissionId}</p>
            </div>
        </div>

        <!-- Patient Demographics -->
        <div class="section">
            <p class="section-title">Patient Details</p>
            <div style="background:#f9fafb;border-radius:8px;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <p><strong>Name:</strong> ${patient.full_name || 'N/A'}</p>
                <p><strong>Patient ID:</strong> ${patient.patient_id || 'N/A'}</p>
                <p><strong>Age / Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                <p><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p><strong>Ward:</strong> ${admission.ward?.ward_name || 'N/A'}</p>
                <p><strong>Bed:</strong> ${admission.bed_id || 'N/A'}</p>
            </div>
        </div>

        <!-- Admission/Discharge Dates -->
        <div class="section">
            <p class="section-title">Admission Details</p>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                <p><strong>Admitted:</strong> ${admissionDate}</p>
                <p><strong>Discharged:</strong> ${dischargeDate}</p>
                <p><strong>Length of Stay:</strong> ${daysStayed} day(s)</p>
            </div>
            <p style="margin-top:6px;"><strong>Diagnosis:</strong> ${admission.diagnosis || 'Not recorded'}</p>
            <p><strong>Attending Doctor:</strong> ${admission.doctor_name || 'Not assigned'}</p>
        </div>

        ${ehrNotes.length > 0 ? `
        <!-- Clinical Notes -->
        <div class="section">
            <p class="section-title">Clinical Notes</p>
            ${ehrNotes.map(n => `
                <div style="background:#f9fafb;border-radius:6px;padding:10px;margin-bottom:6px;">
                    <p style="font-size:10px;color:#6b7280;margin-bottom:4px;">${new Date(n.created_at).toLocaleDateString('en-IN')} &bull; ${n.doctor_name || 'Note'}</p>
                    ${n.diagnosis ? `<p><strong>Diagnosis:</strong> ${n.diagnosis}</p>` : ''}
                    ${n.doctor_notes ? `<p><strong>Notes:</strong> ${n.doctor_notes}</p>` : ''}
                </div>
            `).join('')}
        </div>` : ''}

        ${vitals.length > 0 ? `
        <!-- Vitals -->
        <div class="section">
            <p class="section-title">Vital Signs (Recent)</p>
            <table>
                <thead><tr><th>Date</th><th>BP</th><th>Heart Rate</th><th>Temp</th><th>SpO2</th><th>RR</th></tr></thead>
                <tbody>
                    ${vitals.map(v => `
                        <tr>
                            <td>${new Date(v.created_at).toLocaleDateString('en-IN')}</td>
                            <td>${v.blood_pressure || '-'}</td>
                            <td>${v.heart_rate || '-'}</td>
                            <td>${v.temperature || '-'}</td>
                            <td>${v.oxygen_sat || '-'}%</td>
                            <td>${v.respiratory_rate || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>` : ''}

        ${labOrders.length > 0 ? `
        <!-- Lab Results -->
        <div class="section">
            <p class="section-title">Laboratory Results</p>
            <table>
                <thead><tr><th>Test</th><th>Result</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                    ${labOrders.map(l => `
                        <tr>
                            <td>${l.test_type}</td>
                            <td>${l.result_value || 'Pending'}</td>
                            <td>${l.status}</td>
                            <td>${new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>` : ''}

        ${dischargeSummary?.generated_summary ? `
        <!-- AI/Manual Summary -->
        <div class="section">
            <p class="section-title">Discharge Summary Notes</p>
            <div style="background:#f9fafb;border-radius:6px;padding:12px;font-size:12px;line-height:1.6;">
                ${dischargeSummary.generated_summary}
            </div>
        </div>` : ''}

        <!-- Follow-up -->
        <div class="section">
            <p class="section-title">Follow-up Instructions</p>
            <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px;font-size:11px;">
                <p>1. Follow up with attending doctor within 7 days of discharge.</p>
                <p>2. Continue prescribed medications as directed.</p>
                <p>3. In case of emergency, visit the hospital emergency department immediately.</p>
                <p>4. Bring this discharge summary for all follow-up visits.</p>
            </div>
        </div>

        <!-- Signature -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;">
            <div>
                <div style="border-bottom:1px solid #1f2937;width:200px;margin-bottom:4px;height:40px;"></div>
                <p style="font-size:11px;font-weight:700;">Attending Physician</p>
                <p style="font-size:10px;color:#6b7280;">${admission.doctor_name || 'Dr. ___________'}</p>
            </div>
            <div style="text-align:right;">
                <div style="border-bottom:1px solid #1f2937;width:200px;margin-bottom:4px;margin-left:auto;height:40px;"></div>
                <p style="font-size:11px;font-weight:700;">Medical Superintendent</p>
            </div>
        </div>

        <!-- Footer -->
        <div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:30px;text-align:center;">
            <p style="font-size:9px;color:#9ca3af;">This is a computer-generated document. &bull; Avani Hospital &bull; For queries contact reception</p>
        </div>
    </div>
</body>
</html>`

        // If accessed via API key (Zealthix), return the URL to view the discharge HTML
        if (isApiKeyAuth) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
            const dischargeUrl = `${baseUrl}/api/discharge/${admissionId}/pdf`;
            return NextResponse.json({ url: dischargeUrl, admissionId });
        }

        // Otherwise return HTML for browser viewing
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
    } catch (error: any) {
        console.error('Discharge PDF error:', error)
        return NextResponse.json({ error: error.message || 'Failed to generate discharge summary' }, { status: 500 })
    }
}
