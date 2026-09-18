import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

/**
 * Compatibility URL for the IPD summary bill.
 *
 * The master invoice renderer is the one source of truth for both IPD and OPD
 * bills. Its default layout is the summary bill; /bill routes there with
 * detailed=true for the itemized version.
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
    const billParams = new URLSearchParams();
    if (sourceUrl.searchParams.get('meds') === '0') billParams.set('meds', '0');
    const query = billParams.toString();

    // See the detailed route above: this must remain relative so the browser
    // retains the public host rather than the proxy's localhost upstream.
    return new NextResponse(null, {
        status: 307,
        headers: { Location: `/api/invoice/${invoice.id}/summary-bill${query ? `?${query}` : ''}` },
    });
}
