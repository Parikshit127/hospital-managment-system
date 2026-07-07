import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';
import { dispensingKey } from '@/app/lib/pharmacy-bill-group';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'ipd_manager', 'doctor', 'pharmacist', 'nurse', 'store_manager'];

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const money = (n: number) => Number(n || 0).toFixed(2);

// A pharmacy line description is "Pharmacy: <name> (Batch <batch>) × <qty> — Dr. X".
function parseDesc(desc: string): { name: string; batch: string } {
    let s = String(desc || '').replace(/^Pharmacy:\s*/i, '');
    s = s.split(' — ')[0]; // drop the trailing doctor suffix
    const withBatch = s.match(/^(.*?)\s*\(Batch\s+(.*?)\)\s*(?:×|x)\s*[\d.]+\s*$/i);
    if (withBatch) return { name: withBatch[1].trim(), batch: withBatch[2].trim() };
    const noBatch = s.match(/^(.*?)\s*(?:×|x)\s*[\d.]+\s*$/i);
    return { name: (noBatch ? noBatch[1] : s).trim(), batch: '' };
}

// Pharmacy bill for medicines dispensed to an IPD patient under a package
// (consumption ledger). Optional ?bill=<dispensingKey> scopes it to one bill.
export async function GET(req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { admissionId } = await params;
        const billKey = new URL(req.url).searchParams.get('bill') || '';

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId },
        });
        if (!admission) return new NextResponse('Admission not found', { status: 404 });

        const [patient, allPostings] = await Promise.all([
            prisma.oPD_REG.findFirst({ where: { patient_id: admission.patient_id, organizationId }, select: { full_name: true, patient_id: true, phone: true } }),
            prisma.ipdChargePosting.findMany({
                where: {
                    admission_id: admissionId,
                    disposition: 'package_consumed',
                    OR: [{ service_category: 'Pharmacy' }, { source_module: 'pharmacy' }],
                },
                orderBy: { posted_at: 'asc' },
            }),
        ]);

        // Scope to the clicked dispensing bill if a key was passed.
        const postings = billKey
            ? allPostings.filter((p: any) => dispensingKey(p.posted_at) === billKey)
            : allPostings;

        const billDate = postings.length
            ? new Date(Math.max(...postings.map((p: any) => new Date(p.posted_at).getTime())))
            : new Date();

        const lines = postings.map((p: any, idx: number) => {
            const { name, batch } = parseDesc(p.description);
            const qty = Number(p.quantity || 1);
            const rate = Number(p.unit_price || 0) || (qty ? Number(p.amount || 0) / qty : 0);
            const amount = Number(p.amount || 0);
            return { idx: idx + 1, name, batch, qty, rate, amount };
        });
        const total = lines.reduce((s, l) => s + l.amount, 0);

        const branding = getPharmacyBranding(organizationId);
        const rows = lines.map((l) => `
            <tr>
                <td class="c">${l.idx}</td>
                <td>${esc(l.name)}</td>
                <td class="c">${esc(l.batch)}</td>
                <td class="c">${l.qty}</td>
                <td class="r">${money(l.rate)}</td>
                <td class="r b">${money(l.amount)}</td>
            </tr>`).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pharmacy Bill — ${esc(admissionId)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI', Arial, sans-serif; font-size:12px; color:#111; background:#f0f2f5; }
  .toolbar { display:flex; gap:12px; align-items:center; justify-content:center; padding:10px; background:#1e3a6e; }
  .toolbar button { padding:7px 22px; background:#fff; color:#1e3a6e; font-weight:700; border:none; border-radius:6px; cursor:pointer; }
  .page { max-width:820px; margin:20px auto; background:#fff; padding:26px 30px; box-shadow:0 1px 6px rgba(0,0,0,.08); }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1e3a6e; padding-bottom:10px; margin-bottom:10px; }
  .nm { font-size:18px; font-weight:900; color:#1e3a6e; }
  .sub { font-size:9.5px; color:#6b7280; font-style:italic; }
  .addr { font-size:10px; color:#6b7280; margin-top:3px; }
  .badge { display:inline-block; padding:3px 12px; background:#1e3a6e; color:#fff; font-size:11px; font-weight:800; border-radius:3px; }
  .meta { font-size:10px; color:#374151; margin-top:4px; line-height:1.6; text-align:right; }
  .pt { display:flex; gap:16px; margin:10px 0 12px; font-size:11px; }
  .pt .box { flex:1; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; }
  .pt .t { font-size:8.5px; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; font-weight:800; }
  .pt .v { font-weight:700; }
  .note { font-size:10px; color:#4f46e5; margin:6px 0 10px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#1e3a6e; color:#fff; font-size:9.5px; text-transform:uppercase; padding:6px; border:1px solid #1e3a6e; }
  td { padding:5px 8px; font-size:11px; border:1px solid #e5e7eb; }
  td.c { text-align:center; } td.r { text-align:right; } td.b { font-weight:700; }
  tbody tr:nth-child(even){ background:#fafbfc; }
  tfoot td { font-weight:900; background:#eef2ff; }
  @media print {
    @page { size:A4; margin:10mm; }
    body { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .toolbar { display:none !important; }
    .page { margin:0; box-shadow:none; max-width:none; padding:0; }
    th { background:#1e3a6e !important; color:#fff !important; }
    tfoot td { background:#eef2ff !important; }
  }
</style></head><body>
<div class="toolbar">
  <script>document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('p');if(b)b.onclick=function(){window.print();};var k=document.getElementById('bk');if(k)k.onclick=function(){window.history.back();};});</script>
  <button id="bk" style="background:transparent;color:#cbd5e1;border:1px solid #475569;">Back</button>
  <button id="p">Print / Download PDF</button>
</div>
<div class="page">
  <div class="head">
    <div>
      <div class="nm">${esc(branding.name)}</div>
      ${branding.division ? `<div class="sub">${esc(branding.division)}</div>` : ''}
      <div class="addr">${esc(branding.address)}${branding.phone ? `<br>Phone: ${esc(branding.phone)}` : ''}${branding.gstin ? ` · GSTIN: ${esc(branding.gstin)}` : ''}</div>
    </div>
    <div style="text-align:right;">
      <span class="badge">PHARMACY BILL</span>
      <div class="meta">Admission: <strong>${esc(admissionId)}</strong><br>Date: <strong>${billDate.toLocaleDateString('en-GB')}</strong></div>
    </div>
  </div>

  <div class="pt">
    <div class="box"><div class="t">Patient</div><div class="v">${esc(patient?.full_name || '-')}</div></div>
    <div class="box"><div class="t">MRN</div><div class="v">${esc(patient?.patient_id || '-')}</div></div>
    <div class="box"><div class="t">Contact</div><div class="v">${esc(patient?.phone || '-')}</div></div>
  </div>
  <div class="note">Medicines dispensed under the package (absorbed as hospital expense — not charged to the patient/TPA).</div>

  ${lines.length === 0 ? '<p style="text-align:center;color:#9ca3af;padding:30px;">No pharmacy items for this bill.</p>' : `
  <table>
    <thead><tr><th>Sr</th><th>Medicine</th><th>Batch</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="5" class="r">Total</td><td class="r">₹${money(total)}</td></tr></tfoot>
  </table>`}

  <p style="font-size:9px;color:#9ca3af;margin-top:18px;text-align:center;">Computer-generated pharmacy bill — no signature required.</p>
</div>
</body></html>`;

        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error: any) {
        console.error('pharmacy-bill route error:', error?.message || error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
