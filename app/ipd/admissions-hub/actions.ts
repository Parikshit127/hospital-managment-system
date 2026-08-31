'use server';

import { requireTenantContext } from '@/backend/tenant';
import { attachCancellationReasons } from '@/app/lib/admission-cancellation';

export async function getAdmissionsHubData(filters?: {
    status?: string; // 'All', 'Admitted', 'Discharged', 'Cancelled'
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
        orderBy: filters?.status === 'Cancelled'
            ? { cancellation_date: 'desc' }
            : { admission_date: 'desc' },
        // The grid filters by status CLIENT-side over whatever this returns, so a
        // small cap silently empties the Cancelled/Discharged tabs once the org
        // has more recent admissions than the cap. Matches getIPDAdmissions' bound.
        take: 1000,
    });

    const [wards, admissionsWithCancellationReason] = await Promise.all([
        db.wards.findMany({
            where: { organizationId, is_active: true },
            select: { ward_id: true, ward_name: true }
        }),
        attachCancellationReasons(db, admissions),
    ]);

    return JSON.parse(JSON.stringify({ admissions: admissionsWithCancellationReason, wards }));
}
