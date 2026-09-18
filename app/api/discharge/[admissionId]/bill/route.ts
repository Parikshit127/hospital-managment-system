import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

/**
 * Compatibility URL for the detailed IPD discharge bill.
 *
 * Keep rendering in the master-invoice route so IPD and Master Billing always use
 * the exact same template, calculations, print controls, and medicine handling.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    const auth = await resolveRouteAuth({
        allowPatient: true,
        allowedStaffRoles: ALLOWED_STAFF_ROLES,
    });
    if (!auth.ok) return auth.response;

    const { admissionId } = await params;
    const invoice = await prisma.invoices.findFirst({
        where: {
            admission_id: admissionId,
            organizationId: auth.context.organizationId,
            status: { not: 'Cancelled' },
        },
        orderBy: { created_at: 'desc' },
        select: { id: true },
    }) ?? await prisma.invoices.findFirst({
        where: { admission_id: admissionId, organizationId: auth.context.organizationId },
        orderBy: { created_at: 'desc' },
        select: { id: true },
    });

    if (!invoice) {
        return NextResponse.json({ error: 'No invoice found for this admission' }, { status: 404 });
    }

    const sourceUrl = new URL(req.url);
    const billUrl = new URL(`/api/invoice/${invoice.id}/summary-bill`, sourceUrl.origin);
    billUrl.searchParams.set('detailed', 'true');
    if (sourceUrl.searchParams.get('meds') === '0') billUrl.searchParams.set('meds', '0');

    return NextResponse.redirect(billUrl);
}
