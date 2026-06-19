import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { renderReportHtml } from '@/app/lib/reports/reception-reports';

const ALLOWED_STAFF_ROLES = ['receptionist', 'admin'];

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({ allowPatient: false, allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;

        const { searchParams } = req.nextUrl;
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (!from || !to) {
            return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 });
        }

        const html = await renderReportHtml('opd', auth.context.organizationId, from, to);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error) {
        console.error('OPD Patient Report Error:', error);
        const msg = error instanceof Error ? error.message : 'Failed to generate report';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
