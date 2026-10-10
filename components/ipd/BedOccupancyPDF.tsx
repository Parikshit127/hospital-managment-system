'use client';

/**
 * BedOccupancyPDF — @react-pdf/renderer document for the IPD Bed Occupancy report.
 * Rendered in the browser (see BedOccupancyReport → handleExportPDF), same approach
 * as components/mis/MISReportPDF.tsx. Charts are drawn as SVG primitives because the
 * Chart.js canvases on screen cannot be embedded.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Line, Rect, Polyline, Text as SvgText } from '@react-pdf/renderer';
import type { BedOccupancyReportPayload } from '@/app/actions/bed-occupancy-actions';
import type { OccupancyGroupRow } from '@/app/lib/reports/bed-occupancy';

const styles = StyleSheet.create({
    page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
    header: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: '#ea580c', borderBottomStyle: 'solid' },
    org: { fontSize: 9, color: '#78716c', marginBottom: 2 },
    title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1c1917' },
    meta: { fontSize: 8, color: '#78716c', marginTop: 3 },
    kpiRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    kpi: { width: '12.5%', paddingRight: 6, paddingBottom: 6 },
    kpiBox: { borderWidth: 0.75, borderColor: '#e7e5e4', borderStyle: 'solid', borderRadius: 4, padding: 5, minHeight: 36 },
    kpiLabel: { fontSize: 6, color: '#78716c', textTransform: 'uppercase', marginBottom: 2 },
    kpiValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1c1917' },
    h2: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1c1917', marginTop: 10, marginBottom: 4 },
    th: { flexDirection: 'row', backgroundColor: '#f5f5f4', borderBottomWidth: 1, borderBottomColor: '#d6d3d1', borderBottomStyle: 'solid' },
    tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e7e5e4', borderBottomStyle: 'solid' },
    thCell: { paddingVertical: 4, paddingHorizontal: 3, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#57534e', textTransform: 'uppercase' },
    cell: { paddingVertical: 3, paddingHorizontal: 3, fontSize: 7.5, color: '#44403c' },
    note: { fontSize: 6.5, color: '#78716c', marginTop: 8, lineHeight: 1.4 },
    footer: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#a8a29e' },
});

const ddmmyyyy = (key: string) => {
    const [y, m, d] = key.split('-');
    return `${d}/${m}/${y}`;
};
const shortDate = (key: string) => {
    const [, m, d] = key.split('-');
    return `${d}/${m}`;
};
const n1 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 1 }));

interface ColDef<T> {
    label: string;
    flex: number;
    align?: 'left' | 'right';
    render: (row: T) => string;
}

function PdfTable<T>({ cols, rows }: { cols: ColDef<T>[]; rows: T[] }) {
    return (
        <View>
            <View style={styles.th} fixed>
                {cols.map((c) => (
                    <Text key={c.label} style={[styles.thCell, { flex: c.flex, textAlign: c.align ?? 'left' }]}>{c.label}</Text>
                ))}
            </View>
            {rows.map((r, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 ? { backgroundColor: '#fafaf9' } : {}]} wrap={false}>
                    {cols.map((c) => (
                        <Text key={c.label} style={[styles.cell, { flex: c.flex, textAlign: c.align ?? 'left' }]}>{c.render(r)}</Text>
                    ))}
                </View>
            ))}
        </View>
    );
}

function TrendChart({ daily }: { daily: BedOccupancyReportPayload['daily'] }) {
    const W = 780;
    const H = 130;
    const padL = 30;
    const padB = 16;
    const plotW = W - padL - 6;
    const plotH = H - padB - 6;
    if (daily.length === 0) return null;
    const maxEvents = Math.max(1, ...daily.map((d) => Math.max(d.admissions, d.discharges)));
    const step = plotW / daily.length;
    const barW = Math.max(0.8, Math.min(8, step * 0.32));
    const x = (i: number) => padL + step * i + step / 2;
    const yPct = (p: number) => 6 + plotH - (Math.min(p, 100) / 100) * plotH;
    const yEv = (v: number) => 6 + plotH - (v / maxEvents) * plotH * 0.5;
    const labelEvery = Math.max(1, Math.ceil(daily.length / 14));
    return (
        <Svg width={W} height={H}>
            {[0, 25, 50, 75, 100].map((p) => (
                <React.Fragment key={p}>
                    <Line x1={padL} x2={W - 6} y1={yPct(p)} y2={yPct(p)} stroke="#e7e5e4" strokeWidth={0.5} />
                    <SvgText x={padL - 4} y={yPct(p) + 2} style={{ fontSize: 6 }} fill="#78716c" textAnchor="end">{`${p}%`}</SvgText>
                </React.Fragment>
            ))}
            {daily.map((d, i) => (
                <React.Fragment key={d.date}>
                    <Rect x={x(i) - barW} y={yEv(d.admissions)} width={barW} height={Math.max(0, 6 + plotH - yEv(d.admissions))} fill="#93c5fd" />
                    <Rect x={x(i)} y={yEv(d.discharges)} width={barW} height={Math.max(0, 6 + plotH - yEv(d.discharges))} fill="#fca5a5" />
                    {i % labelEvery === 0 && (
                        <SvgText x={x(i)} y={H - 4} style={{ fontSize: 5.5 }} fill="#78716c" textAnchor="middle">{shortDate(d.date)}</SvgText>
                    )}
                </React.Fragment>
            ))}
            <Polyline points={daily.map((d, i) => `${x(i)},${yPct(d.occupancyPct)}`).join(' ')} stroke="#ea580c" strokeWidth={1.5} fill="none" />
        </Svg>
    );
}

export function BedOccupancyPDF({ data }: { data: BedOccupancyReportPayload }) {
    const s = data.summary;
    const snap = data.snapshot;
    const f = data.meta.filters;
    const period = `${ddmmyyyy(data.range.start)} to ${ddmmyyyy(data.range.end)}`;
    const filterBits = [f.department && `Department: ${f.department}`, f.ward && `Ward: ${f.ward}`, f.bedCategory && `Category: ${f.bedCategory}`].filter(Boolean).join('  ·  ');
    const generated = new Date(data.meta.generatedAt).toLocaleString('en-IN', { timeZone: data.meta.timezone });
    const asOfLabel = snap.isLive ? 'now' : 'end of range';

    const kpis: [string, string][] = [
        ['Total beds', String(snap.total)],
        [`Occupied (${asOfLabel})`, String(snap.occupied)],
        [`Vacant (${asOfLabel})`, String(snap.vacant)],
        ['Blocked (now)', snap.blocked == null ? 'n/a' : String(snap.blocked)],
        ['Period occupancy', `${n1(s.occupancyPct)}%`],
        ['Avg occupied beds', n1(s.avgOccupiedBeds)],
        ['Admissions', String(s.admissions)],
        ['Discharges', String(s.discharges)],
    ];

    const groupCols = (label: string): ColDef<OccupancyGroupRow>[] => [
        { label, flex: 2.2, render: (r) => r.label },
        { label: 'Beds', flex: 0.8, align: 'right', render: (r) => String(r.totalBeds) },
        { label: 'Bed-days avail.', flex: 1.2, align: 'right', render: (r) => n1(r.bedDaysAvailable) },
        { label: 'Bed-days occ.', flex: 1.2, align: 'right', render: (r) => n1(r.bedDaysOccupied) },
        { label: 'Occ. %', flex: 0.9, align: 'right', render: (r) => `${n1(r.occupancyPct)}%` },
        { label: 'Avg occ.', flex: 0.9, align: 'right', render: (r) => n1(r.avgOccupiedBeds) },
        { label: 'Avg vacant', flex: 0.9, align: 'right', render: (r) => n1(r.avgVacantBeds) },
        { label: 'Occ. (as of)', flex: 1, align: 'right', render: (r) => String(r.occupiedAsOf) },
        { label: 'Vacant (as of)', flex: 1, align: 'right', render: (r) => String(r.vacantAsOf) },
        { label: 'Blocked', flex: 0.9, align: 'right', render: (r) => (r.blockedAsOf == null ? 'n/a' : String(r.blockedAsOf)) },
        { label: 'Adm.', flex: 0.7, align: 'right', render: (r) => String(r.admissions) },
        { label: 'Disch.', flex: 0.7, align: 'right', render: (r) => String(r.discharges) },
        { label: 'ALOS', flex: 0.7, align: 'right', render: (r) => n1(r.alosDays) },
    ];

    return (
        <Document title="IPD Bed Occupancy Report">
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.header}>
                    {data.meta.organizationName ? <Text style={styles.org}>{data.meta.organizationName}</Text> : null}
                    <Text style={styles.title}>IPD Bed Occupancy Report</Text>
                    <Text style={styles.meta}>
                        Period: {period}{filterBits ? `  ·  ${filterBits}` : ''}  ·  Generated {generated}
                    </Text>
                </View>

                <View style={styles.kpiRow}>
                    {kpis.map(([label, value]) => (
                        <View key={label} style={styles.kpi}>
                            <View style={styles.kpiBox}>
                                <Text style={styles.kpiLabel}>{label}</Text>
                                <Text style={styles.kpiValue}>{value}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                <Text style={styles.h2}>Daily occupancy trend</Text>
                <Text style={{ fontSize: 6.5, color: '#78716c', marginBottom: 2 }}>Line: occupancy %  ·  Blue bars: admissions  ·  Red bars: discharges</Text>
                <TrendChart daily={data.daily} />

                <Text style={styles.h2}>Admission &amp; discharge statistics</Text>
                <PdfTable
                    cols={[
                        { label: 'Admissions', flex: 1, align: 'right', render: () => String(s.admissions) },
                        { label: 'Discharges', flex: 1, align: 'right', render: () => String(s.discharges) },
                        { label: 'Net change', flex: 1, align: 'right', render: () => String(s.netCensusChange) },
                        { label: 'Deaths', flex: 1, align: 'right', render: () => String(s.deaths) },
                        { label: 'Cancelled', flex: 1, align: 'right', render: () => String(s.cancelled) },
                        { label: 'Awaiting final discharge', flex: 1.6, align: 'right', render: () => String(s.awaitingFinalDischarge) },
                        { label: 'ALOS (days)', flex: 1, align: 'right', render: () => n1(s.alosDays) },
                        { label: 'Turnover rate', flex: 1, align: 'right', render: () => n1(s.bedTurnoverRate) },
                        { label: 'Turnover interval (d)', flex: 1.4, align: 'right', render: () => n1(s.turnoverIntervalDays) },
                    ]}
                    rows={[0]}
                />
                {s.dischargeTypes.length > 0 && (
                    <Text style={[styles.note, { marginTop: 4 }]}>
                        Discharge types: {s.dischargeTypes.map((d) => `${d.type} ${d.count}`).join('  ·  ')}
                    </Text>
                )}

                <Text style={styles.h2} break>Department-wise occupancy</Text>
                <PdfTable cols={groupCols('Department')} rows={data.byDepartment} />

                <Text style={styles.h2}>Ward-wise occupancy</Text>
                <PdfTable cols={groupCols('Ward')} rows={data.byWard} />

                <Text style={styles.h2}>Bed category-wise occupancy</Text>
                <PdfTable cols={groupCols('Bed category')} rows={data.byCategory} />

                <Text style={styles.h2} break>Daily occupancy</Text>
                <PdfTable
                    cols={[
                        { label: 'Date', flex: 1.2, render: (r) => ddmmyyyy(r.date) },
                        { label: 'Total beds', flex: 1, align: 'right', render: (r) => String(r.totalBeds) },
                        { label: 'Avg occupied', flex: 1, align: 'right', render: (r) => n1(r.avgOccupiedBeds) },
                        { label: 'Closing occupied', flex: 1.2, align: 'right', render: (r) => String(r.closingOccupiedBeds) },
                        { label: 'Avg vacant', flex: 1, align: 'right', render: (r) => n1(r.avgVacantBeds) },
                        { label: 'Occupancy %', flex: 1, align: 'right', render: (r) => `${n1(r.occupancyPct)}%` },
                        { label: 'Admissions', flex: 1, align: 'right', render: (r) => String(r.admissions) },
                        { label: 'Discharges', flex: 1, align: 'right', render: (r) => String(r.discharges) },
                    ]}
                    rows={data.daily}
                />

                <Text style={styles.note}>
                    Occupancy is time-weighted from actual bed allocation (admission, bed transfers, discharge timestamps). Patients awaiting final
                    discharge keep their bed until discharged. The bed master has no commissioning dates, so the current bed list applies to the whole
                    period. Blocked/maintenance status is not historised and is shown only for views that include the current moment.
                </Text>

                <View style={styles.footer} fixed>
                    <Text>HospitalOS · IPD Bed Occupancy</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}

export default BedOccupancyPDF;
