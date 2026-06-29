'use client';

/**
 * DoctorRevenueSummaryPDF
 * -----------------------
 * Bespoke @react-pdf/renderer template for the `revenue-doctor-wise-summary`
 * report ONLY. It reproduces the legacy "Doctor Wise Revenue Summary" finance
 * document: navy document header, an isolated 5-up summary strip, and a grouped
 * IPD / OPD / Grand-Total data grid with a leading GRAND TOTAL row.
 *
 * It is selected over the generic MISReportPDF by the reportId→template map in
 * ExportPDFButton. All values come from the same `rows` / `totals` the web table
 * uses — no recomputation, so the PDF can never drift from the on-screen data.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ColumnSpec } from '@/lib/mis/types';

// ─── Palette (matches the legacy document) ───────────────────────────────────
const NAVY = '#16243f';
const NAVY_SUB = '#274472';
const GREEN = '#15803d';
const BLUE = '#2563eb'; // currency figures
const INK = '#1c1917';
const MUTED = '#6b7280';
const ZEBRA = '#f6f8fc';
const LINE = '#d8dee9';

// ─── Column model (S.No + 11 data columns) ───────────────────────────────────
type Kind = 'idx' | 'text' | 'money' | 'count' | 'pct' | 'pctDash';
interface Col { key: string; w: number; align: 'left' | 'center' | 'right'; kind: Kind; sub: string }

const COLS: Col[] = [
    { key: 'sno', w: 3.5, align: 'center', kind: 'idx', sub: 'S.No' },
    { key: 'doctor_name', w: 16, align: 'left', kind: 'text', sub: 'Doctor / Consultant' },
    { key: 'ipd_cash_bills', w: 6, align: 'center', kind: 'count', sub: 'Cash Bills' },
    { key: 'ipd_cash_revenue', w: 10, align: 'right', kind: 'money', sub: 'Cash Revenue' },
    { key: 'ipd_tpa_bills', w: 6, align: 'center', kind: 'count', sub: 'TPA Bills' },
    { key: 'ipd_tpa_net_revenue', w: 10, align: 'right', kind: 'money', sub: 'IPD TPA (Net Rev)' },
    { key: 'total_ipd_revenue', w: 10, align: 'right', kind: 'money', sub: 'Total IPD Revenue' },
    { key: 'ipd_pct', w: 6.5, align: 'right', kind: 'pctDash', sub: '% of Total IPD' },
    { key: 'opd_bills', w: 6, align: 'center', kind: 'count', sub: 'OPD Bills' },
    { key: 'opd_cash_revenue', w: 9, align: 'right', kind: 'money', sub: 'OPD Cash Revenue' },
    { key: 'grand_total', w: 10.5, align: 'right', kind: 'money', sub: 'Grand Total' },
    { key: 'gt_pct', w: 6.5, align: 'right', kind: 'pct', sub: '% of Grand Total' },
];

// Group-header band: cell widths must sum to the children they span.
const GROUPS = [
    { label: '', w: 19.5, bg: NAVY },
    { label: 'IPD', w: 48.5, bg: NAVY },
    { label: 'OPD (Cash Only)', w: 15, bg: NAVY_SUB },
    { label: 'Grand Total (IPD + OPD)', w: 10.5, bg: NAVY },
    { label: 'GT %', w: 6.5, bg: NAVY_SUB },
];

// ─── Formatters ──────────────────────────────────────────────────────────────
const n = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => (n(v) > 0 ? 'Rs. ' + Math.round(n(v)).toLocaleString('en-US') : '-');
const moneyCard = (v: unknown) => 'Rs. ' + Math.round(n(v)).toLocaleString('en-US');
const count = (v: unknown) => (n(v) > 0 ? String(n(v)) : '-');
const pct = (v: unknown) => `${n(v).toFixed(1)}%`;
const pctDash = (v: unknown) => (n(v) > 0 ? `${n(v).toFixed(1)}%` : '-');

function render(kind: Kind, value: unknown, sno: number): string {
    switch (kind) {
        case 'idx': return String(sno);
        case 'text': return String(value ?? '');
        case 'money': return money(value);
        case 'count': return count(value);
        case 'pct': return pct(value);
        case 'pctDash': return pctDash(value);
    }
}

const styles = StyleSheet.create({
    page: { paddingTop: 22, paddingBottom: 34, paddingHorizontal: 22, fontSize: 7.5, fontFamily: 'Helvetica', color: INK },

    // Document header
    headerBand: { backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 14, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
    headerTitle: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'center', letterSpacing: 0.5 },
    headerSubBand: { backgroundColor: '#e8edf5', paddingVertical: 4, paddingHorizontal: 14, marginBottom: 10 },
    headerSub: { color: '#475569', fontSize: 7.5, textAlign: 'center' },

    // Summary strip
    cardsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    card: { flex: 1, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 8 },
    cardLabel: { color: '#cbd5e1', fontSize: 6.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
    cardValue: { color: '#ffffff', fontSize: 11, fontFamily: 'Helvetica-Bold' },

    // Table
    table: { borderWidth: 0.5, borderColor: LINE },
    groupRow: { flexDirection: 'row' },
    groupCell: { paddingVertical: 4, alignItems: 'center', justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: '#3a557e' },
    groupText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3 },

    subRow: { flexDirection: 'row', backgroundColor: NAVY_SUB },
    subCell: { paddingVertical: 4, paddingHorizontal: 3, justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: '#3a557e' },
    subText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 6.8 },

    grandRow: { flexDirection: 'row', backgroundColor: '#dde6f3', borderBottomWidth: 1, borderBottomColor: '#b8c6de' },
    dataRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eceff4' },
    cell: { paddingVertical: 3.5, paddingHorizontal: 3, justifyContent: 'center' },
    cellText: { fontSize: 7 },

    notes: { marginTop: 10, fontSize: 6.5, color: MUTED, lineHeight: 1.4 },
    footer: { position: 'absolute', bottom: 16, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: '#9ca3af' },
});

const alignItems = (a: Col['align']) => (a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start');

export interface DoctorRevenueSummaryPDFProps {
    reportName: string;
    columns?: ColumnSpec[];
    rows: Record<string, unknown>[];
    totals: Record<string, number>;
    hospitalName?: string;
    period?: string;
}

export default function DoctorRevenueSummaryPDF({ reportName, rows, totals, hospitalName, period }: DoctorRevenueSummaryPDFProps) {
    const title = `${(hospitalName || 'Hospital OS').toUpperCase()} — DOCTOR WISE REVENUE SUMMARY`;
    const subtitle = `${period ? period + ' | ' : ''}Based on Net Revenue (All) | Sorted by Grand Total Revenue`;

    const cards = [
        { label: 'Total IPD Revenue', value: totals.total_ipd_revenue, bg: NAVY },
        { label: 'Total OPD Revenue', value: totals.opd_cash_revenue, bg: NAVY },
        { label: 'Grand Total Revenue', value: totals.grand_total, bg: GREEN },
        { label: 'IPD Cash Revenue', value: totals.ipd_cash_revenue, bg: GREEN },
        { label: 'IPD TPA Net Revenue', value: totals.ipd_tpa_net_revenue, bg: NAVY },
    ];

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page} wrap>
                {/* ── Document header ─────────────────────────────────────── */}
                <View style={styles.headerBand}>
                    <Text style={styles.headerTitle}>{title}</Text>
                </View>
                <View style={styles.headerSubBand}>
                    <Text style={styles.headerSub}>{subtitle}</Text>
                </View>

                {/* ── Top summary strip ───────────────────────────────────── */}
                <View style={styles.cardsRow}>
                    {cards.map((c) => (
                        <View key={c.label} style={[styles.card, { backgroundColor: c.bg }]}>
                            <Text style={styles.cardLabel}>{c.label}</Text>
                            <Text style={styles.cardValue}>{moneyCard(c.value)}</Text>
                        </View>
                    ))}
                </View>

                {/* ── Data grid ───────────────────────────────────────────── */}
                <View style={styles.table}>
                    {/* Grouped header (repeats on page breaks) */}
                    <View fixed>
                        <View style={styles.groupRow}>
                            {GROUPS.map((g, i) => (
                                <View key={i} style={[styles.groupCell, { width: `${g.w}%`, backgroundColor: g.bg }]}>
                                    <Text style={styles.groupText}>{g.label}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={styles.subRow}>
                            {COLS.map((c) => (
                                <View key={c.key} style={[styles.subCell, { width: `${c.w}%`, alignItems: alignItems(c.align) }]}>
                                    <Text style={[styles.subText, { textAlign: c.align }]}>{c.sub}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* GRAND TOTAL row (from server totals) */}
                    <View style={styles.grandRow} wrap={false}>
                        {COLS.map((c) => {
                            const txt =
                                c.key === 'sno' ? '' :
                                c.key === 'doctor_name' ? 'GRAND TOTAL' :
                                render(c.kind, totals[c.key], 0);
                            return (
                                <View key={c.key} style={[styles.cell, { width: `${c.w}%`, alignItems: alignItems(c.align) }]}>
                                    <Text style={[styles.cellText, { fontFamily: 'Helvetica-Bold', color: INK, textAlign: c.align }]}>{txt}</Text>
                                </View>
                            );
                        })}
                    </View>

                    {/* Doctor rows */}
                    {rows.map((row, idx) => (
                        <View key={idx} style={[styles.dataRow, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#ffffff' }]} wrap={false}>
                            {COLS.map((c) => {
                                const txt = render(c.kind, row[c.key], idx + 1);
                                const isMoney = c.kind === 'money';
                                const isName = c.key === 'doctor_name';
                                return (
                                    <View key={c.key} style={[styles.cell, { width: `${c.w}%`, alignItems: alignItems(c.align) }]}>
                                        <Text
                                            style={[
                                                styles.cellText,
                                                {
                                                    textAlign: c.align,
                                                    color: isMoney && n(row[c.key]) > 0 ? BLUE : c.kind === 'idx' ? MUTED : INK,
                                                    fontFamily: isName ? 'Helvetica-Bold' : 'Helvetica',
                                                },
                                            ]}
                                        >
                                            {txt}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* ── Notes ───────────────────────────────────────────────── */}
                <Text style={styles.notes}>
                    Notes: (1) All revenues based on Net Amount (TPA/Insurance also uses Net Revenue, not Approved Amount).
                    {'  '}(2) % of Total IPD = Doctor&apos;s IPD Revenue ÷ Total IPD Revenue.  GT % = Doctor&apos;s Grand Total ÷ Grand Total Revenue.
                </Text>

                {/* ── Footer ──────────────────────────────────────────────── */}
                <View style={styles.footer} fixed>
                    <Text>{reportName} • HospitalOS MIS</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
