/**
 * app/lib/voice/vapi-tools.ts — LEGACY Vapi adapter (retired in Phase 6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin translation between Vapi's tool-call envelope and the provider-neutral
 * `voice-core.ts`. Kept only so the existing Vapi webhook keeps compiling during
 * the Bolna transition; both this file and `app/api/webhooks/vapi/route.ts` are
 * deleted in Phase 6. New work should call `voice-core.ts` directly via the
 * `/api/voice/v1/*` endpoints.
 */

import {
  type VoiceCtx,
  lookupCaller,
  verifyCallerName,
  getHospitalInfo,
  findDoctors,
  getDoctorAvailability,
  getClinicStatus,
  bookAppointment,
  registerPatient,
  rescheduleAppointment,
  cancelAppointment,
  requestCallback,
} from './voice-core';

interface ToolResult {
  toolCallId: string;
  result: any;
}

/** Normalize a Vapi tool call to { id, name, args } (supports nested + flat shapes). */
function parseToolCall(tc: any): { id: string; name: string; args: Record<string, any> } {
  const name = tc?.function?.name ?? tc?.name ?? '';
  let args = tc?.function?.arguments ?? tc?.arguments ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  return { id: tc?.id, name, args: args ?? {} };
}

async function runTool(name: string, args: Record<string, any>, ctx: VoiceCtx) {
  switch (name) {
    case 'lookup_caller':
      return lookupCaller(ctx, { phone: args?.phone });
    case 'verify_caller_name':
      return verifyCallerName(ctx, { name: args?.name, phone: args?.phone });
    case 'get_hospital_info':
      return getHospitalInfo(ctx);
    case 'find_doctors':
      return findDoctors(ctx, { department: args?.department });
    case 'get_doctor_availability':
      return getDoctorAvailability(ctx, { doctorName: args?.doctorName, date: args?.date });
    case 'book_appointment':
      return bookAppointment(ctx, { doctorName: args?.doctorName, date: args?.date, time: args?.time, reason: args?.reason });
    case 'register_patient':
      return registerPatient(ctx, { fullName: args?.fullName, email: args?.email, phone: args?.phone });
    case 'reschedule_appointment':
      return rescheduleAppointment(ctx, { newDate: args?.newDate, newTime: args?.newTime, doctorName: args?.doctorName });
    case 'cancel_appointment':
      return cancelAppointment(ctx, { reason: args?.reason });
    case 'get_clinic_status':
      return getClinicStatus();
    case 'request_callback':
      return requestCallback(ctx, { reason: args?.reason, department: args?.department });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Handle a Vapi `tool-calls` server message → the { results } body Vapi expects. */
export async function handleVapiToolCalls(message: any, organizationId: string): Promise<{ results: ToolResult[] }> {
  const rawCalls: any[] = message?.toolCallList ?? message?.toolCalls ?? [];
  const callerPhone: string | null = message?.call?.customer?.number ?? message?.customer?.number ?? null;
  const callId: string | null = message?.call?.id ?? null;

  const results = await Promise.all(
    rawCalls.map(async (raw) => {
      const { id, name, args } = parseToolCall(raw);
      try {
        const out = await runTool(name, args, { organizationId, callerPhone, callId });
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
