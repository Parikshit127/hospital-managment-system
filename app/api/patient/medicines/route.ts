import { NextResponse } from 'next/server';
import { getPatientSession } from '@/app/lib/session';
import { getTenantPrisma } from '@/backend/db';

export async function GET() {
    const session = await getPatientSession();
    if (!session) return NextResponse.json({ medicines: [] }, { status: 401 });

    const db = getTenantPrisma(session.organization_id);
    const medicines = await db.pharmacy_medicine_master.findMany({
        where: { is_active: true },
        select: { id: true, brand_name: true, generic_name: true, category: true, selling_price: true },
        orderBy: { brand_name: 'asc' },
        take: 200,
    });

    return NextResponse.json({ medicines: JSON.parse(JSON.stringify(medicines)) });
}
