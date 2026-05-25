import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { ensureIPDRoomChargesAccrued } from '@/app/actions/ipd-billing-helpers';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist', 'doctor', 'ipd_manager'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { admissionId } = await params;

        // Accrue any missing per-day room/nursing charges before rendering the summary
        await ensureIPDRoomChargesAccrued(admissionId).catch(() => null);

        const admission = await prisma.admissions.findFirst({
            where: { admission_id: admissionId, organizationId: auth.context.organizationId },
            include: {
                patient: { select: { full_name: true, patient_id: true, phone: true, age: true, gender: true } },
                ward: { select: { ward_name: true } },
                bed: { select: { bed_id: true } },
            },
        });
        if (!admission) return NextResponse.json({ error: 'Admission not found' }, { status: 404 });

        const invoice = await prisma.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
            include: { items: true, payments: { where: { status: { not: 'Reversed' } } } },
            orderBy: { created_at: 'desc' },
        });
        if (!invoice) return NextResponse.json({ error: 'No invoice found' }, { status: 404 });

        const org = await prisma.organization.findUnique({
            where: { id: auth.context.organizationId },
        });

        const deposits = await prisma.patientDeposit.findMany({
            where: { patient_id: admission.patient_id },
        });

        const isFinal = admission.status === 'Discharged';
        const html = generateSummaryBillHTML(admission, invoice, org, deposits, isFinal);

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('Summary bill error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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
    return 'Rupees ' + convert(Math.floor(n)) + ' Only';
}

function generateSummaryBillHTML(admission: any, invoice: any, org: any, deposits: any[], isFinal: boolean) {
    const patient = admission.patient || {};
    const items = invoice.items || [];

    const hospitalName = org?.name || 'Hospital';
    const gstin = org?.registration_number || 'N/A';

    const admissionDate = new Date(admission.admission_date).toLocaleDateString('en-IN');
    const dischargeDate = admission.discharge_date
        ? new Date(admission.discharge_date).toLocaleDateString('en-IN')
        : new Date().toLocaleDateString('en-IN');
    const los = Math.max(
        1,
        Math.ceil(
            (new Date(admission.discharge_date || new Date()).getTime() -
                new Date(admission.admission_date).getTime()) /
                (1000 * 60 * 60 * 24),
        ),
    );

    const total = Number(invoice.total_amount || 0);
    const totalDiscount = Number(invoice.total_discount || 0);
    const totalTax = Number(invoice.total_tax || 0);
    const net = Number(invoice.net_amount || 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_due || 0);

    // Aggregate items by service_category (one row per category)
    const categoryAgg: Record<string, { qty: number; amount: number; tax: number }> = {};
    for (const item of items) {
        const cat = item.service_category || item.department || 'Other';
        if (!categoryAgg[cat]) categoryAgg[cat] = { qty: 0, amount: 0, tax: 0 };
        categoryAgg[cat].qty += Number(item.quantity || 0);
        categoryAgg[cat].amount += Number(item.net_price || 0);
        categoryAgg[cat].tax += Number(item.tax_amount || 0);
    }
    const sortedCategories = Object.entries(categoryAgg).sort(
        ([, a], [, b]) => b.amount + b.tax - (a.amount + a.tax),
    );

    let categoryRows = '';
    for (const [cat, data] of sortedCategories) {
        const subtotal = data.amount + data.tax;
        categoryRows += `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;">${cat}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center;color:#6b7280;">${data.qty}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:right;color:#6b7280;">${data.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;text-align:right;font-weight:700;">${subtotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
        </tr>`;
    }

    const depositTotal = deposits.reduce((s, d) => s + Number(d.applied_amount || 0), 0);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${isFinal ? 'FINAL' : 'INTERIM'} SUMMARY BILL - ${admission.admission_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
        
        .letterhead-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            pointer-events: none;
        }
        .letterhead-bg img {
            width: 100%;
            height: 100%;
            object-fit: fill;
        }

        .print-layout-table {
            width: 100%;
            border-collapse: collapse;
        }

        .print-layout-header-spacer {
            height: 130px;
        }

        .print-layout-footer-spacer {
            height: 80px;
        }

        .bill-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 60px;
            position: relative;
            z-index: 1;
        }

        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 80px;
            font-weight: 900;
            color: ${isFinal ? '#1e3a6e' : '#f59e0b'};
            opacity: 0.04;
            pointer-events: none;
            z-index: 0;
        }

        @media print {
            @page {
                margin: 0;
            }
            body {
                margin: 0;
                background: white;
            }
            .bill-container {
                max-width: 100%;
                margin: 0;
                padding: 0 60px;
            }
            .no-print {
                display: none !important;
            }
            .watermark {
                opacity: 0.06;
            }
        }
    </style>
