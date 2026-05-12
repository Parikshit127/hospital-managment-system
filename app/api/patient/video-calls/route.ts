import { NextResponse } from 'next/server';
import { getPatientSession } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export async function GET() {
    const session = await getPatientSession();
    if (!session) return NextResponse.json({ success: false, requests: [] }, { status: 401 });

    const db = getTenantPrisma(session.organization_id);
    const requests = await db.videoCallRequest.findMany({
        where: { patient_id: session.id },
        orderBy: { request_date: 'desc' },
        take: 20,
    });

    return NextResponse.json({ success: true, requests: JSON.parse(JSON.stringify(requests)) });
}
