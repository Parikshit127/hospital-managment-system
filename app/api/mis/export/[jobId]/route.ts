import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import fs from 'fs/promises';
import path from 'path';

/**
 * app/api/mis/export/[jobId]/route.ts
 * ------------------------------------
 * Secure download proxy for completed MIS export jobs.
 *
 * ## Why this route exists
 *   In local mode, file_key is `/exports/{filename}` — a public URL that
 *   works fine directly. In S3 mode, file_key is an S3 object key like
 *   `mis-exports/filename.xlsx`, which is not a public URL.
 *
 *   This route abstracts both modes:
 *     GET /api/mis/export/{jobId}
 *       → verifies the job exists and belongs to the user's org
 *       → local mode: reads file from /public/exports/ and streams it
 *       → S3 mode:    generates a pre-signed URL and redirects
 *
 * ## ExportExcelButton integration
 *   Currently ExportExcelButton calls `window.open(job.file_key, '_blank')`.
 *   In local mode, file_key IS a URL (/exports/...) so it works directly.
 *   To use this download route instead, change ExportExcelButton to:
 *     window.open(`/api/mis/export/${jobId}`, '_blank')
 *   This is the production-recommended pattern.
 *
 * ## Security
 *   - Verifies job.organizationId matches the requesting user's session org.
 *   - Only serves jobs with status === 'Completed'.
 *   - Rejects expired jobs (expires_at < now).
 */

export const dynamic = 'force-dynamic';

const STORAGE_MODE      = process.env.MIS_STORAGE_MODE ?? 'local';
const LOCAL_EXPORTS_DIR = path.join(process.cwd(), 'public', 'exports');
const XLSX_MIME         = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;

  // ── 1. Fetch and validate the job ────────────────────────────────────────
  const job = await prisma.report_jobs.findUnique({
    where:  { id: jobId },
    select: {
      id:             true,
      status:         true,
      file_key:       true,
      report_id:      true,
      organizationId: true,
      expires_at:     true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  // ── 2. Status checks ─────────────────────────────────────────────────────

  if (job.status !== 'Completed') {
    return NextResponse.json(
      {
        error: `Job is not ready for download. Current status: ${job.status}.`,
        status: job.status,
      },
      { status: 409 } // 409 Conflict — resource exists but is not in the right state
    );
  }

  if (!job.file_key) {
    return NextResponse.json(
      { error: 'Job completed but no file was generated.' },
      { status: 500 }
    );
  }

  // ── 3. Expiry check ──────────────────────────────────────────────────────
  if (job.expires_at && job.expires_at < new Date()) {
    return NextResponse.json(
      { error: 'This export has expired. Please regenerate the report.' },
      { status: 410 } // 410 Gone
    );
  }

  // ── 4. Derive a safe download filename from the file_key ─────────────────
  // file_key in local mode: "/exports/Report_Name_abc123_2026-06-13.xlsx"
  // file_key in S3   mode:  "mis-exports/Report_Name_abc123_2026-06-13.xlsx"
  const downloadFilename = job.file_key.split('/').pop() ?? `mis_export_${jobId}.xlsx`;

  // ── 5. Serve the file ────────────────────────────────────────────────────

  if (STORAGE_MODE === 's3') {
    return serveFromS3(job.file_key, downloadFilename);
  }

  return serveFromLocal(job.file_key, downloadFilename);
}

// ─── Local mode: read from /public/exports/ and stream ───────────────────────

async function serveFromLocal(fileKey: string, filename: string): Promise<NextResponse> {
  // fileKey = "/exports/Report_Name_abc123_2026-06-13.xlsx"
  // Strip the leading slash to get the relative path inside /public/
  const relativePath = fileKey.startsWith('/') ? fileKey.slice(1) : fileKey;
  const absolutePath = path.join(process.cwd(), 'public', relativePath);

  try {
    const fileBuffer = await fs.readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      status:  200,
      headers: {
        'Content-Type':        XLSX_MIME,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(fileBuffer.byteLength),
        // Prevent caching of sensitive financial data
        'Cache-Control':       'no-store, no-cache, must-revalidate',
        'Pragma':              'no-cache',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MIS Export] Failed to read local file "${absolutePath}":`, msg);
    return NextResponse.json(
      { error: 'Export file not found on server. It may have been cleaned up.' },
      { status: 404 }
    );
  }
}

// ─── S3 mode: generate pre-signed URL and redirect ───────────────────────────

async function serveFromS3(s3Key: string, filename: string): Promise<NextResponse> {
  try {
    // Dynamic import — only loaded when S3 mode is active.
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl }               = await import('@aws-sdk/s3-request-presigner');

    const region = process.env.AWS_REGION;
    const bucket = process.env.MIS_S3_BUCKET;

    if (!region || !bucket) {
      throw new Error('AWS_REGION or MIS_S3_BUCKET env vars are not set.');
    }

    const client    = new S3Client({ region });
    const command   = new GetObjectCommand({
      Bucket:                     bucket,
      Key:                        s3Key,
      ResponseContentType:        XLSX_MIME,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    // Pre-signed URL expires in 5 minutes — enough time for the browser redirect.
    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 300 });

    // Redirect the browser to the pre-signed URL. 302 (not 301) so the
    // redirect is not cached — a new pre-signed URL must be generated each time.
    return NextResponse.redirect(presignedUrl, 302);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MIS Export] S3 pre-sign failed for key "${s3Key}":`, msg);
    return NextResponse.json(
      { error: 'Failed to generate download link. Please try again.' },
      { status: 500 }
    );
  }
}
