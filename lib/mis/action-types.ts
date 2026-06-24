/**
 * lib/mis/action-types.ts
 * -----------------------
 * Shared response shapes for all MIS Server Actions.
 *
 * `GenerateReportResponse` carries an optional `error` field so the caller
 * (Server Component page.tsx) can pass access-denied results to
 * `UniversalReportShell` without crashing to Next.js's error boundary.
 *
 * `ExportExcelResponse` is a discriminated union:
 *   - { async: false; base64; filename }  → sync path, download immediately
 *   - { async: true;  jobId }             → large report queued as background
 *                                           job; ExportExcelButton polls
 *                                           getJobStatus() until Completed.
 */

export interface JobStatusResponse {
  id:           string;
  status:       string;
  progress:     number;
  file_key?:    string | null;
  error?:       string | null;
  createdAt:    Date;
  finished_at?: Date | null;
}

export interface GenerateReportResponse {
  async:   boolean;
  jobId?:  string;
  rows?:   Record<string, unknown>[];
  totals?: Record<string, number>;
  meta?: {
    generatedAt: Date;
    reportName:  string;
    rowCount:    number;
  };
  /**
   * Set to 'UNAUTHORIZED' by generateReport() when assertReportAccess throws
   * MISAccessDeniedError. The shell detects this string and renders the
   * <AccessDeniedState> component rather than crashing to an error boundary.
   */
  error?: string;
}

/**
 * Discriminated union returned by exportReportToExcel().
 *
 * Callers MUST type-narrow on the `async` discriminant before accessing
 * `base64`/`filename` (sync) or `jobId` (async):
 *
 * ```ts
 * const response = await exportReportToExcel(id, filters);
 * if (response.async) {
 *   // poll getJobStatus(response.jobId)
 * } else {
 *   triggerBlobDownload(base64ToBlob(response.base64, XLSX_MIME), response.filename);
 * }
 * ```
 */
export type ExportExcelResponse =
  | { async: false; base64: string; filename: string }
  | { async: true;  jobId: string };
