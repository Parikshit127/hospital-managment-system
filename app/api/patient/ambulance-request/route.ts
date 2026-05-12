import { NextRequest, NextResponse } from 'next/server';
import { getPatientSession } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export async function POST(request: NextRequest) {
    const session = await getPatientSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { pickup_address, contact_phone, emergency_type, notes } = body;

    if (!pickup_address?.trim() || !contact_phone?.trim()) {
        return NextResponse.json({ success: false, error: 'Address and phone are required' }, { status: 400 });
    }

    const db = getTenantPrisma(session.organization_id);
    const requestId = `AMB-${Date.now()}`;

    await db.system_audit_logs.create({
        data: {
            action: 'AMBULANCE_REQUEST',
            module: 'patient_portal',
            entity_type: 'patient',
            entity_id: session.id,
            details: JSON.stringify({ request_id: requestId, pickup_address, contact_phone, emergency_type, notes }),
            organizationId: session.organization_id,
        },
    });

    // Also create a notification for admin
    await db.notification.create({
        data: {
            organizationId: session.organization_id,
            user_id: 'admin',
            title: '🚑 Ambulance Request',
            body: `Patient ${session.id} (${session.name}) has requested an ambulance. Type: ${emergency_type}. Address: ${pickup_address}`,
            type: 'critical',
        },
    }).catch(() => {});

    return NextResponse.json({ success: true, request_id: requestId });
}
