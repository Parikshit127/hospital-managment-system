/**
 * GET /api/voice/v1/hospital-info — hospital name/address/phone + department list.
 */
import { NextResponse } from 'next/server';
import { guardApiKey, voiceCtx } from '@/app/lib/voice/api-auth';
import { getHospitalInfo } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    const result = await getHospitalInfo(voiceCtx(auth.organizationId, {}));
    return NextResponse.json(result);
  } catch (e) {
    console.error('[voice-api] hospital-info error:', e);
    return NextResponse.json({ error: 'hospital-info failed' }, { status: 500 });
  }
}
