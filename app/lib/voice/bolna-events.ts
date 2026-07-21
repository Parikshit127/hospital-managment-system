/**
 * app/lib/voice/bolna-events.ts — Bolna call-events → CallLog + CallTranscript
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists the call lifecycle + transcript from Bolna's webhook. Transcript-only
 * (no audio). Idempotent on the Bolna execution id (stored as CallLog.provider_call_id).
 *
 * Payload shape confirmed from a real Bolna "completed" webhook (2026):
 *   { id, agent_id, status, conversation_duration, summary, error_message,
 *     transcript: "assistant: ...\nuser: ...\n",         // a NEWLINE STRING, not an array
 *     user_number, agent_number, created_at_str, updated_at_str,
 *     extracted_data: { user_name, ... },
 *     context_details: { recipient_data: { name }, recipient_phone_number },
 *     telephony_data: { from_number, to_number, recording_url, provider_call_id,
 *                       call_type, provider, ... } }
 * The pick* helpers keep defensive fallbacks so a schema tweak won't break ingest.
 */

import { prisma } from '@/backend/db';

const AGENT_ID = 'ai-voice-assistant';

function pickCallId(b: any): string | null {
  return (
    b?.id ??
    b?.telephony_data?.provider_call_id ??
    b?.call_id ??
    b?.callId ??
    b?.execution_id ??
    b?.conversation_id ??
    null
  );
}

function pickNumbers(b: any): { from: string | null; to: string | null } {
  const t = b?.telephony_data ?? b?.telephony ?? {};
  // Inbound: caller = user_number = telephony from_number; hospital = agent_number = to_number.
  return {
    from: b?.user_number ?? t?.from_number ?? b?.from_number ?? b?.from ?? b?.context_details?.recipient_phone_number ?? null,
    to: b?.agent_number ?? t?.to_number ?? b?.to_number ?? b?.to ?? null,
  };
}

function pickName(b: any): string | null {
  const n = b?.extracted_data?.user_name ?? b?.context_details?.recipient_data?.name ?? b?.patient_name ?? null;
  const s = (n ?? '').toString().trim();
  return s.length ? s : null;
}

function pickDuration(b: any): number | null {
  const t = b?.telephony_data ?? {};
  const d = b?.conversation_duration ?? b?.duration ?? b?.call_duration ?? t?.duration;
  if (d == null) return null;
  const n = typeof d === 'number' ? d : Number(d);
  return isNaN(n) ? null : Math.round(n);
}

/** ISO-ish string → Date, tolerant of Bolna's microsecond, tz-less timestamps. */
function toDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function mapRole(raw: string): 'caller' | 'assistant' {
  const r = raw.toLowerCase();
  if (r === 'user' || r === 'human' || r === 'caller' || r === 'customer') return 'caller';
  return 'assistant'; // assistant | agent | bot | system → assistant side
}

function mapStatus(s?: string): string {
  const x = (s ?? '').toString().toLowerCase();
  if (x.includes('ring') || x === 'queued' || x === 'initiated' || x === 'scheduled') return 'ringing';
  if (x.includes('progress') || x === 'ongoing' || x === 'in-call' || x === 'answered') return 'in_progress';
  if (x === 'completed' || x === 'ended' || x === 'call_ended' || x === 'hangup') return 'completed';
  if (x.includes('fail') || x.includes('error') || x === 'busy' || x === 'no-answer') return 'failed';
  return 'in_progress';
}

