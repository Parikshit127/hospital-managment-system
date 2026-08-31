'use client';

import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
} from '@react-pdf/renderer';

// --- Styles ---
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 9,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
    },
    // Header
    header: {
        marginBottom: 20,
        paddingBottom: 12,
        borderBottomWidth: 2,
        borderBottomColor: '#6366f1',
        borderBottomStyle: 'solid',
    },
    title: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: '#1e1b4b',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 9,
        color: '#4f46e5',
        fontFamily: 'Helvetica-Bold',
        marginBottom: 2,
    },
    meta: {
        fontSize: 8,
        color: '#6b7280',
    },
    // Sections
    sectionTitle: {
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        color: '#1f2937',
        marginTop: 15,
        marginBottom: 6,
        paddingBottom: 2,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    // KPI Grid
    kpiContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 15,
    },
    kpiCard: {
        width: '23%',
        padding: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 6,
        backgroundColor: '#fafafa',
    },
    kpiLabel: {
        fontSize: 7,
        color: '#6b7280',
        textTransform: 'uppercase',
        marginBottom: 4,
        fontFamily: 'Helvetica-Bold',
    },
    kpiVal: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        color: '#111827',
    },
    kpiSub: {
        fontSize: 7,
        color: '#9ca3af',
        marginTop: 2,
    },
    // Tables
    table: {
        width: '100%',
        marginBottom: 15,
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f3f4f6',
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
        minHeight: 18,
        alignItems: 'center',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#e5e7eb',
        minHeight: 16,
        alignItems: 'center',
    },
    tableCell: {
        paddingHorizontal: 4,
        paddingVertical: 3,
    },
    tableHeaderCell: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
        color: '#374151',
        textTransform: 'uppercase',
        paddingHorizontal: 4,
    },
    textLeft: {
        textAlign: 'left',
    },
    textRight: {
        textAlign: 'right',
    },
    textCenter: {
        textAlign: 'center',
    },
    fontBold: {
        fontFamily: 'Helvetica-Bold',
    },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 25,
        left: 40,
        right: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 7,
        color: '#9ca3af',
        borderTopWidth: 0.5,
        borderTopColor: '#e5e7eb',
        paddingTop: 8,
    },
});

// --- Formatters ---
// No ₹ symbol: the built-in Helvetica that react-pdf uses has no glyph for
// U+20B9, so it rendered as a stray mark on every amount. Columns and the page
// header say INR instead; registering a rupee-capable font would mean shipping
// a font file for one character.
function fmtINR(val: number): string {
    return Math.round(val || 0).toLocaleString('en-IN');
}

export interface PharmacyFinanceReportPDFProps {
    dateRange: { from: string; to: string };
    rev: any;
    data: any;
}

