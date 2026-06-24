'use client';

/**
 * ExportExcelButton
 * -----------------
 * Consumes the `exportReportToExcel` Server Action and triggers a browser-
 * native file download — **no Node.js `Buffer` is used**.
 *
 * ## Why NOT `Buffer`
 * `Buffer` is a Node.js built-in. In a Next.js Client Component it runs in the
 * browser where `Buffer` is undefined, causing a hard runtime crash:
 *   ReferenceError: Buffer is not defined
 *
 * ## Browser-native Base64 → Blob (chosen approach)
 * We use the globally available `atob()` + `Uint8Array` pipeline:
 *
 *   1. `atob(base64)`           — decodes Base64 string → binary string
 *   2. `Uint8Array.charCodeAt`  — converts each character to a raw byte
 *   3. `new Blob([bytes], …)`   — wraps bytes in a typed MIME blob
 *   4. `URL.createObjectURL`    — creates a short-lived blob URL
 *   5. Synthetic `<a>` click    — triggers browser's native Save-As dialog
 *   6. `URL.revokeObjectURL`    — releases the blob URL to free memory
 *
 * This is synchronous, zero-dependency, and supported in every modern browser.
 * The alternative (`fetch('data:…')`) is slower and may be blocked by CSP.
 *
 * ## State Machine (Phase 4 expanded)
 *
 *   idle → loading ──→ success → idle  (auto-reset after 2.5 s)
 *               │
 *               └──→ polling ──→ success → idle  (auto-reset after 2.5 s)
 *                         │
 *                         └──→ error → idle  (auto-reset after 4 s)
 *               │
 *               └──→ error   → idle  (auto-reset after 4 s)
 *
 * The `polling` state is entered when exportReportToExcel() returns
 * { async: true, jobId }. The button calls getJobStatus(jobId) every 2 s
 * until status === 'Completed', then opens file_key in a new tab.
 */

import React, { useCallback, useRef, useState } from 'react';
import { exportReportToExcel } from '@/app/actions/mis-report-actions';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportState = 'idle' | 'loading' | 'polling' | 'success' | 'error';

