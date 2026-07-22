import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding } from '@/app/lib/bill-branding';
import { removeAbsorbedCharge } from '@/app/actions/ipd-finance-actions';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'ipd_manager', 'doctor', 'pharmacist', 'nurse', 'store_manager'];

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Printable view of the CONSUMPTION ledger: charges absorbed under the package
// (disposition = package_consumed) — NOT on the patient/TPA bill. Internal doc.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { admissionId } = await params;

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId },
        });
        if (!admission) return new NextResponse('Admission not found', { status: 404 });

        const [patient, admPkg, postings, branding] = await Promise.all([
            prisma.oPD_REG.findFirst({ where: { patient_id: admission.patient_id, organizationId }, select: { full_name: true, patient_id: true } }),
            prisma.ipdAdmissionPackage.findFirst({ where: { admission_id: admissionId }, include: { package: true } }),
            prisma.ipdChargePosting.findMany({
                where: { admission_id: admissionId, disposition: 'package_consumed' },
                orderBy: { posted_at: 'desc' },
            }),
            getBillBranding(organizationId),
        ]);

        const items = postings.map((p: any) => ({
            id: p.id,
            date: new Date(p.posted_at).toLocaleDateString('en-GB'),
            description: p.description,
            category: p.service_category || p.source_module || 'Other',
            quantity: Number(p.quantity || 1),
            amount: Number(p.amount || 0),
        }));
        const total = items.reduce((s, i) => s + i.amount, 0);
        const byCategory: Record<string, number> = {};
        for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;
        const packageName = admPkg?.applied_package_name || admPkg?.package?.package_name || '';
        const packageAmount = admPkg ? Number(admPkg.applied_amount) : 0;

        const rows = items.map((i, idx) => `
            <tr>
                <td class="c">${idx + 1}</td>
                <td class="c">${esc(i.date)}</td>
                <td>${esc(i.description)}</td>
                <td>${esc(i.category)}</td>
                <td class="c">${i.quantity}</td>
                <td class="r">${money(i.amount)}</td>
                <td class="c noprint"><button class="rm" data-id="${i.id}" title="Remove (added by mistake)">✕</button></td>
            </tr>`).join('');

        const catChips = Object.entries(byCategory)
            .map(([cat, amt]) => `<span class="chip">${esc(cat)}: ₹${money(amt)}</span>`).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Absorbed Charges — ${esc(admissionId)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI', Arial, sans-serif; font-size:12px; color:#111; background:#f0f2f5; }
  .toolbar { display:flex; gap:12px; align-items:center; justify-content:center; padding:10px; background:#1e3a6e; }
  .toolbar button { padding:7px 22px; background:#fff; color:#1e3a6e; font-weight:700; border:none; border-radius:6px; cursor:pointer; }
  .page { max-width:820px; margin:20px auto; background:#fff; padding:26px 30px; box-shadow:0 1px 6px rgba(0,0,0,.08); }
  .head { border-bottom:2px solid #1e3a6e; padding-bottom:10px; margin-bottom:12px; }
  .nm { font-size:18px; font-weight:900; color:#1e3a6e; }
  .addr { font-size:10px; color:#6b7280; margin-top:2px; }
  .title { display:inline-block; margin-top:8px; padding:3px 12px; background:#eef2ff; color:#3730a3; font-weight:800; font-size:12px; border-radius:4px; }
  .meta { font-size:11px; color:#374151; margin-top:8px; line-height:1.6; }
  .note { font-size:11px; color:#4f46e5; margin:8px 0; }
  .chips { margin:10px 0; display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:10.5px; font-weight:600; background:#f3f4f6; color:#374151; border-radius:999px; padding:3px 10px; }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th { background:#1e3a6e; color:#fff; font-size:9.5px; text-transform:uppercase; padding:6px; border:1px solid #1e3a6e; }
  td { padding:5px 6px; font-size:11px; border:1px solid #e5e7eb; }
  td.c { text-align:center; } td.r { text-align:right; }
  tbody tr:nth-child(even){ background:#fafbfc; }
  tfoot td { font-weight:800; }
  .totrow td { background:#eef2ff; }
  .rm { background:#fee2e2; color:#b91c1c; border:none; border-radius:4px; padding:2px 8px; font-weight:700; cursor:pointer; font-size:11px; }
  .rm:hover { background:#fecaca; }
  .rm[disabled] { opacity:.5; cursor:default; }
  @media print {
    @page { size:A4; margin:10mm; }
    body { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .toolbar { display:none !important; }
    .noprint { display:none !important; }
    .page { margin:0; box-shadow:none; max-width:none; padding:0; }
    th { background:#1e3a6e !important; color:#fff !important; }
    .totrow td { background:#eef2ff !important; }
  }
</style></head><body>
<div class="toolbar">
  <script>
    document.addEventListener('DOMContentLoaded',function(){
      var b=document.getElementById('p');if(b)b.onclick=function(){window.print();};
      var k=document.getElementById('bk');if(k)k.onclick=function(){window.history.back();};
    });
    // Remove a wrongly-added absorbed charge (admin/finance only).
    document.addEventListener('click',function(e){
      var btn=e.target && e.target.closest ? e.target.closest('.rm') : null;
      if(!btn) return;
      if(!confirm('Remove this absorbed charge? This deletes it from the absorbed list and the hospital expense.')) return;
      btn.disabled=true; btn.textContent='…';
      fetch(window.location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chargeId:Number(btn.getAttribute('data-id'))})})
        .then(function(r){return r.json();})
        .then(function(res){ if(res&&res.success){ window.location.reload(); } else { alert((res&&res.error)||'Failed to remove'); btn.disabled=false; btn.textContent='✕'; } })
        .catch(function(){ alert('Failed to remove'); btn.disabled=false; btn.textContent='✕'; });
    });
  </script>
  <button id="bk" style="background:transparent;color:#cbd5e1;border:1px solid #475569;">Back</button>
  <button id="p">Print / Download PDF</button>
</div>
<div class="page">
  <div class="head">
    <div class="nm">${esc(branding.hospitalName)}</div>
    <div class="addr">${esc(branding.hospitalAddress)}</div>
    <div class="title">ABSORBED CHARGES (UNDER PACKAGE)</div>
    <div class="meta">
      Patient: <strong>${esc(patient?.full_name || '-')}</strong> &nbsp;·&nbsp; MRN: <strong>${esc(patient?.patient_id || '-')}</strong><br>
      Admission: <strong>${esc(admissionId)}</strong>${packageName ? ` &nbsp;·&nbsp; Package: <strong>${esc(packageName)}</strong>` : ''}
    </div>
    <div class="note">These charges are absorbed by the hospital under the package and are NOT billed to the patient/TPA (booked as expense).</div>
  </div>

  ${items.length === 0 ? '<p style="text-align:center;color:#9ca3af;padding:30px;">No absorbed charges for this admission.</p>' : `
  <div class="chips">${catChips}</div>
  <table>
    <thead><tr><th>Sr</th><th>Date</th><th>Description</th><th>Category</th><th>Qty</th><th>Amount</th><th class="noprint"></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="totrow"><td colspan="5" class="r">Total Absorbed (hospital expense)</td><td class="r">₹${money(total)}</td><td class="noprint"></td></tr>
      ${packageAmount > 0 ? `<tr><td colspan="5" class="r" style="font-weight:600;color:#065f46;">Package amount (billed to patient/TPA)</td><td class="r" style="color:#065f46;">₹${money(packageAmount)}</td><td class="noprint"></td></tr>` : ''}
    </tfoot>
  </table>`}

  <p style="font-size:9px;color:#9ca3af;margin-top:18px;text-align:center;">Internal document — consumption ledger. Computer-generated, no signature required.</p>
</div>
</body></html>`;

        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error: any) {
        console.error('absorbed-charges route error:', error?.message || error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Remove a wrongly-added absorbed charge. Called from the × buttons on the page.
export async function POST(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ['admin', 'finance'] });
        if (!auth.ok) return auth.response;
        const body = await req.json().catch(() => ({}));
        const chargeId = Number(body?.chargeId);
        if (!chargeId) return NextResponse.json({ success: false, error: 'chargeId required' }, { status: 400 });
        const res = await removeAbsorbedCharge(chargeId);
        return NextResponse.json(res, { status: res.success ? 200 : 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
