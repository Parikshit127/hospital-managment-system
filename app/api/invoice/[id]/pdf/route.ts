import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'
import { validateZealthixApiKey } from '@/app/lib/zealthix/auth'
import { convertHtmlToPdf } from '@/app/lib/pdf-generator'

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        // Check for Zealthix API key first (for external access)
        const apiKeyHeader = req.headers.get('X-Api-Key');
        let organizationId: string | null = null;
        let isApiKeyAuth = false;

        if (apiKeyHeader) {
            // Zealthix API authentication
            const zealthixAuth = await validateZealthixApiKey(req);
            if (!(zealthixAuth instanceof NextResponse)) {
                organizationId = zealthixAuth.organizationId;
                isApiKeyAuth = true;
            }
        }

        // If not API key auth, use regular authentication
        if (!isApiKeyAuth) {
            const auth = await resolveRouteAuth({
                allowPatient: true,
                allowedStaffRoles: ALLOWED_STAFF_ROLES,
            });
            if (!auth.ok) return auth.response;
            organizationId = auth.context.organizationId;
        }

        const { id } = await params;
        const invoiceId = parseInt(id)
        if (isNaN(invoiceId)) {
            return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 })
        }

        const invoice = await prisma.invoices.findFirst({
            where: {
                id: invoiceId,
                organizationId: organizationId!,
            },
            include: {
                items: { orderBy: { created_at: 'asc' } },
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true } },
                admission: { select: { admission_id: true, doctor_name: true, admission_date: true, ward: { select: { ward_name: true } }, bed: { select: { bed_id: true } } } },
                payments: {
                    where: { status: { not: 'Reversed' } },
                    orderBy: { created_at: 'desc' },
                },
            }
        })

        if (!invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
        }

        // Skip patient check for API key requests
        if (!isApiKeyAuth) {
            const auth = await resolveRouteAuth({
                allowPatient: true,
                allowedStaffRoles: ALLOWED_STAFF_ROLES,
            });
            if (auth.ok && auth.context.kind === 'patient' && invoice.patient_id !== auth.context.session.id) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
        }

        // Fetch organization details
        const org = await prisma.organization.findUnique({
            where: { id: organizationId! },
            include: { branding: true },
        });

        const html = generateInvoiceHTML(invoice, org)

        // If accessed via API key (Zealthix), return actual PDF
        if (isApiKeyAuth) {
            const pdfBuffer = await convertHtmlToPdf(html);
            return new Response(new Uint8Array(pdfBuffer), {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `inline; filename="invoice-${invoice.invoice_number}.pdf"`
                }
            });
        }

        // Otherwise return HTML for browser viewing
        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
    } catch (error: any) {
        console.error('Invoice PDF error:', error)
        return NextResponse.json({ error: error.message || 'Failed to generate invoice' }, { status: 500 })
    }
}

