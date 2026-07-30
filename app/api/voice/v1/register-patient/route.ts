/**
 * POST /api/voice/v1/register-patient — register a new patient during the call.
 * Body: { call_id?, caller_phone?, fullName, email?, phone? }. Repeat calls in the
 * same session update the record (corrections) instead of duplicating.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { registerPatient } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await registerPatient(voiceCtx(auth.organizationId, body), { fullName: body?.fullName, email: body?.email, phone: body?.phone });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] register-patient error:', e);
    return NextResponse.json({ error: 'register failed' }, { status: 500 });
  }
}
