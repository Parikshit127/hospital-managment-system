import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

/**
 * app/api/mis/jobs/[jobId]/route.ts
 * ----------------------------------
 * REST endpoint for polling MIS background job status.
 *
 * ## Why this route exists (architectural fix for infinite job loop)
 *
 * The previous polling mechanism called `getJobStatus` — a `'use server'`
 * Server Action — from the browser every 3 seconds via SWR. In Next.js 15,
 * ANY call to a Server Action from the client triggers full-route Server
 * Component cache invalidation. This caused:
 *
 *   poll getJobStatus()
 *     → Next.js invalidates RSC cache for /admin/mis/[reportId]
 *     → page.tsx re-executes generateReport()
 *     → runReport() sees rowLimitSync exceeded
 *     → prisma.report_jobs.create()  ← new job every 3 s
 *     → payload.jobId changes
 *     → AsyncQueuedBanner remounts with new jobId
 *     → SWR reinitialises, loop repeats
 *
 * Route Handlers (this file) are plain HTTP endpoints. Calling them from
 * the browser with `fetch()` does NOT interact with the Next.js router
 * cache at all. The Server Component re-render loop is completely broken.
 *
 * ## Security
 *   This route replicates the exact same RBAC guard from getJobStatus():
 *   organizationId isolation + requested_by ownership check.
 *
 *   The session resolver is the same mock (first User in DB) used across
 *   all MIS Server Actions. Replace `resolveSession()` when real auth lands.
 *
 * ## Response shape (mirrors JobStatusResponse from lib/mis/action-types.ts)
 *   200 { id, status, progress, file_key, error, createdAt, finished_at }
 *   401 { error: 'No session' }
 *   404 { error: 'Job not found' }
 *   500 { error: '...' }
 *
 * ## Cache
 *   force-dynamic prevents Next.js from ever caching this response.
 *   Polling endpoints must always return live data.
 */

export const dynamic = 'force-dynamic';

// ─── Session resolver (mirrors getSession() in mis-report-actions.ts) ─────────
//
// This is the same mock pattern used in the Server Actions file.
// It reads the first User from the DB and uses their orgId / userId for
// multi-tenant isolation.  Replace with real auth (NextAuth getServerSession,
// JWT decode, etc.) when the auth layer is wired.

async function resolveSession() {
  const user = await prisma.user.findFirst({
    select: { id: true, organizationId: true },
  });
  if (!user) return null;
  return { orgId: user.organizationId, userId: user.id };
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  // ── 1. Resolve session ──────────────────────────────────────────────────
  let session: { orgId: string; userId: string } | null;
  try {
    session = await resolveSession();
  } catch {
    return NextResponse.json({ error: 'Session error.' }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'No session.' }, { status: 401 });
  }

  // ── 2. Parse jobId from dynamic segment ─────────────────────────────────
  const { jobId } = await context.params;

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'Missing jobId.' }, { status: 400 });
  }

  // ── 3. Fetch job from DB ─────────────────────────────────────────────────
  let job: {
    id:           string;
    status:       string;
    progress:     number | null;
    file_key:     string | null;
    error:        string | null;
    organizationId: string;
    requested_by:   string;
    expires_at:     Date | null;
    createdAt:      Date;
    finished_at:    Date | null;
  } | null;

  try {
    job = await prisma.report_jobs.findUnique({
      where: { id: jobId },
      select: {
        id:             true,
        status:         true,
        progress:       true,
        file_key:       true,
        error:          true,
        organizationId: true,
        requested_by:   true,
        expires_at:     true,
        createdAt:      true,
        finished_at:    true,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MIS Jobs API] DB error for jobId "${jobId}":`, msg);
    return NextResponse.json({ error: 'Database error.' }, { status: 500 });
  }

  // ── 4. Ownership + existence guard (mirrors Gap #9 fix in getJobStatus) ──
  //
  // Return 404 in all failure cases — do not reveal whether the job exists
  // at all to callers who don't own it (prevents enumeration attacks).
  if (
    !job ||
    job.organizationId !== session.orgId ||
    job.requested_by   !== session.userId
  ) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  // ── 5. Expiry check (mirrors Gap #17 fix in getJobStatus) ───────────────
  //
  // Surface expired Completed jobs as status='Expired' so the UI can render
  // a "regenerate" prompt rather than a broken download button.
  const isExpired =
    job.status === 'Completed' &&
    job.expires_at !== null &&
    job.expires_at < new Date();

  // ── 6. Return normalised job status ─────────────────────────────────────
  return NextResponse.json({
    id:          job.id,
    status:      isExpired ? 'Expired' : job.status,
    progress:    job.progress ?? 0,
    file_key:    isExpired ? null : job.file_key,
    error:       isExpired
                   ? 'This export has expired. Please regenerate the report.'
                   : job.error,
    createdAt:   job.createdAt,
    finished_at: job.finished_at,
  });
}
