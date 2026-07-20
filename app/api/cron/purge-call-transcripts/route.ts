/**
 * app/api/cron/purge-call-transcripts/route.ts — AI Voice Call Assistant · Phase 6
 * ─────────────────────────────────────────────────────────────────────────────
 * Retention purge for voice-call transcripts (PHI). Deletes CallTranscript rows
 * older than the retention window, keeping the CallLog metadata (outcome, links,
 * timing) intact. Run on a schedule (e.g. daily) with the CRON_SECRET bearer.
 *
 * Retention window: VOICE_TRANSCRIPT_RETENTION_DAYS (default 365).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const days = Number(process.env.VOICE_TRANSCRIPT_RETENTION_DAYS) || 365;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.callTranscript.deleteMany({
      where: { created_at: { lt: cutoff } },
    });

    console.log(`[purge-call-transcripts] Deleted ${result.count} transcript(s) older than ${days} days.`);
    return NextResponse.json({ success: true, deleted: result.count, retentionDays: days, cutoff: cutoff.toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Purge failed';
    console.error('[purge-call-transcripts] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
