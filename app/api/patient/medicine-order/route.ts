import { NextRequest, NextResponse } from 'next/server';
import { getPatientSession } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export async function POST(request: NextRequest) {
    const session = await getPatientSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { items, notes } = body;

    if (!items?.length) return NextResponse.json({ success: false, error: 'No items in order' }, { status: 400 });

    const db = getTenantPrisma(session.organization_id);

    // Create pharmacy order
    const total = items.reduce((sum: number, i: any) => sum + (i.price * i.qty), 0);
    const orderNumber = `MED-${Date.now()}`;

    await db.system_audit_logs.create({
        data: {
            action: 'PATIENT_MEDICINE_ORDER',
            module: 'patient_portal',
            entity_type: 'patient',
            entity_id: session.id,
            details: JSON.stringify({ order_number: orderNumber, items, notes, total }),
            organizationId: session.organization_id,
        },
    });

    return NextResponse.json({ success: true, order_number: orderNumber, total });
}
