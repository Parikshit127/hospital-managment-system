/**
 * app/lib/voice/voice-core.ts — AI Voice Receptionist · provider-neutral core
 * ─────────────────────────────────────────────────────────────────────────────
 * The hospital business logic the voice agent uses, with NO telephony/provider
 * envelope. Consumed by the `/api/voice/v1/*` REST endpoints (Bolna) and — during
 * the transition — by the legacy Vapi adapter (`vapi-tools.ts`, retired in Phase 6).
 *
 * Every function takes an explicit `VoiceCtx` (organizationId + the provider's
 * call id + the caller's phone) and returns a structured, speakable result. All
 * DB access is org-scoped via getTenantPrisma(organizationId).
 *
 * Read functions never create patients/appointments. Write functions are gated on
 * the caller being identified (verified existing patient or freshly registered),
 * tracked on the CallLog (`provider_call_id` = the provider's call id).
 */

import { getTenantPrisma } from '@/backend/db';
import { getDoctorsBySpecialty, getAvailableSpecialties } from '@/lib/booking/doctor-service';
import { getAvailableSlotsForDoctor, findNextAvailableDate } from '@/lib/booking/slot-service';
import { createVoiceAppointment } from '@/lib/booking/appointment-service';
import { generateUHID } from '@/app/lib/uhid';
import { notifyPatient } from '@/app/lib/notify-patient';

