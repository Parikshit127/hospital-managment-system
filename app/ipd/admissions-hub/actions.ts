'use server';

import { requireTenantContext } from '@/backend/tenant';

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
        orderBy: { admission_date: 'desc' },
        take: 100 // High density page, can implement pagination later
    });

    const cancelledAdmissionIds = admissions
        .filter((admission: any) => admission.status === 'Cancelled')
        .map((admission: any) => admission.admission_id);

    const [wards, cancellationLogs] = await Promise.all([
        db.wards.findMany({
            where: { organizationId, is_active: true },
            select: { ward_id: true, ward_name: true }
        }),
        cancelledAdmissionIds.length > 0
            ? db.system_audit_logs.findMany({
                where: {
                    organizationId,
                    action: 'CANCEL_ADMISSION',
                    entity_type: 'admission',
                    entity_id: { in: cancelledAdmissionIds },
                },
                orderBy: { created_at: 'desc' },
                select: { entity_id: true, details: true },
            })
            : Promise.resolve([]),
    ]);

    const cancellationReasons = new Map<string, string>();
    cancellationLogs.forEach((log: any) => {
        if (!log.entity_id || cancellationReasons.has(log.entity_id) || !log.details) return;
        try {
            const reason = JSON.parse(log.details)?.reason;
            if (typeof reason === 'string' && reason.trim()) {
                cancellationReasons.set(log.entity_id, reason.trim());
            }
        } catch {
            // Ignore malformed historical audit details.
        }
    });

    const admissionsWithCancellationReason = admissions.map((admission: any) => ({
        ...admission,
        cancellation_reason: cancellationReasons.get(admission.admission_id) || null,
    }));

    return JSON.parse(JSON.stringify({ admissions: admissionsWithCancellationReason, wards }));
}
