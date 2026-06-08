import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding, type BillBranding } from '@/app/lib/bill-branding';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { admissionId } = await params;

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId: auth.context.organizationId },
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true, address: true } },
                ward: { select: { ward_name: true } },
                bed: { select: { bed_id: true } },
                ipd_admission_packages: {
                    where: { is_broken_open: false },
                    include: { package: true },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                },
            },
        });

        if (!admission) {
            return NextResponse.json({ error: 'Admission not found' }, { status: 404 });
        }

        const admPkg = admission.ipd_admission_packages?.[0];
        const org = await prisma.organization.findUnique({
            where: { id: auth.context.organizationId },
        });
        const branding = await getBillBranding(auth.context.organizationId);

        if (!admPkg) {
            return new NextResponse(noPackageHTML(admission, org, branding), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }

        const html = packageAcceptanceHTML(admission, admPkg, org, branding);
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Package acceptance error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function noPackageHTML(admission: any, org: any, branding: BillBranding): string {
    const hospitalName = branding.hospitalName;
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>No Package Attached</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#374151;}h1{color:${branding.accentColor};}p{font-size:14px;line-height:1.6;}a{color:${branding.accentColor};}</style>
</head><body>
<h1>${hospitalName}</h1>
<h2 style="color:#f59e0b;">No IPD Package Attached</h2>
<p>Admission <strong>${admission.admission_id}</strong> does not have an IPD package attached. The Package Acceptance form is only generated when a package has been selected for this admission.</p>
<p>To attach a package: open the admission, go to the billing tab, or re-admit via the IPD Dashboard with a package selected.</p>
<p><a href="javascript:window.close()">Close this tab</a></p>
</body></html>`;
}

function packageAcceptanceHTML(admission: any, admPkg: any, org: any, branding: BillBranding): string {
    const patient = admission.patient || {};
    const pkg = admPkg.package;
    const rawInclusions: any[] = Array.isArray(pkg.inclusions) ? pkg.inclusions : [];
    const inclusions = rawInclusions.map((x: any) => {
        if (typeof x === 'string') return { name: x, amount: 0 };
        return { name: x.name || String(x), amount: Number(x.amount || 0) };
    });
    const hasAmounts = inclusions.some((x: any) => x.amount > 0);
    const exclusions: string[] = Array.isArray(pkg.exclusions) ? pkg.exclusions.filter((x: any) => typeof x === 'string') : [];

    let meta: { category?: string; is_day_care?: boolean } = {};
    try {
        if (pkg.description) meta = JSON.parse(pkg.description);
    } catch {
        meta = {};
    }

    const hospitalName = branding.hospitalName;
    const gstin = branding.gstin || org?.registration_number || 'N/A';
    const admissionDate = new Date(admission.admission_date).toLocaleDateString('en-IN');
    const amount = Number(admPkg.applied_amount || pkg.total_amount || 0);

    const incRows = inclusions.length
        ? inclusions.map((i: any) => `<li style="margin-bottom:4px;">${i.name}${hasAmounts && i.amount > 0 ? ` <span style="float:right;font-weight:700;">₹${i.amount.toLocaleString('en-IN')}</span>` : ''}</li>`).join('')
        : '<li style="color:#9ca3af;list-style:none;">—</li>';
    const excRows = exclusions.length
        ? exclusions.map((e) => `<li style="margin-bottom:4px;">${e}</li>`).join('')
        : '<li style="color:#9ca3af;list-style:none;">—</li>';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Package Acceptance Form — ${admission.admission_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
        .page { max-width: 780px; margin: 0 auto; padding: 30px; }
        h1 { color: ${branding.accentColor}; font-size: 22px; font-weight: 900; }
        h2 { font-size: 16px; font-weight: 800; }
        ul { padding-left: 18px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:${branding.accentColor};color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Print / Download PDF</button>
        <span style="margin-left:12px;font-size:11px;color:#6b7280;">Have the patient/relative sign before treatment begins. Keep a copy on file.</span>
    </div>

    <div class="page">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${branding.accentColor};padding-bottom:14px;margin-bottom:18px;">
            <div>
                <h1>${hospitalName}</h1>
                <p style="font-size:10px;color:#6b7280;margin-top:2px;">A Unit of TAH Global Healthcare Pvt. Ltd.</p>
                <p style="font-size:10px;color:#6b7280;">GSTIN: ${gstin}</p>
            </div>
            <div style="text-align:right;">
                <h2 style="color:${branding.accentColor};">IPD PACKAGE ACCEPTANCE FORM</h2>
                <p style="font-size:11px;font-weight:700;color:${branding.accentColor};margin-top:4px;">Admission: ${admission.admission_id}</p>
                <p style="font-size:10px;color:#6b7280;">Date: ${new Date().toLocaleDateString('en-IN')}</p>
            </div>
        </div>

        <!-- Patient & Admission -->
        <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <p style="font-size:11px;"><strong>Patient:</strong> ${patient.full_name || '-'}</p>
                <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id || '-'}</p>
                <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                <p style="font-size:11px;"><strong>Phone:</strong> ${patient.phone || '-'}</p>
                <p style="font-size:11px;"><strong>Doctor:</strong> ${admission.doctor_name || '-'}</p>
                <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
                <p style="font-size:11px;"><strong>Admission Date:</strong> ${admissionDate}</p>
                <p style="font-size:11px;"><strong>Diagnosis:</strong> ${admission.diagnosis || '-'}</p>
            </div>
        </div>

        <!-- Package details -->
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-family:monospace;font-size:14px;font-weight:800;color:#065f46;">${pkg.package_code}</span>
                    ${meta.category ? `<span style="padding:2px 8px;background:#10b981;color:white;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;">${meta.category}</span>` : ''}
                    ${meta.is_day_care ? `<span style="padding:2px 8px;background:#f59e0b;color:white;border-radius:4px;font-size:10px;font-weight:700;">DAY CARE</span>` : ''}
                </div>
                <span style="font-size:18px;font-weight:900;color:#065f46;">₹${amount.toLocaleString('en-IN')}</span>
            </div>
            <p style="font-size:13px;font-weight:600;color:#065f46;">${pkg.package_name}</p>
            <p style="font-size:10px;color:#047857;margin-top:4px;">Package validity: ${pkg.validity_days || 7} day(s) from date of surgery</p>
        </div>

        <!-- Inclusions / Exclusions -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
            <div style="border:1px solid #a7f3d0;border-radius:8px;padding:12px;">
                <h3 style="font-size:13px;font-weight:800;color:#059669;margin-bottom:8px;">✓ WHAT IS INCLUDED</h3>
                <ul style="color:#374151;">${incRows}</ul>
            </div>
            <div style="border:1px solid #fecaca;border-radius:8px;padding:12px;">
                <h3 style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:8px;">✗ WHAT IS NOT INCLUDED</h3>
                <ul style="color:#374151;">${excRows}</ul>
            </div>
        </div>

        <!-- Declaration -->
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:18px;background:#fffbeb;">
            <h3 style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:8px;">Declaration by Patient / Relative</h3>
            <p style="font-size:11px;line-height:1.7;color:#374151;">
                I confirm that I have read and understood the package <strong>${pkg.package_code} — ${pkg.package_name}</strong>
                priced at <strong>₹${amount.toLocaleString('en-IN')}</strong>, including the inclusions and exclusions listed above.
                I understand that any services, tests, medicines, or consumables outside the listed inclusions will be charged separately.
                I accept the terms and authorize ${hospitalName} to proceed with treatment under this package.
            </p>
        </div>

        <!-- Signatures -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px;">
            <div>
                <div style="border-bottom:1px solid #374151;height:50px;"></div>
                <p style="font-size:11px;color:#374151;margin-top:4px;"><strong>Patient / Relative Signature</strong></p>
                <p style="font-size:10px;color:#6b7280;">Name: ____________________________</p>
                <p style="font-size:10px;color:#6b7280;">Relation: __________________________</p>
                <p style="font-size:10px;color:#6b7280;">Date: _____________________________</p>
            </div>
            <div>
                <div style="border-bottom:1px solid #374151;height:50px;"></div>
                <p style="font-size:11px;color:#374151;margin-top:4px;"><strong>Hospital Witness Signature</strong></p>
                <p style="font-size:10px;color:#6b7280;">Name: ____________________________</p>
                <p style="font-size:10px;color:#6b7280;">Designation: ______________________</p>
                <p style="font-size:10px;color:#6b7280;">Date: _____________________________</p>
            </div>
        </div>

        <p style="font-size:9px;color:#9ca3af;text-align:center;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:8px;">
            This form must be signed BEFORE treatment commences. Original copy filed with the patient's IPD record.
        </p>
    </div>
</body>
</html>`;
}
