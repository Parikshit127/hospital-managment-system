/**
 * app/lib/voice/bolna-events.ts — Bolna call-events → CallLog + CallTranscript
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists the call lifecycle + transcript from Bolna's webhook. Transcript-only
 * (no audio). Idempotent on the Bolna call id (stored as CallLog.provider_call_id).
 *
 * ⚠️ Bolna's exact payload field names are not yet confirmed (plan §8). This
 * mapper is deliberately defensive — it accepts several common shapes. Once a
 * real Bolna payload sample is available, tighten the `pick*`/`mapTranscript`
 * helpers below; nothing else needs to change.
 */

import { prisma } from '@/backend/db';

const AGENT_ID = 'ai-voice-assistant';

function pickCallId(b: any): string | null {
  return b?.id ?? b?.call_id ?? b?.callId ?? b?.execution_id ?? b?.conversation_id ?? null;
}

function pickNumbers(b: any): { from: string | null; to: string | null } {
  const t = b?.telephony_data ?? b?.telephony ?? {};
  return {
    from: b?.from_number ?? b?.from ?? t?.from_number ?? t?.from ?? b?.customer?.number ?? null,
    to: b?.to_number ?? b?.to ?? t?.to_number ?? t?.to ?? null,
  };
}

function pickDuration(b: any): number | null {
  const t = b?.telephony_data ?? {};
  const d = b?.duration ?? b?.conversation_duration ?? b?.call_duration ?? t?.duration ?? t?.conversation_duration;
  if (d == null) return null;
  const n = typeof d === 'number' ? d : Number(d);
  return isNaN(n) ? null : Math.round(n);
}

function mapStatus(s?: string): string {
  const x = (s ?? '').toString().toLowerCase();
  if (x.includes('ring') || x === 'queued' || x === 'initiated' || x === 'scheduled') return 'ringing';
  if (x.includes('progress') || x === 'ongoing' || x === 'in-call' || x === 'answered') return 'in_progress';
  if (x === 'completed' || x === 'ended' || x === 'call_ended' || x === 'hangup') return 'completed';
  if (x.includes('fail') || x.includes('error') || x === 'busy' || x === 'no-answer') return 'failed';
  return 'in_progress';
}

/** Map Bolna's transcript (array of turns or a plain string) → our turns + summary. */
function mapTranscript(b: any): { turns: Array<{ role: string; text: string }>; summary: string | null } {
  const summary = b?.summary ?? b?.analysis?.summary ?? b?.extracted_data?.summary ?? null;
  const raw = b?.transcript ?? b?.messages ?? b?.conversation ?? null;

  if (Array.isArray(raw)) {
    const turns = raw
      .map((m: any) => {
        const role = (m?.role ?? m?.speaker ?? '').toString().toLowerCase();
        const text = m?.content ?? m?.text ?? m?.message ?? '';
        const mapped =
          role === 'user' || role === 'human' || role === 'caller' ? 'caller'
          : role === 'assistant' || role === 'agent' || role === 'bot' ? 'assistant'
          : role || 'assistant';
        return { role: mapped, text: String(text) };
      })
      .filter((t) => t.text.trim().length > 0);
    return { turns, summary };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { turns: [], summary: summary ?? raw.trim() };
  }
  return { turns: [], summary: summary ?? null };
}

function isCompletion(b: any, turns: number, hasSummary: boolean): boolean {
  const s = (b?.status ?? '').toString().toLowerCase();
  return ['completed', 'ended', 'call_ended', 'hangup'].includes(s) || turns > 0 || hasSummary || !!b?.end_time || !!b?.ended_at;
}

export async function handleBolnaCallEvent(body: any, organizationId: string) {
  const callId = pickCallId(body);
  if (!callId) return { received: true, note: 'no call id in payload' };

  const { from, to } = pickNumbers(body);
  const { turns, summary } = mapTranscript(body);
  const completion = isCompletion(body, turns.length, !!summary);
  const status = completion ? 'completed' : mapStatus(body?.status);
  const duration = pickDuration(body);
  const startedAt = body?.start_time ?? body?.started_at ?? null;
  const endedAt = body?.end_time ?? body?.ended_at ?? (completion ? new Date().toISOString() : null);

  const callLog = await prisma.callLog.upsert({
    where: { provider_call_id: callId },
    create: {
      organizationId,
      agent_id: AGENT_ID,
      channel: 'voice_ai',
      direction: 'inbound',
      provider: 'bolna',
      provider_call_id: callId,
      patient_phone: from ?? 'unknown',
      from_number: from ?? null,
      to_number: to ?? null,
      call_type: 'Inbound',
      outcome: 'Enquiry', // neutral default; the write tools set the real outcome mid-call
      status,
      duration_seconds: duration,
      started_at: startedAt ? new Date(startedAt) : null,
      ended_at: endedAt ? new Date(endedAt) : null,
    },
    update: {
      status,
      ...(from ? { from_number: from, patient_phone: from } : {}),
      ...(to ? { to_number: to } : {}),
      ...(duration != null ? { duration_seconds: duration } : {}),
      ...(startedAt ? { started_at: new Date(startedAt) } : {}),
      ...(endedAt ? { ended_at: new Date(endedAt) } : {}),
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
