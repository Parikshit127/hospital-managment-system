'use client';

/**
 * DoctorRevenueSummaryPDF — premium edition.
 *
 * A glance-first finance document for hospital staff / managers:
 *   - full-bleed gradient navy header with a brand emblem + period badge
 *   - five KPI cards, colour-keyed to the table sections (navy / green / gold)
 *   - the data grid is split into clearly colour-banded SECTIONS so the eye
 *     parses it instantly:
 *        · Identity (S.No + Doctor) — dark slate, walled off from the metrics
 *        · IPD       — blue band  (dark group header + light-blue sub-header)
 *        · OPD       — green band
 *        · Combined  — gold band (the headline totals)
 *     with vertical dividers between sections and short, non-repetitive labels.
 *
 * Selected over the generic MISReportPDF via the reportId→template map in
 * ExportPDFButton. All figures come from the same rows/totals as the web table.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Defs, LinearGradient, Stop, Rect, Font } from '@react-pdf/renderer';
import type { ColumnSpec } from '@/lib/mis/types';

// Disable mid-word hyphenation ("REVENUE" → "REV-ENUE"); wrap at spaces instead.
Font.registerHyphenationCallback((word) => [word]);

// ─── Canvas (A4 landscape) ───────────────────────────────────────────────────
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 26;
const HEADER_H = 74;

// ─── Palette ─────────────────────────────────────────────────────────────────
const NAVY = '#1e3a5f';
const NAVY_DEEP = '#0f2547';
const NAVY_LIGHT = '#2c4a72';
const SLATE = '#15233a';        // identity block
const EMERALD = '#15803d';
const EMERALD_DEEP = '#0d5e2c';
const GOLD = '#e0b04a';
const GOLD_DEEP = '#b9892f';
const BLUE = '#1d4ed8';         // currency figures
const INK = '#172033';
const MUTED = '#6b7280';
const ZEBRA = '#f4f7fb';
const ROW1 = '#fbf5e6';         // top-ranked doctor highlight
const DIVIDER = '#b9c5d6';      // vertical section dividers
const GRID = '#e6ecf4';

// Section tints (group header bg / sub-header bg / sub-header text)
const SEC: Record<string, { label: string; group: string; subBg: string; subFg: string }> = {
    ipd: { label: 'IPD', group: NAVY, subBg: '#e7edf6', subFg: NAVY },
    opd: { label: 'OPD (Cash Only)', group: EMERALD, subBg: '#e5f3ea', subFg: EMERALD_DEEP },
    tot: { label: 'Combined', group: GOLD_DEEP, subBg: '#f8efd9', subFg: '#8a6420' },
};

// ─── Columns ─────────────────────────────────────────────────────────────────
type Kind = 'idx' | 'text' | 'money' | 'count' | 'pct' | 'pctDash';
type Sec = 'id' | 'ipd' | 'opd' | 'tot';
interface Col { key: string; w: number; align: 'left' | 'center' | 'right'; kind: Kind; sec: Sec; sub: string; first?: boolean }

const COLS: Col[] = [
    { key: 'sno', w: 4, align: 'center', kind: 'idx', sec: 'id', sub: 'S.No' },
    { key: 'doctor_name', w: 17, align: 'left', kind: 'text', sec: 'id', sub: 'Doctor / Consultant' },
    { key: 'ipd_cash_bills', w: 6, align: 'right', kind: 'count', sec: 'ipd', sub: 'Cash Bills', first: true },
    { key: 'ipd_cash_revenue', w: 10, align: 'right', kind: 'money', sec: 'ipd', sub: 'Cash Rev' },
    { key: 'ipd_tpa_bills', w: 6, align: 'right', kind: 'count', sec: 'ipd', sub: 'TPA Bills' },
    { key: 'ipd_tpa_net_revenue', w: 10, align: 'right', kind: 'money', sec: 'ipd', sub: 'TPA Net Rev' },
    { key: 'total_ipd_revenue', w: 10, align: 'right', kind: 'money', sec: 'ipd', sub: 'IPD Total' },
    { key: 'ipd_pct', w: 6, align: 'right', kind: 'pctDash', sec: 'ipd', sub: 'IPD %' },
    { key: 'opd_bills', w: 5.5, align: 'right', kind: 'count', sec: 'opd', sub: 'Bills', first: true },
    { key: 'opd_cash_revenue', w: 8.5, align: 'right', kind: 'money', sec: 'opd', sub: 'Cash Rev' },
    { key: 'grand_total', w: 11.5, align: 'right', kind: 'money', sec: 'tot', sub: 'Grand Total', first: true },
    { key: 'gt_pct', w: 5.5, align: 'right', kind: 'pct', sec: 'tot', sub: 'GT %' },
];

const ID_W = COLS.filter((c) => c.sec === 'id').reduce((s, c) => s + c.w, 0);      // 21
const METRIC_W = 100 - ID_W;                                                       // 79
const metricCols = COLS.filter((c) => c.sec !== 'id');
const mwPct = (w: number) => `${((w / METRIC_W) * 100).toFixed(3)}%`;              // width within metrics block
const groupPct = (sec: Sec) => mwPct(metricCols.filter((c) => c.sec === sec).reduce((s, c) => s + c.w, 0));

// ─── Formatters ──────────────────────────────────────────────────────────────
const n = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => (n(v) > 0 ? 'Rs. ' + Math.round(n(v)).toLocaleString('en-US') : '–');
const moneyCard = (v: unknown) => 'Rs. ' + Math.round(n(v)).toLocaleString('en-US');
const count = (v: unknown) => (n(v) > 0 ? String(n(v)) : '–');
const pct = (v: unknown) => `${n(v).toFixed(1)}%`;
const pctDash = (v: unknown) => (n(v) > 0 ? `${n(v).toFixed(1)}%` : '–');

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

const alignItems = (a: Col['align']) => (a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start');

const styles = StyleSheet.create({
    page: { paddingTop: 0, paddingBottom: 26, paddingHorizontal: 0, fontSize: 7.5, fontFamily: 'Helvetica', color: INK },

    // Header
    headerWrap: { height: HEADER_H, position: 'relative' },
    headerContent: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: MARGIN },
    emblem: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: GOLD, backgroundColor: NAVY_LIGHT, alignItems: 'center', justifyContent: 'center' },
    emblemText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 14, letterSpacing: 0.5 },
    hospital: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 17, letterSpacing: 0.4 },
    docType: { color: '#aebfd6', fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 3 },
    badge: { backgroundColor: NAVY_LIGHT, borderRadius: 6, borderWidth: 0.5, borderColor: '#3a567f', paddingVertical: 6, paddingHorizontal: 11, alignItems: 'flex-end' },
    badgeMain: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
    badgeSub: { color: '#aebfd6', fontSize: 6.8, marginTop: 2, letterSpacing: 0.3 },

    body: { paddingHorizontal: MARGIN, paddingTop: 13 },

    // KPI cards
    cardsRow: { flexDirection: 'row', gap: 7, marginBottom: 14 },
    card: { flex: 1, flexDirection: 'row', borderRadius: 5, overflow: 'hidden', borderWidth: 0.7, minHeight: 46 },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, justifyContent: 'center' },
    cardLabel: { fontSize: 5.9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.35, marginBottom: 4 },
    cardValue: { fontSize: 11.5, fontFamily: 'Helvetica-Bold' },

    // Table
    table: { borderWidth: 0.8, borderColor: NAVY, borderRadius: 3, overflow: 'hidden' },
    hRow: { flexDirection: 'row' },
    identityHead: { width: `${ID_W}%`, flexDirection: 'row', backgroundColor: SLATE },
    idHeadCell: { justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 5 },
    idHeadText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 6.9, letterSpacing: 0.3 },
    groupCell: { paddingVertical: 5.5, alignItems: 'center', justifyContent: 'center' },
    groupText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    subCell: { paddingVertical: 5, paddingHorizontal: 3.5, justifyContent: 'center', borderTopWidth: 1.5, borderTopColor: GOLD },
    subText: { fontFamily: 'Helvetica-Bold', fontSize: 6.6 },

    grandRow: { flexDirection: 'row', backgroundColor: '#dfe7f3', borderBottomWidth: 1.5, borderBottomColor: NAVY },
    dataRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: GRID },
    cell: { paddingVertical: 4.6, paddingHorizontal: 3.5, justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: GRID },
    cellText: { fontSize: 7 },

    notesWrap: { marginTop: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    notesBar: { width: 3, alignSelf: 'stretch', backgroundColor: GOLD, borderRadius: 2 },
    notes: { flex: 1, fontSize: 6.6, color: MUTED, lineHeight: 1.45 },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 18, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: MARGIN },
    footerText: { color: '#aebfd6', fontSize: 6.6, letterSpacing: 0.3 },
});

// Vertical divider that separates a section from the previous one (data cells).
const sectionDivider = { borderLeftWidth: 1.2, borderLeftColor: DIVIDER };

export interface DoctorRevenueSummaryPDFProps {
    reportName: string;
    columns?: ColumnSpec[];
    rows: Record<string, unknown>[];
    totals: Record<string, number>;
    hospitalName?: string;
    period?: string;
}

export default function DoctorRevenueSummaryPDF({ reportName, rows, totals, hospitalName, period }: DoctorRevenueSummaryPDFProps) {
    const hosp = hospitalName || 'Hospital OS';
    const monogram = hosp.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'H';
    const periodMain = (period || '').replace(/^Period:\s*/i, '') || 'All time';

    // KPI cards — colour-keyed to the table sections (navy IPD · green OPD/cash · gold total).
    const cards = [
        { label: 'Total IPD Revenue', value: totals.total_ipd_revenue, bg: NAVY, accent: GOLD, border: NAVY_DEEP, fg: '#ffffff', lc: '#aebfd6' },
        { label: 'Total OPD Revenue', value: totals.opd_cash_revenue, bg: EMERALD, accent: '#7fd6a0', border: EMERALD_DEEP, fg: '#ffffff', lc: '#d3f0de' },
        { label: 'Grand Total Revenue', value: totals.grand_total, bg: GOLD, accent: GOLD_DEEP, border: GOLD_DEEP, fg: '#3a2c08', lc: '#6e561d' },
        { label: 'IPD Cash Revenue', value: totals.ipd_cash_revenue, bg: EMERALD, accent: '#7fd6a0', border: EMERALD_DEEP, fg: '#ffffff', lc: '#d3f0de' },
        { label: 'IPD TPA Net Revenue', value: totals.ipd_tpa_net_revenue, bg: NAVY, accent: GOLD, border: NAVY_DEEP, fg: '#ffffff', lc: '#aebfd6' },
    ];

    const idCols = COLS.filter((c) => c.sec === 'id');

    return (
        <Document>
            <Page size={[PAGE_W, PAGE_H]} orientation="landscape" style={styles.page} wrap>
                {/* ── Gradient header band ──────────────────────────────────── */}
                <View style={styles.headerWrap} fixed>
                    <Svg width={PAGE_W} height={HEADER_H} style={{ position: 'absolute', top: 0, left: 0 }}>
                        <Defs>
                            <LinearGradient id="navyGrad" x1="0" y1="0" x2="1" y2="0">
                                <Stop offset="0" stopColor={NAVY_DEEP} />
                                <Stop offset="0.6" stopColor={NAVY} />
                                <Stop offset="1" stopColor={NAVY_LIGHT} />
                            </LinearGradient>
                        </Defs>
                        <Rect x="0" y="0" width={PAGE_W} height={HEADER_H} fill="url(#navyGrad)" />
                        <Rect x="0" y={HEADER_H - 3} width={PAGE_W} height="3" fill={GOLD} />
                    </Svg>
                    <View style={styles.headerContent}>
                        <View style={styles.emblem}><Text style={styles.emblemText}>{monogram}</Text></View>
                        <View style={{ marginLeft: 13, flex: 1 }}>
                            <Text style={styles.hospital}>{hosp.toUpperCase()}</Text>
                            <Text style={styles.docType}>Doctor Wise Revenue Summary</Text>
                        </View>
                        <View style={styles.badge}>
                            <Text style={styles.badgeMain}>{periodMain}</Text>
                            <Text style={styles.badgeSub}>Net Revenue (All) · by Grand Total</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.body}>
                    {/* ── KPI cards ─────────────────────────────────────────── */}
                    <View style={styles.cardsRow}>
                        {cards.map((c) => (
                            <View key={c.label} style={[styles.card, { borderColor: c.border }]}>
                                <View style={[styles.cardAccent, { backgroundColor: c.accent }]} />
                                <View style={[styles.cardBody, { backgroundColor: c.bg }]}>
                                    <Text style={[styles.cardLabel, { color: c.lc }]}>{c.label}</Text>
                                    <Text style={[styles.cardValue, { color: c.fg }]}>{moneyCard(c.value)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* ── Data grid ─────────────────────────────────────────── */}
                    <View style={styles.table}>
                        {/* Header: dark identity block (spans both rows) + colour-banded metric sections */}
                        <View style={styles.hRow} fixed>
                            <View style={styles.identityHead}>
                                {idCols.map((c) => (
                                    <View
                                        key={c.key}
                                        style={[
                                            styles.idHeadCell,
                                            { width: `${(c.w / ID_W) * 100}%`, alignItems: c.align === 'center' ? 'center' : 'flex-start' },
                                            c.key === 'sno' ? { borderRightWidth: 0.5, borderRightColor: '#2c3e57' } : {},
                                        ]}
                                    >
                                        <Text style={styles.idHeadText}>{c.sub}</Text>
                                    </View>
                                ))}
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={styles.hRow}>
                                    {(['ipd', 'opd', 'tot'] as Sec[]).map((sec) => (
                                        <View key={sec} style={[styles.groupCell, { width: groupPct(sec), backgroundColor: SEC[sec as string].group }]}>
                                            <Text style={styles.groupText}>{SEC[sec as string].label}</Text>
                                        </View>
                                    ))}
                                </View>
                                <View style={styles.hRow}>
                                    {metricCols.map((c) => (
                                        <View
                                            key={c.key}
                                            style={[
                                                styles.subCell,
                                                { width: mwPct(c.w), backgroundColor: SEC[c.sec as string].subBg, alignItems: alignItems(c.align) },
                                                c.first ? { borderLeftWidth: 1.2, borderLeftColor: '#ffffff' } : {},
                                            ]}
                                        >
                                            <Text style={[styles.subText, { color: SEC[c.sec as string].subFg, textAlign: c.align }]}>{c.sub}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>

                        {/* GRAND TOTAL band */}
                        <View style={styles.grandRow} wrap={false}>
                            {COLS.map((c) => {
                                const txt = c.key === 'sno' ? '' : c.key === 'doctor_name' ? 'GRAND TOTAL' : render(c.kind, totals[c.key], 0);
                                return (
                                    <View key={c.key} style={[styles.cell, { width: `${c.w}%`, alignItems: alignItems(c.align), borderRightColor: '#c2cee0' }, c.first ? sectionDivider : {}]}>
                                        <Text style={[styles.cellText, { fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: c.align }]}>{txt}</Text>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Doctor rows */}
                        {rows.map((row, idx) => {
                            const bg = idx === 0 ? ROW1 : idx % 2 === 1 ? ZEBRA : '#ffffff';
                            return (
                                <View key={idx} style={[styles.dataRow, { backgroundColor: bg }]} wrap={false}>
                                    {COLS.map((c) => {
                                        const txt = render(c.kind, row[c.key], idx + 1);
                                        const isMoney = c.kind === 'money';
                                        const emphasize = c.key === 'doctor_name' || c.key === 'grand_total';
                                        return (
                                            <View key={c.key} style={[styles.cell, { width: `${c.w}%`, alignItems: alignItems(c.align) }, c.first ? sectionDivider : {}]}>
                                                <Text
                                                    style={[
                                                        styles.cellText,
                                                        {
                                                            textAlign: c.align,
                                                            color: isMoney && n(row[c.key]) > 0 ? BLUE : c.kind === 'idx' ? MUTED : INK,
                                                            fontFamily: emphasize ? 'Helvetica-Bold' : 'Helvetica',
                                                        },
                                                    ]}
                                                >
                                                    {txt}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            );
                        })}
                    </View>

                    {/* ── Notes ─────────────────────────────────────────────── */}
                    <View style={styles.notesWrap}>
                        <View style={styles.notesBar} />
                        <Text style={styles.notes}>
                            All revenues are based on Net Amount (TPA / Insurance also uses Net Revenue, not Approved Amount).{'\n'}
                            IPD % = Doctor&apos;s IPD Revenue ÷ Total IPD Revenue.   GT % = Doctor&apos;s Grand Total ÷ Grand Total Revenue.
                        </Text>
                    </View>
                </View>

                {/* ── Footer band ───────────────────────────────────────────── */}
                <View style={styles.footer} fixed>
                    <Text style={styles.footerText}>{hosp}  ·  {reportName}</Text>
                    <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `HospitalOS MIS  ·  Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
