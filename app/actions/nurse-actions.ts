'use server';

import { requireTenantContext, denyUnlessRole, CLINICAL_ROLES } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { generateIndentNumber } from '@/app/lib/sequence-generator';
import { applyAdministration } from '@/app/lib/medication-safety';

// ========================================
// NURSE DASHBOARD
// ========================================

export async function getNurseDashboard(nurseId: string) {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [pendingTasks, completedTasks, totalAdmitted, pendingMeds] = await Promise.all([
            db.nursingTask.count({
                where: { assigned_to: nurseId, status: 'Pending', scheduled_at: { gte: todayStart, lte: todayEnd } },
            }),
            db.nursingTask.count({
                where: { assigned_to: nurseId, status: 'Completed', scheduled_at: { gte: todayStart, lte: todayEnd } },
            }),
            db.admissions.count({ where: { status: 'Admitted' } }),
            db.medicationAdministration.count({
                where: { status: 'Scheduled', scheduled_time: { gte: todayStart, lte: todayEnd } },
            }),
        ]);

        return {
            success: true,
            data: { pendingTasks, completedTasks, totalAdmitted, pendingMeds },
        };
    } catch (error) {
        console.error('Nurse Dashboard Error:', error);
        return { success: false, data: null };
    }
}

// ========================================
// WARD PATIENTS
// ========================================

