/**
 * lib/mis/s3-uploader.ts
 * ----------------------
 * Dual-mode file storage for MIS export buffers.
 *
 * ## Local development (default)
 *   Writes the buffer to `public/exports/{filename}` so Next.js serves it
 *   as a static asset at `http://localhost:3000/exports/{filename}`.
 *   The returned `file_key` is the browser-accessible URL path `/exports/{filename}`.
 *
 * ## Production (S3)
 *   Set env var:  MIS_STORAGE_MODE=s3
 *   Set env vars: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *                 MIS_S3_BUCKET
 *   The file is uploaded to S3 and the returned `file_key` is the S3 object
 *   key (e.g. `mis-exports/filename.xlsx`). The download route
 *   `app/api/mis/export/[jobId]` generates a pre-signed URL from this key.
 *
 * ## ExportExcelButton integration
 *   `window.open(job.file_key, '_blank')` is called on Completed jobs.
 *   In local mode:  file_key = '/exports/Billing___2026-06-13_abc123.xlsx'  ← direct URL, works
 *   In S3 mode:     file_key = 'mis-exports/...'  → button must route through /api/mis/export/[jobId]
 */

import path from 'path';
import fs from 'fs/promises';

const STORAGE_MODE = process.env.MIS_STORAGE_MODE ?? 'local';

/** Directory where exports are written in local mode. */
const LOCAL_EXPORTS_DIR = path.join(process.cwd(), 'public', 'exports');

/**
 * Saves `buffer` to the configured storage backend and returns the `file_key`
 * that should be stored in `ReportJob.file_key`.
 *
 * @param buffer    Node.js Buffer containing the .xlsx binary.
 * @param filename  Safe filename (no path separators). E.g. "Report_2026-06-13_abc.xlsx".
 * @returns
 *   local mode → `/exports/{filename}`  (browser URL path, served by Next.js)
 *   s3    mode → `mis-exports/{filename}` (S3 object key)
 */
export async function uploadToS3(buffer: Buffer, filename: string): Promise<string> {
  if (STORAGE_MODE === 's3') {
    return uploadToS3Real(buffer, filename);
  }
  return saveLocally(buffer, filename);
}

// ─── Local mode ───────────────────────────────────────────────────────────────

async function saveLocally(buffer: Buffer, filename: string): Promise<string> {
  // Ensure the exports directory exists (created on first use).
  await fs.mkdir(LOCAL_EXPORTS_DIR, { recursive: true });

  const filePath = path.join(LOCAL_EXPORTS_DIR, filename);
  await fs.writeFile(filePath, buffer);

  // Return a browser-accessible URL path — Next.js serves `/public` as `/`.
  return `/exports/${filename}`;
}

// ─── S3 mode ──────────────────────────────────────────────────────────────────

async function uploadToS3Real(buffer: Buffer, filename: string): Promise<string> {
  // Dynamic import so the AWS SDK is only bundled when S3 mode is active.
  // Install: npm install @aws-sdk/client-s3
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const region = process.env.AWS_REGION;
  const bucket = process.env.MIS_S3_BUCKET;
  if (!region || !bucket) {
    throw new Error(
      'S3 mode is active but AWS_REGION or MIS_S3_BUCKET env vars are not set.'
    );
  }

  const client = new S3Client({ region });
  const key    = `mis-exports/${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      Body:        buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );

  return key;
}
