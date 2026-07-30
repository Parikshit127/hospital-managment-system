/**
 * POST /api/voice/v1/book-appointment — book an OPD appointment for the identified
 * caller. Body: { call_id?, caller_phone?, doctorName, date?, time, reason? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { bookAppointment } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await bookAppointment(voiceCtx(auth.organizationId, body), { doctorName: body?.doctorName, date: body?.date, time: body?.time, reason: body?.reason });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] book-appointment error:', e);
    return NextResponse.json({ error: 'booking failed' }, { status: 500 });
  }
}
