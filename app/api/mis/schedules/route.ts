import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        const url = new URL(req.url);
        const reportId = url.searchParams.get('report_id');

        const schedules = await prisma.report_schedules.findMany({
            where: {
                organizationId: session.organization_id,
                owner_user_id: session.id,
                ...(reportId ? { report_id: reportId } : {}),
            },
            include: {
                report_presets: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json({ data: schedules });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
