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
function fmtINR(val: number): string {
    return `₹${Math.round(val || 0).toLocaleString('en-IN')}`;
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

    return (
        <Document>
            {/* Page 1: Summary, Channels, Doctors & Movers */}
            <Page size="A4" orientation="portrait" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.subtitle}>PHARMACY PORTAL FINANCIAL REPORT</Text>
                    <Text style={styles.title}>Revenue & Financial Analytics</Text>
                    <Text style={styles.meta}>
                        Date Range: {dateRange.from} to {dateRange.to} • Generated: {now} • HospitalOS RCM
                    </Text>
                </View>

                {/* KPI Metrics */}
                <Text style={styles.sectionTitle}>Executive Financial Summary</Text>
                <View style={styles.kpiContainer}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Total Revenue</Text>
                        <Text style={styles.kpiVal}>{fmtINR(rev.totalRevenue)}</Text>
                        <Text style={styles.kpiSub}>{rev.totalBills} bills issued</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>Gross Margin %</Text>
                        <Text style={styles.kpiVal}>{rev.grossMarginPct}%</Text>
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
                </View>

                {/* Top Movers & Prescribers Grid */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    {/* Top Movers Column */}
                    <View style={{ width: '48%' }}>
                        <Text style={styles.sectionTitle}>Top 5 Medicines (by Revenue)</Text>
                        <View style={styles.table}>
                            <View style={styles.tableHeaderRow}>
                                <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '60%' }]}>Medicine</Text>
                                <Text style={[styles.tableHeaderCell, styles.textRight, { width: '20%' }]}>Qty</Text>
                                <Text style={[styles.tableHeaderCell, styles.textRight, { width: '20%' }]}>Revenue</Text>
                            </View>
                            {(rev.topMovers || []).slice(0, 5).map((m: any, idx: number) => (
                                <View key={idx} style={styles.tableRow}>
                                    <Text style={[styles.tableCell, styles.textLeft, { width: '60%' }]}>{m.name}</Text>
                                    <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{m.qty}</Text>
                                    <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{fmtINR(m.revenue)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Prescribers Column */}
                    <View style={{ width: '48%' }}>
                        <Text style={styles.sectionTitle}>Prescriber Revenue Splits</Text>
                        <View style={styles.table}>
                            <View style={styles.tableHeaderRow}>
                                <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '70%' }]}>Doctor</Text>
                                <Text style={[styles.tableHeaderCell, styles.textRight, { width: '30%' }]}>Revenue</Text>
                            </View>
                            {(rev.byDoctor || []).slice(0, 5).map((d: any, idx: number) => (
                                <View key={idx} style={styles.tableRow}>
                                    <Text style={[styles.tableCell, styles.textLeft, { width: '70%' }]}>{d.name}</Text>
                                    <Text style={[styles.tableCell, styles.textRight, { width: '30%' }]}>{fmtINR(d.revenue)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text>HospitalOS Pharmacy Services</Text>
                    <Text>Page 1 of 2</Text>
                </View>
            </Page>

            {/* Page 2: Detailed Transaction Ledger */}
            <Page size="A4" orientation="portrait" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.subtitle}>PHARMACY PORTAL FINANCIAL REPORT</Text>
                    <Text style={styles.title}>Detailed Billing Transaction Ledger</Text>
                    <Text style={styles.meta}>
                        Date Range: {dateRange.from} to {dateRange.to} • Generated: {now} • Total Bills: {rev.bills?.length || 0}
                    </Text>
                </View>

                {/* Detailed Bills Table */}
                <Text style={styles.sectionTitle}>Transaction Log (Recent Sales)</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '20%' }]}>Bill No</Text>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '30%' }]}>Patient</Text>
                        <Text style={[styles.tableHeaderCell, styles.textCenter, { width: '15%' }]}>Channel</Text>
                        <Text style={[styles.tableHeaderCell, styles.textLeft, { width: '20%' }]}>Doctor</Text>
                        <Text style={[styles.tableHeaderCell, styles.textRight, { width: '15%' }]}>Amount (INR)</Text>
                    </View>
                    {(rev.bills || []).slice(0, 30).map((b: any, idx: number) => (
                        <View key={idx} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '20%', fontFamily: 'Helvetica' }]}>{b.billNo}</Text>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '30%' }]}>{b.patient}</Text>
                            <Text style={[styles.tableCell, styles.textCenter, { width: '15%', fontSize: 7, fontFamily: 'Helvetica-Bold' }]}>{b.channel.toUpperCase()}</Text>
                            <Text style={[styles.tableCell, styles.textLeft, { width: '20%', color: '#4b5563' }]}>{b.doctor || 'Self'}</Text>
                            <Text style={[styles.tableCell, styles.textRight, { width: '15%', fontFamily: 'Helvetica-Bold' }]}>{fmtINR(b.revenue)}</Text>
                        </View>
                    ))}
                    {(rev.bills || []).length > 30 && (
                        <View style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.textCenter, { width: '100%', color: '#9ca3af', fontStyle: 'italic' }]}>
                                ... and {(rev.bills || []).length - 30} more bills. Please export to Excel/XML for the complete log.
                            </Text>
                        </View>
                    )}
                </View>

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text>HospitalOS Pharmacy Services</Text>
                    <Text>Page 2 of 2</Text>
                </View>
            </Page>
        </Document>
    );
}
