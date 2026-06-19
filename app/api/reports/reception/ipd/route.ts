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

        const html = await renderReportHtml('ipd', auth.context.organizationId, from, to);
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error: any) {
        console.error('IPD Patient Report Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate report' }, { status: 500 });
    }
}
