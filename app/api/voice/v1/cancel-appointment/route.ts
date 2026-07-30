/**
 * POST /api/voice/v1/cancel-appointment — cancel the caller's upcoming
 * appointment (frees the slot). Body: { call_id?, caller_phone?, reason? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { cancelAppointment } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await cancelAppointment(voiceCtx(auth.organizationId, body), { reason: body?.reason });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] cancel-appointment error:', e);
    return NextResponse.json({ error: 'cancel failed' }, { status: 500 });
  }
}
