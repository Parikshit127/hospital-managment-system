/**
 * POST /api/voice/v1/lookup-caller — does this caller's number match a patient?
 * Body: { call_id?, caller_phone?, phone? }. Never reveals the patient's name.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { lookupCaller } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await lookupCaller(voiceCtx(auth.organizationId, body), { phone: body?.phone });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] lookup-caller error:', e);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }
}
