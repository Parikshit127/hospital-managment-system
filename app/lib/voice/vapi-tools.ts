/**
 * app/lib/voice/vapi-tools.ts — AI Voice Call Assistant · Phase 3
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only "tools" the Vapi assistant can call mid-conversation (function
 * calling). These let the AI answer with REAL hospital data instead of guessing:
 *   • lookup_caller          — is this caller ID a known patient? (no name leak)
 *   • verify_caller_name     — confirm a spoken name against the matched record
 *   • get_hospital_info      — org address/phone + department list (FAQ)
 *   • find_doctors           — doctors (optionally by department) with fees/hours
 *   • get_doctor_availability— live slots for a doctor on a date (+ leave check)
 *
 * Read-only: these NEVER create patients or appointments. (Availability may
 * lazily materialize slot rows via getOrCreateDailySlots — the same benign
 * behavior the staff/patient calendars already use.)
 *
 * All queries are org-scoped via getTenantPrisma(organizationId). The caller's
 * phone always comes from the call's caller-ID metadata, never from the LLM.
 */

import { getTenantPrisma } from '@/backend/db';
import { getDoctorsBySpecialty, getAvailableSpecialties } from '@/lib/booking/doctor-service';
import { getAvailableSlotsForDoctor, findNextAvailableDate } from '@/lib/booking/slot-service';
import {
  bookAppointment,
  registerPatient as registerPatientTool,
  rescheduleAppointment,
  cancelAppointment,
  type VoiceCtx,
} from './vapi-booking';

interface ToolResult {
  toolCallId: string;
  result: any;
}

/**
 * Normalize a Vapi tool call to { id, name, args }. Vapi sends OpenAI-style
 * nesting: { id, type:'function', function:{ name, arguments } } — but older
 * docs show a flat { id, name, arguments }. Support both, and parse arguments
 * whether they arrive as an object or a JSON string.
 */
function parseToolCall(tc: any): { id: string; name: string; args: Record<string, any> } {
  const name = tc?.function?.name ?? tc?.name ?? '';
  let args = tc?.function?.arguments ?? tc?.arguments ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  return { id: tc?.id, name, args: args ?? {} };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Last-10-digits normalization, mirroring checkDuplicatePatient(). */
function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

/** Today's (or offset) date as YYYY-MM-DD in Asia/Kolkata. */
function istDate(offsetDays = 0): string {
  const t = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(t);
}

/** Resolve a loose date argument ("today"/"tomorrow"/ISO) to YYYY-MM-DD. */
function resolveDate(arg?: string): string {
  if (!arg) return istDate(0);
  const a = arg.trim().toLowerCase();
  if (a === 'today') return istDate(0);
  if (a === 'tomorrow') return istDate(1);
  const parsed = new Date(arg);
  if (!isNaN(parsed.getTime())) return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(parsed);
  return istDate(0);
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

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
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
    where: {
      doctor_id: doctorId,
      is_approved: true,
      from_date: { lte: date },
      to_date: { gte: date },
    },
    select: { id: true },
  });
  return !!leave;
}

// ── Individual tools (each returns a speakable result for the assistant) ──────

async function lookupCaller(organizationId: string, callerPhone: string | null, phoneArg?: string) {
  const phone = normalizePhone(phoneArg ?? callerPhone);
  if (!phone) {
    return { found: false, message: 'No caller ID available. Ask the caller for their 10-digit phone number and their name to look them up.' };
  }
  const db = getTenantPrisma(organizationId);
  const matches = await db.oPD_REG.findMany({
    where: { phone: { contains: phone } },
    select: { patient_id: true },
    take: 5,
  });
  if (matches.length === 0) {
    return { found: false, message: 'No patient record is registered to this number. Treat as a new caller — ask for their name to register.' };
  }
  // Do NOT reveal the name to an unverified caller. Ask them to state it.
  return {
    found: true,
    count: matches.length,
    message: `A patient record exists for this number. To verify identity, ask the caller to say their full name, then call verify_caller_name.`,
  };
}

async function verifyCallerName(organizationId: string, callerPhone: string | null, spokenName?: string, callId?: string | null, phoneArg?: string) {
  const phone = normalizePhone(phoneArg ?? callerPhone);
  if (!phone || !spokenName?.trim()) {
    return { verified: false, message: 'Need both a 10-digit phone number and a spoken name to verify. Ask the caller for whichever is missing.' };
  }
  const db = getTenantPrisma(organizationId);
  const matches = await db.oPD_REG.findMany({
    where: { phone: { contains: phone } },
    select: { patient_id: true, full_name: true },
    take: 10,
  });

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  const said = norm(spokenName);
  const hit = matches.find((m: any) => {
    const full = norm(m.full_name ?? '');
    if (!full) return false;
    // match if either contains the other, or they share the first name
    return full === said || full.includes(said) || said.includes(full) || full.split(' ')[0] === said.split(' ')[0];
  });

  if (!hit) {
    return {
      verified: false,
      message: 'The spoken name does not match the record on this number. Treat as unverified — do not disclose any details; offer to register them as a new patient.',
    };
  }
  // Persist the verified identity on this call so booking/reschedule/cancel can
  // act on the correct patient (important when a number has multiple records).
  if (callId) {
    await db.callLog
      .updateMany({
        where: { provider_call_id: callId },
        data: { patient_id: hit.patient_id, patient_name: hit.full_name, verification_status: 'name_confirmed' },
      })
      .catch(() => {});
  }
  return {
    verified: true,
    patientId: hit.patient_id,
    patientName: hit.full_name,
    message: `Identity confirmed for ${hit.full_name} (${hit.patient_id}). You may proceed to help them.`,
  };
}

