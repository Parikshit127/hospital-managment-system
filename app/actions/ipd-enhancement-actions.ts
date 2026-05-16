'use server';
import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) =>
    typeof v === 'object' && v !== null && v?.constructor?.name === 'Decimal' ? Number(v) : v));
}

// ============================================
// DAYCARE BILLING
// ============================================

export async function createDaycareInvoice(data: {
  bookingId: string;
  patientId: string;       // real UHID or name-based fallback
  patientName: string;
  procedureName: string;
  unitPrice: number;
  discount?: number;
  paymentMethod: string;   // Cash | Card | UPI | Online
  notes?: string;
}) {
  try {
    const { db, organizationId } = await requireTenantContext();

    // 1. Resolve or auto-create OPD_REG record (daycare patients may not be registered)
    let patient = await db.oPD_REG.findUnique({ where: { patient_id: data.patientId } });
    if (!patient) {
      // Auto-register as a walk-in daycare patient
      const timestamp = Date.now().toString(36).toUpperCase();
      const newPatientId = `DC-${timestamp}`;
      patient = await db.oPD_REG.create({
        data: {
          patient_id: newPatientId,
          full_name: data.patientName || 'Daycare Patient',
          organizationId,
        },
      });
    }

    const discount = data.discount || 0;
    const total_price = data.unitPrice;
    const net_price = total_price - discount;

    // 2. Create invoice
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    const invoice = await db.invoices.create({
      data: {
        invoice_number: `DC-${dateStr}-${seq}`,
        patient_id: patient.patient_id,
        invoice_type: 'OPD',
        status: 'Draft',
        notes: data.notes || `Daycare: ${data.procedureName}`,
        organizationId,
        billing_patient_type: 'cash',
      },
    });

    // 3. Add procedure line item
    await db.invoice_items.create({
      data: {
        invoice_id: invoice.id,
        department: 'Daycare',
        description: data.procedureName,
        quantity: 1,
        unit_price: data.unitPrice,
        total_price,
        discount,
        net_price,
        tax_rate: 0,
        tax_amount: 0,
        service_category: 'Procedure',
        ref_id: data.bookingId,
        organizationId,
      },
    });

    // 4. Recalculate invoice totals
    await db.invoices.update({
      where: { id: invoice.id },
      data: {
        total_amount: total_price,
        total_discount: discount,
        net_amount: net_price,
        balance_due: net_price,
        status: 'Draft',
      },
    });

    // 5. If payment method provided, record payment and mark paid
    if (data.paymentMethod && net_price > 0) {
      const receiptSeq = String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
      await db.payments.create({
        data: {
          receipt_number: `RCP-${dateStr}-${receiptSeq}`,
          invoice_id: invoice.id,
          amount: net_price,
          payment_method: data.paymentMethod,
          payment_type: 'Settlement',
          status: 'Completed',
          organizationId,
        },
      });
      await db.invoices.update({
        where: { id: invoice.id },
        data: {
          paid_amount: net_price,
          balance_due: 0,
          status: 'Paid',
          finalized_at: new Date(),
        },
      });
    }

    // 6. Mark booking as billed
    await (db.admissionBooking as any).update({
      where: { id: data.bookingId },
      data: { status: 'Completed' },
    });

    revalidatePath('/ipd/daycare');
    return { success: true, data: serialize({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, patientId: patient.patient_id }) };
  } catch (e: any) {
    console.error('createDaycareInvoice error:', e);
    return { success: false, error: e?.message || 'Failed to create invoice' };
  }
}

export async function createAdmissionBooking(data: {
  patientId: string; expectedDate: string; bedCategory: string;
  department: string; doctorId?: string; doctorName?: string;
  estimatedCost?: number; notes?: string; admissionType?: string;
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
        admission_type: data.admissionType || 'REGULAR',
      },
    });
    revalidatePath('/ipd/pre-admissions');
    revalidatePath('/ipd/daycare');
    return { success: true, data: booking };
  } catch (e: any) { return { success: false, error: e?.message || 'Failed to create booking' }; }
}

export async function updateAdmissionBookingStatus(id: string, status: 'In Progress' | 'Completed' | 'Cancelled') {
  try {
    const { db, organizationId } = await requireTenantContext();
    const booking = await (db.admissionBooking as any).update({
      where: { id, organizationId },
      data: { status },
    });
    revalidatePath('/ipd/daycare');
    return { success: true, data: booking };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to update booking status' };
  }
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
