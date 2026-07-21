/**
 * POST /api/voice/v1/reschedule-appointment — move the caller's upcoming
 * appointment. Body: { call_id?, caller_phone?, newDate?, newTime, doctorName? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { rescheduleAppointment } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await rescheduleAppointment(voiceCtx(auth.organizationId, body), { newDate: body?.newDate, newTime: body?.newTime, doctorName: body?.doctorName });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] reschedule-appointment error:', e);
    return NextResponse.json({ error: 'reschedule failed' }, { status: 500 });
  }
}