export async function getWardPatients(wardId?: number, status?: string) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        // status 'All' → no filter; otherwise filter (default 'Admitted')
        if (status && status !== 'All') where.status = status;
        else if (!status) where.status = 'Admitted';
        if (wardId) where.ward_id = wardId;

        const admissions = await db.admissions.findMany({
            where,
            include: {
                patient: true,
                bed: true,
                ward: true,
            },
            orderBy: { admission_date: 'desc' },
        });

        return {
            success: true,
            data: admissions.map((a: any) => {
                const prefix = `${a.organizationId}-${a.ward_id}-`;
                const bedLabel = a.bed_id?.startsWith(prefix) ? a.bed_id.slice(prefix.length) : a.bed_id;
                return {
                    admissionId: a.admission_id,
                    patientId: a.patient_id,
                    patientName: a.patient?.full_name || 'Unknown',
                    age: a.patient?.age,
                    gender: a.patient?.gender,
                    bedId: a.bed_id,
                    bedLabel,
                    bedStatus: a.bed?.status,
                    wardId: a.ward_id,
                    wardName: a.ward?.ward_name || 'Unassigned',
                    wardType: a.ward?.ward_type,
                    diagnosis: a.diagnosis,
                    doctorName: a.doctor_name,
                    status: a.status,
                    admissionDate: a.admission_date,
                    dischargeDate: a.discharge_date,
                };
            }),
        };
    } catch (error) {
        console.error('Ward Patients Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// VITALS RECORDING
// ========================================

export async function recordVitals(data: {
    patientId: string;
    appointmentId?: string;
    bloodPressure?: string;
    heartRate?: number;
    temperature?: number;
    oxygenSat?: number;
    respiratoryRate?: number;
    weight?: number;
    height?: number;
    /** @deprecated Ignored. The recorder is taken from the signed-in session. */
    recordedBy?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record vitals');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();

        await db.vital_signs.create({
            data: {
                patient_id: data.patientId,
                appointment_id: data.appointmentId,
                blood_pressure: data.bloodPressure,
                heart_rate: data.heartRate,
                temperature: data.temperature,
                oxygen_sat: data.oxygenSat,
                respiratory_rate: data.respiratoryRate,
                weight: data.weight,
                height: data.height,
                // Never trust a caller-supplied recorder on a clinical record.
                recorded_by: session.id,
            },
        });

        revalidatePath('/nurse/vitals');
        revalidatePath('/nurse/patients');
        return { success: true };
    } catch (error) {
        console.error('Record Vitals Error:', error);
        return { success: false, error: 'Failed to record vitals' };
    }
}

export async function getPatientVitals(patientId: string) {
    try {
        const { db } = await requireTenantContext();

        const vitals = await db.vital_signs.findMany({
            where: { patient_id: patientId },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        return { success: true, data: vitals };
    } catch (error) {
        console.error('Get Vitals Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// MEDICATION ADMINISTRATION
// ========================================

export async function getMedicationSchedule(admissionId?: string, filter?: 'due' | 'all') {
    try {
        const { db } = await requireTenantContext();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const where: any = {};
        if (admissionId) where.admission_id = admissionId;

        if (filter === 'due') {
            where.status = 'Scheduled';
            where.scheduled_time = { gte: todayStart, lte: todayEnd };
        }

        const medications = await db.medicationAdministration.findMany({
            where,
            orderBy: { scheduled_time: 'asc' },
        });

        // Enrich with patient names via admissions
        const admissionIds = [...new Set(medications.map((m: any) => m.admission_id))];
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: admissionIds } },
            include: { patient: { select: { full_name: true, patient_id: true } } },
        });
        const admissionMap = Object.fromEntries(
            admissions.map((a: any) => [a.admission_id, { patientName: a.patient?.full_name, patientId: a.patient?.patient_id }])
        );

        return {
            success: true,
            data: medications.map((m: any) => ({
                ...m,
                patientName: admissionMap[m.admission_id]?.patientName || 'Unknown',
                patientId: admissionMap[m.admission_id]?.patientId || '',
            })),
        };
    } catch (error) {
        console.error('Medication Schedule Error:', error);
        return { success: false, data: [] };
    }
}

// Both eMAR screens run through applyAdministration() in lib/medication-safety.
// They previously had separate implementations against the same table, so the
// allergy check added to one did not apply to the other and an allergic drug
// could still be given from this screen.

export async function administerMedication(
    id: number,
    /** @deprecated Ignored. The administering user is taken from the session. */
    _nurseId?: string,
    notes?: string,
    options?: { witness_id?: string; allergy_override_reason?: string },
) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.ADMINISTER, 'administer medication');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();
        const outcome = await applyAdministration(db, session.id, {
            med_id: id,
            status: 'Administered',
            notes,
            witness_id: options?.witness_id,
            allergy_override_reason: options?.allergy_override_reason,
        });
        if (!outcome.ok) {
            return { success: false, error: outcome.error, allergyConflict: outcome.allergyConflict };
        }
        revalidatePath('/nurse/medications');
        revalidatePath('/ipd/medication-admin');
        return { success: true };
    } catch (error) {
        console.error('Administer Medication Error:', error);
        return { success: false, error: 'Failed to administer' };
    }
}

export async function updateMedicationStatus(id: number, status: string, reason?: string) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.ADMINISTER, 'change a medication status');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();
        const outcome = await applyAdministration(db, session.id, {
            med_id: id,
            status: status as 'Administered' | 'Missed' | 'Held' | 'Refused',
            not_given_reason: reason,
            notes: reason,
        });
        if (!outcome.ok) return { success: false, error: outcome.error };
        revalidatePath('/nurse/medications');
        revalidatePath('/ipd/medication-admin');
        return { success: true };
    } catch (error) {
        console.error('Update Medication Status Error:', error);
        return { success: false, error: 'Failed to update' };
    }
}

// ========================================
// NURSING NOTES
// ========================================

export async function addNursingNote(data: {
    admissionId: string;
    /** @deprecated Ignored. The author is taken from the session. */
    nurseId?: string;
    noteType: string;
    details: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'write a nursing note');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();

        await db.nursingNote.create({
            data: {
                admission_id: data.admissionId,
                nurse_id: session.id,
                note_type: data.noteType,
                details: data.details,
            },
        });

        revalidatePath('/nurse/patients');
        return { success: true };
    } catch (error) {
        console.error('Add Nursing Note Error:', error);
        return { success: false, error: 'Failed to add note' };
    }
}

