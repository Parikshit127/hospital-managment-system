import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'
import { validateZealthixApiKey } from '@/app/lib/zealthix/auth'
import { getBillBranding, inlineHeaderHtml, billFooterHtml, letterheadBackgroundHtml, letterheadCss, printButtonHtml, fmtBillDate, type BillBranding } from '@/app/lib/bill-branding'
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding'
import { getBillSections } from '@/app/lib/bill-sections'
import { formatDoctorName } from '@/app/lib/format-name'

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager', 'pharmacy', 'pharmacist', 'nurse'];

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
                patient: {
                    select: {
                        full_name: true, patient_id: true, phone: true, age: true, gender: true, department: true,
                        patient_type: true,
                        corporate: { select: { company_name: true, company_code: true } },
                        insurance_policies: {
                            where: { status: 'Active' },
                            orderBy: { created_at: 'desc' },
                            take: 1,
                            select: {
                                policy_number: true,
                                plan_name: true,
                                provider: { select: { provider_name: true } },
                            },
                        },
                    },
                },
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

        // Doctor for OPD/Pharmacy: prefer the doctor recorded on the invoice itself,
        // then the latest appointment. Never fall back to patient.department — that's
        // a specialty label, not a doctor name (was showing e.g. "Dr. senior urologist").
        let opdDoctor = (invoice as any).doctor_name || '';
        if (!opdDoctor && !invoice.admission_id && invoice.patient_id) {
            const apt = await prisma.appointments.findFirst({
                where: { patient_id: invoice.patient_id, organizationId: organizationId! },
                orderBy: { appointment_date: 'desc' },
                select: { doctor_name: true, department: true },
            });
            opdDoctor = apt?.doctor_name || '';
        }

        // Fetch TPA/Insurance provider name if applicable
        let tpaProviderName = '';
        if (invoice.tpa_provider_id) {
            const tpa = await prisma.insurance_providers.findUnique({ where: { id: invoice.tpa_provider_id } });
            tpaProviderName = tpa?.provider_name || '';
        }
        if (!tpaProviderName && invoice.billing_patient_type === 'tpa_insurance') {
            const policy = await prisma.insurance_policies.findFirst({
                where: { patient_id: invoice.patient_id },
                include: { provider: { select: { provider_name: true } } },
            });
            tpaProviderName = (policy as any)?.provider?.provider_name || '';
        }

        const branding = await getBillBranding(organizationId!);
        const pharmacy = getPharmacyBranding(organizationId!);
        const sections = await getBillSections(organizationId!, 'invoice');
        const html = generateInvoiceHTML(invoice, branding, pharmacy, sections, opdDoctor, tpaProviderName)

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

