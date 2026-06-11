import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding, type BillBranding } from '@/app/lib/bill-branding';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager', 'pharmacist', 'nurse'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ packageId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: false,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { packageId } = await params;
        const pkgId = parseInt(packageId);
        if (isNaN(pkgId)) {
            return NextResponse.json({ error: 'Invalid package ID' }, { status: 400 });
        }

        const pkg = await prisma.ipdPackage.findFirst({
            where: { id: pkgId, organizationId: auth.context.organizationId },
        });

        if (!pkg) {
            return NextResponse.json({ error: 'Package not found' }, { status: 404 });
        }

        const branding = await getBillBranding(auth.context.organizationId);
        const html = packageBreakupHTML(pkg, branding);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Package breakup error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function packageBreakupHTML(pkg: any, branding: BillBranding): string {
    const accent = branding.accentColor || '#1e3a6e';
    const hospitalName = branding.hospitalName;
    const gstin = branding.gstin || 'N/A';
    const amount = Number(pkg.total_amount || 0);

    // Parse inclusions — can be array of strings or array of objects { name, qty, amount?, service_id? }
    const rawInclusions: any[] = Array.isArray(pkg.inclusions) ? pkg.inclusions : [];
    const inclusions = rawInclusions.map((inc: any) => {
        if (typeof inc === 'string') return { name: inc, qty: 1, amount: 0 };
        return { name: inc.name || inc, qty: inc.qty ?? 1, amount: Number(inc.amount || 0), service_id: inc.service_id };
    });
    const hasAmounts = inclusions.some(inc => inc.amount > 0);
    const inclusionsTotal = inclusions.reduce((s, inc) => s + inc.amount, 0);

    // Parse exclusions — can be JSON string or array
    let exclusions: string[] = [];
    if (Array.isArray(pkg.exclusions)) {
        exclusions = pkg.exclusions.filter((x: any) => typeof x === 'string');
    } else if (typeof pkg.exclusions === 'string') {
        try {
            const parsed = JSON.parse(pkg.exclusions);
            exclusions = Array.isArray(parsed) ? parsed : [pkg.exclusions];
        } catch {
            if (pkg.exclusions.trim()) {
                exclusions = pkg.exclusions.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
        }
    }

    // Parse description for metadata (category, is_day_care)
    let meta: { category?: string; is_day_care?: boolean } = {};
    try {
        if (pkg.description) meta = JSON.parse(pkg.description);
    } catch {
        meta = {};
    }

    const colCount = hasAmounts ? 5 : 4;
    const inclusionRows = inclusions.length > 0
        ? inclusions.map((inc, i) => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;color:#9ca3af;font-size:11px;">${i + 1}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:500;">${inc.name}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:12px;font-weight:600;">${inc.qty}</td>
                ${hasAmounts ? `<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;font-weight:600;">${inc.amount > 0 ? '&#8377;' + inc.amount.toLocaleString('en-IN') : '—'}</td>` : ''}
                <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:11px;color:#059669;">Included</td>
            </tr>`).join('')
        : `<tr><td colspan="${colCount}" style="padding:12px;text-align:center;color:#9ca3af;font-size:12px;">No specific inclusions listed</td></tr>`;

    const inclusionTotalRow = hasAmounts ? `
        <tr style="background:#f0fdf4;">
            <td colspan="3" style="padding:10px 12px;text-align:right;font-size:12px;font-weight:800;color:#065f46;">Breakup Total</td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:900;color:#065f46;">&#8377;${inclusionsTotal.toLocaleString('en-IN')}</td>
            <td></td>
        </tr>` : '';

    const exclusionList = exclusions.length > 0
        ? exclusions.map(e => `<li style="margin-bottom:6px;font-size:12px;color:#374151;">${e}</li>`).join('')
        : '<li style="color:#9ca3af;list-style:none;font-size:12px;">No specific exclusions listed</li>';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Package Breakup — ${pkg.package_code}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #f0f2f5; }
        @media print {
            @page { margin: 10mm 8mm; size: A4; }
            body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .toolbar { display: none !important; }
            .page { margin: 0; box-shadow: none; border-radius: 0; }
        }
    </style>
</head>
<body>
    <div class="toolbar" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 20px;background:${accent};">
        <button onclick="window.history.back()" style="padding:7px 20px;background:transparent;color:#94a3b8;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">Back</button>
        <button onclick="window.print()" style="padding:7px 24px;background:white;color:${accent};border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">Print / Download PDF</button>
        <span style="font-size:11px;color:#94a3b8;">${pkg.package_code} — ${pkg.package_name}</span>
    </div>

    <div class="page" style="max-width:800px;margin:24px auto;background:#fff;border-radius:4px;box-shadow:0 1px 6px rgba(0,0,0,0.08);overflow:hidden;">
        <div style="height:4px;background:linear-gradient(90deg, ${accent} 0%, ${accent}99 100%);"></div>
        <div style="padding:36px 44px 32px;">

            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;">
                <div>
                    <h1 style="font-size:22px;font-weight:900;color:${accent};letter-spacing:0.5px;margin:0;">${hospitalName}</h1>
                    ${branding.tagline ? `<p style="font-size:9.5px;color:#6b7280;margin-top:1px;font-style:italic;">${branding.tagline}</p>` : ''}
                    <p style="font-size:10px;color:#6b7280;margin-top:4px;">${branding.hospitalAddress || ''}</p>
                    ${gstin !== 'N/A' ? `<p style="font-size:10px;color:#6b7280;">GSTIN: ${gstin}</p>` : ''}
                </div>
                <div style="text-align:right;">
                    <span style="display:inline-block;padding:3px 12px;background:${accent};color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;border-radius:3px;">Package Breakup</span>
                    <p style="font-size:10px;color:#6b7280;margin-top:6px;">Date: <strong style="color:#1a1a1a;">${new Date().toLocaleDateString('en-GB')}</strong></p>
                </div>
            </div>

            <hr style="border:none;border-top:1.5px solid #e5e7eb;margin:0 0 18px 0;"/>

            <!-- Package Info Card -->
            <div style="background:linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
                    <div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
                            <span style="font-family:monospace;font-size:14px;font-weight:800;color:#065f46;background:#d1fae5;padding:3px 10px;border-radius:4px;">${pkg.package_code}</span>
                            ${meta.category ? `<span style="padding:2px 8px;background:#10b981;color:white;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;">${meta.category}</span>` : ''}
                            ${meta.is_day_care ? `<span style="padding:2px 8px;background:#f59e0b;color:white;border-radius:4px;font-size:10px;font-weight:700;">DAY CARE</span>` : ''}
                        </div>
                        <h2 style="font-size:16px;font-weight:700;color:#065f46;margin:0;">${pkg.package_name}</h2>
                        <p style="font-size:11px;color:#047857;margin-top:4px;">Package validity: <strong>${pkg.validity_days || 7} day(s)</strong> from date of surgery/procedure</p>
                    </div>
                    <div style="text-align:right;">
                        <p style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Package Amount</p>
                        <p style="font-size:28px;font-weight:900;color:#065f46;margin-top:2px;">&#8377;${amount.toLocaleString('en-IN')}</p>
                    </div>
                </div>
            </div>

            <!-- Inclusions Table -->
            <div style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#d1fae5;border-radius:50%;font-size:14px;font-weight:800;color:#059669;">&#10003;</span>
                    <h3 style="font-size:14px;font-weight:800;color:#059669;margin:0;">What Is Included</h3>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="padding:8px 12px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#fff;background:${accent};text-align:center;width:50px;border-radius:4px 0 0 0;">S.No</th>
                            <th style="padding:8px 12px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#fff;background:${accent};text-align:left;">Service / Item</th>
                            <th style="padding:8px 12px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#fff;background:${accent};text-align:center;width:70px;">Qty</th>
                            ${hasAmounts ? `<th style="padding:8px 12px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#fff;background:${accent};text-align:right;width:110px;">Amount</th>` : ''}
                            <th style="padding:8px 12px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#fff;background:${accent};text-align:center;width:90px;border-radius:0 4px 0 0;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inclusionRows}
                        ${inclusionTotalRow}
                    </tbody>
                </table>
            </div>

            ${hasAmounts && inclusionsTotal < amount ? `
            <!-- Remaining Amount Note -->
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;color:#1e40af;font-weight:600;">Remaining (Surgeon Fees, OT, Room, Nursing, etc.)</span>
                <span style="font-size:14px;font-weight:900;color:#1e40af;">&#8377;${(amount - inclusionsTotal).toLocaleString('en-IN')}</span>
            </div>
            ` : ''}

            <!-- Exclusions -->
            <div style="margin-bottom:24px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#fee2e2;border-radius:50%;font-size:14px;font-weight:800;color:#dc2626;">&#10007;</span>
                    <h3 style="font-size:14px;font-weight:800;color:#dc2626;margin:0;">What Is Not Included</h3>
                    <span style="font-size:10px;color:#9ca3af;font-style:italic;">(Will be charged separately)</span>
                </div>
                <div style="border:1px solid #fecaca;border-radius:8px;padding:14px 18px;background:#fef2f2;">
                    <ul style="padding-left:18px;margin:0;">
                        ${exclusionList}
                    </ul>
                </div>
            </div>

            <!-- Notes -->
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
                <h4 style="font-size:12px;font-weight:800;color:#92400e;margin:0 0 6px 0;">Important Notes</h4>
                <ul style="padding-left:18px;margin:0;font-size:11px;color:#78350f;line-height:1.7;">
                    <li>Package validity of <strong>${pkg.validity_days || 7} day(s)</strong> begins from the date of surgery/procedure.</li>
                    <li>Any services, tests, medicines, or consumables outside the listed inclusions will be charged separately at prevailing rates.</li>
                    <li>Extended stay beyond the package validity will attract additional room and nursing charges.</li>
                    <li>This breakup is for informational purposes. Final billing will be as per actuals for excluded items.</li>
                </ul>
            </div>

            <!-- Footer -->
            <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:16px;border-top:1px solid #e5e7eb;">
                <div>
                    <p style="font-size:9px;color:#9ca3af;">Package Code: <strong style="color:#6b7280;">${pkg.package_code}</strong></p>
                    <p style="font-size:9px;color:#9ca3af;">Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div style="text-align:right;">
                    <div style="border-top:1px solid #9ca3af;width:140px;margin:0 0 4px auto;"></div>
                    <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">Authorized</p>
                    <p style="font-size:9px;color:#6b7280;font-style:italic;">For ${hospitalName}</p>
                </div>
            </div>

            <p style="font-size:8px;color:#d1d5db;text-align:center;margin-top:16px;padding-top:8px;border-top:1px dashed #e5e7eb;">
                This is a computer-generated document. &mdash; ${hospitalName}
            </p>
        </div>
    </div>
</body>
</html>`;
}
