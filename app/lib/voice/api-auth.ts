/**
 * app/lib/voice/api-auth.ts — auth for the /api/voice/v1/* surface
 * ─────────────────────────────────────────────────────────────────────────────
 * These endpoints are called by the Bolna voice agent (separate repo), not by a
 * logged-in user. Two schemes:
 *   • Tool endpoints  → a shared VOICE_API_KEY sent as `Authorization: Bearer <key>`
 *                       (or `X-Voice-Api-Key: <key>`), constant-time compared.
 *   • /call-events    → HMAC-SHA256 of the raw body, secret = VOICE_WEBHOOK_SECRET,
 *                       sent as `X-Voice-Signature` (hex or base64).
 * Org is single-tenant, resolved from VOICE_AI_ORG_ID (never trusted from the body).
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import type { VoiceCtx } from './voice-core';

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function getVoiceOrgId(): string | null {
  return process.env.VOICE_AI_ORG_ID || null;
}

/** Verify the tool-endpoint API key (Authorization: Bearer OR X-Voice-Api-Key). */
export function verifyApiKey(headers: Headers): boolean {
  const key = process.env.VOICE_API_KEY;
  if (!key) {
    console.error('[voice-api] VOICE_API_KEY not set — rejecting');
    return false;
  }
  const bearer = headers.get('authorization');
  if (bearer) {
    const token = bearer.replace(/^Bearer\s+/i, '');
    if (timingSafeEqualStr(token, key)) return true;
  }
  const custom = headers.get('x-voice-api-key');
  if (custom && timingSafeEqualStr(custom, key)) return true;
  return false;
}

/** HMAC-SHA256 verify for the call-events webhook (X-Voice-Signature, hex or base64). */
export function verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[voice-api] VOICE_WEBHOOK_SECRET not set — rejecting');
    return false;
  }
  const sig = headers.get('x-voice-signature');
  if (!sig) return false;
  const hex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (timingSafeEqualStr(sig, hex)) return true;
  const b64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return timingSafeEqualStr(sig, b64);
}

type Guard = { ok: true; organizationId: string } | { ok: false; response: NextResponse };

/** Guard a tool endpoint: checks the API key + resolves the single-tenant org. */
export function guardApiKey(request: Request): Guard {
  if (!verifyApiKey(request.headers)) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const organizationId = getVoiceOrgId();
  if (!organizationId) {
    console.error('[voice-api] VOICE_AI_ORG_ID not set');
    return { ok: false, response: NextResponse.json({ error: 'Server not configured' }, { status: 500 }) };
  }
  return { ok: true, organizationId };
}

/** Build the per-call VoiceCtx from a request body (call id + caller phone). */
export function voiceCtx(organizationId: string, body: any): VoiceCtx {
  return {
    organizationId,
    callId: body?.call_id ?? body?.callId ?? null,
    callerPhone: body?.caller_phone ?? body?.callerPhone ?? null,
  };
}
