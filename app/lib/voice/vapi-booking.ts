/**
 * app/lib/voice/vapi-booking.ts — AI Voice Call Assistant · Phase 4
 * ─────────────────────────────────────────────────────────────────────────────
 * Write-path tools the Vapi assistant can call: book, register, reschedule,
 * cancel. Unlike the Phase 3 read tools, these mutate the DB — but they are
 * gated on the caller being identified (verified existing patient or freshly
 * registered), which is tracked on the CallLog for this call.
 *
 * Reuses the existing engine:
 *   • createVoiceAppointment (transactional, idempotent, PAV) — booking_channel "voice_ai"
 *   • generateUHID — patient IDs identical to manual registration
 *   • getAvailableSlotsForDoctor / findNextAvailableDate — live slots
 *   • notifyPatient — fire-and-forget SMS/WhatsApp/email confirmation
 *
 * Reschedule/cancel also FREE the previously-booked slot (fixing the gap in the
 * existing reception/portal flows).
 */

import { getTenantPrisma } from '@/backend/db';
import { createVoiceAppointment } from '@/lib/booking/appointment-service';
import { getAvailableSlotsForDoctor } from '@/lib/booking/slot-service';
import { generateUHID } from '@/app/lib/uhid';
import { notifyPatient } from '@/app/lib/notify-patient';

export interface VoiceCtx {
  organizationId: string;
  callId: string | null;
  callerPhone: string | null;
}

// ── Local helpers ────────────────────────────────────────────────────────────

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

function istDate(offsetDays = 0): string {
  const t = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(t);
}

function resolveDate(arg?: string): string {
  if (!arg) return istDate(0);
  const a = arg.trim().toLowerCase();
  if (a === 'today') return istDate(0);
  if (a === 'tomorrow') return istDate(1);
  const parsed = new Date(arg);
  if (!isNaN(parsed.getTime())) return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(parsed);
  return istDate(0);
}

