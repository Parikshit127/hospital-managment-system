'use client';

/**
 * ExportPDFButton
 * ---------------
 * Renders a "Export PDF" button that uses @react-pdf/renderer's
 * <PDFDownloadLink> to generate and download a PDF of the current
 * MIS report data.
 *
 * Design:
 *   - Styled to match ExportExcelButton (same height, font size, padding)
 *   - Uses indigo accent to visually distinguish from the emerald Excel button
 *   - Shows a spinner while the PDF is being generated in the browser
 *   - Disabled when there are no rows
 *
 * Technical notes:
 *   - <PDFDownloadLink> is a client-side component — no server round-trip
 *   - The MISReportPDF document component is passed as a child
 *   - react-pdf handles pagination, font embedding, and blob creation
 */

import React, { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { ColumnSpec } from '@/lib/mis/types';

export interface ExportPDFButtonProps {
    /** Human-readable report name for the PDF header. */
    reportName: string;
    /** Column definitions — drives the PDF table layout. */
    columns: ColumnSpec[];
    /** Report data rows. */
    rows: Record<string, unknown>[];
    /** Server-computed totals. */
    totals: Record<string, number>;
    /** Report id — selects a bespoke PDF template when one is registered. */
    reportId?: string;
    /** Optional "Period: …" line for bespoke templates. */
    period?: string;
    /** Optional hospital/brand name for bespoke document headers. */
    hospitalName?: string;
}

/**
 * Per-report PDF template overrides. A report listed here renders with its own
 * @react-pdf/renderer Document instead of the generic MISReportPDF; every other
 * report is untouched and keeps the default layout.
 */
const CUSTOM_PDF_TEMPLATES: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
    'revenue-doctor-wise-summary': () => import('@/components/mis/DoctorRevenueSummaryPDF'),
};

/**
 * We lazy-load both @react-pdf/renderer and MISReportPDF to avoid
 * bundling the entire PDF engine in the main chunk. The button renders
 * as a plain button that triggers generation on click.
 */
export function ExportPDFButton({ reportName, columns, rows, totals, reportId, period, hospitalName }: ExportPDFButtonProps) {
    const [generating, setGenerating] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Only render on client — react-pdf uses browser APIs
    useEffect(() => { setMounted(true); }, []);

    const handleExportPDF = async () => {
        if (rows.length === 0 || generating) return;
        setGenerating(true);

        try {
            const { pdf } = await import('@react-pdf/renderer');

            // Choose a bespoke template if this report registers one, else the
            // generic MISReportPDF. Both accept the same core data shape.
            const customLoader = reportId ? CUSTOM_PDF_TEMPLATES[reportId] : undefined;
            // react-pdf's pdf() expects a Document element; both templates return one.
            let doc: React.ReactElement<any>;
            if (customLoader) {
                const { default: CustomPDF } = await customLoader();
                doc = <CustomPDF
                    reportName={reportName}
                    columns={columns}
                    rows={rows}
                    totals={totals}
                    period={period}
                    hospitalName={hospitalName}
                />;
            } else {
                const { MISReportPDF } = await import('@/components/mis/MISReportPDF');
                doc = <MISReportPDF
                    reportName={reportName}
                    columns={columns}
                    rows={rows}
                    totals={totals}
                />;
            }

            const blob = await pdf(doc as React.ReactElement<any>).toBlob();

            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${reportName.replace(/[^a-zA-Z0-9]/g, '-')}-Report.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF export failed:', err);
            // Graceful fallback — don't crash the page
            alert('PDF generation failed. Please try again or use Excel export.');
        } finally {
            setGenerating(false);
        }
    };

    if (!mounted) return null;

    return (
        <button
            type="button"
            suppressHydrationWarning
            onClick={handleExportPDF}
            disabled={generating || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 hover:border-indigo-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download report as PDF"
        >
            {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {generating ? 'Generating…' : 'Export PDF'}
        </button>
    );
}
