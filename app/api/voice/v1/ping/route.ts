/**
 * GET /api/voice/v1/ping — authenticated check (used by Bolna to confirm the
 * API key works). Returns the resolved org id on success.
 */
import { NextResponse } from 'next/server';
import { guardApiKey } from '@/app/lib/voice/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = guardApiKey(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true, organizationId: auth.organizationId });
}
