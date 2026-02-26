'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';

// Convert Prisma Decimal/Date objects to plain JS for client serialization
function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

// ============================================
// BED & WARD MANAGEMENT
// ============================================

// Get all wards with bed counts
export async function getWardsWithBeds() {
    try {
        const { db } = await requireTenantContext();
        const wards = await db.wards.findMany({
            include: {
                beds: true,
            },
            orderBy: { ward_name: 'asc' },
        });

        const wardData = wards.map((ward: any) => ({
            ...ward,
            cost_per_day: Number(ward.cost_per_day || 0),
            nursing_charge: Number(ward.nursing_charge || 0),
            totalBeds: ward.beds.length,
            available: ward.beds.filter((b: any) => b.status === 'Available').length,
            occupied: ward.beds.filter((b: any) => b.status === 'Occupied').length,
            maintenance: ward.beds.filter((b: any) => b.status === 'Maintenance').length,
            reserved: ward.beds.filter((b: any) => b.status === 'Reserved').length,
            cleaning: ward.beds.filter((b: any) => b.status === 'Cleaning').length,
            isolation: ward.beds.filter((b: any) => b.status === 'Isolation').length,
            blocked: ward.beds.filter((b: any) => b.status === 'Blocked').length,
        }));

        return { success: true, data: serialize(wardData) };
    } catch (error: any) {
        console.error('getWardsWithBeds error:', error);
        return { success: false, error: error.message };
    }
}

// Get all beds with ward info and admission info
export async function getAllBeds() {
    try {
        const { db } = await requireTenantContext();
        const beds = await db.beds.findMany({
            include: {
                wards: true,
                admissions: {
                    where: { status: 'Admitted' },
                    include: {
                        patient: { select: { full_name: true, patient_id: true, phone: true } },
                    },
                },
            },
            orderBy: { bed_id: 'asc' },
        });

        return { success: true, data: serialize(beds) };
    } catch (error: any) {
        console.error('getAllBeds error:', error);
        return { success: false, error: error.message };
    }
}

// Update bed status
export async function updateBedStatus(bedId: string, newStatus: string) {
    try {
        const { db } = await requireTenantContext();
        const validStatuses = ['Available', 'Occupied', 'Maintenance', 'Reserved', 'Cleaning', 'Isolation', 'Blocked'];
        if (!validStatuses.includes(newStatus)) {
            return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
        }

        const bed = await db.beds.update({
            where: { bed_id: bedId },
            data: { status: newStatus },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_BED_STATUS',
                module: 'ipd',
                entity_type: 'bed',
                entity_id: bedId,
                details: JSON.stringify({ newStatus }),
            },
        });

        return { success: true, data: bed };
    } catch (error: any) {
        console.error('updateBedStatus error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// IPD ADMISSION
// ============================================

// Admit a patient to a bed
export async function admitPatientIPD(data: {
    patient_id: string;
    bed_id: string;
    ward_id: number;
    diagnosis: string;
    doctor_name: string;
}) {
    try {
        const { db } = await requireTenantContext();
        // Check if bed is available
        const bed = await db.beds.findUnique({ where: { bed_id: data.bed_id } });
        if (!bed || bed.status !== 'Available') {
            return { success: false, error: 'Bed is not available for admission' };
        }

        // Create admission
        const admission = await db.admissions.create({
            data: {
                patient_id: data.patient_id,
                bed_id: data.bed_id,
                ward_id: data.ward_id,
                status: 'Admitted',
                diagnosis: data.diagnosis,
                doctor_name: data.doctor_name,
            },
        });

        // Mark bed as occupied
        await db.beds.update({
            where: { bed_id: data.bed_id },
            data: { status: 'Occupied' },
        });

        // Create IPD invoice
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

        await db.invoices.create({
            data: {
                invoice_number: `INV-${dateStr}-${seq}`,
                patient_id: data.patient_id,
                admission_id: admission.admission_id,
                invoice_type: 'IPD',
                status: 'Draft',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'ADMIT_PATIENT_IPD',
                module: 'ipd',
                entity_type: 'admission',
                entity_id: admission.admission_id,
                details: JSON.stringify({
                    patient_id: data.patient_id,
                    bed_id: data.bed_id,
                    doctor: data.doctor_name,
                }),
            },
        });

        return { success: true, data: admission };
    } catch (error: any) {
        console.error('admitPatientIPD error:', error);
        return { success: false, error: error.message };
    }
}

// Get all current admissions (IPD Dashboard)
export async function getIPDAdmissions(statusFilter?: string) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (statusFilter) where.status = statusFilter;

        const admissions = await db.admissions.findMany({
            where,
            include: {
                patient: { select: { full_name: true, patient_id: true, age: true, gender: true, phone: true } },
                bed: { include: { wards: true } },
                ward: true,
                medical_notes: { orderBy: { created_at: 'desc' }, take: 3 },
            },
            orderBy: { admission_date: 'desc' },
        });

        const enriched = admissions.map((a: any) => {
            const daysAdmitted = Math.ceil(
                (new Date().getTime() - new Date(a.admission_date).getTime()) / (1000 * 60 * 60 * 24)
            );
            return {
                ...a,
                daysAdmitted,
                wardName: a.ward?.ward_name || a.bed?.wards?.ward_name || 'N/A',
                wardType: a.ward?.ward_type || a.bed?.wards?.ward_type || 'General',
                costPerDay: Number(a.ward?.cost_per_day || a.bed?.wards?.cost_per_day || 0),
                estimatedRoomCharge: daysAdmitted * Number(a.ward?.cost_per_day || a.bed?.wards?.cost_per_day || 0),
            };
        });

        return { success: true, data: serialize(enriched) };
    } catch (error: any) {
        console.error('getIPDAdmissions error:', error);
        return { success: false, error: error.message };
    }
}

