/**
 * POST /api/voice/v1/request-callback — log a callback request (CRMLead) so a
 * call is never dropped. Body: { call_id?, caller_phone?, reason?, department? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { requestCallback } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await requestCallback(voiceCtx(auth.organizationId, body), { reason: body?.reason, department: body?.department });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] request-callback error:', e);
    return NextResponse.json({ error: 'callback failed' }, { status: 500 });
  }
}
