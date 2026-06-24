'use client';

/**
 * MISReportPDF
 * ------------
 * @react-pdf/renderer Document definition for rendering MIS report data
 * as a downloadable PDF. Accepts the same ColumnSpec[] + rows + totals
 * data shape that UniversalReportShell uses.
 *
 * Layout:
 *   - Header: report name, generation timestamp, row count
 *   - Column headers with alternating background
 *   - Data rows with proper formatting (currency, date, number, percent)
 *   - Totals row at the bottom (when applicable)
 *   - Footer: page numbers
 *
 * Performance note:
 *   react-pdf renders entirely in the browser — no server round-trip.
 *   For very large datasets (>2000 rows), PDF generation may take a few
 *   seconds. The button shows a spinner during this time.
 */

import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import type { ColumnSpec } from '@/lib/mis/types';

// ─── Register a clean sans-serif font (Helvetica is built-in) ─────────────────

// react-pdf ships with Helvetica by default — no external font needed.

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontSize: 8,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
    },
    // ── Header ──
    header: {
        marginBottom: 16,
        paddingBottom: 10,
        borderBottomWidth: 2,
        borderBottomColor: '#059669',
        borderBottomStyle: 'solid',
    },
    reportTitle: {
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        color: '#1c1917',
        marginBottom: 4,
    },
    reportMeta: {
        fontSize: 8,
        color: '#78716c',
        fontFamily: 'Helvetica',
    },
    // ── Table ──
    table: {
        width: '100%',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f5f5f4',
        borderBottomWidth: 1.5,
        borderBottomColor: '#d6d3d1',
        borderBottomStyle: 'solid',
        minHeight: 22,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#e7e5e4',
        borderBottomStyle: 'solid',
        minHeight: 18,
    },
    tableRowEven: {
        backgroundColor: '#fafaf9',
    },
    tableRowOdd: {
        backgroundColor: '#ffffff',
    },
    tableTotalsRow: {
        flexDirection: 'row',
        borderTopWidth: 2,
        borderTopColor: '#a8a29e',
        borderTopStyle: 'solid',
        backgroundColor: '#f5f5f4',
        minHeight: 22,
    },
    // ── Cells ──
    headerCell: {
        paddingVertical: 5,
        paddingHorizontal: 4,
        fontFamily: 'Helvetica-Bold',
        fontSize: 7,
        color: '#57534e',
        textTransform: 'uppercase',
    },
    dataCell: {
        paddingVertical: 4,
        paddingHorizontal: 4,
        fontSize: 7.5,
        color: '#44403c',
        fontFamily: 'Helvetica',
    },
    dataCellBold: {
        paddingVertical: 4,
        paddingHorizontal: 4,
        fontSize: 7.5,
        color: '#1c1917',
        fontFamily: 'Helvetica-Bold',
    },
    totalCell: {
        paddingVertical: 5,
        paddingHorizontal: 4,
        fontSize: 8,
        color: '#1c1917',
        fontFamily: 'Helvetica-Bold',
    },
    totalLabel: {
        paddingVertical: 5,
        paddingHorizontal: 4,
        fontSize: 8,
        color: '#57534e',
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
    },
    // ── Footer ──
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 7,
        color: '#a8a29e',
        fontFamily: 'Helvetica',
    },
});

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPDFCell(value: unknown, type: ColumnSpec['type']): string {
    if (value === null || value === undefined || value === '') return '—';

    switch (type) {
        case 'currency': {
            const num = Number(value);
            return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        case 'number':
            return Number(value).toLocaleString('en-IN');

        case 'percent':
            return `${Number(value).toFixed(1)}%`;

        case 'date': {
            const s = String(value);
            // Handle YYYY-MM-DD and full ISO strings
            const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                const [, y, m, d] = match;
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                return dateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                });
            }
            return s;
        }

        default:
            return String(value);
    }
}

function effectiveAlign(col: ColumnSpec): 'left' | 'center' | 'right' {
    if (col.align) return col.align;
    return col.type === 'currency' || col.type === 'number' || col.type === 'percent'
        ? 'right'
        : 'left';
}

const ALIGN_MAP: Record<string, 'flex-start' | 'center' | 'flex-end'> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
};