/** Per-call context every core function receives. */
export interface VoiceCtx {
  organizationId: string;
  /** The voice provider's call id (Bolna call id); stored as CallLog.provider_call_id. */
  callId: string | null;
  /** Caller's phone from caller-ID metadata (may be null on web/test calls). */
  callerPhone: string | null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Last-10-digits normalization, mirroring checkDuplicatePatient(). */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

/** Today's (or offset) date as YYYY-MM-DD in Asia/Kolkata. */
function istDate(offsetDays = 0): string {
  const t = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(t);
}

/** Resolve a loose date argument ("today"/"tomorrow"/ISO) to YYYY-MM-DD (IST). */
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

/** Case-insensitive dedupe, keeping the first-seen casing; sorted. */
function dedupeCI(items: string[]): string[] {
  const seen = new Map<string, string>();
  for (const it of items) {
    const key = it.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, it.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function normalizeEmail(raw?: string): string | null {
  if (!raw) return null;
  let e = ` ${raw.trim().toLowerCase()} `;
  e = e.replace(/\s+at\s+the\s+rate\s+(of\s+)?/g, '@');
  e = e.replace(/\s+at\s+/g, '@');
  e = e.replace(/\s+(dot|period)\s+/g, '.');
  e = e.replace(/\s+underscore\s+/g, '_');
  e = e.replace(/\s+(dash|hyphen)\s+/g, '-');
  // spelled letter-by-letter separated by spaces/hyphens → join (dots preserved)
  e = e.replace(/\b([a-z0-9])[\s-]+(?=[a-z0-9]\b)/g, '$1');
  e = e.replace(/\s+/g, '').replace(/\.+/g, '.');
  return e || null;
}

function isValidEmail(e: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

async function findDoctorByName(db: any, name: string): Promise<{ id: string; name: string; specialty: string | null } | null> {
  const cleaned = name.replace(/^dr\.?\s+/i, '').trim();
  const doc = await db.user.findFirst({
    where: { role: 'doctor', is_active: true, name: { contains: cleaned, mode: 'insensitive' } },
    select: { id: true, name: true, specialty: true },
  });
  return doc ?? null;
}

async function isDoctorOnLeave(db: any, doctorId: string, dateStr: string): Promise<boolean> {
  const date = new Date(`${dateStr}T12:00:00`);
  const leave = await db.doctorLeave.findFirst({
    where: { doctor_id: doctorId, is_approved: true, from_date: { lte: date }, to_date: { gte: date } },
    select: { id: true },
  });
  return !!leave;
}

/** True when a real staff transfer number is configured (not the placeholder). */
export function staffTransferConfigured(): boolean {
  const n = (process.env.STAFF_TRANSFER_NUMBER ?? '').replace(/[^\d+]/g, '');
  return /^\+\d{10,15}$/.test(n) && n !== '+910000000000' && n !== '+910000000';
}

async function updateCallLog(db: any, callId: string | null, data: Record<string, any>) {
  if (!callId) return;
  try {
    await db.callLog.updateMany({ where: { provider_call_id: callId }, data });
  } catch (e) {
    console.error('[VoiceCore] CallLog update failed:', e);
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

// ── Read functions ────────────────────────────────────────────────────────────

export async function lookupCaller(ctx: VoiceCtx, args: { phone?: string } = {}) {
  const phone = normalizePhone(args.phone ?? ctx.callerPhone);
  if (!phone) {
    return { found: false, message: 'No caller ID available. Ask the caller for their 10-digit phone number and their name to look them up.' };
  }
  const db = getTenantPrisma(ctx.organizationId);
  const matches = await db.oPD_REG.findMany({ where: { phone: { contains: phone } }, select: { patient_id: true }, take: 5 });
  if (matches.length === 0) {
    return { found: false, message: 'No patient record is registered to this number. Treat as a new caller — ask for their name to register.' };
  }
  // Do NOT reveal the name to an unverified caller. Ask them to state it.
  return {
    found: true,
    count: matches.length,
    message: 'A patient record exists for this number. To verify identity, ask the caller to say their full name, then call verify-name.',
  };
}

export async function verifyCallerName(ctx: VoiceCtx, args: { name?: string; phone?: string } = {}) {
  const phone = normalizePhone(args.phone ?? ctx.callerPhone);
  if (!phone || !args.name?.trim()) {
    return { verified: false, message: 'Need both a 10-digit phone number and a spoken name to verify. Ask the caller for whichever is missing.' };
  }
  const db = getTenantPrisma(ctx.organizationId);
  const matches = await db.oPD_REG.findMany({ where: { phone: { contains: phone } }, select: { patient_id: true, full_name: true }, take: 10 });

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  const said = norm(args.name);
  const hit = matches.find((m: any) => {
    const full = norm(m.full_name ?? '');
    if (!full) return false;
    return full === said || full.includes(said) || said.includes(full) || full.split(' ')[0] === said.split(' ')[0];
  });

  if (!hit) {
    return {
      verified: false,
      message: 'The spoken name does not match the record on this number. Treat as unverified — do not disclose any details; offer to register them as a new patient.',
    };
  }
  // Persist the verified identity on this call so writes act on the right record.
  await updateCallLog(db, ctx.callId, { patient_id: hit.patient_id, patient_name: hit.full_name, verification_status: 'name_confirmed' });
  return {
    verified: true,
    patientId: hit.patient_id,
    patientName: hit.full_name,
    message: `Identity confirmed for ${hit.full_name} (${hit.patient_id}). You may proceed to help them.`,
  };
}

export async function getHospitalInfo(ctx: VoiceCtx) {
  const db = getTenantPrisma(ctx.organizationId);
  const [org, specialties] = await Promise.all([
    db.organization.findFirst({ where: { id: ctx.organizationId }, select: { name: true, address: true, phone: true, email: true, website: true } }),
    getAvailableSpecialties(ctx.organizationId),
  ]);
  const departments = dedupeCI(specialties);
  return {
    name: org?.name ?? 'the hospital',
    address: org?.address ?? null,
    phone: org?.phone ?? null,
    email: org?.email ?? null,
    website: org?.website ?? null,
    departments,
    message: `${org?.name ?? 'The hospital'} has these departments: ${departments.join(', ') || 'not configured'}.`,
  };
}

export async function findDoctors(ctx: VoiceCtx, args: { department?: string } = {}) {
  const department = args.department;
  const res = await getDoctorsBySpecialty(ctx.organizationId, department ? { specialty: department, available: true } : { available: true });
  if (!res.success) return { doctors: [], message: 'Could not fetch doctors right now.' };
  if (res.doctors.length === 0) {
    const specialties = dedupeCI(await getAvailableSpecialties(ctx.organizationId));
    return {
      doctors: [],
      availableDepartments: specialties,
      message: department
        ? `No doctors found for "${department}". Available departments are: ${specialties.join(', ')}.`
        : 'No doctors are currently listed.',
    };
  }
  const list = res.doctors.map((d) => ({ name: d.name, department: d.specialty, consultationFee: d.consultationFee, workingHours: d.workingHours }));
  return {
    doctors: list,
    message: list.map((d) => `${d.name} (${d.department}), consultation fee ₹${d.consultationFee}, hours ${d.workingHours}`).join('; '),
  };
}

export async function getDoctorAvailability(ctx: VoiceCtx, args: { doctorName?: string; date?: string } = {}) {
  const db = getTenantPrisma(ctx.organizationId);
  if (!args.doctorName?.trim()) {
    return { available: false, message: 'Which doctor? Ask the caller for the doctor or department name.' };
  }
  const doc = await findDoctorByName(db, args.doctorName);
  if (!doc) {
    return { available: false, message: `No doctor named "${args.doctorName}" was found. Offer to list doctors by department.` };
  }
  const dateStr = resolveDate(args.date);

  if (await isDoctorOnLeave(db, doc.id, dateStr)) {
    const next = await findNextAvailableDate(ctx.organizationId, doc.id, dateStr, 10);
    return {
      available: false,
      doctor: doc.name,
      date: dateStr,
      message: `${doc.name} is on leave on ${dateStr}.${next ? ` The next available date is ${next}.` : ' No availability in the next 10 days.'}`,
    };
  }

  const slotsRes = await getAvailableSlotsForDoctor(ctx.organizationId, doc.id, dateStr);
  const openSlots = (slotsRes.slots as any[]).filter((s) => s.isAvailable !== false);

  if (openSlots.length === 0) {
    const next = await findNextAvailableDate(ctx.organizationId, doc.id, dateStr, 10);
    return {
      available: false,
      doctor: doc.name,
      date: dateStr,
      message: `${doc.name} has no open slots on ${dateStr}.${next ? ` The next available date is ${next}.` : ' No availability in the next 10 days.'}`,
    };
  }

  const times = openSlots.slice(0, 8).map((s) => to12h(s.startTime));
  return {
    available: true,
    doctor: doc.name,
    department: doc.specialty,
    date: dateStr,
    slots: times,
    message: `${doc.name} is available on ${dateStr} at: ${times.join(', ')}. Do NOT book yet — booking is confirmed in a later step.`,
  };
}

/** OPD open? (Asia/Kolkata, 9am–6pm) + whether a live transfer is possible now. */
export function getClinicStatus() {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()),
    10,
  );
  const open = hour >= 9 && hour < 18;
  const transferAvailable = open && staffTransferConfigured();
  return {
    open,
    transferAvailable,
    message: open
      ? (transferAvailable ? 'The OPD is open and a staff member can be connected.' : 'The OPD is open, but live transfer is unavailable — offer a callback.')
      : 'The OPD is currently closed — offer to log a callback for the next working hours.',
  };
}

// ── Write functions ───────────────────────────────────────────────────────────

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

  const hospital = await orgName(db, ctx.organizationId);
  void notifyPatient(
    { email: patient.email, phone: patient.phone },
    { type: 'appointment', patientName: patient.name, doctorName: doc.name ?? 'the doctor', department: doc.specialty ?? 'OPD', date: dateStr, time: to12h(wantTime), hospitalName: hospital },
    hospital,
    ctx.organizationId,
  ).catch(() => {});

  return {
    appointmentId: result.appointmentId,
    message: `Booked. ${patient.name} is confirmed with ${doc.name} on ${dateStr} at ${to12h(wantTime)}. Please pay at the hospital reception. The appointment reference is ${result.appointmentId}. A confirmation will be sent by SMS.`,
  };
}

export async function registerPatient(ctx: VoiceCtx, args: { fullName?: string; email?: string; phone?: string }) {
  const db = getTenantPrisma(ctx.organizationId);

  const email = normalizeEmail(args.email);
  const emailValid = email ? isValidEmail(email) : false;
  const digits = (args.phone ?? ctx.callerPhone ?? '').replace(/\D/g, '');
  const phone = digits.length >= 10 ? digits.slice(-10) : digits || null;

  // Repeat calls in the same session are CORRECTIONS (fix email/name) — update, never duplicate.
  const existingLog = ctx.callId
    ? await db.callLog.findFirst({ where: { provider_call_id: ctx.callId }, select: { patient_id: true } })
    : null;

  if (existingLog?.patient_id) {
    const data: Record<string, any> = {};
    if (args.fullName?.trim()) data.full_name = args.fullName.trim();
    if (emailValid) data.email = email;
    if (phone && phone.length >= 8) data.phone = phone;
    if (Object.keys(data).length) await db.oPD_REG.updateMany({ where: { patient_id: existingLog.patient_id }, data });
    const p = await db.oPD_REG.findFirst({ where: { patient_id: existingLog.patient_id }, select: { patient_id: true, full_name: true, phone: true, email: true } });
    return {
      patientId: p?.patient_id,
      message: `Updated. I have ${p?.full_name}, mobile ${p?.phone ?? 'not set'}${p?.email ? `, email ${p.email}` : ''}. Which doctor and time would you like to book?`,
    };
  }

  if (!args.fullName?.trim()) return { message: 'What is your full name, so I can register you?' };
  if (!phone || phone.length < 8) return { message: 'Please tell me your mobile number once more, and I will register you.' };

  const cfg = await db.organizationConfig.findUnique({ where: { organizationId: ctx.organizationId }, select: { uhid_prefix: true } }).catch(() => null);
  const uhid = await generateUHID(db as any, cfg?.uhid_prefix || 'AVN');

  await db.oPD_REG.create({
    data: {
      patient_id: uhid,
      full_name: args.fullName.trim(),
      phone,
      email: emailValid ? email : null,
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

  const emailPart = emailValid
    ? ` Your email is ${email} — please tell me if that's wrong.`
    : (args.email ? ' I could not capture the email clearly; we can add it at reception.' : '');
  return {
    patientId: uhid,
    message: `Thank you, ${args.fullName.trim()}. You're registered with mobile number ${phone}.${emailPart} Now, which doctor and time would you like to book?`,
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

  const doc = args.doctorName?.trim()
    ? await findDoctorByName(db, args.doctorName)
    : await db.user.findFirst({ where: { id: appt.doctor_id ?? undefined }, select: { id: true, name: true, specialty: true } });
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
    console.error('[VoiceCore] reschedule failed:', e);
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
    console.error('[VoiceCore] cancel failed:', e);
    return { message: 'The cancellation could not be completed right now.' };
  }

  await updateCallLog(db, ctx.callId, { appointment_id: appt.appointment_id, patient_id: patient.patientId, outcome: 'Cancelled' });

  return { message: `Your appointment with ${appt.doctor_name ?? 'the doctor'} has been cancelled. Is there anything else I can help with?` };
}

function leadNumber(): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `LEAD-${d}-${rand}`;
}

/**
 * Log a callback request (the safety net so a call is NEVER dropped). Creates a
 * CRMLead for staff follow-up and links it to the CallLog.
 */
export async function requestCallback(ctx: VoiceCtx, args: { reason?: string; department?: string }) {
  const db = getTenantPrisma(ctx.organizationId);

  let name = 'Phone caller';
  let patientId: string | null = null;
  let phone = normalizePhone(ctx.callerPhone);
  if (ctx.callId) {
    const log = await db.callLog.findFirst({
      where: { provider_call_id: ctx.callId },
      select: { patient_id: true, patient_name: true, patient_phone: true, from_number: true },
    });
    if (log) {
      name = log.patient_name || name;
      patientId = log.patient_id ?? null;
      phone = phone || normalizePhone(log.from_number ?? log.patient_phone);
    }
  }

  const lead = await db.cRMLead.create({
    data: {
      lead_number: leadNumber(),
      name,
      phone: phone || 'unknown',
      source: 'voice_ai',
      source_detail: 'AI voice call — callback requested',
      status: 'New',
      department_interest: args.department || null,
      notes: args.reason || 'Caller requested a callback from staff.',
      patient_id: patientId,
    },
  });

  await updateCallLog(db, ctx.callId, { callback_lead_id: lead.id, outcome: 'Callback', handoff_status: 'callback_created' });

  return { callbackLeadId: lead.id, message: 'I have logged a callback request, and our staff will call you back shortly. Is there anything else I can help you with?' };
}
