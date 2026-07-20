/**
 * lib/booking/appointment-service.ts
 * =====================================================================
 * Track B — Step 6 service: Transactional appointment creation
 *
 * Guarantees:
 * - Idempotent: supplying the same idempotencyKey returns the existing
 *   appointment (no duplicate creation on retry) — NFR-3
 * - Transactional: slot verification + mark-booked + appointment creation
 *   happen inside a single Prisma $transaction — no orphan appointments
 * - Org-scoped: getTenantPrisma auto-injects organisationId — NFR-4
 * - Payment mode: PAV (Pay at Visit) per user-approved decision
 * - booking_channel: "patient_portal" (consistent with existing portal booking)
 *
 * =====================================================================
 */

import { getTenantPrisma } from '@/backend/db';
import type { AppointmentCreationResult, DoctorCard } from '@/lib/contracts/voice';
import { isSlotStillAvailable } from './slot-service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateVoiceAppointmentInput {
  /** OPD_REG.patient_id (e.g. "AVN-2026-00001") */
  patientId: string;
  /** User.id of the doctor */
  doctorId: string;
  /** AppointmentSlot.id */
  slotId: string;
  /** Organisation UUID */
  organisationId: string;
  /** Optional free-text reason for the visit */
  reason?: string;
  /**
   * Client-supplied idempotency key.
   * If an appointment with this key already exists, it is returned without
   * creating a duplicate (NFR-3 idempotent saves).
   * Recommended format: `voice-{patientId}-{slotId}`
   */
  idempotencyKey: string;
  /**
   * booking_channel value. Defaults to "patient_portal" (browser voice flow).
   * The phone assistant passes "voice_ai".
   */
  bookingChannel?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ID generator (mirrors existing pattern in app/patient/appointments/actions.ts)
// ─────────────────────────────────────────────────────────────────────────────

