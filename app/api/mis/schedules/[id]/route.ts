import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        const { id: scheduleId } = await params;
        const schedule = await prisma.report_schedules.findUnique({ where: { id: scheduleId } });

        if (!schedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }

        // Only the owner can delete the schedule
        if (schedule.owner_user_id !== session.id || schedule.organizationId !== session.organization_id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.report_schedules.delete({ where: { id: scheduleId } });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
