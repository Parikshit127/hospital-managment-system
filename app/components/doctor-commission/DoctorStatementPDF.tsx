'use client';

/**
 * DoctorStatementPDF
 * ------------------
 * @react-pdf/renderer document for a SINGLE historical doctor payout statement.
 * Used by the Statements tab's per-row download button — it renders the exact
 * commission lines that belong to one statement (filtered client-side by
 * statement_id), so the icon downloads that statement instead of window.print().
 *
 * No backend/data logic lives here — it only formats data already loaded by
 * getDoctorCommissionDetail.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#1e3a5f';
const GREEN = '#15803d';
const BLUE = '#1d4ed8';
const INK = '#1c1917';
const MUTED = '#6b7280';
const ZEBRA = '#f5f8fc';
const LINE = '#d8dee9';

const money = (v: unknown) => 'Rs. ' + Math.round(Number(v ?? 0)).toLocaleString('en-US');
const fmtDate = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const COLS = [
    { key: 'invoice_id', w: 14, align: 'left' as const },
    { key: 'invoice_type', w: 16, align: 'left' as const },
    { key: 'eligible_base', w: 22, align: 'right' as const },
    { key: 'rate_applied', w: 12, align: 'right' as const },
    { key: 'commission_amount', w: 20, align: 'right' as const },
    { key: 'accrued_at', w: 16, align: 'right' as const },
];
const HEAD = ['Invoice', 'Type', 'Collected Base', 'Rate', 'Commission', 'Date'];

const styles = StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 30, fontSize: 9, fontFamily: 'Helvetica', color: INK },
    headerBand: { backgroundColor: NAVY, paddingVertical: 12, paddingHorizontal: 16, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    hospital: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 15, letterSpacing: 0.4 },
    docType: { color: '#cbd5e1', fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 },

    metaRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#eef2f7', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 14 },
    metaLabel: { fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    metaValue: { fontSize: 10, color: INK, fontFamily: 'Helvetica-Bold', marginTop: 2 },

    totalBox: { backgroundColor: GREEN, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'flex-end' },
    totalLabel: { color: '#d1fae5', fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    totalValue: { color: '#ffffff', fontSize: 14, fontFamily: 'Helvetica-Bold' },

    table: { borderWidth: 0.5, borderColor: LINE, marginBottom: 14 },
    thRow: { flexDirection: 'row', backgroundColor: NAVY },
    th: { paddingVertical: 6, paddingHorizontal: 6, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3 },
    tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eceff4' },
    td: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 8.5 },
    totalRow: { flexDirection: 'row', borderTopWidth: 1.2, borderTopColor: '#b8c6de', backgroundColor: '#dde6f3' },

    payBox: { borderWidth: 0.5, borderColor: LINE, borderRadius: 3, padding: 12, marginBottom: 12 },
    payTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    payGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    payItem: { width: '25%', marginBottom: 4 },

    footer: { position: 'absolute', bottom: 18, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#9ca3af' },
});

const alignItems = (a: 'left' | 'right') => (a === 'right' ? 'flex-end' : 'flex-start');

interface Line { invoice_id: number; invoice_type: string; eligible_base: number; rate_applied: number; commission_amount: number; accrued_at: string }
export interface DoctorStatementPDFProps {
    hospitalName?: string;
    doctor: { name: string; specialty?: string | null };
    statement: {
        period_start: string; period_end: string; total_commission: number; status: string;
        tds_rate_percent?: number; total_tds?: number; net_payable?: number;
        paid_amount?: number | null; paid_at?: string | null; payment_mode?: string | null;
        payment_reference?: string | null; notes?: string | null;
    };
    lines: Line[];
}

function cellText(key: string, row: Line): string {
    switch (key) {
        case 'invoice_id': return `#${row.invoice_id}`;
        case 'invoice_type': return row.invoice_type || '—';
        case 'eligible_base': return money(row.eligible_base);
        case 'rate_applied': return row.rate_applied ? `${row.rate_applied}%` : '—';
        case 'commission_amount': return money(row.commission_amount);
        case 'accrued_at': return fmtDate(row.accrued_at);
        default: return '';
    }
}

export default function DoctorStatementPDF({ hospitalName, doctor, statement, lines }: DoctorStatementPDFProps) {
    const isPaid = statement.status === 'paid';
    // Statements created before TDS support existed have net_payable = 0 (schema
    // default) — fall back to the gross commission rather than showing ₹0 net.
    const netPayable = statement.net_payable && statement.net_payable > 0 ? statement.net_payable : statement.total_commission;
    const totalTds = statement.total_tds ?? 0;
    return (
        <Document>
            <Page size="A4" style={styles.page} wrap>
                <View style={styles.headerBand}>
                    <Text style={styles.hospital}>{(hospitalName || 'Hospital OS').toUpperCase()}</Text>
                    <Text style={styles.docType}>Doctor Payout Statement</Text>
                </View>

                <View style={styles.metaRow}>
                    <View>
                        <Text style={styles.metaLabel}>Doctor</Text>
                        <Text style={styles.metaValue}>{doctor.name}{doctor.specialty ? `  ·  ${doctor.specialty}` : ''}</Text>
                        <Text style={[styles.metaLabel, { marginTop: 6 }]}>Period</Text>
                        <Text style={styles.metaValue}>{fmtDate(statement.period_start)} – {fmtDate(statement.period_end)}</Text>
                        <Text style={[styles.metaLabel, { marginTop: 6 }]}>Status</Text>
                        <Text style={[styles.metaValue, { color: isPaid ? GREEN : '#b45309' }]}>{statement.status.replace(/_/g, ' ').toUpperCase()}</Text>
                    </View>
                    <View style={styles.totalBox}>
                        <Text style={styles.totalLabel}>Net Payout (after TDS)</Text>
                        <Text style={styles.totalValue}>{money(netPayable)}</Text>
                    </View>
                </View>

                {/* Commission lines */}
                <View style={styles.table}>
                    <View style={styles.thRow} fixed>
                        {COLS.map((c, i) => (
                            <View key={c.key} style={{ width: `${c.w}%`, alignItems: alignItems(c.align) }}>
                                <Text style={styles.th}>{HEAD[i]}</Text>
                            </View>
                        ))}
                    </View>
                    {lines.length === 0 ? (
                        <View style={styles.tr}><Text style={[styles.td, { color: MUTED }]}>No commission lines recorded for this statement.</Text></View>
                    ) : lines.map((row, idx) => (
                        <View key={idx} style={[styles.tr, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#ffffff' }]} wrap={false}>
                            {COLS.map((c) => {
                                const isMoney = c.key === 'eligible_base' || c.key === 'commission_amount';
                                return (
                                    <View key={c.key} style={{ width: `${c.w}%`, alignItems: alignItems(c.align), justifyContent: 'center' }}>
                                        <Text style={[styles.td, { textAlign: c.align, color: isMoney ? BLUE : INK, fontFamily: c.key === 'commission_amount' ? 'Helvetica-Bold' : 'Helvetica' }]}>
                                            {cellText(c.key, row)}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                    {/* Total row */}
                    <View style={styles.totalRow} wrap={false}>
                        <View style={{ width: '64%' }}><Text style={[styles.td, { fontFamily: 'Helvetica-Bold', color: INK }]}>TOTAL ({lines.length} line{lines.length === 1 ? '' : 's'})</Text></View>
                        <View style={{ width: '20%', alignItems: 'flex-end', justifyContent: 'center' }}><Text style={[styles.td, { fontFamily: 'Helvetica-Bold', color: INK }]}>{money(statement.total_commission)}</Text></View>
                        <View style={{ width: '16%' }} />
                    </View>
                    <View style={[styles.tr, { borderBottomWidth: 0 }]} wrap={false}>
                        <View style={{ width: '64%' }}><Text style={[styles.td, { color: MUTED }]}>TDS deducted ({statement.tds_rate_percent ?? 10}%)</Text></View>
                        <View style={{ width: '20%', alignItems: 'flex-end', justifyContent: 'center' }}><Text style={[styles.td, { color: MUTED }]}>−{money(totalTds)}</Text></View>
                        <View style={{ width: '16%' }} />
                    </View>
                    <View style={[styles.totalRow, { backgroundColor: '#d1fae5' }]} wrap={false}>
                        <View style={{ width: '64%' }}><Text style={[styles.td, { fontFamily: 'Helvetica-Bold', color: INK }]}>NET PAYABLE</Text></View>
                        <View style={{ width: '20%', alignItems: 'flex-end', justifyContent: 'center' }}><Text style={[styles.td, { fontFamily: 'Helvetica-Bold', color: INK }]}>{money(netPayable)}</Text></View>
                        <View style={{ width: '16%' }} />
                    </View>
                </View>

                {/* Payment details */}
                {isPaid && (
                    <View style={styles.payBox}>
                        <Text style={styles.payTitle}>Payment Details</Text>
                        <View style={styles.payGrid}>
                            <View style={styles.payItem}><Text style={styles.metaLabel}>Paid Amount</Text><Text style={styles.metaValue}>{statement.paid_amount != null ? money(statement.paid_amount) : '—'}</Text></View>
                            <View style={styles.payItem}><Text style={styles.metaLabel}>Paid On</Text><Text style={styles.metaValue}>{fmtDate(statement.paid_at)}</Text></View>
                            <View style={styles.payItem}><Text style={styles.metaLabel}>Mode</Text><Text style={styles.metaValue}>{statement.payment_mode || '—'}</Text></View>
                            <View style={styles.payItem}><Text style={styles.metaLabel}>Reference</Text><Text style={styles.metaValue}>{statement.payment_reference || '—'}</Text></View>
                        </View>
                        {statement.notes ? <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>Notes: {statement.notes}</Text> : null}
                    </View>
                )}

                <View style={styles.footer} fixed>
                    <Text>{(hospitalName || 'Hospital OS')} • Doctor Payout Statement</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
