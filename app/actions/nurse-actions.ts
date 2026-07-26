'use server';

import { requireTenantContext, denyUnlessRole, CLINICAL_ROLES } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { generateIndentNumber } from '@/app/lib/sequence-generator';
import { applyAdministration } from '@/app/lib/medication-safety';
import { topUpMedicationSchedules } from '@/app/actions/ipd-emr-actions';
import { recordObservation, parseBloodPressure } from '@/app/lib/vitals-recording';

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
        const { db, session } = await requireTenantContext();

        const where: any = {};
        // status 'All' → no filter; otherwise filter (default 'Admitted')
        if (status && status !== 'All') where.status = status;
        else if (!status) where.status = 'Admitted';
        // An explicit ward filter wins; otherwise a ward-assigned nurse sees their
        // own ward instead of every admitted patient in the hospital. Users with no
        // assignment are unscoped, which is how every account behaves today.
        const effectiveWard = wardId ?? (session.role === 'nurse' ? session.assigned_ward_id ?? undefined : undefined);
        if (effectiveWard) where.ward_id = Number(effectiveWard);

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
    consciousness?: string;
    painScore?: number;
    bloodSugar?: number;
    onSupplementalOxygen?: boolean;
    /** @deprecated Ignored. The recorder is taken from the signed-in session. */
    recordedBy?: string;
}) {
    const denied = await denyUnlessRole(CLINICAL_ROLES.CHART, 'record vitals');
    if (denied) return denied;
    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Find the patient's live admission. This screen previously wrote only to
        // vital_signs — no admission link, no NEWS, no escalation — so whether a
        // deteriorating inpatient was scored at all depended on which of the two
        // vitals screens the nurse happened to open. One implementation now
        // serves both entrances; an inpatient is scored either way.
        const admission = await db.admissions.findFirst({
            where: { patient_id: data.patientId, status: 'Admitted' },
            select: { admission_id: true },
        });

        const { systolic, diastolic } = parseBloodPressure(data.bloodPressure);

        const result = await recordObservation(db, organizationId, session.id, {
            patient_id: data.patientId,
            admission_id: admission?.admission_id ?? null,
            bp_systolic: systolic,
            bp_diastolic: diastolic,
            heart_rate: data.heartRate,
            temperature: data.temperature,
            spo2: data.oxygenSat,
            respiratory_rate: data.respiratoryRate,
            consciousness: data.consciousness,
            pain_score: data.painScore,
            blood_sugar: data.bloodSugar,
            on_supplemental_oxygen: data.onSupplementalOxygen,
            weight: data.weight,
            height: data.height,
        });

        revalidatePath('/nurse/vitals');
        revalidatePath('/nurse/patients');
        if (admission) revalidatePath(`/ipd/vitals/${admission.admission_id}`);
        return {
            success: true,
            news: result.news,
            escalation: result.escalation,
            inpatient: !!admission,
        };
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

export async function getMedicationSchedule(
    admissionId?: string,
    filter?: 'due' | 'all',
    wardId?: number,
) {
    try {
        const { db, session } = await requireTenantContext();

        // Keep the chart populated for open-ended orders before reading it.
        await topUpMedicationSchedules(admissionId).catch(() => { /* never block the read */ });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Restrict to currently admitted patients. This list previously queried the
        // eMAR table directly with no join, so a discharged patient's remaining
        // doses stayed on the ward chart and reappeared as due the next morning.
        const admissionWhere: any = { status: 'Admitted' };
        if (admissionId) admissionWhere.admission_id = admissionId;

        // Ward scoping: a nurse assigned to a ward sees that ward. Staff without an
        // assignment (and admins) still see everything, so nothing breaks for sites
        // that have not filled the field in.
        const effectiveWard = wardId ?? (session.role === 'nurse' ? session.assigned_ward_id ?? undefined : undefined);
        if (effectiveWard) admissionWhere.ward_id = Number(effectiveWard);

        const admissions = await db.admissions.findMany({
            where: admissionWhere,
            include: { patient: { select: { full_name: true, patient_id: true } }, ward: { select: { ward_name: true } } },
        });
        if (!admissions.length) return { success: true, data: [] };

        const where: any = { admission_id: { in: admissions.map((a: any) => a.admission_id) } };
        if (filter === 'due') {
            where.status = 'Scheduled';
            where.scheduled_time = { gte: todayStart, lte: todayEnd };
        } else {
            // Cancelled doses are historical noise on a working chart.
            where.status = { not: 'Cancelled' };
        }

        const medications = await db.medicationAdministration.findMany({
            where,
            orderBy: { scheduled_time: 'asc' },
            take: 500,
        });

        const admissionMap = Object.fromEntries(
            admissions.map((a: any) => [a.admission_id, {
                patientName: a.patient?.full_name,
                patientId: a.patient?.patient_id,
                wardName: a.ward?.ward_name,
                bedId: a.bed_id,
            }])
        );

        return {
            success: true,
            data: medications.map((m: any) => ({
                ...m,
                patientName: admissionMap[m.admission_id]?.patientName || 'Unknown',
                patientId: admissionMap[m.admission_id]?.patientId || '',
                wardName: admissionMap[m.admission_id]?.wardName || '',
                bedId: admissionMap[m.admission_id]?.bedId || '',
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
        const { db, session, organizationId } = await requireTenantContext();
        const outcome = await applyAdministration(db, session.id, {
            med_id: id,
            status: 'Administered',
            notes,
            witness_id: options?.witness_id,
            allergy_override_reason: options?.allergy_override_reason,
        }, { organizationId, actorName: session.name });
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
        const { db, session, organizationId } = await requireTenantContext();
        const outcome = await applyAdministration(db, session.id, {
            med_id: id,
            status: status as 'Administered' | 'Missed' | 'Held' | 'Refused',
            not_given_reason: reason,
            notes: reason,
        }, { organizationId, actorName: session.name });
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
    wardId?: number;
}) {
    try {
        const { db, session } = await requireTenantContext();

        const where: any = {};
        if (options?.nurseId) where.assigned_to = options.nurseId;
        // Statuses are stored capitalised ("Pending"), but the task screen passes
        // its lowercase filter key straight through, so the list came back empty
        // for every filter. Normalise instead of relying on the caller's casing.
        if (options?.status) {
            const s = options.status.trim();
            where.status = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        }

        if (options?.dateFilter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            where.scheduled_at = { gte: todayStart, lte: todayEnd };
        }

        // Only tasks for patients still on the ward, scoped to the nurse's ward
        // when they have one. A task for a discharged patient is not work.
        const admissionWhere: any = { status: 'Admitted' };
        const effectiveWard = options?.wardId
            ?? (session.role === 'nurse' ? session.assigned_ward_id ?? undefined : undefined);
        if (effectiveWard) admissionWhere.ward_id = Number(effectiveWard);

        const admissions = await db.admissions.findMany({
            where: admissionWhere,
            include: { patient: { select: { full_name: true, patient_id: true } }, ward: { select: { ward_name: true } } },
        });
        if (!admissions.length) return { success: true, data: [] };
        where.admission_id = { in: admissions.map((a: any) => a.admission_id) };

        const tasks = await db.nursingTask.findMany({
            where,
            // Urgency first, then time — a STAT order should not sit below a
            // routine task simply because it was scheduled a minute later.
            orderBy: [{ scheduled_at: 'asc' }],
            take: 500,
        });

        const admissionMap = Object.fromEntries(
            admissions.map((a: any) => [a.admission_id, {
                patientName: a.patient?.full_name, patientId: a.patient?.patient_id,
                bedId: a.bed_id, wardName: a.ward?.ward_name,
            }])
        );

        const rank: Record<string, number> = { stat: 0, urgent: 1, routine: 2 };
        const enriched = tasks.map((t: any) => ({
            ...t,
            patientName: admissionMap[t.admission_id]?.patientName || 'Unknown',
            patientId: admissionMap[t.admission_id]?.patientId || '',
            bedId: admissionMap[t.admission_id]?.bedId || '',
            wardName: admissionMap[t.admission_id]?.wardName || '',
        })).sort((a: any, b: any) => {
            const pr = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
            return pr !== 0 ? pr : new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
        });

        return { success: true, data: enriched };
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