</head>
<body>
    <div class="letterhead-bg">
        <img src="/letter head.png" alt="" aria-hidden="true" />
    </div>

    <div class="watermark">${isFinal ? 'FINAL' : 'INTERIM'} SUMMARY</div>

    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;">
        <button onclick="window.print()" style="padding:8px 24px;background:#1e3a6e;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Print / Download PDF</button>
        <span style="margin-left:12px;font-size:11px;color:#6b7280;">This is a category-level summary. For line-by-line details, see the Detailed Bill.</span>
    </div>

    <table class="print-layout-table">
        <thead>
            <tr>
                <td class="print-layout-header-spacer"></td>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div class="bill-container">
                        <!-- Header details matching pharmacy layout (no logo since it is on the letterhead) -->
                        <div style="display:flex;justify-content:flex-end;border-bottom:2px solid #1e3a6e;padding-bottom:12px;margin-bottom:20px;">
                            <div style="text-align:right;">
                                <h2 style="font-size:16px;font-weight:800;color:${isFinal ? '#1e3a6e' : '#f97316'};">${isFinal ? 'SUMMARY BILL' : 'INTERIM SUMMARY'}</h2>
                                <p style="font-size:12px;font-weight:700;color:#1e3a6e;">${invoice.invoice_number}</p>
                                <p style="font-size:10px;color:#6b7280;">Type: <strong>${invoice.invoice_type || 'IPD'}</strong></p>
                                <p style="font-size:10px;color:#6b7280;">Date: ${new Date().toLocaleDateString('en-IN')}</p>
                                <p style="font-size:10px;color:#6b7280;">GSTIN: ${gstin}</p>
                            </div>
                        </div>

                        <!-- Patient & Admission -->
                        <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                                <p style="font-size:11px;"><strong>Patient:</strong> ${patient.full_name || '-'}</p>
                                <p style="font-size:11px;"><strong>UHID:</strong> ${patient.patient_id || '-'}</p>
                                <p style="font-size:11px;"><strong>Age/Gender:</strong> ${patient.age || '-'} / ${patient.gender || '-'}</p>
                                <p style="font-size:11px;"><strong>Admission ID:</strong> ${admission.admission_id}</p>
                                <p style="font-size:11px;"><strong>Doctor:</strong> ${admission.doctor_name || '-'}</p>
                                <p style="font-size:11px;"><strong>Ward/Bed:</strong> ${admission.ward?.ward_name || '-'} / ${admission.bed?.bed_id || '-'}</p>
                                <p style="font-size:11px;"><strong>Admitted:</strong> ${admissionDate}</p>
                                <p style="font-size:11px;"><strong>Discharged:</strong> ${isFinal ? dischargeDate : 'N/A'}</p>
                                <p style="font-size:11px;"><strong>LOS:</strong> ${los} day(s)</p>
                                <p style="font-size:11px;"><strong>Diagnosis:</strong> ${admission.diagnosis || '-'}</p>
                            </div>
                        </div>

                        <!-- Category-level Summary -->
                        <h3 style="font-size:11px;font-weight:800;color:#1e3a6e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Charges Summary</h3>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                            <thead>
                                <tr style="border-bottom:2px solid #1e3a6e;background:#f9fafb;">
                                    <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:#1e3a6e;">Category</th>
                                    <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:#1e3a6e;">Items</th>
                                    <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#1e3a6e;">GST</th>
                                    <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:800;color:#1e3a6e;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>${categoryRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">No charges yet</td></tr>'}</tbody>
                        </table>

                        <!-- Totals -->
                        <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
                            <table style="width:320px;border-collapse:collapse;">
                                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Subtotal</td><td style="padding:5px 12px;font-size:12px;text-align:right;">${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ${totalDiscount > 0 ? `<tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Discount</td><td style="padding:5px 12px;font-size:12px;text-align:right;color:#dc2626;">-${totalDiscount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                                ${totalTax > 0 ? `
                                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">CGST</td><td style="padding:5px 12px;font-size:12px;text-align:right;">${(totalTax / 2).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">SGST</td><td style="padding:5px 12px;font-size:12px;text-align:right;">${(totalTax / 2).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ` : ''}
                                <tr style="border-top:2px solid #1f2937;"><td style="padding:7px 12px;font-size:14px;font-weight:800;">Net Amount</td><td style="padding:7px 12px;font-size:14px;text-align:right;font-weight:800;">${net.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ${depositTotal > 0 ? `<tr><td style="padding:5px 12px;font-size:12px;color:#7c3aed;">Deposits Applied</td><td style="padding:5px 12px;font-size:12px;text-align:right;color:#7c3aed;">-${depositTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : ''}
                                <tr><td style="padding:5px 12px;font-size:12px;color:#059669;">Total Paid</td><td style="padding:5px 12px;font-size:12px;text-align:right;color:#059669;">${paid.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>
                                ${balance > 0 ? `<tr style="background:#fef2f2;"><td style="padding:7px 12px;font-size:13px;font-weight:800;color:#dc2626;">Balance Due</td><td style="padding:7px 12px;font-size:13px;text-align:right;font-weight:800;color:#dc2626;">${balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td></tr>` : `<tr style="background:#f0fdf4;"><td style="padding:7px 12px;font-size:13px;font-weight:800;color:#059669;">FULLY PAID</td><td style="padding:7px 12px;font-size:13px;text-align:right;font-weight:800;color:#059669;">&#10003;</td></tr>`}
                            </table>
                        </div>

                        <div style="background:#f0fdf4;border-radius:6px;padding:8px 14px;margin-bottom:14px;">
                            <p style="font-size:10px;color:#059669;"><strong>Amount in Words:</strong> ${numberToWords(net)}</p>
                        </div>

                        <p style="font-size:9px;color:#9ca3af;text-align:center;margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;">
                            This is a category-level summary. For the line-by-line detailed bill, request the Detailed Bill from the billing desk.
                        </p>
                    </div>
                </td>
            </tr>
        </tbody>
        <tfoot>
            <tr>
                <td class="print-layout-footer-spacer"></td>
            </tr>
        </tfoot>
    </table>
</body>
</html>`;
}
