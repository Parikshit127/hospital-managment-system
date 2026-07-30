/**
 * POST /api/voice/v1/call-events — Bolna posts call status + end-of-call
 * transcript. HMAC-verified (X-Voice-Signature / VOICE_WEBHOOK_SECRET). Writes
 * CallLog (provider='bolna') + CallTranscript, idempotent on the Bolna call id.
 */
import { NextResponse } from 'next/server';
import { verifyWebhookSignature, getVoiceOrgId } from '@/app/lib/voice/api-auth';
import { handleBolnaCallEvent } from '@/app/lib/voice/bolna-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const organizationId = getVoiceOrgId();
  if (!organizationId) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const result = await handleBolnaCallEvent(body, organizationId);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] call-events error:', e);
    return NextResponse.json({ error: 'call-events failed' }, { status: 500 });
  }
}

// Lightweight reachability check (no data exposed).
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'call-events' });
}
