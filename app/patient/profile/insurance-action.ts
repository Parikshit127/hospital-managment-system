'use server';

import { getTenantPrisma } from '@/backend/db';
import { getPatientSession } from '../login/actions';

export async function getPatientInsurance() {
    try {
        const session = await getPatientSession();
        if (!session) return { success: false, data: [] };

        const db = getTenantPrisma(session.organization_id);

        const policies = await db.insurance_policies.findMany({
            where: { patient_id: session.id },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: policies };
    } catch (error) {
        console.error('Get patient insurance error:', error);
        return { success: false, data: [] };
    }
}
