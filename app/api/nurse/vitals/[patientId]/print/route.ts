import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { requireTenantContext } from '@/backend/tenant';
import { getBillBranding, inlineHeaderHtml } from '@/app/lib/bill-branding';
import { fmtIstDateTime } from '@/app/lib/ist';

const ALLOWED_STAFF_ROLES = ['admin', 'doctor', 'ipd_manager', 'nurse', 'receptionist', 'finance', 'opd_manager'];

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;

        const { db, organizationId } = await requireTenantContext();
        const { patientId } = await params;

        // Fetch patient registration details
        const patient = await (db.oPD_REG as any).findFirst({
            where: { patient_id: patientId, organizationId },
        });

        if (!patient) {
            return new NextResponse('Patient not found', { status: 404 });
        }

        // Fetch active admission if available for ward/bed info
        const activeAdmission = await (db.admissions as any).findFirst({
            where: { patient_id: patientId, organizationId, status: 'Admitted' },
            include: { ward: true, bed: true },
            orderBy: { admission_date: 'desc' },
        });

        // Fetch vitals history
        const vitals = await (db.vital_signs as any).findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
            take: 50,
        });

        // Collect nurse IDs and resolve names
        const userIdsSet = new Set<string>();
        vitals.forEach((v: any) => { if (v.recorded_by) userIdsSet.add(v.recorded_by); });

        const userMap = new Map<string, string>();
        if (userIdsSet.size > 0) {
            const users = await (db.user as any).findMany({
                where: { id: { in: Array.from(userIdsSet) } },
                select: { id: true, name: true, username: true },
            });
            users.forEach((u: any) => userMap.set(u.id, u.name || u.username || u.id));
        }

        const branding = await getBillBranding(organizationId);

        const wardBedText = activeAdmission
            ? `${activeAdmission.ward?.ward_name || 'Unassigned'} / Bed ${activeAdmission.bed_id || '—'}`
            : 'Outpatient / Not Admitted';

        const vitalsRows = vitals.length > 0 ? vitals.map((v: any, idx: number) => {
            const recordedByName = v.recorded_by ? (userMap.get(v.recorded_by) || v.recorded_by) : '—';
            return `
                <tr>
                    <td class="c">${idx + 1}</td>
                    <td class="c">${esc(fmtIstDateTime(v.created_at))}</td>
                    <td class="c">${esc(v.blood_pressure || '—')}</td>
                    <td class="c">${v.heart_rate != null ? `${v.heart_rate} bpm` : '—'}</td>
                    <td class="c">${v.temperature != null ? `${v.temperature} °C` : '—'}</td>
                    <td class="c">${v.oxygen_sat != null ? `${v.oxygen_sat}%` : '—'}</td>
                    <td class="c">${v.respiratory_rate != null ? `${v.respiratory_rate} /min` : '—'}</td>
                    <td class="c">${v.weight != null ? `${v.weight} kg` : '—'}</td>
                    <td class="c">${v.height != null ? `${v.height} cm` : '—'}</td>
                    <td class="c">${esc(recordedByName)}</td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="10" class="c" style="padding:20px;color:#888;">No vitals recorded yet for this patient.</td></tr>`;

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Vital Signs History — ${esc(patient.full_name)} (${esc(patient.patient_id)})</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; background: #f0f2f5; }
        .toolbar { display: flex; gap: 12px; align-items: center; justify-content: center; padding: 12px; background: #1e3a6e; }
        .toolbar button { padding: 8px 24px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .btn-print { background: #059669; color: #fff; }
        .btn-print:hover { background: #047857; }
        .btn-back { background: transparent; color: #cbd5e1; border: 1px solid #475569 !important; }
        .btn-back:hover { background: #334155; }
        .page { max-width: 850px; margin: 20px auto; background: #fff; padding: 28px 32px; box-shadow: 0 1px 6px rgba(0,0,0,.08); border-radius: 4px; }
        .doc-title { display: inline-block; margin-top: 10px; padding: 4px 14px; background: #fff7ed; color: #c2410c; font-weight: 800; font-size: 12px; border: 1px solid #ffedd5; border-radius: 4px; letter-spacing: 0.5px; }
        .patient-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 16px 0 20px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
        .field { display: flex; flex-direction: column; }
        .lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
        .val { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 1px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #1e3a6e; color: #fff; font-size: 10px; text-transform: uppercase; padding: 8px 6px; border: 1px solid #1e3a6e; letter-spacing: 0.5px; }
        td { padding: 7px 6px; font-size: 11px; border: 1px solid #e2e8f0; color: #1e293b; }
        td.c { text-align: center; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        .foot { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; text-align: center; }
        @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .noprint { display: none !important; }
            .page { margin: 0; box-shadow: none; max-width: none; padding: 0; border-radius: 0; }
            th { background: #1e3a6e !important; color: #fff !important; }
        }
    </style>
</head>
<body>
    <div class="toolbar noprint">
        <button class="btn-back" onclick="window.close()">Close</button>
        <button class="btn-print" onclick="window.print()">Print / Download PDF</button>
    </div>
    <div class="page">
        ${inlineHeaderHtml(branding, `<div class="doc-title">PATIENT VITAL SIGNS HISTORY</div>`)}
        
        <div class="patient-card">
            <div class="field">
                <span class="lbl">Patient Name</span>
                <span class="val">${esc(patient.full_name)}</span>
            </div>
            <div class="field">
                <span class="lbl">Patient ID (UHID)</span>
                <span class="val" style="font-family: monospace;">${esc(patient.patient_id)}</span>
            </div>
            <div class="field">
                <span class="lbl">Age / Gender</span>
                <span class="val">${esc(patient.age || '—')} yrs / ${esc(patient.gender || '—')}</span>
            </div>
            <div class="field">
                <span class="lbl">Ward / Bed</span>
                <span class="val">${esc(wardBedText)}</span>
            </div>
            <div class="field">
                <span class="lbl">Attending Doctor</span>
                <span class="val">${esc(activeAdmission?.doctor_name || '—')}</span>
            </div>
            <div class="field">
                <span class="lbl">Report Date</span>
                <span class="val">${esc(fmtIstDateTime(new Date()))}</span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 35px;">#</th>
                    <th>Date &amp; Time</th>
                    <th>BP (mmHg)</th>
                    <th>Heart Rate</th>
                    <th>Temp</th>
                    <th>SpO₂</th>
                    <th>Resp Rate</th>
                    <th>Weight</th>
                    <th>Height</th>
                    <th>Recorded By</th>
                </tr>
            </thead>
            <tbody>
                ${vitalsRows}
            </tbody>
        </table>

        <div class="foot">
            Generated on ${esc(fmtIstDateTime(new Date()))} &middot; HospitalOS &middot; Confidential Medical Record
        </div>
    </div>
</body>
</html>`;

        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (e: any) {
        console.error('Print Vitals Error:', e);
        return new NextResponse('Failed to generate vitals report', { status: 500 });
    }
}
