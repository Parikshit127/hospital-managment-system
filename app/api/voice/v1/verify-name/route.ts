/**
 * POST /api/voice/v1/verify-name — confirm caller identity by name against the
 * record on their number. Body: { call_id?, caller_phone?, name, phone? }.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { verifyCallerName } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await verifyCallerName(voiceCtx(auth.organizationId, body), { name: body?.name, phone: body?.phone });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] verify-name error:', e);
    return NextResponse.json({ error: 'verify failed' }, { status: 500 });
  }
}