// Get single admission detail
export async function getAdmissionDetail(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: {
                patient: true,
                bed: { include: { wards: true } },
                ward: true,
                medical_notes: { orderBy: { created_at: 'desc' } },
                summaries: true,
                invoices: {
                    include: { items: true, payments: true },
                },
            },
        });

        if (!admission) return { success: false, error: 'Admission not found' };

        return { success: true, data: serialize(admission) };
    } catch (error: any) {
        console.error('getAdmissionDetail error:', error);
        return { success: false, error: error.message };
    }
}

// Add daily charges (room + nursing) to an admission's invoice
export async function accrueIPDDailyCharges(admissionId: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { ward: true, bed: { include: { wards: true } } },
        });

        if (!admission) return { success: false, error: 'Admission not found' };

        const ward = admission.ward || admission.bed?.wards;
        if (!ward) return { success: false, error: 'Ward info not found' };

        // Find the IPD invoice
        let invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        });

        if (!invoice) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
            invoice = await db.invoices.create({
                data: {
                    invoice_number: `INV-${dateStr}-${seq}`,
                    patient_id: admission.patient_id,
                    admission_id: admissionId,
                    invoice_type: 'IPD',
                    status: 'Draft',
                },
            });
        }

        const roomRate = Number(ward.cost_per_day || 0);
        const nursingRate = Number(ward.nursing_charge || 0);
        const today = new Date().toLocaleDateString('en-IN');

        // Add room charge
        if (roomRate > 0) {
            await db.invoice_items.create({
                data: {
                    invoice_id: invoice.id,
                    department: 'Room',
                    description: `${ward.ward_name} - Room Charge (${today})`,
                    quantity: 1,
                    unit_price: roomRate,
                    total_price: roomRate,
                    discount: 0,
                    net_price: roomRate,
                },
            });
        }

        // Add nursing charge
        if (nursingRate > 0) {
            await db.invoice_items.create({
                data: {
                    invoice_id: invoice.id,
                    department: 'Nursing',
                    description: `Nursing Charge (${today})`,
                    quantity: 1,
                    unit_price: nursingRate,
                    total_price: nursingRate,
                    discount: 0,
                    net_price: nursingRate,
                },
            });
        }

        // Recalculate totals
        const items = await db.invoice_items.findMany({ where: { invoice_id: invoice.id } });
        const total = items.reduce((sum: any, item: any) => sum + Number(item.net_price), 0);
        const paid = Number(invoice.paid_amount || 0);

        await db.invoices.update({
            where: { id: invoice.id },
            data: {
                total_amount: total,
                net_amount: total,
                balance_due: total - paid,
            },
        });

        await logAudit({
            action: 'IPD_DAILY_CHARGES_ACCRUED',
            module: 'IPD',
            entity_type: 'admission',
            entity_id: admissionId,
            details: JSON.stringify({ roomRate, nursingRate, invoiceId: invoice.id }),
        });

        return { success: true, data: { roomRate, nursingRate, invoiceId: invoice.id } };
    } catch (error: any) {
        console.error('accrueIPDDailyCharges error:', error);
        return { success: false, error: error.message };
    }
}

