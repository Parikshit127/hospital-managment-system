/**
 * GET /api/voice/v1/clinic-status — OPD open/closed + whether a live staff
 * transfer is possible right now (used to choose transfer vs. callback).
 */
import { NextResponse } from 'next/server';
import { guardApiKey } from '@/app/lib/voice/api-auth';
import { getClinicStatus } from '@/app/lib/voice/voice-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(getClinicStatus());
  } catch (e) {
    console.error('[voice-api] clinic-status error:', e);
    return NextResponse.json({ error: 'clinic-status failed' }, { status: 500 });
  }
}
