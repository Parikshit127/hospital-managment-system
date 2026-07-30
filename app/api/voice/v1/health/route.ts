/**
 * GET /api/voice/v1/health — unauthenticated connectivity check for the voice API.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'voice-api', version: 'v1' });
}
