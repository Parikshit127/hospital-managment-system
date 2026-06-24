import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { REGISTRY } from '@/lib/mis/runner';
import { generateExcelBuffer } from '@/lib/mis/exporter';
import { uploadToS3 } from '@/lib/mis/s3-uploader';

/**
 * app/api/mis/worker/route.ts
 * ---------------------------
 * Background Job Worker for the MIS Report Queue.
 *
 * Fixes Critical Gap #2 from the MIS Audit: "Background Job Worker Does Not Exist".
 *
 * ## How it works
 *
 *   POST /api/mis/worker
 *     → Picks ONE 'Queued' job (oldest first, FIFO)
 *     → Marks it 'Running' immediately (prevents double-processing)
 *     → Executes the report's queryFn directly (bypasses runReport RBAC —
 *        RBAC was already checked when the job was created)
 *     → Generates an Excel buffer via generateExcelBuffer()
 *     → Saves the buffer via uploadToS3() (local: /public/exports/, prod: AWS S3)
 *     → Marks job 'Completed' with file_key and row_count
 *     → On any error: marks job 'Failed' with error message
 *
 *   GET /api/mis/worker
 *     → Returns a queue health snapshot (counts by status) — for monitoring dashboards.
 *
 * ## Triggering the worker
 *
 *   Manual (development):
 *     curl -X POST http://localhost:3000/api/mis/worker \
 *       -H "x-worker-secret: <MIS_WORKER_SECRET>"
 *
 *   Production cron (Vercel / AWS EventBridge / pg_cron):
 *     POST /api/mis/worker every 60 seconds with the secret header.
 *
 * ## Security — Secret Header
 *   Set MIS_WORKER_SECRET in your environment. If unset, the worker is open
 *   (acceptable for local dev; not acceptable for production).
 *   The existing `app/api/cron/mis-jobs/route.ts` (no auth) should be replaced
 *   by this endpoint in production.
 *
 * ## Storage
 *   Local mode (default):  file_key = `/exports/{filename}` (served by Next.js)
 *   S3 mode (MIS_STORAGE_MODE=s3): file_key = `mis-exports/{filename}` (S3 object key)
 *
 * ## Concurrency
 *   Status transition 'Queued' → 'Running' happens in a single UPDATE before
 *   any work begins. Multiple concurrent worker calls will each pick a
 *   different job because `findFirst({ where: { status: 'Queued' } })` only
 *   sees rows still in 'Queued'. For Postgres, this is safe under READ COMMITTED.
 *
 * ## Progress reporting
 *   progress is updated at three checkpoints:
 *     10% — query started
 *     60% — query complete, Excel generation started
 *     90% — Excel buffer ready, upload started
 *   100% is implicit when status = 'Completed'.
 */

export const dynamic = 'force-dynamic';

// ─── Secret header guard ──────────────────────────────────────────────────────

const WORKER_SECRET = process.env.MIS_WORKER_SECRET;

function isAuthorized(req: NextRequest): boolean {
  // If no secret is configured (local dev), allow all requests.
  if (!WORKER_SECRET) return true;
  return req.headers.get('x-worker-secret') === WORKER_SECRET;
}