export interface ExportExcelButtonProps {
    /** Must match a key in the MIS report REGISTRY (e.g. 'billing-revenue-daily'). */
    reportId: string;
    /**
     * The current active filters to pass to the Server Action.
     * Shape is opaque to this component — it is forwarded as-is to
     * `exportReportToExcel(reportId, filters)`.
     */
    filters: unknown;
    /** Optional extra Tailwind classes for positioning / margin overrides. */
    className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a Base64-encoded string to a browser `Blob`.
 *
 * Uses `atob()` (universally available) + `Uint8Array` — purely browser-native.
 * No Node.js `Buffer` involved.
 *
 * @param base64  The raw Base64 string returned by the Server Action.
 * @param mime    MIME type for the resulting Blob.
 */
function base64ToBlob(base64: string, mime: string): Blob {
    // Step 1: Decode Base64 → binary string
    const binaryString = atob(base64);

    // Step 2: Convert each character's char-code to a raw byte
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Step 3: Wrap in a typed Blob
    return new Blob([bytes], { type: mime });
}

/**
 * Triggers a browser file-download for a given `Blob` without any navigation.
 *
 * Creates a short-lived object URL, synthetically clicks an invisible anchor,
 * then immediately revokes the URL to free memory. This is the idiomatic
 * browser-native download pattern — no server round-trip required.
 *
 * @param blob      The file content as a Blob.
 * @param filename  The suggested filename shown in the Save-As dialog.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;

    // Must be in the DOM for Firefox compatibility
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Release the object URL to avoid memory leaks
    URL.revokeObjectURL(url);
}

// ─── XLSX MIME type constant ───────────────────────────────────────────────────

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Polling interval in milliseconds for async export jobs.
 * 2000 ms balances responsiveness against unnecessary server-action traffic.
 */
const POLL_INTERVAL_MS = 2000;

/**
 * Maximum number of poll attempts before giving up.
 * 60 attempts × 2 s = 2 minutes maximum wait before surfacing an error.
 */
const POLL_MAX_ATTEMPTS = 60;

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportExcelButton({
    reportId,
    filters,
    className = '',
}: ExportExcelButtonProps) {
    const [state, setState] = useState<ExportState>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Ref to track auto-reset timers so we can clear them on unmount
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Ref to allow cancellation of the polling loop on unmount
    const pollAbortRef  = useRef<boolean>(false);

    const scheduleReset = useCallback((delay: number) => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
            setState('idle');
            setErrorMsg(null);
        }, delay);
    }, []);

    /**
     * Polls GET /api/mis/jobs/[jobId] every POLL_INTERVAL_MS until the job
     * reaches a terminal state, then either opens the download proxy URL in a
     * new tab (success) or surfaces an error.
     *
     * ## Why a REST endpoint, not getJobStatus() Server Action
     * getJobStatus is a `'use server'` function. Calling it from the browser
     * triggers Next.js 15's full-route RSC cache invalidation, causing page.tsx
     * to re-execute generateReport() and create a new DB job on every poll tick.
     * Using a plain Route Handler (app/api/mis/jobs/[jobId]/route.ts) has zero
     * interaction with the router cache.
     *
     * Uses `pollAbortRef` to cleanly stop if the component unmounts mid-poll.
     */
    const pollForDownload = useCallback(async (jobId: string) => {
        pollAbortRef.current = false;
        let attempts = 0;

        const tick = (): Promise<void> =>
            new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        while (attempts < POLL_MAX_ATTEMPTS && !pollAbortRef.current) {
            await tick();
            attempts++;

            let jobData: { status: string; error?: string | null } | null = null;
            try {
                // REST Route Handler — does NOT invalidate the RSC cache.
                const res = await fetch(`/api/mis/jobs/${jobId}`, {
                    cache:   'no-store',
                    headers: { Accept: 'application/json' },
                });
                if (res.ok) {
                    jobData = await res.json();
                } else if (res.status === 404) {
                    // Job vanished — treat as failure rather than retrying forever.
                    setState('error');
                    setErrorMsg('Export job not found. Please try again.');
                    scheduleReset(4000);
                    return;
                }
                // Other non-ok statuses (5xx) → keep polling (transient error)
            } catch {
                // Network / server error — keep polling rather than giving up
                // immediately; transient blips are common during large jobs.
                continue;
            }

            if (!jobData) continue;

            if (jobData.status === 'Completed') {
                // Route through the secure download proxy rather than opening
                // file_key directly. This works for both local and S3 modes,
                // and surfaces an error if the file is unavailable.
                window.open(`/api/mis/export/${jobId}`, '_blank', 'noopener,noreferrer');
                setState('success');
                scheduleReset(2500);
                return;
            }

            if (jobData.status === 'Failed') {
                setState('error');
                setErrorMsg(jobData.error ?? 'Export job failed. Please try again.');
                scheduleReset(4000);
                return;
            }

            // Any other status ('Queued', 'Running') → keep polling
        }

        // Timeout guard — POLL_MAX_ATTEMPTS exhausted without a terminal status
        if (!pollAbortRef.current) {
            setState('error');
            setErrorMsg(
                'Export is taking longer than expected. Check the Jobs panel for status.'
            );
            scheduleReset(4000);
        }
    }, [scheduleReset]);

    const handleExport = useCallback(async () => {
        // Guard against double-click during any active state
        if (state === 'loading' || state === 'polling') return;

        setState('loading');
        setErrorMsg(null);

        try {
            // ── 1. Smartly extract dates (handling UI keys vs Backend keys) ──
            const start = (filters as any)?.date_start || (filters as any)?.startDate;
            const end   = (filters as any)?.date_end   || (filters as any)?.endDate;

            // ── 2. The Safety Net: Prevent backend crashes ──
            if (!start || !end) {
                setState('error');
                setErrorMsg('Please select a date range in the filter bar before exporting.');
                scheduleReset(4000);
                return;
            }

            // ── 3. Assemble the exact payload the backend demands ──
            const backendPayload = {
                ...(typeof filters === 'object' ? filters : {}),
                date_start: start,
                date_end:   end,
            };

            // ── 4. Call the Server Action ──
            const response = await exportReportToExcel(reportId, backendPayload);

            // ── 5a. Async path — large report queued as a background job ──
            if (response.async) {
                setState('polling');
                await pollForDownload(response.jobId);
                return;
            }

            // ── 5b. Sync path — decode Base64 and trigger immediate download ──
            const blob = base64ToBlob(response.base64, XLSX_MIME);
            triggerBlobDownload(blob, response.filename);
            setState('success');
            scheduleReset(2500);

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
            setState('error');
            setErrorMsg(message);
            scheduleReset(4000);
        }
    }, [state, reportId, filters, scheduleReset, pollForDownload]);

    // ── Derived button appearance based on state ─────────────────────────────

    const isLoading  = state === 'loading' || state === 'polling';
    const isSuccess  = state === 'success';
    const isError    = state === 'error';
    const isPolling  = state === 'polling';

    const buttonLabel: Record<ExportState, string> = {
        idle:    'Export to Excel',
        loading: 'Generating…',
        polling: 'Processing…',
        success: 'Downloaded!',
        error:   'Export Failed',
    };

    const buttonBase = `
        inline-flex items-center gap-2 px-3.5 py-2
        text-[12px] font-bold rounded-xl
        border transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-60
        select-none whitespace-nowrap
    `;

    const buttonVariant: Record<ExportState, string> = {
        idle: `
            bg-emerald-50 text-emerald-700 border-emerald-200
            hover:bg-emerald-100 hover:border-emerald-300
            focus-visible:ring-emerald-400
            active:scale-[0.97]
        `,
        loading: `
            bg-emerald-50 text-emerald-600 border-emerald-200
            cursor-wait
        `,
        polling: `
            bg-amber-50 text-amber-700 border-amber-200
            cursor-wait
        `,
        success: `
            bg-emerald-500 text-white border-emerald-500
            shadow-sm shadow-emerald-200
        `,
        error: `
            bg-rose-50 text-rose-700 border-rose-200
            hover:bg-rose-100
            focus-visible:ring-rose-400
        `,
    };

    const Icon: Record<ExportState, React.ReactElement> = {
        idle:    <Download  className="h-3.5 w-3.5 shrink-0"            aria-hidden="true" />,
        loading: <Loader2   className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />,
        polling: <Loader2   className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />,
        success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0"         aria-hidden="true" />,
        error:   <AlertCircle  className="h-3.5 w-3.5 shrink-0"         aria-hidden="true" />,
    };

    return (
        <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
            <button
                type="button"
                suppressHydrationWarning
                onClick={handleExport}
                disabled={isLoading}
                aria-label={
                    isPolling
                        ? 'Processing large report in the background, please wait…'
                        : isLoading
                        ? 'Generating Excel report, please wait…'
                        : 'Export this report as an Excel file'
                }
                aria-live="polite"
                aria-busy={isLoading}
                className={`${buttonBase} ${buttonVariant[state]}`}
            >
                {Icon[state]}
                <span>{buttonLabel[state]}</span>
            </button>

            {/* Inline error message — only shown when state === 'error' */}
            {isError && errorMsg && (
                <p
                    role="alert"
                    className="text-[10px] font-semibold text-rose-600 max-w-[220px] text-right leading-tight"
                >
                    {errorMsg}
                </p>
            )}

            {/* Polling status hint */}
            {isPolling && (
                <p className="text-[10px] font-semibold text-amber-600 max-w-[220px] text-right leading-tight">
                    Large report — processing in background…
                </p>
            )}
        </div>
    );
}