async function getHospitalInfo(organizationId: string) {
  const db = getTenantPrisma(organizationId);
  const [org, specialties] = await Promise.all([
    db.organization.findFirst({
      where: { id: organizationId },
      select: { name: true, address: true, phone: true, email: true, website: true },
    }),
    getAvailableSpecialties(organizationId),
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

async function findDoctors(organizationId: string, department?: string) {
  const res = await getDoctorsBySpecialty(organizationId, department ? { specialty: department, available: true } : { available: true });
  if (!res.success) return { doctors: [], message: 'Could not fetch doctors right now.' };
  if (res.doctors.length === 0) {
    const specialties = dedupeCI(await getAvailableSpecialties(organizationId));
    return {
      doctors: [],
      availableDepartments: specialties,
      message: department
        ? `No doctors found for "${department}". Available departments are: ${specialties.join(', ')}.`
        : 'No doctors are currently listed.',
    };
  }
  const list = res.doctors.map((d) => ({
    name: d.name,
    department: d.specialty,
    consultationFee: d.consultationFee,
    workingHours: d.workingHours,
  }));
  return {
    doctors: list,
    message: list
      .map((d) => `${d.name} (${d.department}), consultation fee ₹${d.consultationFee}, hours ${d.workingHours}`)
      .join('; '),
  };
}

async function getDoctorAvailability(organizationId: string, args: { doctorName?: string; date?: string }) {
  const db = getTenantPrisma(organizationId);
  if (!args.doctorName?.trim()) {
    return { available: false, message: 'Which doctor? Ask the caller for the doctor or department name.' };
  }
  const doc = await findDoctorByName(db, args.doctorName);
  if (!doc) {
    return { available: false, message: `No doctor named "${args.doctorName}" was found. Offer to list doctors by department.` };
  }

  const dateStr = resolveDate(args.date);

  if (await isDoctorOnLeave(db, doc.id, dateStr)) {
    const next = await findNextAvailableDate(organizationId, doc.id, dateStr, 10);
    return {
      available: false,
      doctor: doc.name,
      date: dateStr,
      message: `${doc.name} is on leave on ${dateStr}.${next ? ` The next available date is ${next}.` : ' No availability in the next 10 days.'}`,
    };
  }

  const slotsRes = await getAvailableSlotsForDoctor(organizationId, doc.id, dateStr);
  const openSlots = (slotsRes.slots as any[]).filter((s) => s.isAvailable !== false);

  if (openSlots.length === 0) {
    const next = await findNextAvailableDate(organizationId, doc.id, dateStr, 10);
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

// ── Dispatcher ───────────────────────────────────────────────────────────────

async function runTool(name: string, args: Record<string, any>, ctx: VoiceCtx) {
  switch (name) {
    // ── Read-only (Phase 3) ──
    case 'lookup_caller':
      return lookupCaller(ctx.organizationId, ctx.callerPhone, args?.phone);
    case 'verify_caller_name':
      return verifyCallerName(ctx.organizationId, ctx.callerPhone, args?.name, ctx.callId, args?.phone);
    case 'get_hospital_info':
      return getHospitalInfo(ctx.organizationId);
    case 'find_doctors':
      return findDoctors(ctx.organizationId, args?.department);
    case 'get_doctor_availability':
      return getDoctorAvailability(ctx.organizationId, { doctorName: args?.doctorName, date: args?.date });
    // ── Write path (Phase 4) ──
    case 'book_appointment':
      return bookAppointment(ctx, { doctorName: args?.doctorName, date: args?.date, time: args?.time, reason: args?.reason });
    case 'register_patient':
      return registerPatientTool(ctx, { fullName: args?.fullName, email: args?.email, phone: args?.phone });
    case 'reschedule_appointment':
      return rescheduleAppointment(ctx, { newDate: args?.newDate, newTime: args?.newTime, doctorName: args?.doctorName });
    case 'cancel_appointment':
      return cancelAppointment(ctx, { reason: args?.reason });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Handle a Vapi `tool-calls` server message. Returns the { results } body Vapi
 * expects, matching each toolCallId. Caller phone is read from call metadata.
 */
export async function handleVapiToolCalls(message: any, organizationId: string): Promise<{ results: ToolResult[] }> {
  const rawCalls: any[] = message?.toolCallList ?? message?.toolCalls ?? [];
  const callerPhone: string | null =
    message?.call?.customer?.number ?? message?.customer?.number ?? null;
  const callId: string | null = message?.call?.id ?? null;

  const results = await Promise.all(
    rawCalls.map(async (raw) => {
      const { id, name, args } = parseToolCall(raw);
      try {
        const out = await runTool(name, args, { organizationId, callerPhone, callId });
        // Return a speakable string result — most reliable for the assistant.
        const result = (out && typeof out === 'object' && 'message' in out) ? (out as any).message : out;
        return { toolCallId: id, result };
      } catch (err) {
        console.error(`[Vapi Tools] ${name} failed:`, err);
        return { toolCallId: id, result: 'Sorry, there was a problem fetching that. Tell the caller a staff member will help.' };
      }
    }),
  );

  return { results };
}
