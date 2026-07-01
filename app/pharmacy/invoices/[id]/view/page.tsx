import { notFound } from 'next/navigation';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';
import { parseWalkinNote } from '@/app/lib/walkin-note';
import { dispensingKey } from '@/app/lib/pharmacy-bill-group';
import { formatDoctorName } from '@/app/lib/format-name';

function splitLineDoctor(desc: any): { text: string; doctor: string } {
    const parts = String(desc || '').split(' — ');
    if (parts.length > 1) {
        return { text: parts.slice(0, -1).join(' — '), doctor: parts[parts.length - 1].trim() };
    }
    return { text: String(desc || ''), doctor: '' };
}

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
    if (rupees >= 10000000) words += belowThousand(Math.floor(rupees / 10000000)) + 'Crore ';
    if (rupees >= 100000)   words += belowThousand(Math.floor((rupees % 10000000) / 100000)) + 'Lakh ';
    if (rupees >= 1000)     words += belowThousand(Math.floor((rupees % 100000) / 1000)) + 'Thousand ';
    words += belowThousand(rupees % 1000);
    words = words.trim() + ' Rupees';
    if (paise > 0) words += ' and ' + belowThousand(paise).trim() + ' Paise';
    return words + ' Only';
}

export default async function PharmacyInvoiceViewPage({ params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ bill?: string }>;
}) {
    const { id } = await params;
    const { bill: billKey } = await searchParams;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) notFound();

    const session = await getSession();
    if (!session?.organization_id) {
        return <div style={{ padding: 40, fontFamily: 'Arial' }}>Not authorised. Please log in.</div>;
    }

    const pharmacy = getPharmacyBranding(session.organization_id);

    const invoice = await prisma.invoices.findFirst({
        where: { id: invoiceId, organizationId: session.organization_id },
        include: {
            items: { orderBy: { created_at: 'asc' } },
            patient: { select: { full_name: true, patient_id: true, phone: true, address: true } },
        },
    });

    if (!invoice) notFound();

    const isWalkIn = invoice.patient_id === 'WALKIN';
    const walkin = parseWalkinNote(invoice.notes);
    const patientName = isWalkIn ? (walkin.name || 'WALK-IN / OTC') : (invoice.patient?.full_name || 'Walk-in Patient');
    const patientAddress = isWalkIn ? '' : ((invoice.patient as any)?.address || '');
    const patientContact = (isWalkIn ? walkin.contact : invoice.patient?.phone) || '';

    const isIpd = invoice.invoice_type === 'IPD';
    const allItems = invoice.items as any[];
    let items = isIpd ? allItems.filter((i: any) => i.service_category === 'Pharmacy') : allItems;
    if (isIpd && billKey) {
        const scoped = items.filter((i: any) => dispensingKey(i.created_at) === billKey);
        if (scoped.length > 0) items = scoped;
    }
    if (isIpd && items.length === 0) {
        return <div style={{ padding: 40, fontFamily: 'Arial', color: '#6b7280' }}>No pharmacy items found on this IPD invoice.</div>;
    }

    // Prescribing doctor + registration number, shown once in the header.
    // Resolve the doctor as reliably as possible:
    //   1. the invoice's own doctor (OPD / counter pharmacy),
    //   2. the admission's attending doctor (IPD pharmacy),
    //   3. the "— Dr. X" suffix carried on the medicine line descriptions.
    // Then look the doctor up in the user master to print the registration number.
    let doctorUser: { name: string | null; doctor_registration_no: string | null } | null = null;

    const invoiceDoctorId = (invoice as any).doctor_id as string | null;
    let admissionDoctorName = '';
    if (invoiceDoctorId) {
        doctorUser = await prisma.user.findFirst({
            where: { id: invoiceDoctorId, organizationId: session.organization_id },
            select: { name: true, doctor_registration_no: true },
        });
    }
    if (!doctorUser && isIpd && (invoice as any).admission_id) {
        const adm = await prisma.admissions.findFirst({
            where: { admission_id: (invoice as any).admission_id, organizationId: session.organization_id },
            select: { attending_doctor_id: true, doctor_name: true },
        });
        admissionDoctorName = adm?.doctor_name || '';
        if (adm?.attending_doctor_id) {
            doctorUser = await prisma.user.findFirst({
                where: { id: adm.attending_doctor_id, organizationId: session.organization_id },
                select: { name: true, doctor_registration_no: true },
            });
        }
    }

    const lineDoctor = Array.from(new Set(items.map((i: any) => splitLineDoctor(i.description).doctor).filter(Boolean))).join(', ');
    const rawDoctorName = doctorUser?.name || (invoice as any).doctor_name || admissionDoctorName || lineDoctor || '';

    // If we have a name but no matched user yet, try resolving by name to get the
    // registration number (strip a leading "Dr." before matching).
    if (!doctorUser && rawDoctorName) {
        const nameGuess = rawDoctorName.replace(/^\s*(dr\.?|doctor)\s*/i, '').trim();
        if (nameGuess) {
            doctorUser = await prisma.user.findFirst({
                where: {
                    organizationId: session.organization_id,
                    OR: [
                        { name: { equals: nameGuess, mode: 'insensitive' } },
                        { name: { equals: rawDoctorName, mode: 'insensitive' } },
                        { name: { contains: nameGuess, mode: 'insensitive' } },
                    ],
                },
                select: { name: true, doctor_registration_no: true },
            });
        }
    }

    const headerDoctor = rawDoctorName ? formatDoctorName(rawDoctorName) : '';

    // Per-line CGST/SGST — derive from tax_rate on each item
    const lineData = items.map((item: any) => {
        const qty       = Number(item.quantity || 0);
        const rate      = Number(item.unit_price || 0);
        const taxRate   = Number(item.tax_rate || 0);
        const mrp       = Number(item.mrp || rate);
        const netPrice  = Number(item.net_price || qty * rate);
        const taxAmt    = Number(item.tax_amount || 0);
        const cgstRate  = taxRate / 2;
        const sgstRate  = taxRate / 2;
        const cgstAmt   = taxAmt / 2;
        const sgstAmt   = taxAmt / 2;
        const amount    = netPrice; // pre-tax net (rate*qty - discount)

        // Parse batch / expiry from description or ref fields
        const desc      = splitLineDoctor(item.description).text;
        const batchMatch = desc.match(/\(Batch[:\s]+([^)]+)\)/i);
        const batchNo   = item.batch_no || (batchMatch ? batchMatch[1] : '');
        const expiry    = item.expiry_date
            ? new Date(item.expiry_date).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' })
            : '';
        const pack      = item.pack_size || item.pack || '—';
        const hsn       = item.hsn_sac_code || '3004';
        // Product name: strip batch info from description
        const productName = desc.replace(/\s*\(Batch[^)]*\)/i, '').replace(/\s*×\s*\d+$/, '').trim()
            || item.description?.replace(/\s*\(Batch[^)]*\)/i, '').trim() || '-';

        return { productName, pack, hsn, batchNo, expiry, qty, mrp, rate, sgstRate, cgstRate, sgstAmt, cgstAmt, taxRate, amount, taxAmt };
    });

    const subtotal   = lineData.reduce((s, l) => s + l.amount, 0);
    const totalTax   = lineData.reduce((s, l) => s + l.taxAmt, 0);
    const totalCgst  = totalTax / 2;
    const totalSgst  = totalTax / 2;
    const grandTotal = subtotal + totalTax;
    const roundOff   = 0; // no rounding applied

    const lineDiscount = items.reduce((s: number, i: any) => s + Number(i.discount || 0), 0);
    const billDiscount = isIpd ? 0 : Math.max(0, Math.max(
        Number((invoice as any).bill_discount || 0),
        Number((invoice as any).total_discount || 0) - lineDiscount,
    ));

    const paid    = isIpd ? 0 : Number((invoice as any).paid_amount || 0);
    const balance = isIpd ? grandTotal : Math.max(0, grandTotal - paid);

    const dateSource: Date = (isIpd && items.length > 0)
        ? new Date((items[items.length - 1] as any).created_at || invoice.created_at)
        : new Date(invoice.created_at);
    const dateStr = dateSource.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // GST summary line at bottom (e.g. "GST 100.00*2.5+2.5%=2.50SGST+2.50CGST")
    const gstSummaryLines = lineData.map(l =>
        `GST ${l.amount.toFixed(2)}*${l.sgstRate}+${l.cgstRate}%=${l.sgstAmt.toFixed(2)}SGST+${l.cgstAmt.toFixed(2)}CGST`
    ).join(',  ');

    const css = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #f0f2f5; }

        .toolbar { display: flex; align-items: center; justify-content: center; gap: 12px;
            padding: 10px 20px; background: #1e3a6e; }
        .toolbar button { padding: 7px 24px; background: white; color: #1e3a6e; font-weight: 700;
            border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .toolbar .inv-ref { font-size: 11px; color: #94a3b8; }

        .page { max-width: 860px; margin: 24px auto; background: #fff;
            box-shadow: 0 1px 6px rgba(0,0,0,0.10); padding: 28px 32px; }

        /* Hospital header */
        .hosp-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .hosp-left h1 { font-size: 18px; font-weight: 900; }
        .hosp-left p  { font-size: 10px; line-height: 1.6; }
        .hosp-right   { text-align: right; font-size: 10px; line-height: 1.7; }
        .hosp-right strong { font-weight: 700; }
        .gstin-bar { font-size: 10px; font-weight: 700; margin-bottom: 6px; }

        /* GST Invoice title */
        .inv-title { text-align: center; font-size: 14px; font-weight: 900;
            border-top: 2px solid #000; border-bottom: 2px solid #000;
            padding: 5px 0; margin: 6px 0; letter-spacing: 1px; }

        /* Invoice meta line */
        .inv-meta-bar { display: flex; justify-content: flex-end; font-size: 10px;
            margin-bottom: 6px; gap: 16px; }

        /* Items table */
        table.items { width: 100%; border-collapse: collapse; border: 1px solid #000; }
        table.items th, table.items td { border: 1px solid #000; padding: 4px 5px; font-size: 10px; }
        table.items thead th { background: #f5f5f5; font-weight: 700; text-align: center; font-size: 10px; }
        table.items tbody td { text-align: center; }
        table.items tbody td.left { text-align: left; }
        /* Empty filler rows */
        table.items tr.empty td { height: 18px; }

        /* GST summary */
        .gst-summary { font-size: 9px; margin-top: 4px; margin-bottom: 2px; }

        /* Bottom section */
        .bottom-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 8px; }
        .terms-col { max-width: 380px; font-size: 9.5px; }
        .terms-col h4 { font-size: 10px; font-weight: 700; margin-bottom: 3px; }
        .terms-col p  { line-height: 1.6; }
        .terms-col .remark { margin-top: 8px; font-size: 10px; }

        /* Totals box */
        .totals-col { width: 260px; border: 1px solid #000; }
        .totals-col .row { display: flex; justify-content: space-between;
            padding: 4px 8px; border-bottom: 1px solid #ccc; font-size: 10.5px; }
        .totals-col .row:last-child { border-bottom: none; font-weight: 900; font-size: 12px; background: #f5f5f5; }
        .totals-col .row span:last-child { font-weight: 700; }

        /* Words + signature */
        .words-bar { font-size: 10px; font-weight: 700; margin-top: 10px; }
        .sig-row { display: flex; justify-content: flex-end; margin-top: 36px; }
        .sig-box { text-align: center; font-size: 10px; }
        .sig-line { border-top: 1px solid #000; width: 160px; margin: 0 auto 4px auto; }

        .gen-note { font-size: 8px; color: #aaa; text-align: center; margin-top: 14px; }

        @media print {
            @page { margin: 8mm; size: A4; }
            body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .toolbar { display: none !important; }
            .page { margin: 0; box-shadow: none; padding: 16px 20px; }
        }
    `;

    // Fill empty rows to always show at least 8 rows in the table
    const MIN_ROWS = 8;
    const emptyRows = Math.max(0, MIN_ROWS - lineData.length);

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: css }} />

            {/* Toolbar */}
            <div className="toolbar">
                <script dangerouslySetInnerHTML={{ __html: `
                    document.addEventListener('DOMContentLoaded', function() {
                        var btn = document.getElementById('printBtn');
                        if (btn) btn.onclick = function(){ window.print(); };
                        var back = document.getElementById('backBtn');
                        if (back) back.onclick = function(){ window.history.back(); };
                    });
                ` }} />
                <button id="backBtn" style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569' }}>Back</button>
                <button id="printBtn">Print / Save PDF</button>
                <span className="inv-ref">{invoice.invoice_number}</span>
            </div>

            <div className="page">

                {/* Hospital Header */}
                <div className="hosp-header">
                    <div className="hosp-left">
                        <h1>{pharmacy.name}</h1>
                        <p>
                            {pharmacy.address || '123 Health Avenue, Medical District'}<br />
                            Phone : {(pharmacy as any).phone || '+91 80000 00000'}<br />
                            E-Mail : {(pharmacy as any).email || `admin@avanihospital.com`}
                        </p>
                    </div>
                    <div className="hosp-right">
                        <strong>Patient Name :</strong> {patientName}<br />
                        Patient Address : {patientAddress}<br />
                        <strong>Dr Name :</strong> {headerDoctor || '—'}
                    </div>
                </div>

                <div className="gstin-bar">GSTIN : {pharmacy.gstin || ''}</div>

                {/* GST Invoice Title */}
                <div className="inv-title">GST INVOICE</div>

                {/* Invoice Number + Date */}
                <div className="inv-meta-bar">
                    <span><strong>Invoice No. :</strong> {invoice.invoice_number}</span>
                    <span><strong>Date :</strong> {dateStr}</span>
                </div>

                {/* Items Table */}
                <table className="items">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>SN.</th>
                            <th style={{ textAlign: 'left' }}>PRODUCT NAME</th>
                            <th style={{ width: 44 }}>PACK</th>
                            <th style={{ width: 44 }}>HSN</th>
                            <th style={{ width: 60 }}>BATCH</th>
                            <th style={{ width: 44 }}>EXP.</th>
                            <th style={{ width: 36 }}>QTY</th>
                            <th style={{ width: 56 }}>MRP</th>
                            <th style={{ width: 60 }}>RATE</th>
                            <th style={{ width: 44 }}>SGST</th>
                            <th style={{ width: 44 }}>CGST</th>
                            <th style={{ width: 68 }}>AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineData.map((l, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}.</td>
                                <td className="left">{l.productName}</td>
                                <td>{l.pack}</td>
                                <td>{l.hsn}</td>
                                <td>{l.batchNo}</td>
                                <td>{l.expiry}</td>
                                <td>{l.qty}</td>
                                <td>{l.mrp.toFixed(2)}</td>
                                <td>{l.rate.toFixed(2)}</td>
                                <td>{l.sgstRate.toFixed(2)}</td>
                                <td>{l.cgstRate.toFixed(2)}</td>
                                <td>{l.amount.toFixed(2)}</td>
                            </tr>
                        ))}
                        {/* Empty filler rows */}
                        {Array.from({ length: emptyRows }).map((_, i) => (
                            <tr className="empty" key={`empty-${i}`}>
                                {Array.from({ length: 12 }).map((_, j) => <td key={j}>&nbsp;</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* GST Summary line */}
                <div className="gst-summary">
                    {gstSummaryLines}&nbsp;&nbsp;&nbsp;<strong>*** GET WELL SOON **</strong>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span style={{ float: 'right' }}>For {pharmacy.name} PHARMACY</span>
                </div>

                {/* Bottom: Terms + Totals */}
                <div className="bottom-section">
                    <div className="terms-col">
                        <h4>Terms &amp; Conditions</h4>
                        <p>
                            Goods once sold will not be taken back or exchanged.<br />
                            Bills not paid due date will attract 24% interest.<br />
                            All disputes subject to Jurisdication only.<br />
                            Prescribed Sales Tax declaration will be given.
                        </p>
                        <div className="remark"><em>Remark :</em></div>
                    </div>

                    <div className="totals-col">
                        <div className="row"><span>SUB TOTAL</span><span>{subtotal.toFixed(2)}</span></div>
                        <div className="row"><span>ROUND OFF</span><span>{roundOff.toFixed(2)}</span></div>
                        {lineData.map((l, i) => (
                            l.sgstAmt > 0 ? (
                                <div className="row" key={`sgst-${i}`}>
                                    <span>SGST {l.sgstRate.toFixed(1)} %</span>
                                    <span>{l.sgstAmt.toFixed(2)}</span>
                                </div>
                            ) : null
                        ))}
                        {lineData.map((l, i) => (
                            l.cgstAmt > 0 ? (
                                <div className="row" key={`cgst-${i}`}>
                                    <span>CGST {l.cgstRate.toFixed(1)} %</span>
                                    <span>{l.cgstAmt.toFixed(2)}</span>
                                </div>
                            ) : null
                        ))}
                        <div className="row"><span>GRAND TOTAL</span><span>{grandTotal.toFixed(2)}</span></div>
                    </div>
                </div>

                {/* Amount in words */}
                <div className="words-bar">Rs. {numberToWords(grandTotal)}</div>

                {/* Signature */}
                <div className="sig-row">
                    <div className="sig-box">
                        <div className="sig-line" />
                        <div>Authorised Signatory</div>
                    </div>
                </div>

                <div className="gen-note">Computer generated invoice — {pharmacy.name}</div>
            </div>
        </>
    );
}