export async function getNursingNotes(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const notes = await db.nursingNote.findMany({
            where: { admission_id: admissionId },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: notes };
    } catch (error) {
        console.error('Get Nursing Notes Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// NURSING TASKS
// ========================================

export async function getNursingTasks(options?: {
    nurseId?: string;
    status?: string;
    dateFilter?: 'today' | 'all';
}) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (options?.nurseId) where.assigned_to = options.nurseId;
        if (options?.status) where.status = options.status;

        if (options?.dateFilter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            where.scheduled_at = { gte: todayStart, lte: todayEnd };
        }

        const tasks = await db.nursingTask.findMany({
            where,
            orderBy: { scheduled_at: 'asc' },
        });

        // Enrich with patient names
        const admissionIds = [...new Set(tasks.map((t: any) => t.admission_id))];
        const admissions = await db.admissions.findMany({
            where: { admission_id: { in: admissionIds } },
            include: { patient: { select: { full_name: true, patient_id: true } } },
        });
        const admissionMap = Object.fromEntries(
            admissions.map((a: any) => [a.admission_id, { patientName: a.patient?.full_name, patientId: a.patient?.patient_id, bedId: a.bed_id }])
        );

        return {
            success: true,
            data: tasks.map((t: any) => ({
                ...t,
                patientName: admissionMap[t.admission_id]?.patientName || 'Unknown',
                patientId: admissionMap[t.admission_id]?.patientId || '',
                bedId: admissionMap[t.admission_id]?.bedId || '',
            })),
        };
    } catch (error) {
        console.error('Get Nursing Tasks Error:', error);
        return { success: false, data: [] };
    }
}

export async function completeNursingTask(taskId: number) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'complete a nursing task');
    if (denied) return denied;
    try {
        const { db } = await requireTenantContext();

        await db.nursingTask.update({
            where: { id: taskId },
            data: { status: 'Completed', completed_at: new Date() },
        });

        revalidatePath('/nurse/tasks');
        return { success: true };
    } catch (error) {
        console.error('Complete Task Error:', error);
        return { success: false, error: 'Failed to complete task' };
    }
}

// ========================================
// SHIFT HANDOVER
// ========================================

export async function generateHandoverReport(data: {
    wardId?: number;
    /** @deprecated Ignored. The outgoing nurse is taken from the session. */
    fromNurseId?: string;
    toNurseId?: string;
    summary: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record a shift handover');
    if (denied) return denied;
    try {
        const { db, session } = await requireTenantContext();

        await db.shiftHandover.create({
            data: {
                ward_id: data.wardId || 0,
                from_nurse_id: session.id,
                to_nurse_id: data.toNurseId || '',
                shift_date: new Date(),
                summary: data.summary,
            },
        });

        revalidatePath('/nurse/handover');
        return { success: true };
    } catch (error) {
        console.error('Handover Error:', error);
        return { success: false, error: 'Failed to create handover' };
    }
}

export async function getHandoverHistory(wardId?: number) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (wardId) where.ward_id = wardId;

        const handovers = await db.shiftHandover.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        return { success: true, data: handovers };
    } catch (error) {
        console.error('Handover History Error:', error);
        return { success: false, data: [] };
    }
}

export async function getWardsList() {
    try {
        const { db } = await requireTenantContext();
        const wards = await db.wards.findMany({ orderBy: { ward_name: 'asc' } });
        return { success: true, data: wards };
    } catch (error) {
        console.error('Get Wards Error:', error);
        return { success: false, data: [] };
    }
}

// ========================================
// PHARMACY — MEDICINE SEARCH & STOCK CHECK
// ========================================