/** Parse Bolna's "role: text" newline transcript into turns; also accepts an array. */
function mapTranscript(b: any): { turns: Array<{ role: string; text: string }>; summary: string | null } {
  const summary = (b?.summary ?? b?.analysis?.summary ?? null) || null;
  const raw = b?.transcript ?? b?.messages ?? b?.conversation ?? null;

  if (Array.isArray(raw)) {
    const turns = raw
      .map((m: any) => ({
        role: mapRole((m?.role ?? m?.speaker ?? '').toString()),
        text: String(m?.content ?? m?.text ?? m?.message ?? '').trim(),
      }))
      .filter((t) => t.text.length > 0);
    return { turns, summary };
  }

  if (typeof raw === 'string' && raw.trim()) {
    const roleRe = /^(assistant|agent|bot|system|user|human|caller|customer)\s*:\s*(.*)$/i;
    const turns: Array<{ role: string; text: string }> = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(roleRe);
      if (m) {
        turns.push({ role: mapRole(m[1]), text: m[2] });
      } else if (turns.length) {
        turns[turns.length - 1].text += '\n' + line; // continuation of previous turn
      }
    }
    const cleaned = turns.map((t) => ({ role: t.role, text: t.text.trim() })).filter((t) => t.text.length > 0);
    return { turns: cleaned, summary };
  }

  return { turns: [], summary };
}

function buildNotes(b: any): string | null {
  const rec = b?.telephony_data?.recording_url ?? b?.recording_url ?? null;
  const err = (b?.error_message ?? '').toString().trim();
  const parts: string[] = [];
  if (rec) parts.push(`recording: ${rec}`);
  if (err) parts.push(`error: ${err}`);
  return parts.length ? parts.join(' | ') : null;
}

export async function handleBolnaCallEvent(body: any, organizationId: string) {
  const callId = pickCallId(body);
  if (!callId) return { received: true, note: 'no call id in payload' };

  const { from, to } = pickNumbers(body);
  const name = pickName(body);
  const { turns, summary } = mapTranscript(body);
  const status = mapStatus(body?.status);
  const duration = pickDuration(body);
  const notes = buildNotes(body);

  const callType = (body?.telephony_data?.call_type ?? 'inbound').toString().toLowerCase();
  const direction = callType === 'outbound' ? 'outbound' : 'inbound';

  const startedAt = toDate(body?.created_at_str ?? body?.initiated_at ?? body?.start_time ?? body?.started_at);
  const endedAt =
    toDate(body?.updated_at_str ?? body?.end_time ?? body?.ended_at) ?? (status === 'completed' ? new Date() : null);

  const callLog = await prisma.callLog.upsert({
    where: { provider_call_id: callId },
    create: {
      organizationId,
      agent_id: AGENT_ID,
      channel: 'voice_ai',
      direction,
      provider: 'bolna',
      provider_call_id: callId,
      patient_phone: from ?? 'unknown',
      patient_name: name,
      from_number: from ?? null,
      to_number: to ?? null,
      call_type: direction === 'outbound' ? 'Outbound' : 'Inbound',
      outcome: 'Enquiry', // neutral default; refined once call_id is threaded into the tool calls
      status,
      duration_seconds: duration,
      notes,
      started_at: startedAt,
      ended_at: endedAt,
    },
    update: {
      status,
      ...(from ? { from_number: from, patient_phone: from } : {}),
      ...(to ? { to_number: to } : {}),
      ...(name ? { patient_name: name } : {}),
      ...(duration != null ? { duration_seconds: duration } : {}),
      ...(notes ? { notes } : {}),
      ...(startedAt ? { started_at: startedAt } : {}),
      ...(endedAt ? { ended_at: endedAt } : {}),
    },
  });

  // Transcript-only PHI store (audio is never persisted).
  if (turns.length > 0 || summary) {
    await prisma.callTranscript.upsert({
      where: { call_log_id: callLog.id },
      create: { organizationId, call_log_id: callLog.id, turns, summary, language: (callLog as any).language ?? null },
      update: { turns, summary },
    });
  }

  prisma.system_audit_logs
    .create({
      data: {
        action: 'VOICE_CALL_RECEIVED',
        module: 'call-center',
        entity_type: 'CallLog',
        entity_id: callLog.id,
        organizationId,
        username: AGENT_ID,
        role: 'system',
        details: JSON.stringify({ provider: 'bolna', provider_call_id: callId, status, duration, turns: turns.length }),
      },
    })
    .catch(() => {});

  return { received: true, callLogId: callLog.id, status, turns: turns.length };
}