export function PharmacyFinanceReportPDF({ dateRange, rev, data }: PharmacyFinanceReportPDFProps) {
    const now = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    // Fall back to byChannel for a payload produced before grandTotal existed.
    const gt = rev.grandTotal || {
        ipd: rev.byChannel?.ipd?.revenue || 0,
        opd: rev.byChannel?.opd?.revenue || 0,
        counter: rev.byChannel?.counter?.revenue || 0,
        total: rev.totalRevenue || 0,
        bills: rev.totalBills || 0,
    };
    const months: any[] = rev.byMonth || [];
    const doctors: any[] = rev.byDoctor || [];
    const docTotals = doctors.reduce(
        (t: any, d: any) => ({
            ipd: t.ipd + (d.ipd || 0), opd: t.opd + (d.opd || 0),
            counter: t.counter + (d.counter || 0), revenue: t.revenue + (d.revenue || 0),
            bills: t.bills + (d.bills || 0),
        }),
        { ipd: 0, opd: 0, counter: 0, revenue: 0, bills: 0 },
    );

    return (
        <Document>
            {/* Page 1: Summary, Channels, Doctors & Movers */}
            <Page size="A4" orientation="portrait" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.subtitle}>PHARMACY PORTAL FINANCIAL REPORT</Text>
                    <Text style={styles.title}>Revenue & Financial Analytics</Text>
                    <Text style={styles.meta}>
                        Date Range: {dateRange.from} to {dateRange.to} • Generated: {now} • All amounts in INR
                    </Text>
                </View>

                {/* KPI Metrics */}
                <Text style={styles.sectionTitle}>Executive Financial Summary</Text>
                <View style={styles.kpiContainer}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Total Revenue (INR)</Text>
                        <Text style={styles.kpiVal}>{fmtINR(rev.totalRevenue)}</Text>
                        <Text style={styles.kpiSub}>{rev.totalBills} bills issued</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Gross Margin %</Text>
                        <Text style={styles.kpiVal}>{rev.grossMarginPct == null ? 'n/a' : `${rev.grossMarginPct}%`}</Text>
                        <Text style={styles.kpiSub}>COGS: {fmtINR(rev.cogs)}</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Stock Asset Value</Text>
                        <Text style={styles.kpiVal}>{fmtINR(data?.totalStockValue || 0)}</Text>
                        <Text style={styles.kpiSub}>{(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)} alerts</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Expiry Write-off</Text>
                        <Text style={[styles.kpiVal, { color: '#dc2626' }]}>{fmtINR(data?.expiryWriteOffValue || 0)}</Text>
                        <Text style={styles.kpiSub}>{data?.expiredCount || 0} expired batches</Text>
                    </View>
                </View>

                {/* Channels Performance */}
                <Text style={styles.sectionTitle}>Sales Performance by Channel</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '40%' }]}>Channel</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '20%' }]}>Bills Count</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '20%' }]}>Revenue Share</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '20%' }]}>Revenue (INR)</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={[styles.tableCell, styles.textLeft, { width: '40%' }]}>IPD Pharmacy Billing</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{rev.byChannel.ipd.billCount}</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{rev.byChannel.ipd.pct}%</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%', fontFamily: 'Helvetica-Bold' }]}>{fmtINR(rev.byChannel.ipd.revenue)}</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={[styles.tableCell, styles.textLeft, { width: '40%' }]}>OPD Pharmacy Billing</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{rev.byChannel.opd.billCount}</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{rev.byChannel.opd.pct}%</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%', fontFamily: 'Helvetica-Bold' }]}>{fmtINR(rev.byChannel.opd.revenue)}</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <Text style={[styles.tableCell, styles.textLeft, { width: '40%' }]}>Direct Counter Sales</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{rev.byChannel.counter.billCount}</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{rev.byChannel.counter.pct}%</Text>
                        <Text style={[styles.tableCell, styles.textRight, { width: '20%', fontFamily: 'Helvetica-Bold' }]}>{fmtINR(rev.byChannel.counter.revenue)}</Text>
                    </View>
                    <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: '#9ca3af', backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tableCell, styles.textLeft, styles.fontBold, { width: '40%' }]}>Total</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '20%' }]}>{gt.bills}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '20%' }]}>100%</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '20%' }]}>{fmtINR(gt.total)}</Text>
                    </View>
                </View>

                {/* Top Movers */}
                <Text style={styles.sectionTitle}>Top 5 Medicines (by Revenue)</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '55%' }]}>Medicine</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '15%' }]}>Qty</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '30%' }]}>Revenue (INR)</Text>
                    </View>
                    {(rev.topMovers || []).slice(0, 5).map((m: any, idx: number) => (
                        <View key={idx} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '55%' }]}>{m.name}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>{m.qty}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '30%' }]}>{fmtINR(m.revenue)}</Text>
                        </View>
                    ))}
                </View>

                {/* Monthly Summary + closing grand total */}
                <Text style={styles.sectionTitle}>Monthly Summary</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '24%' }]}>Month</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '12%' }]}>Bills</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '16%' }]}>IPD (INR)</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '16%' }]}>OPD (INR)</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '16%' }]}>Counter (INR)</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '16%' }]}>Total</Text>
                    </View>
                    {months.length === 0 ? (
                        <View style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textCenter, { width: '100%', color: '#9ca3af' }]}>No billing in this period</Text>
                        </View>
                    ) : months.map((m: any, idx: number) => (
                        <View key={idx} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '24%' }]}>{m.month}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>{m.bills}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '16%' }]}>{fmtINR(m.ipd)}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '16%' }]}>{fmtINR(m.opd)}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '16%' }]}>{fmtINR(m.counter)}</Text>
                            <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '16%' }]}>{fmtINR(m.total)}</Text>
                        </View>
                    ))}
                    <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: '#9ca3af', backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tableCell, styles.textLeft, styles.fontBold, { width: '24%' }]}>TOTAL</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '12%' }]}>{gt.bills}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '16%' }]}>{fmtINR(gt.ipd)}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '16%' }]}>{fmtINR(gt.opd)}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '16%' }]}>{fmtINR(gt.counter)}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '16%' }]}>{fmtINR(gt.total)}</Text>
                    </View>
                </View>

                {/* The final calculation the report closes on */}
                <View style={{ marginTop: 6, borderWidth: 1.5, borderColor: '#1e1b4b', borderRadius: 4, padding: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                        <Text>Total IPD Amount</Text><Text style={styles.fontBold}>{fmtINR(gt.ipd)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                        <Text>Total OPD Amount</Text><Text style={styles.fontBold}>{fmtINR(gt.opd)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                        <Text>Counter Sales</Text><Text style={styles.fontBold}>{fmtINR(gt.counter)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: '#1e1b4b' }}>
                        <Text style={[styles.fontBold, { fontSize: 11 }]}>OVERALL TOTAL ({gt.bills} bills)</Text>
                        <Text style={[styles.fontBold, { fontSize: 12 }]}>{fmtINR(gt.total)}</Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text>HospitalOS Pharmacy Services</Text>
                    <Text>Page 1 of 3</Text>
                </View>
            </Page>

            {/* Page 2: Doctor-wise pharmacy billing — IPD and OPD totalled separately */}
            <Page size="A4" orientation="portrait" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.subtitle}>PHARMACY PORTAL FINANCIAL REPORT</Text>
                    <Text style={styles.title}>Doctor-wise Pharmacy Billing</Text>
                    <Text style={styles.meta}>
                        Date Range: {dateRange.from} to {dateRange.to} • {doctors.length} doctors • All amounts in INR •
                        IPD attributed to the admission&apos;s treating consultant
                    </Text>
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '6%' }]}>#</Text>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '34%' }]}>Doctor</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '10%' }]}>Bills</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '17%' }]}>IPD (INR)</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '16%' }]}>OPD (INR)</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '17%' }]}>Total</Text>
                    </View>
                    {doctors.length === 0 ? (
                        <View style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textCenter, { width: '100%', color: '#9ca3af' }]}>No doctor-wise data in this period</Text>
                        </View>
                    ) : doctors.map((d: any, idx: number) => (
                        <View key={idx} style={styles.tableRow} wrap={false}>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '6%', color: '#9ca3af' }]}>{idx + 1}</Text>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '34%' }]}>{d.name}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '10%' }]}>{d.bills}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '17%' }]}>{fmtINR(d.ipd)}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '16%' }]}>{fmtINR(d.opd)}</Text>
                            <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '17%' }]}>{fmtINR(d.revenue)}</Text>
                        </View>
                    ))}
                    <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: '#9ca3af', backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tableCell, styles.textLeft, styles.fontBold, { width: '40%' }]}>TOTAL</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '10%' }]}>{docTotals.bills}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '17%' }]}>{fmtINR(docTotals.ipd)}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '16%' }]}>{fmtINR(docTotals.opd)}</Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '17%' }]}>{fmtINR(docTotals.revenue)}</Text>
                    </View>
                </View>

                <View style={styles.footer} fixed>
                    <Text>HospitalOS Pharmacy Services</Text>
                    <Text>Page 2 of 3</Text>
                </View>
            </Page>

            {/* Page 2: Detailed Transaction Ledger */}
            <Page size="A4" orientation="portrait" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.subtitle}>PHARMACY PORTAL FINANCIAL REPORT</Text>
                    <Text style={styles.title}>Detailed Billing Transaction Ledger</Text>
                    <Text style={styles.meta}>
                        Date Range: {dateRange.from} to {dateRange.to} • Total Bills: {rev.bills?.length || 0} • All amounts in INR
                    </Text>
                </View>

                {/* Detailed Bills Table */}
                <Text style={styles.sectionTitle}>Transaction Log (Recent Sales)</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '18%' }]}>Bill No</Text>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '13%' }]}>Date</Text>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '26%' }]}>Patient</Text>
                        <Text style={[styles.tableHeaderCell, styles.textCenter, { width: '12%' }]}>Channel</Text>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '18%' }]}>Doctor</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '13%' }]}>Amount (INR)</Text>
                    </View>
                    {(rev.bills || []).slice(0, 30).map((b: any, idx: number) => (
                        <View key={idx} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '18%', fontFamily: 'Helvetica' }]}>{b.billNo || '-'}</Text>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '13%', color: '#6b7280' }]}>{new Date(b.date).toLocaleDateString('en-GB')}</Text>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '26%' }]}>{b.patient}</Text>
                            <Text style={[styles.tableCell, styles.textCenter, { width: '12%', fontSize: 7, fontFamily: 'Helvetica-Bold' }]}>{b.channel.toUpperCase()}</Text>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '18%', color: '#4b5563' }]}>{b.doctor || 'Self'}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '13%', fontFamily: 'Helvetica-Bold' }]}>{fmtINR(b.revenue)}</Text>
                        </View>
                    ))}
                    {(rev.bills || []).length > 30 && (
                        <View style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textCenter, { width: '100%', color: '#9ca3af', fontStyle: 'italic' }]}>
                                ... and {(rev.bills || []).length - 30} more bills. Subtotals below cover ALL bills in the period, not just the 30 listed.
                            </Text>
                        </View>
                    )}
                    {/* Subtotals cover every bill in the period, so the page still balances
                        even though only the first 30 rows are printed. */}
                    {(['ipd', 'opd', 'counter'] as const)
                        .filter(ch => (rev.bills || []).some((b: any) => b.channel === ch))
                        .map(ch => {
                            const rows = (rev.bills || []).filter((b: any) => b.channel === ch);
                            return (
                                <View key={ch} style={[styles.tableRow, { borderTopWidth: 0.5, borderTopColor: '#d1d5db' }]}>
                                    <Text style={[styles.tableCell, styles.textLeft, styles.fontBold, { width: '87%' }]}>
                                        {ch === 'counter' ? 'Counter / Cash' : ch.toUpperCase()} subtotal — {rows.length} bills
                                    </Text>
                                    <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '13%' }]}>
                                        {fmtINR(rows.reduce((t: number, b: any) => t + (b.revenue || 0), 0))}
                                    </Text>
                                </View>
                            );
                        })}
                    <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: '#1e1b4b', backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tableCell, styles.textLeft, styles.fontBold, { width: '87%' }]}>
                            GRAND TOTAL — {(rev.bills || []).length} bills
                        </Text>
                        <Text style={[styles.tableCell, styles.textRight, styles.fontBold, { width: '13%' }]}>
                            {fmtINR((rev.bills || []).reduce((t: number, b: any) => t + (b.revenue || 0), 0))}
                        </Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text>HospitalOS Pharmacy Services</Text>
                    <Text>Page 3 of 3</Text>
                </View>
            </Page>
        </Document>
    );
}
