import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/backend/tenant';
import { getBillBranding, inlineHeaderHtml } from '@/app/lib/bill-branding';

export async function GET(request: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
  try {
    const { admissionId } = await params;
    const { db, organizationId } = await requireTenantContext();
    const branding = await getBillBranding(organizationId);
    const admission = await (db.admissions as any).findUnique({
      where: { admission_id: admissionId },
    });
    if (!admission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let patient: any = null;
    if (admission.patient_id) {
      patient = await (db.oPD_REG as any).findUnique({ where: { patient_id: admission.patient_id } });
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facesheet</title>
<style>body{font-family:Arial,sans-serif;padding:30px;color:#111;max-width:800px;margin:0 auto}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid ${branding.accentColor};padding-bottom:14px;margin-bottom:20px}
.hdr-left{display:flex;align-items:center;gap:14px}
.hdr-logo{height:56px;width:auto;object-fit:contain}
.hdr-name{font-size:26px;font-weight:900;color:${branding.accentColor};font-family:'Arial Black',Arial,sans-serif;letter-spacing:-1px;line-height:1}
.hdr-bar-row{display:flex;align-items:center;gap:4px;margin-top:3px}
.hdr-bar{display:inline-block;width:24px;height:5px;background:#f97316;border-radius:2px}
.hdr-hospitals{font-size:10px;font-weight:700;color:${branding.accentColor};letter-spacing:0.35em}
.hdr-sub{font-size:10px;color:${branding.accentColor};opacity:0.7;margin-top:3px}
.hdr-right{text-align:right}
.ft{font-size:13px;letter-spacing:4px;text-transform:uppercase;color:${branding.accentColor};font-weight:700;margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:16px}
.field{margin-bottom:10px}.lbl{font-size:10px;text-transform:uppercase;color:#999;letter-spacing:1px}
.val{font-size:13px;font-weight:bold;border-bottom:1px solid #ddd;padding-bottom:2px;min-height:18px}
.sec{margin-top:18px;border-top:1px solid #ccc;padding-top:14px}
.sec-t{font-size:11px;font-weight:bold;text-transform:uppercase;color:${branding.accentColor};letter-spacing:2px;margin-bottom:10px}
.id-box{display:inline-block;background:#f8f8f8;border:2px solid ${branding.accentColor};padding:6px 18px;font-size:20px;font-weight:bold;font-family:monospace;letter-spacing:3px;margin-bottom:14px;color:${branding.accentColor}}
.foot{margin-top:36px;border-top:1px solid #eee;padding-top:12px;font-size:10px;color:#aaa;text-align:center}
@media print{body{padding:10px}button{display:none}}</style></head>
<body>
${inlineHeaderHtml(branding, `<div class="ft">Patient Admission Facesheet</div>`)}
<div>
  <span class="id-box">${patient?.patient_id || '—'}</span>&nbsp;&nbsp;
  <span class="id-box">${admission.admission_id}</span>
</div>
<div class="grid">
  <div class="field"><div class="lbl">Full Name</div><div class="val">${patient?.full_name || '—'}</div></div>
  <div class="field"><div class="lbl">Age / Gender</div><div class="val">${patient?.age || '—'} yrs / ${patient?.gender || '—'}</div></div>
  <div class="field"><div class="lbl">Date of Birth</div><div class="val">${patient?.date_of_birth || '—'}</div></div>
  <div class="field"><div class="lbl">Blood Group</div><div class="val">${patient?.blood_group || '—'}</div></div>
  <div class="field"><div class="lbl">Phone</div><div class="val">${patient?.phone || '—'}</div></div>
  <div class="field"><div class="lbl">Aadhaar</div><div class="val">${patient?.aadhar_card || '—'}</div></div>
  <div class="field" style="grid-column:1/-1"><div class="lbl">Address</div><div class="val">${patient?.address || '—'}</div></div>
</div>
<div class="sec"><div class="sec-t">Admission Details</div>
<div class="grid">
  <div class="field"><div class="lbl">Admission Date</div><div class="val">${new Date(admission.admission_date).toLocaleDateString('en-GB')}</div></div>
  <div class="field"><div class="lbl">Ward / Bed</div><div class="val">${admission.ward_name || '—'} / ${admission.bed_number || '—'}</div></div>
  <div class="field"><div class="lbl">Department</div><div class="val">${admission.department || '—'}</div></div>
  <div class="field"><div class="lbl">Consulting Doctor</div><div class="val">${admission.doctor_name || '—'}</div></div>
  <div class="field"><div class="lbl">Billing Category</div><div class="val">${admission.billing_category || 'General'}</div></div>
  <div class="field"><div class="lbl">Admission Type</div><div class="val">${admission.admission_type || '—'}</div></div>
</div></div>
<div class="sec"><div class="sec-t">Emergency Contact</div>
<div class="grid">
  <div class="field"><div class="lbl">Name</div><div class="val">${patient?.emergency_contact_name || '—'}</div></div>
  <div class="field"><div class="lbl">Phone</div><div class="val">${patient?.emergency_contact_phone || '—'}</div></div>
  <div class="field"><div class="lbl">Relation</div><div class="val">${patient?.emergency_contact_relation || '—'}</div></div>
</div></div>
<div class="sec"><div class="sec-t">Clinical Flags</div>
<div class="grid">
  <div class="field"><div class="lbl">Allergies</div><div class="val">${patient?.allergies || 'None reported'}</div></div>
  <div class="field"><div class="lbl">Chronic Conditions</div><div class="val">${patient?.chronic_conditions || 'None reported'}</div></div>
</div></div>
<div class="sec" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;margin-top:40px">
  <div><div class="lbl">Patient / Guardian Signature</div><div style="border-bottom:1px solid #000;height:40px"></div></div>
  <div><div class="lbl">Admitting Staff</div><div style="border-bottom:1px solid #000;height:40px"></div></div>
  <div><div class="lbl">Date & Time</div><div style="border-bottom:1px solid #000;height:40px"></div></div>
</div>
<div class="foot">Generated ${new Date().toLocaleString('en-IN')} · HospitalOS · ${admissionId}</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate facesheet' }, { status: 500 });
  }
}
