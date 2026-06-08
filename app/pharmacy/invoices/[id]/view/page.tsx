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
    const tax     = items.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
    const cgst    = tax / 2;
    const sgst    = tax / 2;
    const total   = subtotal + tax;
    const paid    = Number((invoice as any).paid_amount || 0);
    const balance = total - paid;
    const date    = new Date(invoice.created_at).toLocaleDateString('en-IN');

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
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; }
        .wrap { max-width: 780px; margin: 0 auto; padding: 40px 50px; }
        .no-print { text-align: center; padding: 10px; background: #1e3a6e; }
        .no-print button { padding: 8px 28px; background: white; color: #1e3a6e; font-weight: bold;
            border: none; border-radius: 5px; cursor: pointer; font-size: 13px; }
        /* header */
        .ph-header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 16px; }
        .ph-name { font-size: 18px; font-weight: 900; color: #111; }
        .ph-addr { font-size: 10px; color: #555; margin-top: 3px; }
        .inv-label { font-size: 11px; font-weight: 900; text-transform: uppercase;
            letter-spacing: 0.1em; text-align: right; }
        .inv-num { font-size: 10px; color: #555; margin-top: 3px; text-align: right; }
        /* patient row */
        .pt-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .pt-name { font-size: 12px; font-weight: bold; }
        .pt-sub  { font-size: 10px; color: #555; margin-top: 2px; }
        hr.dashed { border: none; border-top: 1px dashed #999; margin: 6px 0; }
        /* items table */
        table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.items th { padding: 6px 8px; font-size: 10px; font-weight: 900;
            text-transform: uppercase; letter-spacing: 0.05em; border-top: 2px solid #111; border-bottom: 2px solid #111; }
        table.items td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #e5e7eb; }
        table.items tfoot td { padding: 6px 8px; font-size: 11px; }
        table.items tfoot tr.total-row td { border-top: 2px solid #111; font-weight: 900; font-size: 13px; }
        /* summary */
        .summary { margin-top: 14px; }
        .summary table { width: 100%; }
        .summary td { padding: 3px 8px; font-size: 11px; }
        .summary td:first-child { font-weight: bold; width: 130px; }
        .footnote { font-size: 10px; color: #555; text-align: right; margin-top: 8px; }
        /* footer */
        .bill-footer { border-top: 1px solid #e5e7eb; padding-top: 14px; margin-top: 20px;
            display: flex; justify-content: space-between; }
        .terms { font-size: 10px; color: #9ca3af; }
        .sig { text-align: right; }
        .sig-line { border-top: 1px solid #9ca3af; width: 140px; margin: 30px 0 4px auto; }
        .sig p { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
        .sig-for { font-size: 10px; color: #9ca3af; margin-top: 4px; }
        .computer-gen { font-size: 9px; color: #d1d5db; text-align: center; margin-top: 16px; }
        @media print {
            @page { margin: 0; }
            body { margin: 0; }
            .no-print { display: none !important; }
            .wrap { padding: 30px 50px; }
        }
    `;

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: css }} />

            <div className="no-print">
                <button onClick={undefined}>
                    {/* client-only button rendered below via script */}
                </button>
            </div>

            {/* Print button via inline script to avoid client component */}
            <div style={{ textAlign: 'center', padding: '10px', background: '#1e3a6e' }}>
                {/* eslint-disable-next-line @next/next/no-sync-scripts */}
                <script dangerouslySetInnerHTML={{ __html: `
                    document.addEventListener('DOMContentLoaded', function() {
                        var btn = document.getElementById('printBtn');
                        if (btn) btn.onclick = function(){ window.print(); };
                    });
                ` }} />
                <button id="printBtn" style={{
                    padding: '8px 28px', background: 'white', color: '#1e3a6e',
                    fontWeight: 'bold', border: 'none', borderRadius: '5px',
                    cursor: 'pointer', fontSize: '13px'
                }}>Print / Download PDF</button>
                <span style={{ marginLeft: 12, fontSize: 11, color: '#94a3b8' }}>
                    Pharmacy Invoice — {invoice.invoice_number}
                </span>
            </div>

            <div className="wrap">
                {/* ── Header ── */}
                <div className="ph-header">
                    <div>
                        <div className="ph-name">Garnet Pharmaceuticals</div>
                        <div className="ph-addr">B-162, East of Kailash Road, New Delhi, Delhi 110065</div>
                        <div className="ph-addr">GST No.: 07AKIPA3324R1Z0</div>
                    </div>
                    <div>
                        <div className="inv-label">Pharmacy Invoice</div>
                        <div className="inv-num">{invoice.invoice_number}</div>
                        <div className="inv-num">{date}</div>
                    </div>
                </div>

                {/* ── Patient ── */}
                <div className="pt-row">
                    <div>
                        <div className="pt-name">
                            {invoice.patient?.full_name || 'Walk-in Patient'}{' '}
                            {invoice.patient?.patient_id ? `[${invoice.patient.patient_id}]` : '[WALKIN]'}
                        </div>
                        <div className="pt-sub">Contact No.: {invoice.patient?.phone || '-'}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11 }}>
                        Date: <strong>{date}</strong>
                    </div>
                </div>

                <hr className="dashed" />

                {/* ── Items table ── */}
                <table className="items">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>Medicine</th>
                            <th style={{ textAlign: 'center' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Rate</th>
                            <th style={{ textAlign: 'right' }}>Disc</th>
                            <th style={{ textAlign: 'right' }}>Net Amt.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item: any, idx: number) => (
                            <tr key={idx}>
                                <td>{item.description || item.medicine_name || '-'}
                                    {item.batch_no ? <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>(Batch: {item.batch_no})</span> : null}
                                </td>
                                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right' }}>{Number(item.unit_price || 0).toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{Number(item.discount || 0).toFixed(2)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{Number(item.net_price || 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={3} />
                            <td style={{ textAlign: 'right', color: '#6b7280', fontSize: 10 }}>Subtotal</td>
                            <td style={{ textAlign: 'right' }}>{subtotal.toFixed(2)}</td>
                        </tr>
                        {tax > 0 && <>
                            <tr>
                                <td colSpan={3} />
                                <td style={{ textAlign: 'right', color: '#9ca3af', fontSize: 10 }}>CGST</td>
                                <td style={{ textAlign: 'right', fontSize: 10 }}>{cgst.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colSpan={3} />
                                <td style={{ textAlign: 'right', color: '#9ca3af', fontSize: 10 }}>SGST</td>
                                <td style={{ textAlign: 'right', fontSize: 10 }}>{sgst.toFixed(2)}</td>
                            </tr>
                        </>}
                        <tr className="total-row">
                            <td colSpan={2} />
                            <td style={{ textAlign: 'right' }}>{subtotal.toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{items.reduce((s: number, i: any) => s + Number(i.discount || 0), 0).toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{total.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>

                {/* ── Summary ── */}
                <div className="summary">
                    <table>
                        <tbody>
                            <tr><td>Bill Amount :</td><td>{total.toFixed(2)} - {numberToWords(total)}</td></tr>
                            <tr><td>Net Amount :</td><td>{total.toFixed(2)} - {numberToWords(total)}</td></tr>
                            <tr><td>Paid Amount :</td><td>{paid.toFixed(2)} - {paid === 0 ? 'Zero' : numberToWords(paid)}</td></tr>
                            <tr><td>Balance :</td><td>{balance.toFixed(2)} - {balance === 0 ? 'Zero' : numberToWords(balance)}</td></tr>
                        </tbody>
                    </table>
                </div>

                <p className="footnote">(All figures are in Rupees (INR) only)</p>

                {/* ── Footer ── */}
                <div className="bill-footer">
                    <div className="terms">Terms: Payment due on receipt. Subject to local jurisdiction.</div>
                    <div className="sig">
                        <div className="sig-line" />
                        <p>Authorized Signatory</p>
                        <p className="sig-for">For Garnet Pharmaceuticals</p>
                    </div>
                </div>

                <p className="computer-gen">Computer-generated document. Garnet Pharmaceuticals</p>
            </div>
        </>
    );
}