function generateInvoiceHTML(invoice: any, branding: BillBranding, pharmacy: { name: string; division: string; address: string; gstin: string }, sections: any, opdDoctor: string = '', tpaProviderName: string = '') {
    const items = invoice.items || []
    const payments = invoice.payments || []
    const creditNotes = (invoice as any).credit_notes || []
    const creditNoteTotal = creditNotes.reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0)
    const patient = invoice.patient || {}
    // Walk-in / OTC sales share one patient record; the actual customer name (if the
    // cashier entered one) is stored on the invoice's notes field.
    const isWalkInInvoice = invoice.patient_id === 'WALKIN'
    const patientDisplayName = (isWalkInInvoice && invoice.notes?.trim())
        ? invoice.notes.trim()
        : (patient.full_name || '-')
    const admission = invoice.admission || null
    const total = Number(invoice.total_amount || 0)
    const totalDiscount = Number(invoice.total_discount || 0)
    const totalTax = Number(invoice.total_tax || 0)
    // Net = gross − discount + tax (live), so it always reflects the current
    // discount even if the stored net_amount wasn't recalculated.
    const net = total - totalDiscount + totalTax
    const paid = Number(invoice.paid_amount || 0)
    const balance = net - paid
    const isInterState = invoice.is_inter_state || false

    const fmtDate = fmtBillDate
    const fmtTime = (d: any) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
    const invoiceDate = fmtDate(invoice.created_at)
    const isIPD = !!admission
    const billType = isIPD ? 'Bill' : 'Bill'
    const gstin = branding.gstin

    // Determine patient category from billing_patient_type
    const billingType = invoice.billing_patient_type || 'cash'
    let patientCategory = 'Cash / Self-Pay'
    if (billingType === 'tpa_insurance') patientCategory = 'TPA / Insurance'
    else if (billingType === 'corporate') patientCategory = 'Corporate'

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

    const isPharmacyBill = invoice.invoice_type === 'PHARMACY';

    // ── Pharmacy bills: show only the dispensing pharmacy header, no hospital branding ──
    const pharmacyHeader = [
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:16px;">',
        '  <div>',
        '    <h1 style="font-size:20px;font-weight:900;margin:0;color:#111;letter-spacing:0.5px;">' + pharmacy.name + '</h1>',
        '    <p style="font-size:9px;color:#666;margin-top:2px;font-style:italic;">' + pharmacy.division + '</p>',
        pharmacy.address ? '    <p style="font-size:10px;color:#555;margin-top:3px;">' + pharmacy.address + '</p>' : '',
        pharmacy.gstin ? '    <p style="font-size:10px;color:#555;">GST No.: ' + pharmacy.gstin + '</p>' : '',
        '  </div>',
        '  <div style="text-align:right;">',
        '    <p style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;">Pharmacy Invoice</p>',
        '    <p style="font-size:10px;margin-top:3px;">' + invoice.invoice_number + '</p>',
        '  </div>',
        '</div>',
    ].join('\n');

    // ── Non-pharmacy bills: show hospital header ──
    const hospitalHeaderHtml = branding.letterheadUrl ? '' : [
        '<div style="text-align:center;margin-bottom:8px;">',
        branding.logoUrl ? '<img src="' + branding.logoUrl + '" alt="" style="height:50px;margin-bottom:4px;" />' : '',
        '<h1 style="font-size:15px;font-weight:bold;margin:0;">' + branding.hospitalName + (branding.tagline ? ' - ' + branding.tagline : '') + '</h1>',
        gstin !== 'N/A' ? '<p style="font-size:10px;">GST NO.-' + gstin + '</p>' : '',
        '<p style="font-size:10px;">' + branding.hospitalAddress + '</p>',
        branding.hospitalPhone ? '<p style="font-size:10px;">Ph: ' + branding.hospitalPhone + (branding.hospitalEmail ? ' | Email: ' + branding.hospitalEmail : '') + '</p>' : '',
        '</div>',
        '<hr style="border:none;border-top:2px solid #000;margin:6px 0 10px 0;" />',
    ].join('\n');

    const hospitalBillTitle = '<div style="text-align:center;margin-bottom:12px;"><h2 style="font-size:14px;font-weight:bold;border-bottom:1px solid #999;display:inline-block;padding-bottom:2px;">' + billType + '</h2></div>';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${billType} ${invoice.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; background: #fff; font-size: 11px; }
        ${isPharmacyBill ? `.bill-container { max-width: 800px; margin: 0 auto; padding: 40px 60px; }` : letterheadCss(branding)}
    </style>
</head>
<body>
    ${isPharmacyBill ? '' : letterheadBackgroundHtml(branding)}
    ${printButtonHtml(branding, 'Detailed bill for ' + invoice.invoice_number)}

    ${isPharmacyBill ? '<div>' : '<table class="print-layout-table"><thead><tr><td class="print-layout-header-spacer"></td></tr></thead><tbody><tr><td>'}
            <div class="bill-container">

                ${isPharmacyBill ? pharmacyHeader : hospitalHeaderHtml + hospitalBillTitle}

                ${(() => {
                    const corp = (patient as any).corporate;
                    const pol = (patient as any).insurance_policies?.[0];
                    const billingType = (invoice as any).billing_patient_type || patient.patient_type || 'cash';
                    if (corp || pol) {
                        return `
                <!-- Payer Row (Corporate / Insurance) -->
                <div style="background:#eef6ff;border:1px solid #cfe2ff;border-radius:4px;padding:6px 10px;margin-bottom:6px;">
                    ${corp ? `<p style="font-size:11px;font-weight:bold;color:#0b4ea2;margin:0;">Corporate: ${corp.company_name}${corp.company_code ? ` (${corp.company_code})` : ''}</p>` : ''}
                    ${pol ? `<p style="font-size:11px;font-weight:bold;color:#0b4ea2;margin:0;">Insurance: ${pol.provider?.provider_name || '-'}${pol.policy_number ? ` &nbsp;|&nbsp; Policy: ${pol.policy_number}` : ''}${pol.plan_name ? ` &nbsp;|&nbsp; Plan: ${pol.plan_name}` : ''}</p>` : ''}
                    <p style="font-size:9px;color:#555;margin:1px 0 0 0;">Billing Type: ${String(billingType).toUpperCase()}</p>
                </div>`;
                    }
                    return '';
                })()}

                <!-- Patient Row -->
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <div>
                        <p style="font-size:12px;font-weight:bold;">${patientDisplayName} [${patient.patient_id || '-'}]</p>
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
                        <p style="font-size:11px;"><strong>Category:</strong> ${(() => {
                            const t = String((invoice as any).billing_patient_type || (patient as any).patient_type || 'cash').toLowerCase();
                            if (t === 'corporate') return 'CORPORATE';
                            if (t === 'tpa_insurance' || t === 'insurance' || t === 'tpa') return 'INSURANCE / TPA';
                            return `${patientCategory}${tpaProviderName ? ` (${tpaProviderName})` : ''}`;
                        })()}</p>
                    </div>
                    <div style="text-align:center;">
                        ${isIPD && admission.doctor_name ? `<p style="font-size:11px;"><strong>Department:</strong> -</p>` : ''}
                        ${isIPD ? `<p style="font-size:11px;"><strong>Discharge Date:</strong> ${admission.discharge_date ? fmtDate(admission.discharge_date) + ' ' + fmtTime(admission.discharge_date) : 'N/A'}</p>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <p style="font-size:11px;"><strong>Bill Date:</strong> ${invoiceDate}</p>
                        <p style="font-size:11px;"><strong>Doctor:</strong> ${admission
                            ? (formatDoctorName(admission.doctor_name) || '-')
                            : (() => {
                                const d = opdDoctor || (invoice as any).doctor_name || '';
                                if (d) return formatDoctorName(d);
                                // No doctor captured for this OPD bill — fall back to the patient's department.
                                return patient.department || '-';
                            })()}</p>
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
        ${isPharmacyBill ? '</div>' : '</td></tr></tbody><tfoot><tr><td class="print-layout-footer-spacer"></td></tr></tfoot></table>'}
</body>
</html>`
}
