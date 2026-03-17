'use server';

import { requireTenantContext } from '@/backend/tenant';

export async function getAdmissionsHubData(filters?: {
    status?: string; // 'All', 'Admitted', 'Discharged'
    search?: string;
    ward_id?: number | 'All';
}) {
    const { db, organizationId } = await requireTenantContext();

    const where: any = { organizationId };

    if (filters?.status && filters.status !== 'All') {
        where.status = filters.status;
    }

    if (filters?.ward_id && filters.ward_id !== 'All') {
        where.ward_id = Number(filters.ward_id);
    }

    if (filters?.search) {
        where.OR = [
            { patient_id: { contains: filters.search, mode: 'insensitive' } },
            { admission_id: { contains: filters.search, mode: 'insensitive' } },
            { 
                patient: {
                    OR: [
                        { full_name: { contains: filters.search, mode: 'insensitive' } },
                        { phone: { contains: filters.search, mode: 'insensitive' } }
                    ]
                }
            }
        ];
    }

    const admissions = await db.admissions.findMany({
        where,
        include: {
            patient: true,
            ward: true,
            bed: true,
        },
        orderBy: { admission_date: 'desc' },
        take: 100 // High density page, can implement pagination later
    });

    // We also need filter options for Wards
    const wards = await db.wards.findMany({
        where: { organizationId, is_active: true },
        select: { ward_id: true, ward_name: true }
    });

    return JSON.parse(JSON.stringify({ admissions, wards }));
}
