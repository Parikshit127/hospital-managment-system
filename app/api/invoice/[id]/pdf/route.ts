import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/backend/db'
import { resolveRouteAuth } from '@/app/lib/route-auth'

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { id } = await params;
        const invoiceId = parseInt(id)
        if (isNaN(invoiceId)) {
            return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 })
        }

        const invoice = await prisma.invoices.findFirst({
            where: {
                id: invoiceId,
                organizationId: auth.context.organizationId,
            },
            include: {
                items: true,
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true } },
                payments: {
                    where: {
                        status: { not: 'Reversed' },
                        organizationId: auth.context.organizationId,
                    },
                    orderBy: { created_at: 'desc' },
                },
            }
        })

        if (!invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
        }

        if (auth.context.kind === 'patient' && invoice.patient_id !== auth.context.session.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Compute GST breakdown
        const taxableItems = (invoice.items || []).filter(i =>
            ['Consumables', 'Accommodation', 'Housekeeping'].includes(i.department)
        )
        const gstableAmount = taxableItems.reduce((sum, i) => sum + Number(i.net_price), 0)
        const gst = gstableAmount * 0.18
        const cgst = gst / 2
        const sgst = gst / 2

        const html = generateInvoiceHTML(invoice, { gstableAmount, gst, cgst, sgst })

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
            }
        })
    } catch (error: any) {
        console.error('Invoice PDF error:', error)
        return NextResponse.json({ error: error.message || 'Failed to generate invoice' }, { status: 500 })
    }
}

function generateInvoiceHTML(invoice: any, gst: { gstableAmount: number; gst: number; cgst: number; sgst: number }) {
    const items = invoice.items || []
    const payments = invoice.payments || []
    const patient = invoice.patient || {}
    const total = Number(invoice.total_amount || 0)
    const discount = Number(invoice.discount_amount || 0)
    const net = Number(invoice.net_amount || 0)
    const paid = Number(invoice.paid_amount || 0)
    const balance = Number(invoice.balance_due || 0)
    const invoiceDate = invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

    const itemRows = items.map((item: any) => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">${item.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;">${item.department}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center;">${item.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;">${Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;">${Number(item.net_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
    `).join('')

    const paymentRows = payments.map((p: any) => `
        <tr>
            <td style="padding:6px 12px;font-size:11px;">${new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
            <td style="padding:6px 12px;font-size:11px;">${p.payment_method}</td>
            <td style="padding:6px 12px;font-size:11px;text-align:right;">${Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
    `).join('')

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice ${invoice.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        @media print {
            body { margin: 0; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:#059669;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;">
            Print / Download PDF
        </button>
    </div>

    <div style="max-width:800px;margin:0 auto;padding:40px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;border-bottom:3px solid #059669;padding-bottom:20px;">
            <div>
                <h1 style="font-size:24px;font-weight:900;color:#059669;margin-bottom:4px;">Avani Hospital</h1>
                <p style="font-size:11px;color:#6b7280;">Healthcare Excellence &bull; NABH Accredited</p>
                <p style="font-size:10px;color:#9ca3af;margin-top:4px;">CIN: UXXXXXXXXXXXXXXXX &bull; GSTIN: XXXXXXXXXXXXXXXXX</p>
            </div>
            <div style="text-align:right;">
                <h2 style="font-size:20px;font-weight:800;color:#1f2937;">TAX INVOICE</h2>
                <p style="font-size:13px;font-weight:700;color:#059669;">${invoice.invoice_number}</p>
                <p style="font-size:11px;color:#6b7280;">Date: ${invoiceDate}</p>
                <p style="font-size:11px;color:#6b7280;">Status: ${invoice.status}</p>
            </div>
        </div>

        <!-- Patient Info -->
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
            <h3 style="font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Patient Details</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <p style="font-size:12px;"><strong>Name:</strong> ${patient.full_name || 'N/A'}</p>
                <p style="font-size:12px;"><strong>Patient ID:</strong> ${patient.patient_id || 'N/A'}</p>
                <p style="font-size:12px;"><strong>Age / Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                <p style="font-size:12px;"><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p style="font-size:12px;"><strong>Type:</strong> ${invoice.invoice_type || 'OPD'}</p>
                ${invoice.admission_id ? `<p style="font-size:12px;"><strong>Admission:</strong> ${invoice.admission_id}</p>` : ''}
            </div>
        </div>

        <!-- Line Items -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <thead>
                <tr style="background:#f3f4f6;">
                    <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Description</th>
                    <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Dept</th>
                    <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Qty</th>
                    <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Rate</th>
                    <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemRows}
            </tbody>
        </table>

        <!-- Totals -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
            <table style="width:300px;border-collapse:collapse;">
                <tr>
                    <td style="padding:6px 12px;font-size:12px;color:#6b7280;">Subtotal</td>
                    <td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:600;">${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>
                ${discount > 0 ? `
                <tr>
                    <td style="padding:6px 12px;font-size:12px;color:#6b7280;">Discount</td>
                    <td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:600;color:#dc2626;">-${discount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>` : ''}
                ${gst.gst > 0 ? `
                <tr>
                    <td style="padding:6px 12px;font-size:11px;color:#9ca3af;">CGST (9%)</td>
                    <td style="padding:6px 12px;font-size:11px;text-align:right;color:#6b7280;">${gst.cgst.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>
                <tr>
                    <td style="padding:6px 12px;font-size:11px;color:#9ca3af;">SGST (9%)</td>
                    <td style="padding:6px 12px;font-size:11px;text-align:right;color:#6b7280;">${gst.sgst.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>` : ''}
                <tr style="border-top:2px solid #1f2937;">
                    <td style="padding:8px 12px;font-size:13px;font-weight:800;">Net Amount</td>
                    <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:800;">${(net + gst.gst).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>
                <tr>
                    <td style="padding:6px 12px;font-size:12px;color:#059669;font-weight:600;">Paid</td>
                    <td style="padding:6px 12px;font-size:12px;text-align:right;font-weight:600;color:#059669;">${paid.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>
                ${balance > 0 ? `
                <tr style="background:#fef2f2;">
                    <td style="padding:8px 12px;font-size:13px;font-weight:800;color:#dc2626;">Balance Due</td>
                    <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:800;color:#dc2626;">${balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                </tr>` : ''}
            </table>
        </div>

        ${payments.length > 0 ? `
        <!-- Payment History -->
        <div style="margin-bottom:20px;">
            <h3 style="font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Payment History</h3>
            <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;">
                <thead>
                    <tr>
                        <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;">Date</th>
                        <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;">Method</th>
                        <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;">Amount</th>
                    </tr>
                </thead>
                <tbody>${paymentRows}</tbody>
            </table>
        </div>` : ''}

        <!-- Footer -->
        <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:30px;text-align:center;">
            <p style="font-size:10px;color:#9ca3af;">This is a computer-generated invoice. No signature required.</p>
            <p style="font-size:10px;color:#9ca3af;margin-top:4px;">Avani Hospital &bull; For queries contact reception</p>
        </div>
    </div>
</body>
</html>`
}
