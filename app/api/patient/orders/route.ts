import { NextResponse } from 'next/server';
import { getPatientSession } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export async function GET() {
    const session = await getPatientSession();
    if (!session) return NextResponse.json({ success: false, orders: [] }, { status: 401 });

    const db = getTenantPrisma(session.organization_id);

    // Fetch appointments as orders
    const appointments = await db.appointments.findMany({
        where: { patient_id: session.id },
        orderBy: { appointment_date: 'desc' },
        take: 30,
    });

    // Fetch medicine orders and ambulance requests from audit logs
    const auditOrders = await db.system_audit_logs.findMany({
        where: {
            entity_id: session.id,
            action: { in: ['PATIENT_MEDICINE_ORDER', 'AMBULANCE_REQUEST'] },
            organizationId: session.organization_id,
        },
        orderBy: { created_at: 'desc' },
        take: 20,
    });

    const orders = [
        ...appointments.map((a: any) => ({
            id: a.appointment_id,
            type: 'appointment' as const,
            title: `Appointment — ${a.department || 'General'}`,
            subtitle: a.doctor_name ? `Dr. ${a.doctor_name}` : 'Doctor TBD',
            status: a.status,
            created_at: a.appointment_date,
        })),
        ...auditOrders.map((l: any) => {
            const d = JSON.parse(l.details || '{}');
            const isAmbulance = l.action === 'AMBULANCE_REQUEST';
            return {
                id: d.order_number || d.request_id || l.id,
                type: isAmbulance ? 'ambulance' as const : 'medicine' as const,
                title: isAmbulance ? `Ambulance — ${d.emergency_type || 'Emergency'}` : `Medicine Order`,
                subtitle: isAmbulance ? d.pickup_address?.slice(0, 40) : `${d.items?.length || 0} item(s)`,
                status: 'Pending',
                created_at: l.created_at,
                amount: d.total,
            };
        }),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ success: true, orders: JSON.parse(JSON.stringify(orders)) });
}
