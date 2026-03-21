import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getTenantPrisma } from '@/backend/db';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> },
) {
    const auth = await resolveRouteAuth({ allowedStaffRoles: ['admin'] });
    if (!auth.ok) return auth.response;

    const { jobId } = await params;
    const db = getTenantPrisma(auth.context.organizationId);

    const job = await db.dataImportJob.findUnique({
        where: { id: jobId },
        select: {
            id: true,
            import_type: true,
            file_name: true,
            status: true,
            total_rows: true,
            processed_rows: true,
            successful_rows: true,
            failed_rows: true,
            skipped_rows: true,
            started_at: true,
            completed_at: true,
            created_by: true,
        },
    });

    if (!job) {
        return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    const percent = job.total_rows > 0
        ? Math.round((job.processed_rows / job.total_rows) * 100)
        : 0;

    return NextResponse.json({
        success: true,
        ...job,
        percent,
    });
}