// ─── Column width strategy ────────────────────────────────────────────────────
// Distribute widths proportionally: currency/number cols get less space,
// text/string cols get more. This prevents currency columns from being too wide.

function computeColumnWidths(columns: ColumnSpec[]): string[] {
    const weights = columns.map(col => {
        switch (col.type) {
            case 'currency':
            case 'number':
            case 'percent':
                return 1;
            case 'date':
                return 1.2;
            default:
                return 1.5;
        }
    });
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    return weights.map(w => `${((w / totalWeight) * 100).toFixed(1)}%`);
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface MISReportPDFProps {
    reportName: string;
    columns: ColumnSpec[];
    rows: Record<string, unknown>[];
    totals: Record<string, number>;
}

export function MISReportPDF({ reportName, columns, rows, totals }: MISReportPDFProps) {
    const colWidths = computeColumnWidths(columns);
    const hasTotals = columns.some(c => c.total) && Object.keys(totals).length > 0;

    // Find leading non-total column count for the label span
    let leadingNonTotal = 0;
    for (const col of columns) {
        if (col.total) break;
        leadingNonTotal++;
    }
    leadingNonTotal = Math.max(leadingNonTotal, 1);

    // Compute combined width for leading non-total columns
    const leadingWidthPct = colWidths
        .slice(0, leadingNonTotal)
        .reduce((sum, w) => sum + parseFloat(w), 0);

    const now = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page} wrap>
                {/* ── Header ──────────────────────────────────────────────── */}
                <View style={styles.header} fixed>
                    <Text style={styles.reportTitle}>{reportName}</Text>
                    <Text style={styles.reportMeta}>
                        Generated: {now} • {rows.length} {rows.length === 1 ? 'record' : 'records'} • HospitalOS MIS
                    </Text>
                </View>

                {/* ── Table ───────────────────────────────────────────────── */}
                <View style={styles.table}>
                    {/* Column headers */}
                    <View style={styles.tableHeaderRow} fixed>
                        {columns.map((col, idx) => (
                            <View
                                key={col.key}
                                style={{
                                    width: colWidths[idx],
                                    justifyContent: 'center',
                                    alignItems: ALIGN_MAP[effectiveAlign(col)],
                                }}
                            >
                                <Text style={styles.headerCell}>{col.label}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Data rows */}
                    {rows.map((row, rowIdx) => (
                        <View
                            key={rowIdx}
                            style={[
                                styles.tableRow,
                                rowIdx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
                            ]}
                            wrap={false}
                        >
                            {columns.map((col, colIdx) => {
                                const isNumeric = col.type === 'currency' || col.type === 'number' || col.type === 'percent';
                                return (
                                    <View
                                        key={col.key}
                                        style={{
                                            width: colWidths[colIdx],
                                            justifyContent: 'center',
                                            alignItems: ALIGN_MAP[effectiveAlign(col)],
                                        }}
                                    >
                                        <Text style={isNumeric ? styles.dataCellBold : styles.dataCell}>
                                            {formatPDFCell(row[col.key], col.type)}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))}

                    {/* Totals row */}
                    {hasTotals && (
                        <View style={styles.tableTotalsRow} wrap={false}>
                            {/* Leading columns merged for label */}
                            <View
                                style={{
                                    width: `${leadingWidthPct}%`,
                                    justifyContent: 'center',
                                }}
                            >
                                <Text style={styles.totalLabel}>
                                    Grand Total ({rows.length} rows)
                                </Text>
                            </View>

                            {/* Remaining columns with totals */}
                            {columns.slice(leadingNonTotal).map((col, idx) => {
                                const totalVal = col.total && totals[col.key] !== undefined
                                    ? totals[col.key]
                                    : undefined;
                                return (
                                    <View
                                        key={col.key}
                                        style={{
                                            width: colWidths[leadingNonTotal + idx],
                                            justifyContent: 'center',
                                            alignItems: ALIGN_MAP[effectiveAlign(col)],
                                        }}
                                    >
                                        <Text style={styles.totalCell}>
                                            {totalVal !== undefined
                                                ? formatPDFCell(totalVal, col.type)
                                                : ''}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* ── Page footer ─────────────────────────────────────────── */}
                <View style={styles.footer} fixed>
                    <Text>HospitalOS • MIS Report</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