export async function searchMedicines(query: string) {
    try {
        const { db } = await requireTenantContext();
        const cleanQuery = (query ?? '').trim();
        const where: any = { is_active: true };
        if (cleanQuery) {
            const words = cleanQuery.split(/\s+/).filter(Boolean);
            if (words.length > 0) {
                where.AND = words.map(word => ({
                    OR: [
                        { brand_name: { contains: word, mode: 'insensitive' } },
                        { generic_name: { contains: word, mode: 'insensitive' } },
                    ]
                }));
            }
        }
        const medicines = await db.pharmacy_medicine_master.findMany({
            where,
            select: { id: true, brand_name: true, generic_name: true, form: true, strength: true },
            take: 20,
        });
        return { success: true, data: medicines };
    } catch (error) {
        console.error('Search Medicines Error:', error);
        return { success: false, data: [] };
    }
}

export async function checkMedicineStock(medicineId: number) {
    try {
        const { db } = await requireTenantContext();
        const now = new Date();

        const batches = await db.pharmacy_batch_inventory.findMany({
            where: {
                medicine_id: medicineId,
                is_quarantined: false,
                expiry_date: { gt: now },
                current_stock: { gt: 0 },
            },
            select: { id: true, batch_no: true, current_stock: true, expiry_date: true },
        });

        const totalStock = batches.reduce((sum: number, b: any) => sum + (b.current_stock || 0), 0);

        return {
            success: true,
            data: {
                totalStock,
                batches,
                isAvailable: totalStock > 0,
            },
        };
    } catch (error) {
        console.error('Check Medicine Stock Error:', error);
        return { success: false, data: { totalStock: 0, batches: [], isAvailable: false } };
    }
}

// ========================================
// PHARMACY — INDENT (NURSING ORDER)
// ========================================

export interface PharmacyIndentItem {
    medicineId: number;
    medicineName: string;
    quantityRequested: number;
    quantityApproved: number; // may be less if stock is low
    notes?: string;
}

export async function createPharmacyIndent(data: {
    patientId: string;
    admissionId: string;
    /** @deprecated Ignored. The requesting nurse is taken from the session. */
    nurseId?: string;
    /** @deprecated Ignored. Resolved from the session. */
    nurseName?: string;
    doctorName: string;
    items: PharmacyIndentItem[];
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'raise a pharmacy indent');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Requisition number for the pharmacist's indent sheet (AVS-IND-26-27-001).
        const indentNumber = await generateIndentNumber(organizationId, db);

        // Create the pharmacy order (indent) for IPD
        const order = await db.pharmacy_orders.create({
            data: {
                indent_number: indentNumber,
                patient_id: data.patientId,
                doctor_id: session.id,                       // nurse raising the indent
                requested_by_name: session.name || session.username, // shown on pharmacy portal
                admission_id: data.admissionId,
                is_ipd_linked: true,
                status: 'Pending',
                total_items_requested: data.items.length,
                items_dispensed: 0,
                items_missing: 0,  // pharmacist determines shortfalls at dispensing time
                total_amount: 0,
                organizationId,
                items: {
                    create: data.items.map((item) => ({
                        medicine_id: item.medicineId,
                        medicine_name: item.medicineName,
                        quantity_requested: item.quantityRequested,
                        quantity_dispensed: 0,   // pharmacist fills this on dispense
                        // Always start as Pending — the pharmacist confirms stock
                        // availability and sets the final status during dispensing.
                        status: 'Pending',
                    })),
                },
            },
        });

        revalidatePath('/nurse/patients');
        revalidatePath('/pharmacy');
        return { success: true, orderId: order.id, indentNumber: order.indent_number };
    } catch (error) {
        console.error('Create Pharmacy Indent Error:', error);
        return { success: false, error: 'Failed to create pharmacy indent' };
    }
}

// ─── Indent history for a patient ────────────────────────────────────────────
export async function getPatientIndentHistory(patientId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const orders = await db.pharmacy_orders.findMany({
            where: { patient_id: patientId, organizationId },
            orderBy: { created_at: 'desc' },
            include: { items: true },
            take: 50,
        });
        return { success: true, data: orders };
    } catch (error) {
        console.error('getPatientIndentHistory error:', error);
        return { success: false, data: [] };
    }
}
