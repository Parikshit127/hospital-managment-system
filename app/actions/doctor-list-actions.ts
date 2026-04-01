'use server';

import { requireTenantContext } from '@/backend/tenant';

export async function getActiveDoctors() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const doctors = await db.user.findMany({
            where: {
                organizationId,
                role: 'doctor',
                is_active: true
            },
            select: {
                id: true,
                name: true,
                specialty: true,
                consultation_fee: true,
                is_active: true
            },
            orderBy: { name: 'asc' }
        });

        return { success: true, data: doctors };
    } catch (error) {
        console.error('Get Active Doctors Error:', error);
        return { success: false, data: [] };
    }
}
