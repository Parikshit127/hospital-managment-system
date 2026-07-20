/**
 * app/api/webhooks/vapi/route.ts — AI Voice Call Assistant · Phase 2
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives Vapi server messages for the hospital phone line and persists the
 * call lifecycle + transcript. This is a public webhook (no user session) so it
 * is authenticated by a shared secret / HMAC, and the organization is resolved
 * from VOICE_AI_ORG_ID (single-org deployment).
 *
 * Storage policy: TRANSCRIPT-ONLY. Recording is disabled at Vapi and we never
 * persist artifact.recording — only the text transcript lands in CallTranscript.
 *
 * Vapi envelope: { message: { type, call, ... } }. We handle:
 *   • status-update      → create/refresh the CallLog as the call progresses
 *   • end-of-call-report → finalize the CallLog + persist the transcript
 * All other event types are acknowledged (200) and ignored.
 *
 * Idempotency: keyed on message.call.id → CallLog.provider_call_id (unique), so
 * retried/duplicate deliveries never create duplicate rows.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/backend/db';
import { handleVapiToolCalls } from '@/app/lib/voice/vapi-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_ID = 'ai-voice-assistant';

// ── Auth ─────────────────────────────────────────────────────────────────────

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Accept EITHER a plain shared-secret header (X-Vapi-Secret === secret) OR an
 * HMAC-SHA256 signature (X-Vapi-Signature) of the raw body — Vapi's mechanism
 * varies by account/version, so we support both. Fails closed if no secret is
 * configured.
 */
function verifyVapiRequest(rawBody: string, headers: Headers): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Vapi Webhook] VAPI_WEBHOOK_SECRET not set — rejecting');
    return false;
  }

  // (a) plain shared-secret header
  const plain = headers.get('x-vapi-secret');
  if (plain && timingSafeEqualStr(plain, secret)) return true;

  // (b) Authorization header (Vapi "Credential" / Bearer Token) — accept
  //     "Bearer <secret>" or a raw "<secret>"
  const auth = headers.get('authorization');
  if (auth) {
    const token = auth.replace(/^Bearer\s+/i, '');
    if (timingSafeEqualStr(token, secret)) return true;
  }

  // (c) HMAC-SHA256 signature of the raw body
  const sig = headers.get('x-vapi-signature');
  if (sig) {
    const hex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (timingSafeEqualStr(sig, hex)) return true;
    const b64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    if (timingSafeEqualStr(sig, b64)) return true;
  }

  return false;
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

/** Map a Vapi call status to our CallLog.status vocabulary. */
function mapStatus(vapiStatus?: string): string {
  switch (vapiStatus) {
    case 'ringing':
    case 'queued':
    case 'scheduled':
      return 'ringing';
    case 'in-progress':
      return 'in_progress';
    case 'forwarding':
      return 'transferred';
    case 'ended':
      return 'completed';
    default:
      return 'in_progress';
  }
}

/** Derive a call outcome from Vapi's endedReason when we don't have a better one. */
function outcomeFromEndedReason(endedReason?: string): string | null {
  if (!endedReason) return null;
  const r = endedReason.toLowerCase();
  if (r.includes('no-answer') || r.includes('did-not-answer')) return 'NoAnswer';
  if (r.includes('busy')) return 'Busy';
  return null; // leave the existing outcome untouched
}

interface VapiArtifactMessage {
  role?: string;
  message?: string;
  time?: number;
}

/** Convert Vapi artifact.messages into our transcript turns (caller/assistant). */
function toTurns(messages: VapiArtifactMessage[] | undefined) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'bot')
    .map((m) => ({
      role: m.role === 'user' ? 'caller' : 'assistant',
      text: m.message ?? '',
      ts: m.time ?? null,
    }))
    .filter((t) => t.text.trim().length > 0);
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function handleStatusUpdate(msg: any, organizationId: string) {
  const callId: string | undefined = msg?.call?.id;
  if (!callId) return;

  const from: string | undefined = msg?.customer?.number;
  const to: string | undefined = msg?.phoneNumber?.number;
  const status = mapStatus(msg?.status);

  await prisma.callLog.upsert({
    where: { provider_call_id: callId },
    create: {
      organizationId,
      agent_id: AGENT_ID,
      channel: 'voice_ai',
      direction: 'inbound',
      provider: 'vapi',
      provider_call_id: callId,
      patient_phone: from ?? 'unknown',
      from_number: from ?? null,
      to_number: to ?? null,
      call_type: 'Inbound',
      outcome: 'Enquiry', // neutral default until a tool sets the real outcome (Phase 3/4)
      status,
      started_at: status === 'in_progress' ? new Date() : null,
    },
    update: {
      status,
      ...(from ? { from_number: from, patient_phone: from } : {}),
      ...(to ? { to_number: to } : {}),
    },
  });
}

