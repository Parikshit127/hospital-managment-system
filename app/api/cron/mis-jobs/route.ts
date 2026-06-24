/**
 * app/api/cron/mis-jobs/route.ts
 * ─────────────────────────────
 * ⚠️  DEPRECATED — Phase A3 replacement target.
 *
 * This route was an unauthenticated duplicate of /api/mis/worker.
 * All background job processing now goes through the authenticated
 * worker at /api/mis/worker (enforced by MIS_WORKER_SECRET header).
 *
 * This file is kept as a tombstone to prevent Next.js from throwing a
 * "missing route handler" build error while the directory still exists.
 * Delete this file and its parent directory (`app/api/cron/mis-jobs/`)
 * once the next deployment confirms /api/mis/worker is the sole worker.
 *
 * See Gap_Analysis.md §1.3 for the full rationale.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      error: 'DEPRECATED',
      message:
        'This endpoint has been decommissioned. ' +
        'Use POST /api/mis/worker with the x-worker-secret header instead.',
    },
    { status: 410 } // 410 Gone — signals to Vercel cron scheduler to stop
  );
}
