import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding } from '@/app/lib/bill-branding';
import {
    buildDischargeHeader,
    renderDischargeSummaryHtml,
    normalizeDischargeData,
    emptyDischargeData,
} from '@/app/lib/discharge-summary';

const ALLOWED_STAFF_ROLES = ['admin', 'doctor', 'ipd_manager', 'nurse', 'finance'];

// Printable, NABH-format discharge summary (HTML → print to PDF in the browser).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { admissionId } = await params;

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId },
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true } },
                ward: true,
                bed: { include: { wards: true } },
            },
        });
        if (!admission) {
            return NextResponse.json({ error: 'Admission not found' }, { status: 404 });
        }

        // Patient self-access guard
        if (auth.context.kind === 'patient' && admission.patient_id !== auth.context.session.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const row = await prisma.discharge_summaries.findFirst({
            where: { admission_id: admissionId, organizationId },
            orderBy: { created_at: 'desc' },
        });

        const data = row?.data ? normalizeDischargeData(row.data) : emptyDischargeData();
        const branding = await getBillBranding(organizationId);
        const header = buildDischargeHeader(admission, data);

        const html = renderDischargeSummaryHtml(branding, header, data, { withPrintButton: true });
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error: any) {
        console.error('discharge summary print route error:', error);
        return NextResponse.json({ error: error.message || 'Failed to render discharge summary' }, { status: 500 });
    }
}
