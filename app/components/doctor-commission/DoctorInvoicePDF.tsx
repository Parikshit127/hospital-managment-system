'use client';

/**
 * DoctorInvoicePDF
 * ----------------
 * The document sent to the doctor, in two shapes of the SAME invoice:
 *   detailed — every patient, every bill, every service with its rate, any manual
 *              change, then totals and the full payment history.
 *   summary  — one page: totals, a by-bill-type split, one line per patient, and
 *              the payments received.
 *
 * Pure formatting over getDoctorInvoiceDetail's payload; no data logic here.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { fmtIstDate, fmtIstDateTime } from '@/app/lib/ist';
import { INVOICE_STATUS_LABEL } from '@/app/lib/doctor-invoice-calc';

const NAVY = '#1e3a5f';
const GREEN = '#15803d';
const AMBER = '#b45309';
const INK = '#1c1917';
const MUTED = '#6b7280';
const ZEBRA = '#f5f8fc';
const LINE = '#d8dee9';

// Helvetica has no rupee glyph — "Rs." keeps the PDF legible everywhere.
export const pdfMoney = (v: unknown) => {
    const n = Number(v ?? 0);
    const neg = n < 0;
    const abs = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${neg ? '-' : ''}Rs. ${abs}`;
};
const pct = (v: unknown) => `${Math.round((Number(v) || 0) * 100) / 100}%`;

export type DoctorInvoiceDoc = {
    statement: {
        statement_number: string | null;
        status: string;
        invoice_date: string | Date;
        period_start: string | Date;
        period_end: string | Date;
        notes: string | null;
        tds_rate_percent: number;
        adjustment_amount: number;
        adjustment_note: string | null;
    };
    totals: { lines: number; adjustment: number; gross: number; tds: number; net: number; paid: number; balance: number };
    doctor: { name: string; specialty: string | null; phone: string | null; pan: string | null; bank_account: string | null; ifsc: string | null };
    org: { name: string; address: string | null; phone: string | null; license_no: string | null };
    lines: Array<{
        id: string;
        invoice_number: string;
        invoice_type: string;
        bill_date: string | Date;
        patient_id: string;
        patient_name: string;
        collected: number;
        rate: number;
        amount: number;
        computed_amount: number;
        is_adjusted: boolean;
        adjust_note: string | null;
        services: Array<{ name: string; collected: number; rate: number; amount: number; base_rate: number | null }>;
    }>;
    payments: Array<{ id: string; amount: number; paid_at: string | Date; payment_mode: string | null; reference: string | null; notes: string | null; voided_at: string | Date | null }>;
};

const s = StyleSheet.create({
    page: { paddingTop: 26, paddingBottom: 40, paddingHorizontal: 28, fontSize: 9, fontFamily: 'Helvetica', color: INK },
    band: { backgroundColor: NAVY, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between' },
    org: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 14, letterSpacing: 0.4 },
    orgSub: { color: '#cbd5e1', fontSize: 7.5, marginTop: 2 },
    docType: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, textAlign: 'right' },
    docNo: { color: '#cbd5e1', fontSize: 8.5, marginTop: 3, textAlign: 'right' },

    meta: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#eef2f7', paddingVertical: 8, paddingHorizontal: 14, marginBottom: 12 },
    lbl: { fontSize: 6.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    val: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 1.5, marginBottom: 5 },
    netBox: { backgroundColor: GREEN, borderRadius: 3, paddingVertical: 7, paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center' },
    netLbl: { color: '#d1fae5', fontSize: 6.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    netVal: { color: '#ffffff', fontSize: 15, fontFamily: 'Helvetica-Bold' },

    h2: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, marginTop: 4 },
    table: { borderWidth: 0.5, borderColor: LINE, marginBottom: 12 },
    thRow: { flexDirection: 'row', backgroundColor: NAVY },
    th: { paddingVertical: 5, paddingHorizontal: 5, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.3 },
    tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eceff4', alignItems: 'center' },
    td: { paddingVertical: 4, paddingHorizontal: 5, fontSize: 8.5 },
    sub: { paddingVertical: 1.5, paddingHorizontal: 5, fontSize: 7.5, color: MUTED },
    patientRow: { flexDirection: 'row', backgroundColor: '#e8eef7', paddingVertical: 4, paddingHorizontal: 5 },

    sumWrap: { alignSelf: 'flex-end', width: '55%', marginBottom: 12 },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, paddingHorizontal: 6 },
    sumTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#d1fae5', marginVertical: 2 },
    footer: { position: 'absolute', bottom: 16, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#9ca3af' },
    sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 },
    signBox: { width: 130, borderTopWidth: 0.7, borderTopColor: '#6b7280', paddingTop: 3, textAlign: 'center', fontSize: 8, color: MUTED },
});

const right = { textAlign: 'right' as const };
const cell = (w: string, align: 'left' | 'right' = 'left') => ({ width: w, alignItems: align === 'right' ? ('flex-end' as const) : ('flex-start' as const) });

function Header({ doc, title }: { doc: DoctorInvoiceDoc; title: string }) {
    const st = doc.statement;
    const status = INVOICE_STATUS_LABEL[st.status] ?? st.status;
    const isPaid = st.status === 'paid';
    return (
        <>
            <View style={s.band}>
                <View style={{ maxWidth: '62%' }}>
                    <Text style={s.org}>{doc.org.name.toUpperCase()}</Text>
                    {doc.org.address ? <Text style={s.orgSub}>{doc.org.address}</Text> : null}
                    {doc.org.phone || doc.org.license_no ? (
                        <Text style={s.orgSub}>
                            {[doc.org.phone && `Ph: ${doc.org.phone}`, doc.org.license_no && `Licence: ${doc.org.license_no}`].filter(Boolean).join('   ')}
                        </Text>
                    ) : null}
                </View>
                <View>
                    <Text style={s.docType}>{title}</Text>
                    <Text style={s.docNo}>{st.statement_number || 'Doctor invoice'}</Text>
                    <Text style={s.docNo}>Date: {fmtIstDate(st.invoice_date)}</Text>
                </View>
            </View>
            <View style={s.meta}>
                <View>
                    <Text style={s.lbl}>Doctor</Text>
                    <Text style={s.val}>
                        {doc.doctor.name}
                        {doc.doctor.specialty ? `  ·  ${doc.doctor.specialty}` : ''}
                    </Text>
                    <Text style={s.lbl}>Period</Text>
                    <Text style={s.val}>
                        {fmtIstDate(st.period_start)} – {fmtIstDate(st.period_end)}
                    </Text>
                    <Text style={s.lbl}>Status</Text>
                    <Text style={[s.val, { color: isPaid ? GREEN : AMBER, marginBottom: 0 }]}>{status.toUpperCase()}</Text>
                </View>
                <View style={s.netBox}>
                    <Text style={s.netLbl}>Net payable (after TDS)</Text>
                    <Text style={s.netVal}>{pdfMoney(doc.totals.net)}</Text>
                    {doc.totals.paid > 0 ? (
                        <Text style={[s.netLbl, { marginTop: 3 }]}>
                            Paid {pdfMoney(doc.totals.paid)}  ·  Balance {pdfMoney(doc.totals.balance)}
                        </Text>
                    ) : null}
                </View>
            </View>
        </>
    );
}

function Totals({ doc }: { doc: DoctorInvoiceDoc }) {
    const t = doc.totals;
    const st = doc.statement;
    return (
        <View style={s.sumWrap} wrap={false}>
            <View style={s.sumRow}>
                <Text>Bills subtotal</Text>
                <Text>{pdfMoney(t.lines)}</Text>
            </View>
            {Math.abs(t.adjustment) > 0.004 ? (
                <View style={s.sumRow}>
                    <Text>Adjustment{st.adjustment_note ? ` (${st.adjustment_note})` : ''}</Text>
                    <Text>{t.adjustment > 0 ? '+' : ''}{pdfMoney(t.adjustment)}</Text>
                </View>
            ) : null}
            <View style={[s.sumRow, { borderTopWidth: 0.7, borderTopColor: '#b8c6de' }]}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Gross payable</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{pdfMoney(t.gross)}</Text>
            </View>
            <View style={s.sumRow}>
                <Text style={{ color: MUTED }}>TDS deducted ({pct(st.tds_rate_percent)})</Text>
                <Text style={{ color: MUTED }}>-{pdfMoney(t.tds)}</Text>
            </View>
            <View style={s.sumTotal}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>NET PAYABLE</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{pdfMoney(t.net)}</Text>
            </View>
            <View style={s.sumRow}>
                <Text>Paid so far</Text>
                <Text>{pdfMoney(t.paid)}</Text>
            </View>
            <View style={s.sumRow}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: t.balance > 0.004 ? AMBER : GREEN }}>Balance due</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: t.balance > 0.004 ? AMBER : GREEN }}>{pdfMoney(t.balance)}</Text>
            </View>
        </View>
    );
}

function Payments({ doc }: { doc: DoctorInvoiceDoc }) {
    const live = doc.payments.filter((p) => !p.voided_at);
    return (
        <View wrap={false}>
            <Text style={s.h2}>Payments received</Text>
            <View style={s.table}>
                <View style={s.thRow}>
                    <View style={cell('27%')}><Text style={s.th}>Date & time</Text></View>
                    <View style={cell('16%')}><Text style={s.th}>Mode</Text></View>
                    <View style={cell('37%')}><Text style={s.th}>Reference / notes</Text></View>
                    <View style={cell('20%', 'right')}><Text style={s.th}>Amount</Text></View>
                </View>
                {live.length === 0 ? (
                    <View style={s.tr}><Text style={[s.td, { color: MUTED }]}>No payment has been made against this invoice yet.</Text></View>
                ) : (
                    live.map((p, i) => (
                        <View key={p.id} style={[s.tr, { backgroundColor: i % 2 ? ZEBRA : '#ffffff' }]}>
                            <View style={cell('27%')}><Text style={s.td}>{fmtIstDateTime(p.paid_at)}</Text></View>
                            <View style={cell('16%')}><Text style={s.td}>{p.payment_mode || '—'}</Text></View>
                            <View style={cell('37%')}><Text style={s.td}>{[p.reference, p.notes].filter(Boolean).join(' · ') || '—'}</Text></View>
                            <View style={cell('20%', 'right')}><Text style={[s.td, right, { fontFamily: 'Helvetica-Bold' }]}>{pdfMoney(p.amount)}</Text></View>
                        </View>
                    ))
                )}
            </View>
        </View>
    );
}

function Closing({ doc }: { doc: DoctorInvoiceDoc }) {
    const d = doc.doctor;
    const hasBank = d.pan || d.bank_account || d.ifsc;
    return (
        <View wrap={false}>
            {hasBank ? (
                <Text style={{ fontSize: 8, color: MUTED, marginBottom: 3 }}>
                    Payee: {d.name}
                    {d.pan ? `   PAN: ${d.pan}` : ''}
                    {d.bank_account ? `   A/c: ${d.bank_account}` : ''}
                    {d.ifsc ? `   IFSC: ${d.ifsc}` : ''}
                </Text>
            ) : null}
            {doc.statement.notes ? <Text style={{ fontSize: 8, color: MUTED }}>Notes: {doc.statement.notes}</Text> : null}
            <View style={s.sign}>
                <Text style={s.signBox}>Prepared by</Text>
                <Text style={s.signBox}>Doctor&apos;s signature</Text>
                <Text style={s.signBox}>Authorised signatory</Text>
            </View>
        </View>
    );
}

function Footer({ doc, label }: { doc: DoctorInvoiceDoc; label: string }) {
    return (
        <View style={s.footer} fixed>
            <Text>{doc.org.name} • {label} • {doc.statement.statement_number || ''}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
    );
}

// ── Detailed ────────────────────────────────────────────────────────────────

function DetailedBody({ doc }: { doc: DoctorInvoiceDoc }) {
    // Group the bills under their patient, keeping the newest-first order.
    const groups: Array<{ key: string; name: string; uhid: string; lines: DoctorInvoiceDoc['lines'] }> = [];
    for (const l of doc.lines) {
        let g = groups.find((x) => x.key === l.patient_id);
        if (!g) groups.push((g = { key: l.patient_id, name: l.patient_name, uhid: l.patient_id, lines: [] }));
        g.lines.push(l);
    }
    return (
        <>
            <Text style={s.h2}>Patient-wise breakdown</Text>
            <View style={s.table}>
                <View style={s.thRow} fixed>
                    <View style={cell('17%')}><Text style={s.th}>Bill no.</Text></View>
                    <View style={cell('11%')}><Text style={s.th}>Type</Text></View>
                    <View style={cell('14%')}><Text style={s.th}>Date</Text></View>
                    <View style={cell('22%', 'right')}><Text style={s.th}>Collected (share)</Text></View>
                    <View style={cell('12%', 'right')}><Text style={s.th}>Rate</Text></View>
                    <View style={cell('24%', 'right')}><Text style={s.th}>Payable</Text></View>
                </View>
                {groups.map((g, gi) => (
                    <View key={g.key}>
                        <View style={s.patientRow} wrap={false}>
                            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>
                                {gi + 1}. {g.name || '—'}
                            </Text>
                            <Text style={{ color: MUTED, fontSize: 7.5, marginLeft: 6, marginTop: 1 }}>UHID {g.uhid}</Text>
                        </View>
                        {g.lines.map((l) => (
                            <View key={l.id} wrap={false}>
                                <View style={s.tr}>
                                    <View style={cell('17%')}><Text style={s.td}>{l.invoice_number}</Text></View>
                                    <View style={cell('11%')}><Text style={s.td}>{l.invoice_type}</Text></View>
                                    <View style={cell('14%')}><Text style={s.td}>{fmtIstDate(l.bill_date)}</Text></View>
                                    <View style={cell('22%', 'right')}><Text style={[s.td, right]}>{pdfMoney(l.collected)}</Text></View>
                                    <View style={cell('12%', 'right')}><Text style={[s.td, right]}>{l.rate ? pct(l.rate) : '—'}</Text></View>
                                    <View style={cell('24%', 'right')}><Text style={[s.td, right, { fontFamily: 'Helvetica-Bold' }]}>{pdfMoney(l.amount)}</Text></View>
                                </View>
                                {l.services.map((sv, si) => (
                                    <View key={si} style={{ flexDirection: 'row' }}>
                                        <View style={cell('42%')}><Text style={s.sub}>      - {sv.name}</Text></View>
                                        <View style={cell('22%', 'right')}><Text style={[s.sub, right]}>{pdfMoney(sv.collected)}</Text></View>
                                        <View style={cell('12%', 'right')}>
                                            <Text style={[s.sub, right]}>
                                                {sv.rate ? pct(sv.rate) : '—'}
                                                {sv.base_rate != null ? '*' : ''}
                                            </Text>
                                        </View>
                                        <View style={cell('24%', 'right')}><Text style={[s.sub, right]}>{pdfMoney(sv.amount)}</Text></View>
                                    </View>
                                ))}
                                {l.is_adjusted ? (
                                    <Text style={[s.sub, { color: AMBER }]}>
                                        {'   '}Adjusted from {pdfMoney(l.computed_amount)} to {pdfMoney(l.amount)}
                                        {l.adjust_note ? ` — ${l.adjust_note}` : ''}
                                    </Text>
                                ) : null}
                            </View>
                        ))}
                    </View>
                ))}
            </View>
            {doc.lines.some((l) => l.services.some((sv) => sv.base_rate != null)) ? (
                <Text style={{ fontSize: 7, color: MUTED, marginTop: -8, marginBottom: 10 }}>* rate changed from the standard rate for this invoice</Text>
            ) : null}
        </>
    );
}

// ── Summary ─────────────────────────────────────────────────────────────────

function SummaryBody({ doc }: { doc: DoctorInvoiceDoc }) {
    const byType = new Map<string, { bills: number; collected: number; amount: number }>();
    const byPatient = new Map<string, { name: string; uhid: string; bills: number; collected: number; amount: number }>();
    for (const l of doc.lines) {
        const t = byType.get(l.invoice_type) ?? { bills: 0, collected: 0, amount: 0 };
        t.bills++; t.collected += l.collected; t.amount += l.amount;
        byType.set(l.invoice_type, t);
        const p = byPatient.get(l.patient_id) ?? { name: l.patient_name, uhid: l.patient_id, bills: 0, collected: 0, amount: 0 };
        p.bills++; p.collected += l.collected; p.amount += l.amount;
        byPatient.set(l.patient_id, p);
    }
    const types = [...byType.entries()];
    const patients = [...byPatient.values()].sort((a, b) => b.amount - a.amount);
    return (
        <>
            <Text style={s.h2}>By bill type</Text>
            <View style={s.table} wrap={false}>
                <View style={s.thRow}>
                    <View style={cell('40%')}><Text style={s.th}>Type</Text></View>
                    <View style={cell('12%', 'right')}><Text style={s.th}>Bills</Text></View>
                    <View style={cell('24%', 'right')}><Text style={s.th}>Collected (share)</Text></View>
                    <View style={cell('24%', 'right')}><Text style={s.th}>Payable</Text></View>
                </View>
                {types.map(([name, t], i) => (
                    <View key={name} style={[s.tr, { backgroundColor: i % 2 ? ZEBRA : '#ffffff' }]}>
                        <View style={cell('40%')}><Text style={s.td}>{name}</Text></View>
                        <View style={cell('12%', 'right')}><Text style={[s.td, right]}>{t.bills}</Text></View>
                        <View style={cell('24%', 'right')}><Text style={[s.td, right]}>{pdfMoney(t.collected)}</Text></View>
                        <View style={cell('24%', 'right')}><Text style={[s.td, right, { fontFamily: 'Helvetica-Bold' }]}>{pdfMoney(t.amount)}</Text></View>
                    </View>
                ))}
            </View>

            <Text style={s.h2}>By patient ({patients.length})</Text>
            <View style={s.table}>
                <View style={s.thRow} fixed>
                    <View style={cell('6%')}><Text style={s.th}>#</Text></View>
                    <View style={cell('34%')}><Text style={s.th}>Patient</Text></View>
                    <View style={cell('16%')}><Text style={s.th}>UHID</Text></View>
                    <View style={cell('8%', 'right')}><Text style={s.th}>Bills</Text></View>
                    <View style={cell('18%', 'right')}><Text style={s.th}>Collected</Text></View>
                    <View style={cell('18%', 'right')}><Text style={s.th}>Payable</Text></View>
                </View>
                {patients.map((p, i) => (
                    <View key={p.uhid} style={[s.tr, { backgroundColor: i % 2 ? ZEBRA : '#ffffff' }]} wrap={false}>
                        <View style={cell('6%')}><Text style={s.td}>{i + 1}</Text></View>
                        <View style={cell('34%')}><Text style={s.td}>{p.name || '—'}</Text></View>
                        <View style={cell('16%')}><Text style={s.td}>{p.uhid}</Text></View>
                        <View style={cell('8%', 'right')}><Text style={[s.td, right]}>{p.bills}</Text></View>
                        <View style={cell('18%', 'right')}><Text style={[s.td, right]}>{pdfMoney(p.collected)}</Text></View>
                        <View style={cell('18%', 'right')}><Text style={[s.td, right, { fontFamily: 'Helvetica-Bold' }]}>{pdfMoney(p.amount)}</Text></View>
                    </View>
                ))}
            </View>
        </>
    );
}

export default function DoctorInvoicePDF({ doc, mode }: { doc: DoctorInvoiceDoc; mode: 'detailed' | 'summary' }) {
    const detailed = mode === 'detailed';
    const title = detailed ? 'Doctor Payout Invoice — Detailed' : 'Doctor Payout Invoice — Summary';
    return (
        <Document title={`${doc.statement.statement_number || 'Doctor invoice'} (${mode})`} author={doc.org.name}>
            <Page size="A4" style={s.page} wrap>
                <Header doc={doc} title={title} />
                {detailed ? <DetailedBody doc={doc} /> : <SummaryBody doc={doc} />}
                <Totals doc={doc} />
                <Payments doc={doc} />
                <Closing doc={doc} />
                <Footer doc={doc} label={detailed ? 'Detailed invoice' : 'Summary invoice'} />
            </Page>
        </Document>
    );
}
