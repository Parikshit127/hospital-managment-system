/**
 * POST /api/notifications/appointment-confirmation
 * =====================================================================
 * Track B — Step 6 (optional): Send appointment confirmation to patient
 *
 * Request body:
 *   patientId       (required) — OPD_REG.patient_id
 *   appointmentId   (required) — appointments.appointment_id
 *   organisationId  (required) — Organisation UUID
 *
 * Behaviour:
 * - Fetches patient contact (email + phone) and appointment details from DB
 * - Calls notifyPatient() which sends email + WhatsApp (non-blocking internally)
 * - Always returns 200 even if notification fails — a notification failure
 *   must never roll back a successful appointment (FR-6.5)
 * - Fire-and-forget pattern: notification dispatch is non-blocking
 *
 * HTTP status codes:
 *   200 — notification dispatched (or gracefully skipped if no contact info)
 *   400 — missing required fields
 *   404 — appointment or patient not found in this org
 *   500 — unexpected server error
 * =====================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getTenantPrisma } from '@/backend/db';
import { notifyPatient } from '@/app/lib/notify-patient';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, appointmentId, organisationId } = body as {
      patientId?: string;
      appointmentId?: string;
      organisationId?: string;
    };

    // ── 400: Required fields ─────────────────────────────────────────────────
    const missing: string[] = [];
    if (!patientId?.trim())      missing.push('patientId');
    if (!appointmentId?.trim())  missing.push('appointmentId');
    if (!organisationId?.trim()) missing.push('organisationId');

    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    // ── Validate org (NFR-4) ─────────────────────────────────────────────────
    const org = await prisma.organization.findUnique({
      where: { id: organisationId },
      select: { id: true, name: true, is_active: true },
    });
    if (!org || !org.is_active) {
      return NextResponse.json(
        { success: false, error: 'Organisation not found or inactive' },
        { status: 404 },
      );
    }

    const db = getTenantPrisma(organisationId!);

    // ── Fetch appointment (org-scoped) ────────────────────────────────────────
    const appointment = await db.appointments.findFirst({
      where: { appointment_id: appointmentId },
      select: {
        appointment_id: true,
        patient_id: true,
        doctor_name: true,
        department: true,
        appointment_date: true,
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found in this organisation' },
        { status: 404 },
      );
    }

    // Confirm appointment belongs to the requested patient (additional guard)
    if ((appointment as any).patient_id !== patientId) {
      return NextResponse.json(
        { success: false, error: 'Appointment does not belong to this patient' },
        { status: 404 },
      );
    }

    // ── Fetch patient contact info (org-scoped) ───────────────────────────────
    const patient = await (db.oPD_REG.findFirst as any)({
      where: { patient_id: patientId },
      select: { full_name: true, email: true, phone: true },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found in this organisation' },
        { status: 404 },
      );
    }

    // ── Format date and time for the notification ─────────────────────────────
    const apptDate = (appointment as any).appointment_date as Date;
    const formattedDate = apptDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = apptDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // ── Dispatch notification (non-blocking — FR-6.5) ─────────────────────────
    // A failure here must not affect the already-committed appointment.
    notifyPatient(
      {
        email: (patient as any).email,
        phone: (patient as any).phone,
      },
      {
        type: 'appointment',
        patientName: (patient as any).full_name ?? 'Patient',
        doctorName: (appointment as any).doctor_name ?? 'Doctor',
        department: (appointment as any).department ?? 'General',
        date: formattedDate,
        time: formattedTime,
        hospitalName: org.name ?? 'Hospital',
      },
    ).catch(err =>
      console.error('[POST /api/notifications/appointment-confirmation] Notification error:', err),
    );

    return NextResponse.json({
      success: true,
      message: 'Confirmation notification dispatched',
      appointmentId,
      dispatchedTo: {
        email: (patient as any).email ? 'yes' : 'no',
        whatsapp: (patient as any).phone ? 'yes' : 'no',
      },
    });
  } catch (error: any) {
    console.error('[POST /api/notifications/appointment-confirmation]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