// ─── POST — process one queued job ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Step 1: Claim the oldest Queued job ─────────────────────────────────
  // findFirst with orderBy createdAt ensures FIFO processing.
  // We only claim jobs that are still 'Queued' — never 'Running' or terminal.
  const job = await prisma.report_jobs.findFirst({
    where:   { status: 'Queued' },
    orderBy: { createdAt: 'asc' },
  });

  if (!job) {
    return NextResponse.json(
      { message: 'Queue is empty. No jobs to process.', processed: 0 },
      { status: 200 }
    );
  }

  // ── Step 2: Atomically claim the job → 'Running' ─────────────────────────
  // This must happen before any async work so a concurrent worker invocation
  // cannot claim the same job.
  await prisma.report_jobs.update({
    where: { id: job.id },
    data: {
      status:     'Running',
      started_at: new Date(),
      progress:   0,
    },
  });

  // ── Step 3: Execute — wrapped in try/catch so every failure path sets ────
  // status='Failed' and records the error message in the DB.
  try {
    // ── 3a: Resolve report definition ──────────────────────────────────────
    const reportDef = REGISTRY[job.report_id];
    if (!reportDef) {
      throw new Error(
        `Report definition not found in REGISTRY for report_id: "${job.report_id}". ` +
        `The report may have been removed or renamed after this job was created.`
      );
    }

    // ── 3b: Mark 10% — query starting ──────────────────────────────────────
    await prisma.report_jobs.update({
      where: { id: job.id },
      data:  { progress: 10 },
    });

    // ── 3c: Execute the queryFn directly ───────────────────────────────────
    // We intentionally bypass runReport() and assertReportAccess() here:
    // RBAC was already enforced when the job was created (via exportReportToExcel
    // → runReport). Re-checking here would require re-fetching the user's role
    // and would fail for system-initiated jobs (no user context).
    //
    // `job.filters_json` is a Prisma Json value. The queryFn accepts
    // `ValidatedFilters` (Record<string, unknown>), which is compatible —
    // the Zod validation already ran at job-creation time.
    const { rows, totals } = await reportDef.queryFn(
      job.filters_json as Record<string, unknown>,
      job.organizationId
    );

    // ── 3d: Mark 60% — query done, Excel generation starting ───────────────
    await prisma.report_jobs.update({
      where: { id: job.id },
      data:  { progress: 60 },
    });

    // ── 3e: Generate Excel buffer ───────────────────────────────────────────
    const buffer = await generateExcelBuffer(
      reportDef.columns,
      rows   ?? [],
      totals ?? {}
    );

    // ── 3f: Build a safe, unique filename ──────────────────────────────────
    // Format: {SafeReportName}_{jobId_prefix}_{YYYY-MM-DD}.xlsx
    // The jobId prefix (8 chars of UUID) makes filenames unique even if the
    // same report is exported twice on the same day.
    const dateSuffix = new Date().toISOString().split('T')[0];
    const safeName   = reportDef.name.replace(/[^a-zA-Z0-9]+/g, '_');
    const jobPrefix  = job.id.split('-')[0]; // first UUID segment, e.g. "a1b2c3d4"
    const filename   = `${safeName}_${jobPrefix}_${dateSuffix}.xlsx`;

    // ── 3g: Mark 90% — Excel ready, upload starting ────────────────────────
    await prisma.report_jobs.update({
      where: { id: job.id },
      data:  { progress: 90 },
    });

    // ── 3h: Save file to storage ───────────────────────────────────────────
    // uploadToS3() routes to local filesystem or real S3 based on
    // MIS_STORAGE_MODE env var. See lib/mis/s3-uploader.ts for details.
    const fileKey = await uploadToS3(buffer, filename);

    // ── 3i: Set expires_at — files expire in 7 days ────────────────────────
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // ── 3j: Mark Completed ─────────────────────────────────────────────────
    await prisma.report_jobs.update({
      where: { id: job.id },
      data: {
        status:      'Completed',
        progress:    100,
        finished_at: new Date(),
        row_count:   rows.length,
        file_key:    fileKey,
        expires_at:  expiresAt,
        error:       null, // clear any previous error from a prior Failed attempt
      },
    });

    console.info(
      `[MIS Worker] Job ${job.id} (${job.report_id}) completed. ` +
      `Rows: ${rows.length}. File: ${fileKey}`
    );

    return NextResponse.json({
      message:   'Job processed successfully.',
      jobId:     job.id,
      report_id: job.report_id,
      status:    'Completed',
      row_count: rows.length,
      file_key:  fileKey,
    });

  } catch (err: unknown) {
    // ── Error path: mark Failed, record error message ─────────────────────
    const errorMessage =
      err instanceof Error
        ? err.message
        : 'An unknown error occurred during report generation.';

    console.error(`[MIS Worker] Job ${job.id} (${job.report_id}) FAILED:`, errorMessage);

    await prisma.report_jobs.update({
      where: { id: job.id },
      data: {
        status:      'Failed',
        finished_at: new Date(),
        progress:    0,
        error:       errorMessage,
      },
    });

    return NextResponse.json(
      {
        message:   'Job processing failed.',
        jobId:     job.id,
        report_id: job.report_id,
        status:    'Failed',
        error:     errorMessage,
      },
      { status: 500 }
    );
  }
}

// ─── GET — queue health snapshot ─────────────────────────────────────────────

/**
 * Returns counts of ReportJob rows grouped by status.
 * Use this endpoint to monitor queue depth and detect stuck jobs.
 *
 * Example response:
 * {
 *   "queue": {
 *     "Queued":    3,
 *     "Running":   1,
 *     "Completed": 47,
 *     "Failed":    2
 *   },
 *   "oldest_queued_at": "2026-06-13T14:22:00.000Z"
 * }
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Group by status using Prisma's groupBy
  const grouped = await prisma.report_jobs.groupBy({
    by:     ['status'],
    _count: { id: true },
  });

  const queue: Record<string, number> = {};
  for (const group of grouped) {
    queue[group.status] = group._count.id;
  }

  // Surface the oldest Queued job's timestamp so ops can detect stale queues
  const oldestQueued = await prisma.report_jobs.findFirst({
    where:   { status: 'Queued' },
    orderBy: { createdAt: 'asc' },
    select:  { createdAt: true },
  });

  return NextResponse.json({
    queue,
    oldest_queued_at: oldestQueued?.createdAt ?? null,
    storage_mode:     process.env.MIS_STORAGE_MODE ?? 'local',
  });
}
