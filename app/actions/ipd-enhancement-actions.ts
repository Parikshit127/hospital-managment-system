'use server';
import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export async function createAdmissionBooking(data: {
  patientId: string; expectedDate: string; bedCategory: string;
  department: string; doctorId?: string; doctorName?: string;
  estimatedCost?: number; notes?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const count = await (db.admissionBooking as any).count({ where: { organizationId } });
    const bookingNumber = `BKG-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(count+1).padStart(4,'0')}`;
    const booking = await (db.admissionBooking as any).create({
      data: {
        organizationId, patient_id: data.patientId, booking_number: bookingNumber,
        expected_date: new Date(data.expectedDate), bed_category: data.bedCategory,
        department: data.department, doctor_id: data.doctorId || null,
        doctor_name: data.doctorName || null, estimated_cost: data.estimatedCost || null,
        notes: data.notes || null,
      },
    });
    revalidatePath('/ipd/pre-admissions');
    return { success: true, data: booking };
  } catch (e) { return { success: false, error: 'Failed to create booking' }; }
}

export async function getAdmissionBookings(status?: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const where: any = { organizationId };
    if (status) where.status = status;
    const bookings = await (db.admissionBooking as any).findMany({ where, orderBy: { expected_date: 'asc' } });
    return { success: true, data: bookings };
  } catch (e) { return { success: false, data: [] }; }
}

export async function recordPatientMovement(data: {
  admissionId: string; patientId: string; fromLocation: string;
  toLocation: string; purpose?: string; movedBy?: string; escortName?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const movement = await (db.patientMovement as any).create({
      data: {
        organizationId, admission_id: data.admissionId, patient_id: data.patientId,
        from_location: data.fromLocation, to_location: data.toLocation,
        purpose: data.purpose || null, moved_by: data.movedBy || null,
        escort_name: data.escortName || null,
      },
    });
    revalidatePath('/ipd/movement');
    return { success: true, data: movement };
  } catch (e) { return { success: false, error: 'Failed to record movement' }; }
}

export async function returnPatient(movementId: string) {
  try {
    const { db } = await requireTenantContext();
    await (db.patientMovement as any).update({ where: { id: movementId }, data: { returned_at: new Date() } });
    return { success: true };
  } catch (e) { return { success: false, error: 'Failed to update' }; }
}

export async function getActiveMovements() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const movements = await (db.patientMovement as any).findMany({
      where: { organizationId, returned_at: null },
      orderBy: { moved_at: 'asc' },
    });
    return { success: true, data: movements };
  } catch (e) { return { success: false, data: [] }; }
}

export async function initDischargeClearance(admissionId: string) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const existing = await (db.dischargeClearance as any).findUnique({ where: { admission_id: admissionId } });
    if (existing) return { success: true, data: existing };
    const clearance = await (db.dischargeClearance as any).create({ data: { organizationId, admission_id: admissionId } });
    return { success: true, data: clearance };
  } catch (e) { return { success: false, error: 'Failed to init clearance' }; }
}

export async function updateClearanceDept(
  admissionId: string,
  dept: 'pharmacy' | 'lab' | 'finance' | 'nursing' | 'doctor',
  status: 'Cleared' | 'Waived',
  clearedBy: string
) {
  try {
    const { db } = await requireTenantContext();
    const updateData: any = { [dept]: status, [`${dept}_by`]: clearedBy, [`${dept}_at`]: new Date(), updated_at: new Date() };
    const clearance = await (db.dischargeClearance as any).update({ where: { admission_id: admissionId }, data: updateData });
    const depts = ['pharmacy','lab','finance','nursing','doctor'];
    const allClear = depts.every(d => clearance[d] === 'Cleared' || clearance[d] === 'Waived');
    if (allClear) await (db.dischargeClearance as any).update({ where: { admission_id: admissionId }, data: { all_cleared: true } });
    revalidatePath(`/ipd/clearance/${admissionId}`);
    return { success: true, data: clearance };
  } catch (e) { return { success: false, error: 'Failed to update clearance' }; }
}

export async function getDischargeClearance(admissionId: string) {
  try {
    const { db } = await requireTenantContext();
    const clearance = await (db.dischargeClearance as any).findUnique({ where: { admission_id: admissionId } });
    return { success: true, data: clearance };
  } catch (e) { return { success: false, data: null }; }
}

export async function addPatientConsent(data: {
  admissionId: string; consentType: string; formUrl?: string; witnessName?: string; notes?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const consent = await (db.patientConsent_IPD as any).create({
      data: {
        organizationId, admission_id: data.admissionId, consent_type: data.consentType,
        form_url: data.formUrl || null, signed_at: new Date(),
        witness_name: data.witnessName || null, notes: data.notes || null,
      },
    });
    return { success: true, data: consent };
  } catch (e) { return { success: false, error: 'Failed to add consent' }; }
}

export async function getPatientConsents(admissionId: string) {
  try {
    const { db } = await requireTenantContext();
    const consents = await (db.patientConsent_IPD as any).findMany({
      where: { admission_id: admissionId }, orderBy: { created_at: 'desc' },
    });
    return { success: true, data: consents };
  } catch (e) { return { success: false, data: [] }; }
}
