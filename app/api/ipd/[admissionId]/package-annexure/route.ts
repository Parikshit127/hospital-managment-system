import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding, type BillBranding } from '@/app/lib/bill-branding';
import { CHARGE_DISPOSITION, roundMoney } from '@/app/lib/package-billing';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

// Package Utilization Annexure — the internal breakup of services consumed
// under a package (and exclusions billed over it). The main bill/claim shows
// the package line only; this annexure is the supporting detail for TPAs or
// internal review. Read-only: renders from the consumption ledger.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: false,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { admissionId } = await params;
        const organizationId = auth.context.organizationId;

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId },
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true, patient_type: true } },
                ward: { select: { ward_name: true } },
                ipd_admission_packages: {
                    include: { package: true },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                },
            },
        });
        if (!admission) {
            return NextResponse.json({ error: 'Admission not found' }, { status: 404 });
        }

        const admPkg: any = admission.ipd_admission_packages?.[0];
        const org = await prisma.organization.findUnique({ where: { id: organizationId } });
        const branding = await getBillBranding(organizationId);

        if (!admPkg) {
            return new NextResponse(
                shellHTML(branding, org, 'Package Utilization Annexure',
                    '<p style="text-align:center;color:#888;padding:40px 0;">No package is applied to this admission.</p>'),
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            );
        }

        // Consumption ledger for this package. Disposition fields are filtered
        // in JS so this route works even before the Prisma client is regenerated.
        const allPostings: any[] = await prisma.ipdChargePosting.findMany({
            where: { admission_id: admissionId, organizationId },
            orderBy: { posted_at: 'asc' },
        });
        const pkgPostings = allPostings.filter((p: any) => p.admission_package_id === admPkg.id);
        const consumed = pkgPostings.filter((p: any) => p.disposition === CHARGE_DISPOSITION.PACKAGE_CONSUMED);
        const extras = pkgPostings.filter((p: any) => p.disposition === CHARGE_DISPOSITION.BILLABLE_EXTRA);

        const consumedTotal = roundMoney(consumed.reduce((s, p) => s + Number(p.amount), 0));
        const extrasTotal = roundMoney(extras.reduce((s, p) => s + Number(p.amount), 0));
        const packageAmount = Number(admPkg.applied_amount);
        const utilizationPct = packageAmount > 0 ? roundMoney((consumedTotal / packageAmount) * 100) : 0;

        const byCategory: Record<string, any[]> = {};
        for (const p of consumed) {
            const cat = p.service_category || p.source_module || 'Other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(p);
        }

        const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        const dt = (d: any) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        const categoryRows = Object.entries(byCategory).map(([cat, rows]) => {
            const catTotal = roundMoney(rows.reduce((s, p) => s + Number(p.amount), 0));
            const lines = rows.map(p => `
                <tr>
                    <td>${escapeHtml(p.description)}</td>
                    <td>${dt(p.posted_at)}</td>
                    <td style="text-align:center;">${Number(p.quantity) || 1}</td>
                    <td style="text-align:right;">${inr(Number(p.amount))}</td>
                </tr>`).join('');
            return `
                <tr class="cat-row"><td colspan="3">${escapeHtml(cat)}</td><td style="text-align:right;">${inr(catTotal)}</td></tr>
                ${lines}`;
        }).join('');

        const extrasSection = extras.length === 0 ? '' : `
            <h3>Billed over the package (exclusions) — on the main bill</h3>
            <table>
                <thead><tr><th>Service</th><th>Date</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Amount</th></tr></thead>
                <tbody>
                    ${extras.map(p => `
                    <tr>
                        <td>${escapeHtml(p.description)}</td>
                        <td>${dt(p.posted_at)}</td>
                        <td style="text-align:center;">${Number(p.quantity) || 1}</td>
                        <td style="text-align:right;">${inr(Number(p.amount))}</td>
                    </tr>`).join('')}
                    <tr class="total-row"><td colspan="3">Total billed over package</td><td style="text-align:right;">${inr(extrasTotal)}</td></tr>
                </tbody>
            </table>`;

        const body = `
            <table class="meta">
                <tr>
                    <td><strong>Patient:</strong> ${escapeHtml(admission.patient?.full_name || '')} (${escapeHtml(admission.patient?.patient_id || '')})</td>
                    <td><strong>Admission:</strong> ${escapeHtml(admissionId)}</td>
                </tr>
                <tr>
                    <td><strong>Ward:</strong> ${escapeHtml(admission.ward?.ward_name || 'N/A')}</td>
                    <td><strong>Admitted:</strong> ${dt(admission.admission_date)}${admission.discharge_date ? ` · <strong>Discharged:</strong> ${dt(admission.discharge_date)}` : ''}</td>
                </tr>
            </table>

            <div class="summary">
                <div><span>Package</span><strong>${escapeHtml(admPkg.applied_package_name || admPkg.package?.package_name || '')}</strong></div>
                <div><span>Package Amount (billed / claimed)</span><strong>${inr(packageAmount)}</strong></div>
                <div><span>Services consumed under package</span><strong>${inr(consumedTotal)} (${utilizationPct}%)</strong></div>
                <div><span>Margin / headroom</span><strong>${inr(roundMoney(packageAmount - consumedTotal))}</strong></div>
                ${extras.length ? `<div><span>Billed over package (exclusions)</span><strong>${inr(extrasTotal)}</strong></div>` : ''}
            </div>

            <p class="note">The main bill / TPA claim carries the package amount${extras.length ? ' plus the listed exclusions' : ''} only.
            Services below were consumed under the package and are absorbed by the hospital — they are <strong>not</strong> charged to the patient or payer.</p>

            <h3>Services consumed under the package</h3>
            <table>
                <thead><tr><th>Service</th><th>Date</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Amount</th></tr></thead>
                <tbody>
                    ${categoryRows || '<tr><td colspan="4" style="text-align:center;color:#888;">No services consumed yet.</td></tr>'}
                    <tr class="total-row"><td colspan="3">Total consumed (absorbed by hospital)</td><td style="text-align:right;">${inr(consumedTotal)}</td></tr>
                </tbody>
            </table>
            ${extrasSection}
            <p class="footer-note">Status: ${escapeHtml(admPkg.status || (admPkg.is_broken_open ? 'broken_open' : 'active'))} · Generated ${new Date().toLocaleString('en-IN')}</p>`;

        return new NextResponse(
            shellHTML(branding, org, 'Package Utilization Annexure', body),
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
    } catch (error: any) {
        console.error('Package annexure error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function escapeHtml(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shellHTML(branding: BillBranding, org: any, title: string, body: string): string {
    const hospitalName = escapeHtml(branding.hospitalName || org?.name || 'Hospital');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 28px; max-width: 860px; margin: 0 auto; }
    .head { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 14px; }
    .head h1 { font-size: 18px; } .head h2 { font-size: 13px; font-weight: 600; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
    table.meta td { padding: 3px 0; border: none; }
    th, td { border: 1px solid #d5d5d5; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .cat-row td { background: #fafafa; font-weight: 700; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.5px; color: #555; }
    .total-row td { font-weight: 800; background: #f8fafc; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin: 12px 0; }
    .summary div { display: flex; justify-content: space-between; }
    .summary span { color: #64748b; }
    h3 { font-size: 12.5px; margin: 16px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .note { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 8px 10px; color: #3730a3; margin: 10px 0; }
    .footer-note { color: #94a3b8; font-size: 10.5px; margin-top: 18px; text-align: right; }
    @media print { body { padding: 8px; } }
</style>
</head>
<body>
    <div class="head">
        <h1>${hospitalName}</h1>
        <h2>${escapeHtml(title)}</h2>
    </div>
    ${body}
    <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
}
