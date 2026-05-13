import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/backend/tenant';

export async function GET(request: NextRequest, { params }: { params: { admissionId: string } }) {
  try {
    const { db } = await requireTenantContext();
    const admission = await (db.admissions as any).findUnique({
      where: { admission_id: params.admissionId },
      include: { ward: true, bed: true },
    });
    if (!admission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let patient: any = null;
    if (admission.patient_id) {
      patient = await (db.oPD_REG as any).findUnique({ where: { patient_id: admission.patient_id } });
    }

    const hospitalName = process.env.HOSPITAL_NAME || 'Hospital';
    const wardName = admission.ward?.ward_name || '—';
    const bedNumber = admission.bed?.bed_number || '—';
    const bloodGroup = patient?.blood_group || '—';
    const allergies: string = patient?.allergies || '';
    const hasAllergies = allergies && allergies.trim().length > 0 && allergies.toLowerCase() !== 'none';
    const admissionDate = admission.admission_date
      ? new Date(admission.admission_date).toLocaleDateString('en-IN')
      : '—';
    const dob = patient?.date_of_birth || '—';
    const uhid = patient?.patient_id || admission.patient_id || '—';
    const patientName = patient?.full_name || '—';
    const treatingDoctor = admission.doctor_name || '—';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Wristband - ${patientName}</title>
<style>
@page { size: 85mm 28mm; margin: 2mm }
* { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: Arial, sans-serif; font-size: 8pt; color: #111; width: 85mm; height: 28mm; overflow: hidden; display: flex; flex-direction: row; gap: 2mm }
strong { font-size: 9pt }
.main { flex: 1; display: flex; flex-direction: column; gap: 0.5mm; overflow: hidden }
.patient-name { font-size: 10pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55mm }
.row { display: flex; gap: 2mm; align-items: baseline }
.lbl { font-size: 6.5pt; color: #666; white-space: nowrap }
.val { font-size: 7.5pt; font-weight: bold; white-space: nowrap }
.blood { color: #cc0000; font-weight: bold; font-size: 9pt }
.allergy-box { border: 1.5px solid #cc0000; background: #fff0f0; padding: 0.5mm 1mm; font-size: 6.5pt; color: #cc0000; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55mm }
.divider { border-top: 0.5px solid #ccc; margin: 0.5mm 0 }
.qr-box { width: 22mm; border: 1px solid #333; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 6pt; color: #333; padding: 1mm; flex-shrink: 0 }
.qr-label { font-size: 5.5pt; color: #999; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 0.5mm }
.qr-uhid { font-family: monospace; font-size: 6.5pt; font-weight: bold; word-break: break-all; text-align: center }
.scan-tag { font-size: 5pt; text-transform: uppercase; letter-spacing: 1pt; color: #999; margin-top: 0.5mm }
.hosp { font-size: 5.5pt; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
@media print { button { display: none } }
</style></head>
<body>
<div class="main">
  <div class="hosp">${hospitalName}</div>
  <div class="patient-name">${patientName}</div>
  <div class="row">
    <span class="lbl">UHID:</span><span class="val">${uhid}</span>
    <span class="lbl" style="margin-left:2mm">BG:</span><span class="blood">${bloodGroup}</span>
  </div>
  <div class="row">
    <span class="lbl">DOB:</span><span class="val">${dob}</span>
    <span class="lbl" style="margin-left:2mm">Adm:</span><span class="val">${admissionDate}</span>
  </div>
  <div class="divider"></div>
  <div class="row">
    <span class="lbl">Ward/Bed:</span><span class="val">${wardName} / ${bedNumber}</span>
  </div>
  <div class="row">
    <span class="lbl">Dr:</span><span class="val" style="max-width:54mm;overflow:hidden;text-overflow:ellipsis;display:inline-block">${treatingDoctor}</span>
  </div>
  ${hasAllergies ? `<div class="allergy-box">⚠ ALLERGY: ${allergies}</div>` : ''}
</div>
<div class="qr-box">
  <div class="qr-label">Scan</div>
  <div class="qr-uhid">${uhid}</div>
  <div class="scan-tag">ID</div>
</div>
<script>window.onload = () => window.print()</script>
</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate wristband' }, { status: 500 });
  }
}
