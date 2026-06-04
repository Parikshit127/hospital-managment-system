import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'
import { validateZealthixApiKey } from '@/app/lib/zealthix/auth'
import { getBillBranding, inlineHeaderHtml, billFooterHtml, letterheadBackgroundHtml, letterheadCss, printButtonHtml, type BillBranding } from '@/app/lib/bill-branding'
import { getBillSections } from '@/app/lib/bill-sections'

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
            if (zealthixAuth instanceof NextResponse) {
                // API key provided but invalid - return error
                return zealthixAuth;
            }
            organizationId = zealthixAuth.organizationId;
            isApiKeyAuth = true;
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
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true, department: true } },
                admission: { select: { admission_id: true, doctor_name: true, admission_date: true, discharge_date: true, ward: { select: { ward_name: true } }, bed: { select: { bed_id: true } } } },
                payments: {
                    where: { status: { not: 'Reversed' } },
                    orderBy: { created_at: 'desc' },
                },
                credit_notes: { where: { status: 'Approved' }, orderBy: { created_at: 'desc' } },
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

        // Get doctor name for OPD (from latest appointment, or fall back to patient department)
        let opdDoctor = '';
        if (!invoice.admission_id && invoice.patient_id) {
            const apt = await prisma.appointments.findFirst({
                where: { patient_id: invoice.patient_id, organizationId: organizationId! },
                orderBy: { appointment_date: 'desc' },
                select: { doctor_name: true, department: true },
            });
            opdDoctor = apt?.doctor_name || invoice.patient?.department || '';
        }

        const branding = await getBillBranding(organizationId!);
        const sections = await getBillSections(organizationId!, 'invoice');
        const html = generateInvoiceHTML(invoice, branding, sections, opdDoctor)

        // Return HTML for browser viewing (works for both API key and regular auth)
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

