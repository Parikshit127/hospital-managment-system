import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import fs from 'fs/promises';
import path from 'path';

/**
 * app/api/cron/mis-cleanup/route.ts
 * ----------------------------------
 * Cleanup cron for expired MIS export jobs.
 *
 * ## Gap #17 fix — `expires_at` enforcement
 *
 * The audit identified that `ReportJob.expires_at` existed in the schema but
 * was never read or enforced. Completed export files accumulated forever and
 * `listJobs()` returned stale jobs with dead download links.
 *
 * This route implements the enforcement half of the fix:
 *   1. Find all ReportJob rows where status = 'Completed' AND expires_at < now.
 *   2. For each expired job in LOCAL storage mode, delete the physical .xlsx
 *      file from `public/exports/` (the file_key is a URL path like
 *      `/exports/Report_abc_2026-06-13.xlsx`).
 *   3. Delete the ReportJob rows from the database.
 *   4. Return a summary of what was cleaned up.
 *
 * The other half of Gap #17 (filtering expired jobs out of API responses) is
 * implemented in `getJobStatus()` and `listJobs()` in mis-report-actions.ts.
 *
 * ## Storage modes
 *   LOCAL (MIS_STORAGE_MODE unset or 'local'):
 *     file_key = '/exports/{filename}' → physical path is
 *     `{process.cwd()}/public/exports/{filename}`.
 *     We attempt unlink() for each file. Missing files are logged but do NOT
 *     fail the cron — they may have already been cleaned manually.
 *
 *   S3 (MIS_STORAGE_MODE=s3):
 *     file_key = 'mis-exports/{filename}' (S3 object key).
 *     S3 lifecycle rules should handle deletion. This route skips physical
 *     deletion in S3 mode and only purges the DB rows.
 *     To enable S3 deletion here, install @aws-sdk/client-s3 and call
 *     DeleteObjectCommand for each key.
 *
 * ## Schedule
 *   Run this daily via Vercel Cron (vercel.json), AWS EventBridge, or
 *   a pg_cron job. Suggested schedule: 02:00 UTC every day.
 *
 *   vercel.json example:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/mis-cleanup", "schedule": "0 2 * * *" }
 *     ]
 *   }
 *
 * ## Security
 *   Vercel Cron injects `Authorization: Bearer <CRON_SECRET>`.
 *   Set CRON_SECRET in your environment. If unset, the endpoint is open
 *   (acceptable for local dev; not for production).
 */

export const dynamic = 'force-dynamic';

const STORAGE_MODE      = process.env.MIS_STORAGE_MODE ?? 'local';
const LOCAL_EXPORTS_DIR = path.join(process.cwd(), 'public', 'exports');
const CRON_SECRET       = process.env.CRON_SECRET;

// ─── Authorization guard ──────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  if (!CRON_SECRET) return true; // open in local dev
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${CRON_SECRET}`;
}

// ─── GET — run cleanup ────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // ── Step 1: Find all expired Completed jobs ──────────────────────────────
  // We only clean up Completed jobs. Failed/Queued/Running jobs have no file
  // to delete — they stay in the DB until the user dismisses them via UI.
  const expiredJobs = await prisma.report_jobs.findMany({
    where: {
      status:     'Completed',
      expires_at: { lt: now },
    },
    select: {
      id:       true,
      file_key: true,
    },
  });

  if (expiredJobs.length === 0) {
    return NextResponse.json({
      message:  'Nothing to clean up.',
      deleted:  0,
      at:       now.toISOString(),
    });
  }

  console.info(`[MIS Cleanup] Found ${expiredJobs.length} expired job(s) to clean up.`);

  // ── Step 2: Delete physical files (local mode only) ──────────────────────
  const fileResults: Array<{ jobId: string; file_key: string | null; outcome: string }> = [];

  if (STORAGE_MODE === 'local') {
    for (const job of expiredJobs) {
      if (!job.file_key) {
        fileResults.push({ jobId: job.id, file_key: null, outcome: 'skipped (no file_key)' });
        continue;
      }

      // file_key = '/exports/Report_abc_2026-06-13.xlsx'
      // Strip the leading slash and prepend the local public dir path.
      const relativePath  = job.file_key.startsWith('/') ? job.file_key.slice(1) : job.file_key;
      const absolutePath  = path.join(process.cwd(), 'public', relativePath);

      // Sanity check: ensure the resolved path is inside LOCAL_EXPORTS_DIR.
      // This prevents a crafted file_key from escaping the exports directory
      // via path traversal (e.g. file_key = '/exports/../../.env').
      if (!absolutePath.startsWith(LOCAL_EXPORTS_DIR)) {
        console.warn(
          `[MIS Cleanup] Skipping job ${job.id} — file_key resolves outside exports dir: ${absolutePath}`
        );
        fileResults.push({ jobId: job.id, file_key: job.file_key, outcome: 'skipped (path traversal guard)' });
        continue;
      }

      try {
        await fs.unlink(absolutePath);
        fileResults.push({ jobId: job.id, file_key: job.file_key, outcome: 'deleted' });
        console.info(`[MIS Cleanup] Deleted ${absolutePath}`);
      } catch (err: any) {
        // ENOENT = file already missing. Not an error for cleanup purposes.
        const outcome = err.code === 'ENOENT' ? 'already absent' : `error: ${err.message}`;
        fileResults.push({ jobId: job.id, file_key: job.file_key, outcome });
        if (err.code !== 'ENOENT') {
          console.error(`[MIS Cleanup] Failed to delete ${absolutePath}:`, err.message);
        }
      }
    }
  } else {
    // S3 mode: S3 lifecycle rules handle object deletion.
    // DB rows are still purged below so the UI stays clean.
    for (const job of expiredJobs) {
      fileResults.push({
        jobId:    job.id,
        file_key: job.file_key,
        outcome:  'skipped (S3 mode — lifecycle rule handles deletion)',
      });
    }
  }

  // ── Step 3: Delete ReportJob rows from the database ──────────────────────
  // We delete all expired rows regardless of whether the file delete succeeded.
  // A missing file is not a reason to keep a dead DB record.
  const jobIds = expiredJobs.map((j) => j.id);
  const deleted = await prisma.report_jobs.deleteMany({
    where: { id: { in: jobIds } },
  });

  console.info(`[MIS Cleanup] Deleted ${deleted.count} ReportJob row(s) from the database.`);

  return NextResponse.json({
    message:      `Cleanup complete. ${deleted.count} expired job(s) removed.`,
    deleted:      deleted.count,
    storage_mode: STORAGE_MODE,
    at:           now.toISOString(),
    files:        fileResults,
  });
}
