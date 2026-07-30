/**
 * POST /api/voice/v1/doctor-availability — open slots for a doctor on a date
 * (leave-aware). Body: { doctorName, date? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { getDoctorAvailability } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await getDoctorAvailability(voiceCtx(auth.organizationId, body), { doctorName: body?.doctorName, date: body?.date });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] doctor-availability error:', e);
    return NextResponse.json({ error: 'availability failed' }, { status: 500 });
  }
}