function generateInvoiceHTML(invoice: any, branding: BillBranding, sections: any, opdDoctor: string = '') {
    const items = invoice.items || []
    const payments = invoice.payments || []
    const creditNotes = (invoice as any).credit_notes || []
    const creditNoteTotal = creditNotes.reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0)
    const patient = invoice.patient || {}
    const admission = invoice.admission || null
    const total = Number(invoice.total_amount || 0)
    const totalDiscount = Number(invoice.total_discount || 0)
    const totalTax = Number(invoice.total_tax || 0)
    const net = Number(invoice.net_amount || 0)
    const paid = Number(invoice.paid_amount || 0)
    const balance = Number(invoice.balance_due || 0)
    const isInterState = invoice.is_inter_state || false

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
    const fmtTime = (d: any) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
    const invoiceDate = fmtDate(invoice.created_at)
    const isIPD = !!admission
    const billType = isIPD ? 'Bill' : 'Bill'
    const gstin = branding.gstin

    // Group items by service_category
    const categoryMap: Record<string, any[]> = {}
    for (const item of items) {
        const cat = item.service_category || item.department || 'Other'
        if (!categoryMap[cat]) categoryMap[cat] = []
        categoryMap[cat].push(item)
    }

    // Build MEDNET-style item rows with date, category headers, and subtotals
    let sno = 0
    let detailRows = ''
    for (const [cat, catItems] of Object.entries(categoryMap)) {
        const catTotal = catItems.reduce((s: number, i: any) => s + Number(i.net_price || 0), 0)
        const catDisc = catItems.reduce((s: number, i: any) => s + Number(i.discount || 0), 0)
        detailRows += `<tr style="background:#f5f5f5;">
            <td colspan="5" style="padding:6px 8px;font-size:11px;font-weight:700;">${cat}</td>
            <td style="padding:6px 8px;font-size:11px;font-weight:700;text-align:right;">Total Rs. ${catTotal.toFixed(2)}/-</td>
        </tr>`
        for (const item of catItems) {
            sno++
            const itemDate = fmtDate(item.created_at)
            detailRows += `<tr>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;">${itemDate}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;">${item.description}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right;">${Number(item.unit_price).toFixed(2)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center;">${item.quantity}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right;">${Number(item.discount || 0).toFixed(2)}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:right;">${Number(item.net_price).toFixed(2)}</td>
            </tr>`
        }
    }

    // Payment rows MEDNET style
    const mednetPaymentRows = payments.map((p: any) => `<tr>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #eee;">${fmtDate(p.created_at)}</td>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #eee;">Receipt - (${p.receipt_number})</td>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #eee;">Payment ${p.payment_method} on ${fmtDate(p.created_at)}</td>
        <td style="padding:4px 8px;font-size:11px;text-align:right;border-bottom:1px solid #eee;">${Number(p.amount).toFixed(2)}</td>
    </tr>`).join('')

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${billType} ${invoice.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; background: #fff; font-size: 11px; }
        ${letterheadCss(branding)}
    </style>
</head>
<body>
    ${letterheadBackgroundHtml(branding)}
    ${printButtonHtml(branding, 'Detailed bill for ' + invoice.invoice_number)}

    <table class="print-layout-table">
        <thead><tr><td class="print-layout-header-spacer"></td></tr></thead>
        <tbody><tr><td>
            <div class="bill-container">

                <!-- Bill Title + Invoice Info -->
                <div style="text-align:center;margin-bottom:12px;">
                    <h2 style="font-size:14px;font-weight:bold;border-bottom:1px solid #999;display:inline-block;padding-bottom:2px;">${billType}</h2>
                </div>

                <!-- Patient Row -->
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <div>
                        <p style="font-size:12px;font-weight:bold;">${patient.full_name || '-'} [${patient.patient_id || '-'}]</p>
                        <p style="font-size:10px;color:#555;">Contact No.: ${patient.phone || '-'}</p>
                    </div>
                    <div style="text-align:right;">
                        <p style="font-size:11px;">Age /Gender: ${patient.age || '-'} / ${patient.gender || '-'}</p>
                    </div>
                </div>

                <div style="border-top:1px dashed #999;margin:6px 0;"></div>

                <!-- Bill Details Grid -->
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <div>
                        <p style="font-size:11px;"><strong>Bill No.:</strong> ${invoice.invoice_number}</p>
                        ${isIPD ? `<p style="font-size:11px;"><strong>Regn No.:</strong> ${admission.admission_id}</p>` : ''}
                        ${isIPD ? `<p style="font-size:11px;"><strong>Bed No.:</strong> ${admission.bed?.bed_id || '-'}/${admission.ward?.ward_name || '-'}</p>` : ''}
                        <p style="font-size:11px;"><strong>Rate Category:</strong> ${invoice.invoice_type || 'OPD'}</p>
                        <p style="font-size:11px;"><strong>Category:</strong> PAYING</p>
                    </div>
                    <div style="text-align:center;">
                        ${isIPD && admission.doctor_name ? `<p style="font-size:11px;"><strong>Department:</strong> -</p>` : ''}
                        ${isIPD ? `<p style="font-size:11px;"><strong>Discharge Date:</strong> ${admission.discharge_date ? fmtDate(admission.discharge_date) + ' ' + fmtTime(admission.discharge_date) : 'N/A'}</p>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <p style="font-size:11px;"><strong>Bill Date:</strong> ${invoiceDate}</p>
                        <p style="font-size:11px;"><strong>Doctor:</strong> ${admission ? `Dr. ${admission.doctor_name || '-'}` : (opdDoctor ? `Dr. ${opdDoctor}` : '-')}</p>
                        ${isIPD ? `<p style="font-size:11px;"><strong>Adm. Date:</strong> ${fmtDate(admission.admission_date)} ${fmtTime(admission.admission_date)}</p>` : ''}
                    </div>
                </div>

                <!-- Service Table -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #999;">
                    <thead>
                        <tr style="background:#eee;">
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Date</th>
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Service Name</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Rate</th>
                            <th style="padding:6px 8px;text-align:center;font-size:10px;border:1px solid #999;">Qty.</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Disc</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Net Amt.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detailRows}
                        <tr style="border-top:2px solid #000;font-weight:bold;">
                            <td colspan="3" style="padding:6px 8px;font-size:11px;">Total</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${total.toFixed(2)}</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${totalDiscount.toFixed(2)}</td>
                            <td style="padding:6px 8px;font-size:11px;text-align:right;">${(total - totalDiscount).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                ${payments.length > 0 ? `
                <!-- Payment And Refund -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #999;">
                    <thead>
                        <tr style="background:#eee;">
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Date</th>
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Receipt / Refund</th>
                            <th style="padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999;">Notes</th>
                            <th style="padding:6px 8px;text-align:right;font-size:10px;border:1px solid #999;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>${mednetPaymentRows}</tbody>
                </table>` : ''}

                <!-- Amount Summary -->
                <table style="width:100%;margin-bottom:12px;">
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;width:120px;">Bill Amount :</td><td style="font-size:11px;">${total.toFixed(2)} - ${numberToWords(total)}</td></tr>
                    ${totalDiscount > 0 ? `<tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Discount :</td><td style="font-size:11px;">${totalDiscount.toFixed(2)}</td></tr>` : ''}
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Net Amount :</td><td style="font-size:11px;">${net.toFixed(2)} - ${numberToWords(net)}</td></tr>
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Paid Amount :</td><td style="font-size:11px;">${paid.toFixed(2)} - ${numberToWords(paid)}</td></tr>
                    <tr><td style="padding:3px 8px;font-size:11px;font-weight:bold;">Balance :</td><td style="font-size:11px;">${balance.toFixed(2)} - ${numberToWords(balance)}</td></tr>
                </table>

                <p style="font-size:10px;text-align:right;color:#666;margin-bottom:8px;">(All figures are in Rupees (INR) only)</p>

                ${invoice.notes ? `<p style="font-size:11px;margin-bottom:8px;"><strong>Remarks:</strong> ${invoice.notes}</p>` : ''}

                <div style="border-top:1px dashed #999;margin:12px 0;"></div>

                <!-- Signature Footer -->
                ${billFooterHtml(branding)}
            </div>
        </td></tr></tbody>
        <tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot>
    </table>
</body>
</html>`
}