function generateAppointmentId(): string {
  return `APT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency check
// We store the idempotencyKey as a prefix in reason_for_visit:
//   "[idem:{key}] {reason}"
// This avoids adding a new DB column (additive-only constraint).
// ─────────────────────────────────────────────────────────────────────────────

function encodeReason(idempotencyKey: string, reason?: string): string {
  const reasonPart = reason?.trim() ? ` ${reason.trim()}` : '';
  return `[idem:${idempotencyKey}]${reasonPart}`;
}

async function findExistingByIdempotencyKey(
  db: any,
  patientId: string,
  idempotencyKey: string,
): Promise<{ appointment_id: string; appointment_date: Date; doctor_name: string | null; department: string | null } | null> {
  try {
    const existing = await db.appointments.findFirst({
      where: {
        patient_id: patientId,
        reason_for_visit: { startsWith: `[idem:${idempotencyKey}]` },
      },
      select: {
        appointment_id: true,
        appointment_date: true,
        doctor_name: true,
        department: true,
      },
    });
    return existing as any ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a voice-booked appointment, transactionally and idempotently.
 *
 * Steps (inside a single $transaction):
 * 1. Re-verify slot is still available (race-condition guard)
 * 2. Mark slot as booked (is_booked = true, booked_by = patientId)
 * 3. Create appointments record
 *
 * Payment mode: PAV (Pay at Visit) — approved by user.
 * No invoice is created here; payment is collected at the desk.
 *
 * @returns AppointmentCreationResult with appointmentId on success
 */
export async function createVoiceAppointment(
  input: CreateVoiceAppointmentInput,
): Promise<AppointmentCreationResult> {
  const { patientId, doctorId, slotId, organisationId, reason, idempotencyKey } = input;

  const db = getTenantPrisma(organisationId);

  // ─── Idempotency check ──────────────────────────────────────────────────────
  const existing = await findExistingByIdempotencyKey(db, patientId, idempotencyKey);
  if (existing) {
    console.log(`[AppointmentService] Idempotent hit for key: ${idempotencyKey}`);
    return {
      success: true,
      appointmentId: existing.appointment_id,
      appointmentDate: existing.appointment_date?.toISOString(),
      doctor: {
        name: existing.doctor_name ?? '',
        specialty: existing.department ?? '',
      },
    };
  }

  // ─── Fetch doctor info ──────────────────────────────────────────────────────
  let doctorRecord: any;
  try {
    doctorRecord = await db.user.findFirst({
      where: { id: doctorId, role: 'doctor' },
      select: { id: true, name: true, specialty: true },
    });
  } catch (error) {
    console.error('[AppointmentService] Doctor lookup failed:', error);
    return { success: false, error: 'Doctor not found. Please try selecting again.' };
  }

  if (!doctorRecord) {
    return { success: false, error: 'Doctor not found in this organisation.' };
  }

  // ─── Race-condition guard: re-verify slot ───────────────────────────────────
  const slotFree = await isSlotStillAvailable(organisationId, slotId);
  if (!slotFree) {
    return {
      success: false,
      error: 'That slot was just booked by someone else. Please choose another time.',
    };
  }

  // ─── Fetch slot for appointment_date ───────────────────────────────────────
  let slotRecord: any;
  try {
    slotRecord = await db.appointmentSlot.findFirst({
      where: { id: slotId },
      select: { id: true, date: true, start_time: true },
    });
  } catch (error) {
    console.error('[AppointmentService] Slot lookup failed:', error);
    return { success: false, error: 'Could not retrieve slot details.' };
  }

  if (!slotRecord) {
    return { success: false, error: 'Slot no longer exists.' };
  }

  // Build the appointment date from slot date + start_time
  const appointmentDate = new Date(slotRecord.date);
  if (slotRecord.start_time) {
    const [h, m] = slotRecord.start_time.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      appointmentDate.setHours(h, m, 0, 0);
    }
  }

  const apptId = generateAppointmentId();
  const encodedReason = encodeReason(idempotencyKey, reason);

  // ─── Transactional: mark slot + create appointment ─────────────────────────
  try {
    await db.$transaction(async (tx: any) => {
      // Mark slot as booked
      await tx.appointmentSlot.update({
        where: { id: slotId },
        data: {
          is_booked: true,
          booked_by: patientId,
        },
      });

      // Create appointment record
      // booking_channel = "patient_portal" (consistent with manual patient portal booking)
      // payment_mode = "PAV" (Pay at Visit — approved by user)
      await tx.appointments.create({
        data: {
          appointment_id: apptId,
          patient_id: patientId,
          doctor_id: doctorId,
          doctor_name: doctorRecord.name,
          department: doctorRecord.specialty ?? 'General Medicine',
          appointment_date: appointmentDate,
          status: 'Scheduled',
          reason_for_visit: encodedReason,
          booking_channel: input.bookingChannel ?? 'patient_portal',
          payment_mode: 'PAV',
          payment_status: 'PENDING',
          slot_id: slotId,
          appointment_type: 'NEW_OPD',
        },
      });
    });

    return {
      success: true,
      appointmentId: apptId,
      appointmentDate: appointmentDate.toISOString(),
      doctor: {
        name: doctorRecord.name ?? '',
        specialty: doctorRecord.specialty ?? 'General Medicine',
      },
    };
  } catch (error: any) {
    console.error('[AppointmentService] Transaction failed:', error);

    // Unique constraint violation on slot_id means concurrent booking won
    if (error?.code === 'P2002') {
      return {
        success: false,
        error: 'That slot was just booked. Please choose another time.',
      };
    }

    return {
      success: false,
      error: 'Booking failed due to a server error. Your registration is safe — please try again.',
    };
  }
}

/**
 * Fetch a summary of an appointment by its appointment_id.
 * Used for confirmation display and notification trigger.
 * Org-scoped via getTenantPrisma.
 */
export async function getAppointmentSummary(
  organisationId: string,
  appointmentId: string,
): Promise<{
  appointmentId: string;
  patientId: string;
  doctorName: string;
  department: string;
  appointmentDate: string;
  status: string;
} | null> {
  try {
    const db = getTenantPrisma(organisationId);
    const appt = await db.appointments.findFirst({
      where: { appointment_id: appointmentId },
      select: {
        appointment_id: true,
        patient_id: true,
        doctor_name: true,
        department: true,
        appointment_date: true,
        status: true,
      },
    });

    if (!appt) return null;

    return {
      appointmentId: (appt as any).appointment_id,
      patientId: (appt as any).patient_id,
      doctorName: (appt as any).doctor_name ?? '',
      department: (appt as any).department ?? '',
      appointmentDate: (appt as any).appointment_date?.toISOString() ?? '',
      status: (appt as any).status,
    };
  } catch (error) {
    console.error('[AppointmentService] getAppointmentSummary error:', error);
    return null;
  }
}
