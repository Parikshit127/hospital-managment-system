/**
 * POST /api/voice/v1/find-doctors — doctors, optionally by department, with
 * fee + hours. Body: { department? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { findDoctors } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await findDoctors(voiceCtx(auth.organizationId, body), { department: body?.department });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] find-doctors error:', e);
    return NextResponse.json({ error: 'find-doctors failed' }, { status: 500 });
  }
}