async function handleEndOfCall(msg: any, organizationId: string) {
  const callId: string | undefined = msg?.call?.id;
  if (!callId) return;

  const from: string | undefined = msg?.customer?.number;
  const to: string | undefined = msg?.phoneNumber?.number;
  const startedAt = msg?.startedAt ?? msg?.call?.startedAt;
  const endedAt = msg?.endedAt ?? msg?.call?.endedAt;
  let durationSeconds: number | null =
    typeof msg?.durationSeconds === 'number' ? Math.round(msg.durationSeconds) : null;
  if (durationSeconds == null && startedAt && endedAt) {
    durationSeconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  }

  const derivedOutcome = outcomeFromEndedReason(msg?.endedReason);
  const summary: string | null = msg?.analysis?.summary ?? msg?.summary ?? null;
  const turns = toTurns(msg?.artifact?.messages);

  const callLog = await prisma.callLog.upsert({
    where: { provider_call_id: callId },
    create: {
      organizationId,
      agent_id: AGENT_ID,
      channel: 'voice_ai',
      direction: 'inbound',
      provider: 'vapi',
      provider_call_id: callId,
      patient_phone: from ?? 'unknown',
      from_number: from ?? null,
      to_number: to ?? null,
      call_type: 'Inbound',
      outcome: derivedOutcome ?? 'Enquiry',
      status: 'completed',
      duration_seconds: durationSeconds,
      started_at: startedAt ? new Date(startedAt) : null,
      ended_at: endedAt ? new Date(endedAt) : new Date(),
      notes: msg?.endedReason ? `Ended: ${msg.endedReason}` : null,
    },
    update: {
      status: 'completed',
      duration_seconds: durationSeconds,
      started_at: startedAt ? new Date(startedAt) : undefined,
      ended_at: endedAt ? new Date(endedAt) : new Date(),
      ...(derivedOutcome ? { outcome: derivedOutcome } : {}),
      ...(msg?.endedReason ? { notes: `Ended: ${msg.endedReason}` } : {}),
    },
  });

  // Persist transcript (transcript-only — recording is never stored)
  if (turns.length > 0 || summary) {
    await prisma.callTranscript.upsert({
      where: { call_log_id: callLog.id },
      create: {
        organizationId,
        call_log_id: callLog.id,
        turns,
        summary,
        language: callLog.language ?? null,
      },
      update: { turns, summary },
    });
  }

  // Audit (direct write — no session in a webhook; org resolved from config)
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
        details: JSON.stringify({
          provider_call_id: callId,
          endedReason: msg?.endedReason ?? null,
          durationSeconds,
          turns: turns.length,
        }),
      },
    })
    .catch(() => {});
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (!verifyVapiRequest(rawBody, request.headers)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const organizationId = process.env.VOICE_AI_ORG_ID;
    if (!organizationId) {
      console.error('[Vapi Webhook] VOICE_AI_ORG_ID not set');
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const msg = body?.message;
    const type: string | undefined = msg?.type;
    if (!type) return NextResponse.json({ received: true });

    // Tool calls must return a { results: [...] } body the assistant can use.
    if (type === 'tool-calls') {
      const toolResponse = await handleVapiToolCalls(msg, organizationId);
      return NextResponse.json(toolResponse);
    }

    switch (type) {
      case 'status-update':
        await handleStatusUpdate(msg, organizationId);
        break;
      case 'end-of-call-report':
        await handleEndOfCall(msg, organizationId);
        break;
      default:
        // Acknowledge all other event types (transcript, speech-update, hang, etc.)
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[Vapi Webhook] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Lightweight health check so you can confirm the route + tunnel are reachable
// from a browser. Does not expose any data.
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'vapi-webhook' });
}