// Discharge a patient from IPD
export async function dischargePatientIPD(admissionId: string, notes?: string) {
    try {
        const { db } = await requireTenantContext();
        const admission = await db.admissions.findUnique({
            where: { admission_id: admissionId },
            include: { patient: true, ward: true, bed: { include: { wards: true } } },
        });

        if (!admission) return { success: false, error: 'Admission not found' };

        // Calculate total room charges
        const ward = admission.ward || admission.bed?.wards;
        const daysAdmitted = Math.max(1, Math.ceil(
            (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
        ));

        // Update admission status
        await db.admissions.update({
            where: { admission_id: admissionId },
            data: {
                status: 'Discharged',
                discharge_date: new Date(),
            },
        });

        // Free the bed (set to Cleaning first)
        if (admission.bed_id) {
            await db.beds.update({
                where: { bed_id: admission.bed_id },
                data: { status: 'Cleaning' },
            });
        }

        // Finalize invoice
        const invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
        });

        if (invoice) {
            await db.invoices.update({
                where: { id: invoice.id },
                data: {
                    status: Number(invoice.balance_due) <= 0 ? 'Paid' : 'Final',
                    finalized_at: new Date(),
                },
            });
        }

        // Create discharge summary
        await db.discharge_summaries.create({
            data: {
                admission_id: admissionId,
                patient_name: admission.patient?.full_name,
                generated_summary: `<h2>Discharge Summary</h2>
                    <p><strong>Patient:</strong> ${admission.patient?.full_name}</p>
                    <p><strong>Diagnosis:</strong> ${admission.diagnosis || 'N/A'}</p>
                    <p><strong>Doctor:</strong> ${admission.doctor_name || 'N/A'}</p>
                    <p><strong>Duration:</strong> ${daysAdmitted} day(s)</p>
                    <p><strong>Ward:</strong> ${ward?.ward_name || 'N/A'}</p>
                    <p><strong>Notes:</strong> ${notes || 'N/A'}</p>`,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'DISCHARGE_IPD',
                module: 'ipd',
                entity_type: 'admission',
                entity_id: admissionId,
                details: JSON.stringify({
                    patient_id: admission.patient_id,
                    daysAdmitted,
                    bedFreed: admission.bed_id,
                }),
            },
        });

        return { success: true, data: { daysAdmitted, bedId: admission.bed_id } };
    } catch (error: any) {
        console.error('dischargePatientIPD error:', error);
        return { success: false, error: error.message };
    }
}

// Add medical note during admission
export async function addMedicalNote(admissionId: string, noteType: string, details: string) {
    try {
        const { db } = await requireTenantContext();
        const note = await db.medical_notes.create({
            data: {
                admission_id: admissionId,
                note_type: noteType,
                details,
            },
        });

        await logAudit({
            action: 'MEDICAL_NOTE_ADDED',
            module: 'IPD',
            entity_type: 'medical_note',
            entity_id: admissionId,
            details: JSON.stringify({ noteType }),
        });

        return { success: true, data: note };
    } catch (error: any) {
        console.error('addMedicalNote error:', error);
        return { success: false, error: error.message };
    }
}

// Get IPD Stats
export async function getIPDStats() {
    try {
        const { db } = await requireTenantContext();
        const [
            totalAdmitted,
            totalDischarged,
            totalBeds,
            availableBeds,
            occupiedBeds,
        ] = await Promise.all([
            db.admissions.count({ where: { status: 'Admitted' } }),
            db.admissions.count({ where: { status: 'Discharged' } }),
            db.beds.count(),
            db.beds.count({ where: { status: 'Available' } }),
            db.beds.count({ where: { status: 'Occupied' } }),
        ]);

        return {
            success: true,
            data: {
                totalAdmitted,
                totalDischarged,
                totalBeds,
                availableBeds,
                occupiedBeds,
                occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
            },
        };
    } catch (error: any) {
        console.error('getIPDStats error:', error);
        return { success: false, error: error.message };
    }
}

// Search patients for admission
export async function searchPatientsForAdmission(query: string) {
    try {
        const { db } = await requireTenantContext();
        const patients = await db.oPD_REG.findMany({
            where: {
                OR: [
                    { full_name: { contains: query } },
                    { patient_id: { contains: query } },
                    { phone: { contains: query } },
                ],
            },
            take: 10,
        });

        return { success: true, data: serialize(patients) };
    } catch (error: any) {
        console.error('searchPatientsForAdmission error:', error);
        return { success: false, error: error.message };
    }
}
