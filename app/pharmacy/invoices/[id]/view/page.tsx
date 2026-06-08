import { notFound } from 'next/navigation';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';

export default async function PharmacyInvoiceViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) notFound();

    const session = await getSession();
    if (!session?.organization_id) {
        return <div style={{ padding: 40, fontFamily: 'Arial' }}>Not authorised. Please log in.</div>;
    }

    const invoice = await prisma.invoices.findFirst({
        where: { id: invoiceId, organizationId: session.organization_id },
        include: {
            items: { orderBy: { created_at: 'asc' } },
            patient: { select: { full_name: true, patient_id: true, phone: true } },
        },
    });

    if (!invoice) notFound();

    const items = invoice.items as any[];
    const subtotal = items.reduce((s, i) => s + Number(i.net_price || 0), 0);
    const totalDiscount = items.reduce((s, i) => s + Number(i.discount || 0), 0);
    const tax     = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
    const cgst    = tax / 2;
    const sgst    = tax / 2;
    const total   = subtotal + tax;
    const paid    = Number((invoice as any).paid_amount || 0);
    const balance = total - paid;
    const date    = new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time    = new Date(invoice.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // ─── words helper ───────────────────────────────────────────────────────────
    function numberToWords(n: number): string {
        if (n === 0) return 'Zero';
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        function belowThousand(num: number): string {
            if (num === 0) return '';
            if (num < 20) return ones[num] + ' ';
            if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' ';
            return ones[Math.floor(num / 100)] + ' Hundred ' + belowThousand(num % 100);
        }
        const rupees = Math.floor(n);
        const paise = Math.round((n - rupees) * 100);
        let words = '';
        if (rupees >= 10000000) { words += belowThousand(Math.floor(rupees / 10000000)) + 'Crore '; }
        if (rupees >= 100000)   { words += belowThousand(Math.floor((rupees % 10000000) / 100000)) + 'Lakh '; }
        if (rupees >= 1000)     { words += belowThousand(Math.floor((rupees % 100000) / 1000)) + 'Thousand '; }
        words += belowThousand(rupees % 1000);
        words = words.trim() + ' Rupees';
        if (paise > 0) words += ' and ' + belowThousand(paise).trim() + ' Paise';
        return words + ' Only';
    }

    const css = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #f0f2f5; }

        /* ── Toolbar ── */
        .toolbar { display: flex; align-items: center; justify-content: center; gap: 12px;
            padding: 10px 20px; background: #1e3a6e; }
        .toolbar button { padding: 7px 24px; background: white; color: #1e3a6e; font-weight: 700;
            border: none; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.15s; }
        .toolbar button:hover { background: #e8edf4; }
        .toolbar .inv-ref { font-size: 11px; color: #94a3b8; }

        /* ── Page ── */
        .page { max-width: 800px; margin: 24px auto; background: #fff; border-radius: 4px;
            box-shadow: 0 1px 6px rgba(0,0,0,0.08); overflow: hidden; }

        /* ── Accent bar ── */
        .accent-bar { height: 4px; background: linear-gradient(90deg, #1e3a6e 0%, #2d5aa0 100%); }

        /* ── Inner wrap ── */
        .inner { padding: 36px 44px 32px; }

        /* ── Header ── */
        .ph-header { display: flex; justify-content: space-between; align-items: flex-start;
            padding-bottom: 16px; margin-bottom: 0; }
        .ph-name { font-size: 22px; font-weight: 900; color: #1e3a6e; letter-spacing: 0.5px; }
        .ph-division { font-size: 9.5px; color: #6b7280; margin-top: 1px; font-style: italic; }
        .ph-addr { font-size: 10px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
        .ph-gst  { font-size: 10px; color: #6b7280; }
        .inv-badge { display: inline-block; padding: 3px 12px; background: #1e3a6e; color: #fff;
            font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;
            border-radius: 3px; }
        .inv-meta { font-size: 10px; color: #6b7280; margin-top: 6px; text-align: right; line-height: 1.6; }
        .inv-meta strong { color: #1a1a1a; font-weight: 700; }

        /* ── Divider ── */
        .divider { border: none; border-top: 1.5px solid #e5e7eb; margin: 0 0 14px 0; }

        /* ── Patient info ── */
        .pt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
            margin-bottom: 16px; padding: 12px 16px; background: #f8f9fb; border-radius: 6px; border: 1px solid #eef0f4; }
        .pt-field { display: flex; gap: 6px; font-size: 11px; }
        .pt-label { color: #6b7280; white-space: nowrap; }
        .pt-value { font-weight: 700; color: #111; }

        /* ── Items table ── */
        table.items { width: 100%; border-collapse: collapse; }
        table.items thead th { padding: 8px 10px; font-size: 9px; font-weight: 800;
            text-transform: uppercase; letter-spacing: 0.08em; color: #fff; background: #1e3a6e; }
        table.items thead th:first-child { border-radius: 4px 0 0 0; }
        table.items thead th:last-child  { border-radius: 0 4px 0 0; }
        table.items tbody td { padding: 7px 10px; font-size: 11px; border-bottom: 1px solid #f0f0f0; }
        table.items tbody tr:nth-child(even) { background: #fafbfc; }
        table.items tbody tr:hover { background: #f0f4ff; }
        .med-name { font-weight: 600; }
        .batch-tag { font-size: 8.5px; color: #9ca3af; margin-left: 4px; }
        .hsn-tag  { font-size: 9px; color: #6b7280; }

        /* ── Totals strip ── */
        .totals-strip { display: flex; justify-content: flex-end; margin-top: 0; }
        .totals-box { width: 280px; }
        .totals-box .row { display: flex; justify-content: space-between; padding: 5px 10px; font-size: 11px; }
        .totals-box .row.sub { color: #6b7280; }
        .totals-box .row.tax { color: #9ca3af; font-size: 10px; }
        .totals-box .row.grand { background: #1e3a6e; color: #fff; font-weight: 900; font-size: 14px;
            border-radius: 0 0 4px 4px; padding: 8px 10px; margin-top: 2px; }

        /* ── Amount in words ── */
        .words-bar { margin-top: 14px; padding: 8px 14px; background: #f0f4ff; border-left: 3px solid #1e3a6e;
            border-radius: 0 4px 4px 0; font-size: 10.5px; color: #374151; }
        .words-bar strong { color: #111; }

        /* ── Payment summary ── */
        .pay-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 16px; }
        .pay-card { padding: 10px 14px; border-radius: 6px; border: 1px solid #e5e7eb; text-align: center; }
        .pay-card .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em;
            color: #6b7280; font-weight: 700; }
        .pay-card .val { font-size: 16px; font-weight: 900; margin-top: 2px; }
        .pay-card.bill  .val { color: #1e3a6e; }
        .pay-card.paid  .val { color: #059669; }
        .pay-card.bal   .val { color: #dc2626; }
        .pay-card.bal.zero .val { color: #059669; }

        /* ── Footer ── */
        .inv-footer { display: flex; justify-content: space-between; align-items: flex-end;
            margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
        .terms { max-width: 300px; }
        .terms-title { font-size: 9px; font-weight: 800; text-transform: uppercase;
            letter-spacing: 0.08em; color: #6b7280; margin-bottom: 4px; }
        .terms-list { font-size: 9px; color: #9ca3af; line-height: 1.5; }
        .sig { text-align: right; }
        .sig-line { border-top: 1px solid #9ca3af; width: 150px; margin: 36px 0 5px auto; }
        .sig-name { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
        .sig-for  { font-size: 9px; color: #6b7280; margin-top: 2px; font-style: italic; }

        .gen-note { font-size: 8px; color: #d1d5db; text-align: center; margin-top: 20px;
            padding-top: 10px; border-top: 1px dashed #e5e7eb; }

        @media print {
            @page { margin: 10mm 8mm; size: A4; }
            body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .toolbar { display: none !important; }
            .page { margin: 0; box-shadow: none; border-radius: 0; }
            .inner { padding: 20px 30px; }
            table.items thead th { background: #1e3a6e !important; color: #fff !important; }
            table.items tbody tr:nth-child(even) { background: #fafbfc !important; }
            .totals-box .row.grand { background: #1e3a6e !important; color: #fff !important; }
            .words-bar { background: #f0f4ff !important; }
            .pt-grid { background: #f8f9fb !important; }
            .pay-card.bill .val { color: #1e3a6e !important; }
            .pay-card.paid .val { color: #059669 !important; }
            .pay-card.bal  .val { color: #dc2626 !important; }
            .pay-card.bal.zero .val { color: #059669 !important; }
        }
    `;

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: css }} />

            {/* ── Toolbar (hidden on print) ── */}
            <div className="toolbar">
                <script dangerouslySetInnerHTML={{ __html: `
                    document.addEventListener('DOMContentLoaded', function() {
                        var btn = document.getElementById('printBtn');
                        if (btn) btn.onclick = function(){ window.print(); };
                        var back = document.getElementById('backBtn');
                        if (back) back.onclick = function(){ window.history.back(); };
                    });
                ` }} />
                <button id="backBtn" style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569' }}>
                    Back
                </button>
                <button id="printBtn">Print / Download PDF</button>
                <span className="inv-ref">
                    {invoice.invoice_number}
                </span>
            </div>

            <div className="page">
                <div className="accent-bar" />
                <div className="inner">

                    {/* ── Header ── */}
                    <div className="ph-header">
                        <div>
                            <div className="ph-name">Garnet Medicare</div>
                            <div className="ph-division">(Division of Garnet Pharmaceutical)</div>
                            <div className="ph-addr">
                                B-162, East of Kailash Road, New Delhi, Delhi 110065<br />
                                GST No.: 07AKIPA3324R1Z0
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span className="inv-badge">Tax Invoice</span>
                            <div className="inv-meta">
                                Invoice: <strong>{invoice.invoice_number}</strong><br />
                                Date: <strong>{date}</strong><br />
                                Time: <strong>{time}</strong>
                            </div>
                        </div>
                    </div>

                    <hr className="divider" />

                    {/* ── Patient Info ── */}
                    <div className="pt-grid">
                        <div className="pt-field">
                            <span className="pt-label">Patient:</span>
                            <span className="pt-value">{invoice.patient?.full_name || 'Walk-in Patient'}</span>
                        </div>
                        <div className="pt-field" style={{ justifyContent: 'flex-end' }}>
                            <span className="pt-label">Patient ID:</span>
                            <span className="pt-value">{invoice.patient?.patient_id || 'WALKIN'}</span>
                        </div>
                        <div className="pt-field">
                            <span className="pt-label">Contact:</span>
                            <span className="pt-value">{invoice.patient?.phone || '-'}</span>
                        </div>
                        <div className="pt-field" style={{ justifyContent: 'flex-end' }}>
                            <span className="pt-label">Payment:</span>
                            <span className="pt-value">{(invoice as any).payment_method || 'Cash'}</span>
                        </div>
                    </div>

                    {/* ── Items Table ── */}
                    <table className="items">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'center', width: '36px' }}>S.No</th>
                                <th style={{ textAlign: 'left' }}>Medicine</th>
                                <th style={{ textAlign: 'center', width: '60px' }}>HSN</th>
                                <th style={{ textAlign: 'center', width: '50px' }}>Qty</th>
                                <th style={{ textAlign: 'right', width: '72px' }}>Rate</th>
                                <th style={{ textAlign: 'right', width: '60px' }}>Disc</th>
                                <th style={{ textAlign: 'right', width: '82px' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td style={{ textAlign: 'center', color: '#9ca3af' }}>{idx + 1}</td>
                                    <td>
                                        <span className="med-name">{item.description || item.medicine_name || '-'}</span>
                                        {item.batch_no && item.batch_no !== 'N/A' ? (
                                            <span className="batch-tag">(Batch: {item.batch_no})</span>
                                        ) : null}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className="hsn-tag">{item.hsn_sac_code || '3004'}</span>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                                    <td style={{ textAlign: 'right' }}>{Number(item.unit_price || 0).toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', color: '#9ca3af' }}>
                                        {Number(item.discount || 0) > 0 ? Number(item.discount || 0).toFixed(2) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(item.net_price || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* ── Totals ── */}
                    <div className="totals-strip">
                        <div className="totals-box">
                            <div className="row sub">
                                <span>Subtotal</span>
                                <span>{subtotal.toFixed(2)}</span>
                            </div>
                            {totalDiscount > 0 && (
                                <div className="row sub">
                                    <span>Discount</span>
                                    <span>-{totalDiscount.toFixed(2)}</span>
                                </div>
                            )}
                            {tax > 0 && (
                                <>
                                    <div className="row tax">
                                        <span>CGST</span>
                                        <span>{cgst.toFixed(2)}</span>
                                    </div>
                                    <div className="row tax">
                                        <span>SGST</span>
                                        <span>{sgst.toFixed(2)}</span>
                                    </div>
                                </>
                            )}
                            <div className="row grand">
                                <span>Grand Total</span>
                                <span>{total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Amount in words ── */}
                    <div className="words-bar">
                        <strong>Amount in words:</strong> {numberToWords(total)}
                    </div>

                    {/* ── Payment cards ── */}
                    <div className="pay-grid">
                        <div className="pay-card bill">
                            <div className="lbl">Bill Amount</div>
                            <div className="val">{total.toFixed(2)}</div>
                        </div>
                        <div className="pay-card paid">
                            <div className="lbl">Paid</div>
                            <div className="val">{paid.toFixed(2)}</div>
                        </div>
                        <div className={`pay-card bal ${balance <= 0 ? 'zero' : ''}`}>
                            <div className="lbl">Balance</div>
                            <div className="val">{balance.toFixed(2)}</div>
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="inv-footer">
                        <div className="terms">
                            <div className="terms-title">Terms &amp; Conditions</div>
                            <div className="terms-list">
                                1. Goods once sold will not be taken back.<br />
                                2. Payment is due on receipt of invoice.<br />
                                3. Subject to Delhi jurisdiction only.
                            </div>
                        </div>
                        <div className="sig">
                            <div className="sig-line" />
                            <div className="sig-name">Authorized Signatory</div>
                            <div className="sig-for">For Garnet Medicare</div>
                        </div>
                    </div>

                    <div className="gen-note">
                        This is a computer-generated document and does not require a physical signature. &mdash; Garnet Medicare (Division of Garnet Pharmaceutical)
                    </div>

                </div>
            </div>
        </>
    );
}