/** Parse "10", "10:30", "10 am", "9:15 PM" → "HH:MM" 24h, matching slot.start_time. */
function parseTimeToHHMM(t?: string): string | null {
  if (!t) return null;
  const m = t.trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

async function findDoctorByName(db: any, name: string) {
  const cleaned = name.replace(/^dr\.?\s+/i, '').trim();
  return db.user.findFirst({
    where: { role: 'doctor', is_active: true, name: { contains: cleaned, mode: 'insensitive' } },
    select: { id: true, name: true, specialty: true },
  });
}

async function updateCallLog(db: any, callId: string | null, data: Record<string, any>) {
  if (!callId) return;
  try {
    await db.callLog.updateMany({ where: { provider_call_id: callId }, data });
  } catch (e) {
    console.error('[VoiceBooking] CallLog update failed:', e);
  }
}

/** Identify the patient for this call: the one linked on the CallLog (verified /
 *  just-registered), else a unique caller-ID match. Returns null if unresolved. */
async function resolvePatient(db: any, ctx: VoiceCtx): Promise<{ patientId: string; name: string; email: string | null; phone: string | null } | null> {
  if (ctx.callId) {
    const log = await db.callLog.findFirst({ where: { provider_call_id: ctx.callId }, select: { patient_id: true } });
    if (log?.patient_id) {
      const p = await db.oPD_REG.findFirst({ where: { patient_id: log.patient_id }, select: { patient_id: true, full_name: true, email: true, phone: true } });
      if (p) return { patientId: p.patient_id, name: p.full_name, email: p.email, phone: p.phone };
    }
  }
  const phone = normalizePhone(ctx.callerPhone);
  if (phone) {
    const matches = await db.oPD_REG.findMany({ where: { phone: { contains: phone } }, select: { patient_id: true, full_name: true, email: true, phone: true }, take: 2 });
    if (matches.length === 1) {
      const p = matches[0];
      return { patientId: p.patient_id, name: p.full_name, email: p.email, phone: p.phone };
    }
  }
  return null;
}

async function orgName(db: any, organizationId: string): Promise<string> {
  const org = await db.organization.findFirst({ where: { id: organizationId }, select: { name: true } });
  return org?.name ?? 'the hospital';
}

const NOT_IDENTIFIED = {
  message: 'I first need to confirm who you are. Please tell me your full name so I can verify your record, or I can register you as a new patient.',
};

// ── Tools ────────────────────────────────────────────────────────────────────

export async function bookAppointment(ctx: VoiceCtx, args: { doctorName?: string; date?: string; time?: string; reason?: string }) {
  const db = getTenantPrisma(ctx.organizationId);
  const patient = await resolvePatient(db, ctx);
  if (!patient) return NOT_IDENTIFIED;

  if (!args.doctorName?.trim()) return { message: 'Which doctor would you like to book with?' };
  const doc = await findDoctorByName(db, args.doctorName);
  if (!doc) return { message: `I could not find a doctor named "${args.doctorName}". I can list doctors by department.` };

  const dateStr = resolveDate(args.date);
  const wantTime = parseTimeToHHMM(args.time);
  if (!wantTime) return { message: 'What time would you like? For example, 10 AM.' };

  const slotsRes = await getAvailableSlotsForDoctor(ctx.organizationId, doc.id, dateStr);
  const slot = (slotsRes.slots as any[]).find((s) => s.startTime === wantTime && s.isAvailable !== false);
  if (!slot) {
    const open = (slotsRes.slots as any[]).filter((s) => s.isAvailable !== false).slice(0, 6).map((s) => to12h(s.startTime));
    return {
      message: open.length
        ? `${doc.name} is not free at ${to12h(wantTime)} on ${dateStr}. Available times are: ${open.join(', ')}.`
        : `${doc.name} has no open slots on ${dateStr}.`,
    };
  }

  const result = await createVoiceAppointment({
    patientId: patient.patientId,
    doctorId: doc.id,
    slotId: slot.id,
    organisationId: ctx.organizationId,
    reason: args.reason,
    idempotencyKey: `voice-${ctx.callId ?? patient.patientId}-${slot.id}`,
    bookingChannel: 'voice_ai',
  });

  if (!result.success) return { message: result.error ?? 'The booking could not be completed. Please try another time.' };

  await updateCallLog(db, ctx.callId, {
    appointment_id: result.appointmentId,
    patient_id: patient.patientId,
    patient_name: patient.name,
    verification_status: 'name_confirmed',
    outcome: 'Booked',
  });

  // Fire-and-forget confirmation
  const hospital = await orgName(db, ctx.organizationId);
  void notifyPatient(
    { email: patient.email, phone: patient.phone },
    { type: 'appointment', patientName: patient.name, doctorName: doc.name ?? 'the doctor', department: doc.specialty ?? 'OPD', date: dateStr, time: to12h(wantTime), hospitalName: hospital },
    hospital,
    ctx.organizationId,
  ).catch(() => {});

  return {
    message: `Booked. ${patient.name} is confirmed with ${doc.name} on ${dateStr} at ${to12h(wantTime)}. Please pay at the hospital reception. The appointment reference is ${result.appointmentId}. A confirmation will be sent by SMS.`,
  };
}

function normalizeEmail(raw?: string): string | null {
  if (!raw) return null;
  // STT often inserts spaces or spells "at"/"dot" — collapse the obvious cases.
  const e = raw.trim().toLowerCase().replace(/\s+/g, '').replace(/\(at\)|\sat\s/g, '@').replace(/\(dot\)|\sdot\s/g, '.');
  return e || null;
}

function isValidEmail(e: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

export async function registerPatient(ctx: VoiceCtx, args: { fullName?: string; email?: string; phone?: string }) {
  const db = getTenantPrisma(ctx.organizationId);
  if (!args.fullName?.trim()) return { message: 'What is your full name, so I can register you?' };

  // Phone: prefer caller ID; else a spoken number. Speech-to-text often splits or
  // drops a digit, so accept it best-effort (>= 8 digits) and never loop the caller
  // over an exact count. Real phone calls provide a clean 10-digit caller ID.
  const rawDigits = (args.phone ?? ctx.callerPhone ?? '').replace(/\D/g, '');
  if (!rawDigits || rawDigits.length < 8) {
    return { message: 'Please tell me your mobile number once more, and I will register you.' };
  }
  const phone = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

  const email = normalizeEmail(args.email);
  if (email && !isValidEmail(email)) {
    return { message: `I heard the email as "${email}", which doesn't look right. Could you spell your email address for me, or we can skip it?` };
  }

  const cfg = await db.organizationConfig.findUnique({ where: { organizationId: ctx.organizationId }, select: { uhid_prefix: true } }).catch(() => null);
  const uhid = await generateUHID(db as any, cfg?.uhid_prefix || 'AVN');

  await db.oPD_REG.create({
    data: {
      patient_id: uhid,
      full_name: args.fullName.trim(),
      phone,
      email: email || null,
      organizationId: ctx.organizationId,
      registration_consent: true,
      preferred_language: 'en',
      lead_source: 'Call Center',
      patient_type: 'cash',
    },
  });

  await updateCallLog(db, ctx.callId, {
    patient_id: uhid,
    patient_name: args.fullName.trim(),
    verification_status: 'name_confirmed',
    outcome: 'Registered',
  });

  const emailPart = email ? ` I have your email as ${email}.` : '';
  return {
    message: `Thank you, ${args.fullName.trim()}. You're registered with mobile number ${phone}.${emailPart} Please confirm those are correct, then tell me which doctor and time you'd like to book.`,
  };
}

export async function rescheduleAppointment(ctx: VoiceCtx, args: { newDate?: string; newTime?: string; doctorName?: string }) {
  const db = getTenantPrisma(ctx.organizationId);
  const patient = await resolvePatient(db, ctx);
  if (!patient) return NOT_IDENTIFIED;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const appt = await db.appointments.findFirst({
    where: { patient_id: patient.patientId, status: { in: ['Scheduled', 'Pending'] }, appointment_date: { gte: todayStart } },
    orderBy: { appointment_date: 'asc' },
    select: { appointment_id: true, doctor_id: true, doctor_name: true, slot_id: true },
  });
  if (!appt) return { message: 'I could not find an upcoming appointment to reschedule.' };

  const wantTime = parseTimeToHHMM(args.newTime);
  if (!wantTime) return { message: 'What new time would you like?' };
  const dateStr = resolveDate(args.newDate);

  const doc = args.doctorName?.trim() ? await findDoctorByName(db, args.doctorName) : await db.user.findFirst({ where: { id: appt.doctor_id ?? undefined }, select: { id: true, name: true, specialty: true } });
  if (!doc) return { message: 'I could not identify the doctor for the new appointment.' };

  const slotsRes = await getAvailableSlotsForDoctor(ctx.organizationId, doc.id, dateStr);
  const newSlot = (slotsRes.slots as any[]).find((s) => s.startTime === wantTime && s.isAvailable !== false);
  if (!newSlot) {
    const open = (slotsRes.slots as any[]).filter((s) => s.isAvailable !== false).slice(0, 6).map((s) => to12h(s.startTime));
    return { message: open.length ? `That time is not available. ${doc.name} is free at: ${open.join(', ')}.` : `${doc.name} has no open slots on ${dateStr}.` };
  }

  const newDateTime = new Date(`${dateStr}T${wantTime}:00`);
  try {
    await db.$transaction(async (tx: any) => {
      if (appt.slot_id) {
        await tx.appointmentSlot.update({ where: { id: appt.slot_id }, data: { is_booked: false, is_available: true, booked_by: null } });
      }
      await tx.appointmentSlot.update({ where: { id: newSlot.id }, data: { is_booked: true, is_available: false, booked_by: patient.patientId } });
      await tx.appointments.update({
        where: { appointment_id: appt.appointment_id },
        data: { appointment_date: newDateTime, slot_id: newSlot.id, status: 'Scheduled', doctor_id: doc.id, doctor_name: doc.name, department: doc.specialty ?? undefined },
      });
    });
  } catch (e) {
    console.error('[VoiceBooking] reschedule failed:', e);
    return { message: 'The reschedule could not be completed. Please try another time.' };
  }

  await updateCallLog(db, ctx.callId, { appointment_id: appt.appointment_id, patient_id: patient.patientId, outcome: 'Rescheduled' });

  const hospital = await orgName(db, ctx.organizationId);
  void notifyPatient(
    { email: patient.email, phone: patient.phone },
    { type: 'appointment', patientName: patient.name, doctorName: doc.name ?? 'the doctor', department: doc.specialty ?? 'OPD', date: dateStr, time: to12h(wantTime), hospitalName: hospital },
    hospital,
    ctx.organizationId,
  ).catch(() => {});

  return { message: `Done. Your appointment is moved to ${dateStr} at ${to12h(wantTime)} with ${doc.name}. A confirmation will be sent by SMS.` };
}

export async function cancelAppointment(ctx: VoiceCtx, args: { reason?: string }) {
  const db = getTenantPrisma(ctx.organizationId);
  const patient = await resolvePatient(db, ctx);
  if (!patient) return NOT_IDENTIFIED;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const appt = await db.appointments.findFirst({
    where: { patient_id: patient.patientId, status: { in: ['Scheduled', 'Pending'] }, appointment_date: { gte: todayStart } },
    orderBy: { appointment_date: 'asc' },
    select: { appointment_id: true, doctor_name: true, slot_id: true, appointment_date: true },
  });
  if (!appt) return { message: 'I could not find an upcoming appointment to cancel.' };

  const reason = args.reason?.trim() || 'Cancelled by patient over phone';
  try {
    await db.$transaction(async (tx: any) => {
      await tx.appointments.update({ where: { appointment_id: appt.appointment_id }, data: { status: 'Cancelled', cancellation_reason: reason } });
      if (appt.slot_id) {
        await tx.appointmentSlot.update({ where: { id: appt.slot_id }, data: { is_booked: false, is_available: true, booked_by: null } });
      }
    });
  } catch (e) {
    console.error('[VoiceBooking] cancel failed:', e);
    return { message: 'The cancellation could not be completed right now.' };
  }

  await updateCallLog(db, ctx.callId, { appointment_id: appt.appointment_id, patient_id: patient.patientId, outcome: 'Cancelled' });

  return { message: `Your appointment with ${appt.doctor_name ?? 'the doctor'} has been cancelled. Is there anything else I can help with?` };
}
