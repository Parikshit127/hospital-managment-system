import { getTenantPrisma } from '@/backend/db';

export async function archiveOldPatientRecords(
    organizationId: string,
    olderThanYears: number = 5,
) {
    const db = getTenantPrisma(organizationId);
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - olderThanYears);

    // Find patients created before cutoff that aren't already archived
    const patients = await db.oPD_REG.findMany({
        where: {
            created_at: { lt: cutoffDate },
            is_archived: false,
        },
        select: {
            id: true,
            patient_id: true,
            full_name: true,
            age: true,
            gender: true,
            phone: true,
            email: true,
            address: true,
            department: true,
            aadhar_card: true,
            blood_group: true,
            date_of_birth: true,
            allergies: true,
            chronic_conditions: true,
            emergency_contact_name: true,
            emergency_contact_phone: true,
            emergency_contact_relation: true,
            created_at: true,
        },
    });

    let archivedCount = 0;

    for (const patient of patients) {
        // Gather related clinical data
        const [appointments, admissions, labOrders, invoices, clinicalEhrs] = await Promise.all([
            db.appointments.findMany({
                where: { patient_id: patient.patient_id, is_archived: undefined },
            }),
            db.admissions.findMany({
                where: { patient_id: patient.patient_id, is_archived: undefined },
            }),
            db.lab_orders.findMany({
                where: { patient_id: patient.patient_id, is_archived: undefined },
            }),
            db.invoices.findMany({
                where: { patient_id: patient.patient_id, is_archived: undefined },
                include: { items: true, payments: true },
            }),
            db.clinical_EHR.findMany({
                where: { patient_id: patient.patient_id, is_archived: undefined },
            }),
        ]);

        // Create archive snapshot
        await db.archivedPatientRecord.create({
            data: {
                original_patient_id: patient.patient_id,
                patient_data: patient,
                clinical_data: {
                    appointments,
                    admissions,
                    lab_orders: labOrders,
                    clinical_ehrs: clinicalEhrs,
                },
                financial_data: {
                    invoices,
                },
                archive_reason: 'retention_policy',
                original_created_at: patient.created_at,
            },
        });

        // Mark source records as archived (soft archive)
        await Promise.all([
            db.oPD_REG.update({
                where: { id: patient.id },
                data: { is_archived: true, archived_at: new Date() },
            }),
            ...(appointments.length > 0 ? [
                db.appointments.updateMany({
                    where: { patient_id: patient.patient_id },
                    data: {},
                }),
            ] : []),
            ...(labOrders.length > 0 ? [
                db.lab_orders.updateMany({
                    where: { patient_id: patient.patient_id, is_archived: undefined },
                    data: { is_archived: true, archived_at: new Date() },
                }),
            ] : []),
            ...(invoices.length > 0 ? [
                db.invoices.updateMany({
                    where: { patient_id: patient.patient_id, is_archived: undefined },
                    data: { is_archived: true, archived_at: new Date() },
                }),
            ] : []),
        ]);

        archivedCount++;
    }

    return { archived: archivedCount, cutoffDate };
}

export async function searchArchivedRecords(
    organizationId: string,
    query: string,
    page: number = 1,
    limit: number = 20,
) {
    const db = getTenantPrisma(organizationId);

    // Search by patient ID or name within JSON data
    const records = await db.archivedPatientRecord.findMany({
        where: {
            OR: [
                { original_patient_id: { contains: query, mode: 'insensitive' } },
                // For name search, we search in patient_data JSON via Prisma's JSON filtering
                { patient_data: { path: ['full_name'], string_contains: query } },
            ],
        },
        orderBy: { archived_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
            id: true,
            original_patient_id: true,
            patient_data: true,
            archive_reason: true,
            original_created_at: true,
            archived_at: true,
        },
    });

    const total = await db.archivedPatientRecord.count({
        where: {
            OR: [
                { original_patient_id: { contains: query, mode: 'insensitive' } },
                { patient_data: { path: ['full_name'], string_contains: query } },
            ],
        },
    });

    return {
        records,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
}

export async function getArchivedRecordDetail(
    organizationId: string,
    archiveId: string,
) {
    const db = getTenantPrisma(organizationId);

    const record = await db.archivedPatientRecord.findUnique({
        where: { id: archiveId },
    });

    return record;
}