function numberToWords(n: number): string {
    if (n === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convert(num: number): string {
        if (num < 20) return ones[num];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
        if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
        if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
        return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    }

    const rupees = Math.floor(n);
    const paise = Math.round((n - rupees) * 100);
    let result = 'Rupees ' + convert(rupees);
    if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
    return result + ' Only';
}

function generateInvoiceHTML(invoice: any, org: any) {
    const items = invoice.items || []
    const payments = invoice.payments || []
    const patient = invoice.patient || {}
    const admission = invoice.admission || null
    const total = Number(invoice.total_amount || 0)
    const totalDiscount = Number(invoice.total_discount || 0)
    const totalTax = Number(invoice.total_tax || 0)
    const net = Number(invoice.net_amount || 0)
    const paid = Number(invoice.paid_amount || 0)
    const balance = Number(invoice.balance_due || 0)
    const isInterState = invoice.is_inter_state || false
    const invoiceDate = invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

    const hospitalName = org?.name || 'Hospital'
    const hospitalAddress = org?.address || ''
    const hospitalPhone = org?.phone || ''
    const hospitalEmail = org?.email || ''
    const gstin = org?.registration_number || 'N/A'

    // Group items by service_category
    const categoryMap: Record<string, any[]> = {}
    for (const item of items) {
        const cat = item.service_category || item.department || 'Other'
        if (!categoryMap[cat]) categoryMap[cat] = []
        categoryMap[cat].push(item)
    }

    // GST summary by rate
    const gstGroups: Record<string, { taxable: number; rate: number; tax: number; hsn: string }> = {}
    for (const item of items) {
        const rate = Number(item.tax_rate || 0)
        const key = String(rate)
        if (!gstGroups[key]) gstGroups[key] = { taxable: 0, rate, tax: 0, hsn: item.hsn_sac_code || '' }
        gstGroups[key].taxable += Number(item.net_price || 0)
        gstGroups[key].tax += Number(item.tax_amount || 0)
    }

    // Item rows grouped by category
    let itemRows = ''
    for (const [cat, catItems] of Object.entries(categoryMap)) {
        const catTotal = catItems.reduce((s: number, i: any) => s + Number(i.net_price) + Number(i.tax_amount || 0), 0)
        itemRows += `<tr style="background:#f0fdf4;"><td colspan="8" style="padding:6px 12px;font-size:11px;font-weight:700;color:#059669;">${cat} (${catItems.length} items) — Subtotal: ${catTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>`
        for (const item of catItems) {
            itemRows += `<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;">${item.description}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#6b7280;">${item.hsn_sac_code || '-'}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center;">${item.quantity}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:right;">${Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:right;">${Number(item.discount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:right;">${Number(item.net_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center;">${Number(item.tax_rate || 0)}%</td>
                <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:right;">${(Number(item.net_price) + Number(item.tax_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>`
        }
    }

    // GST summary rows
    const gstRows = Object.values(gstGroups).filter(g => g.tax > 0).map(g => `<tr>
        <td style="padding:6px 12px;font-size:11px;">${g.hsn || '-'}</td>
        <td style="padding:6px 12px;font-size:11px;text-align:right;">${g.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:6px 12px;font-size:11px;text-align:center;">${g.rate}%</td>
        <td style="padding:6px 12px;font-size:11px;text-align:right;">${isInterState ? '-' : (g.tax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:6px 12px;font-size:11px;text-align:right;">${isInterState ? '-' : (g.tax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:6px 12px;font-size:11px;text-align:right;">${isInterState ? g.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
        <td style="padding:6px 12px;font-size:11px;text-align:right;font-weight:600;">${g.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

    const paymentRows = payments.map((p: any) => `<tr>
        <td style="padding:6px 12px;font-size:11px;">${p.receipt_number}</td>
        <td style="padding:6px 12px;font-size:11px;">${new Date(p.created_at).toLocaleDateString('en-IN')}</td>
        <td style="padding:6px 12px;font-size:11px;">${p.payment_method}</td>
        <td style="padding:6px 12px;font-size:11px;text-align:right;">${Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice ${invoice.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:#059669;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;">Print / Download PDF</button>
    </div>

    <div style="max-width:800px;margin:0 auto;padding:30px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #059669;padding-bottom:16px;">
            <div>
                <h1 style="font-size:22px;font-weight:900;color:#059669;margin-bottom:4px;">${hospitalName}</h1>
                <p style="font-size:11px;color:#6b7280;">${hospitalAddress}</p>
                <p style="font-size:10px;color:#9ca3af;">Phone: ${hospitalPhone} | Email: ${hospitalEmail}</p>
                <p style="font-size:10px;color:#9ca3af;">GSTIN: ${gstin}</p>
            </div>
            <div style="text-align:right;">
                <h2 style="font-size:18px;font-weight:800;color:#1f2937;">TAX INVOICE</h2>
                <p style="font-size:13px;font-weight:700;color:#059669;">${invoice.invoice_number}</p>
                <p style="font-size:11px;color:#6b7280;">Date: ${invoiceDate}</p>
                <p style="font-size:11px;color:#6b7280;">Type: ${invoice.invoice_type || 'OPD'}</p>
                <p style="font-size:11px;font-weight:600;color:${invoice.status === 'Paid' ? '#059669' : '#dc2626'};">${invoice.status}</p>
            </div>
        </div>

        <!-- Patient Info -->
        <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:20px;">
            <h3 style="font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Patient Details</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                <p style="font-size:12px;"><strong>Name:</strong> ${patient.full_name || 'N/A'}</p>
                <p style="font-size:12px;"><strong>UHID:</strong> ${patient.patient_id || 'N/A'}</p>
                <p style="font-size:12px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                <p style="font-size:12px;"><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                ${admission ? `
                <p style="font-size:12px;"><strong>Doctor:</strong> ${admission.doctor_name || '-'}</p>
                <p style="font-size:12px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
                <p style="font-size:12px;"><strong>Admission:</strong> ${new Date(admission.admission_date).toLocaleDateString('en-IN')}</p>
                ` : ''}
            </div>
        </div>

        <!-- Line Items (grouped by category) -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
                <tr style="background:#f3f4f6;">
                    <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:#6b7280;">Description</th>
                    <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:#6b7280;">SAC/HSN</th>
                    <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:#6b7280;">Qty</th>
                    <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;">Rate</th>
                    <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;">Disc</th>
                    <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;">Taxable</th>
                    <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:#6b7280;">GST%</th>
                    <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;">Total</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>

        <!-- GST Summary Table -->
        ${totalTax > 0 ? `
        <div style="margin-bottom:16px;">
            <h3 style="font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">GST Summary</h3>
            <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;">
                <thead><tr>
                    <th style="padding:6px 12px;font-size:10px;text-align:left;color:#6b7280;">HSN/SAC</th>
                    <th style="padding:6px 12px;font-size:10px;text-align:right;color:#6b7280;">Taxable</th>
                    <th style="padding:6px 12px;font-size:10px;text-align:center;color:#6b7280;">Rate</th>
                    <th style="padding:6px 12px;font-size:10px;text-align:right;color:#6b7280;">CGST</th>
                    <th style="padding:6px 12px;font-size:10px;text-align:right;color:#6b7280;">SGST</th>
                    <th style="padding:6px 12px;font-size:10px;text-align:right;color:#6b7280;">IGST</th>
                    <th style="padding:6px 12px;font-size:10px;text-align:right;color:#6b7280;">Total Tax</th>
                </tr></thead>
                <tbody>${gstRows}</tbody>
                <tfoot><tr style="border-top:1px solid #d1d5db;font-weight:700;">
                    <td colspan="3" style="padding:6px 12px;font-size:11px;">Total</td>
                    <td style="padding:6px 12px;font-size:11px;text-align:right;">${isInterState ? '-' : Number(invoice.cgst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style="padding:6px 12px;font-size:11px;text-align:right;">${isInterState ? '-' : Number(invoice.sgst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style="padding:6px 12px;font-size:11px;text-align:right;">${isInterState ? Number(invoice.igst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td style="padding:6px 12px;font-size:11px;text-align:right;">${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr></tfoot>
            </table>
        </div>` : ''}

        <!-- Totals -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
            <table style="width:320px;border-collapse:collapse;">
                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Subtotal</td><td style="padding:5px 12px;font-size:12px;text-align:right;">${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                ${totalDiscount > 0 ? `<tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Discount</td><td style="padding:5px 12px;font-size:12px;text-align:right;color:#dc2626;">-${totalDiscount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                ${totalTax > 0 ? `<tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Total Tax</td><td style="padding:5px 12px;font-size:12px;text-align:right;">${totalTax.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                <tr style="border-top:2px solid #1f2937;"><td style="padding:8px 12px;font-size:14px;font-weight:800;">Net Amount</td><td style="padding:8px 12px;font-size:14px;text-align:right;font-weight:800;">${net.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                <tr><td style="padding:5px 12px;font-size:12px;color:#059669;">Paid</td><td style="padding:5px 12px;font-size:12px;text-align:right;color:#059669;">${paid.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                ${balance > 0 ? `<tr style="background:#fef2f2;"><td style="padding:8px 12px;font-size:13px;font-weight:800;color:#dc2626;">Balance Due</td><td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:800;color:#dc2626;">${balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
            </table>
        </div>

        <!-- Amount in Words -->
        <div style="background:#f0fdf4;border-radius:6px;padding:10px 14px;margin-bottom:16px;">
            <p style="font-size:11px;color:#059669;"><strong>Amount in Words:</strong> ${numberToWords(net)}</p>
        </div>

        ${payments.length > 0 ? `
        <!-- Payment History -->
        <div style="margin-bottom:16px;">
            <h3 style="font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Payment Summary</h3>
            <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;">
                <thead><tr>
                    <th style="padding:6px 12px;text-align:left;font-size:10px;color:#6b7280;">Receipt #</th>
                    <th style="padding:6px 12px;text-align:left;font-size:10px;color:#6b7280;">Date</th>
                    <th style="padding:6px 12px;text-align:left;font-size:10px;color:#6b7280;">Method</th>
                    <th style="padding:6px 12px;text-align:right;font-size:10px;color:#6b7280;">Amount</th>
                </tr></thead>
                <tbody>${paymentRows}</tbody>
            </table>
        </div>` : ''}

        <!-- Footer -->
        <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:20px;">
            <div style="display:flex;justify-content:space-between;">
                <div>
                    <p style="font-size:10px;color:#9ca3af;">Terms: Payment due on receipt. Subject to local jurisdiction.</p>
                </div>
                <div style="text-align:right;">
                    <p style="font-size:10px;color:#6b7280;margin-bottom:30px;">Authorized Signatory</p>
                    <p style="font-size:10px;border-top:1px solid #d1d5db;padding-top:4px;color:#9ca3af;">For ${hospitalName}</p>
                </div>
            </div>
            <p style="font-size:9px;color:#d1d5db;text-align:center;margin-top:16px;">Computer-generated invoice. ${hospitalName}</p>
        </div>
    </div>
</body>
</html>`
}
