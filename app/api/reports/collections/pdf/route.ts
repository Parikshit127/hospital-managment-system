import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding } from '@/app/lib/bill-branding';

const ALLOWED_STAFF_ROLES = ['admin', 'finance'];

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: false,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { searchParams } = req.nextUrl;
        const fromStr = searchParams.get('from');
        const toStr = searchParams.get('to');
        const methodFilter = searchParams.get('method') || undefined;
        const invoiceTypeFilter = searchParams.get('invoiceType') || undefined;

        if (!fromStr || !toStr) {
            return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 });
        }

        const fromDate = new Date(fromStr + 'T00:00:00+05:30');
        const toDate = new Date(toStr + 'T23:59:59.999+05:30');

        // 1. Fetch Branding
        const branding = await getBillBranding(organizationId);

        // 2. Fetch Users to map username -> name
        const usersList = await prisma.user.findMany({
            where: { organizationId },
            select: { id: true, username: true, name: true }
        });
        const userMap = new Map(usersList.map(u => [u.username?.toLowerCase() || '', u.name || '']));

        // 3. Fetch Payments
        const paymentWhere: any = {
            organizationId,
            created_at: { gte: fromDate, lte: toDate },
            status: { in: ['Completed', 'Reversed'] }
        };
        if (methodFilter && methodFilter !== 'all') {
            paymentWhere.payment_method = methodFilter;
        }
        if (invoiceTypeFilter && invoiceTypeFilter !== 'all') {
            paymentWhere.invoice = { invoice_type: invoiceTypeFilter };
        }

        const payments = await prisma.payments.findMany({
            where: paymentWhere,
            include: {
                invoice: {
                    select: {
                        invoice_number: true,
                        invoice_type: true,
                        patient: {
                            select: {
                                full_name: true,
                                patient_id: true
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'asc' }
        });

        // 4. Fetch Patient Deposits (Advances)
        const depositWhere: any = {
            organizationId,
            created_at: { gte: fromDate, lte: toDate }
        };
        // Deposits only count as advance collections
        if (methodFilter && methodFilter !== 'all') {
            depositWhere.payment_method = methodFilter;
        }

        const deposits = await prisma.patientDeposit.findMany({
            where: depositWhere,
            orderBy: { created_at: 'asc' }
        });

        // Resolve patient details for deposits
        const depositPatientIds = [...new Set(deposits.map(d => d.patient_id))];
        const depositPatients = depositPatientIds.length
            ? await prisma.oPD_REG.findMany({
                where: { patient_id: { in: depositPatientIds }, organizationId },
                select: { patient_id: true, full_name: true }
            })
            : [];
        const depositPatientMap = new Map(depositPatients.map(p => [p.patient_id, p.full_name]));

        // 5. Fetch Refunds
        const refundWhere: any = {
            organizationId,
            created_at: { gte: fromDate, lte: toDate },
            status: { in: ['Approved', 'Processed'] }
        };
        const refunds = await prisma.refund.findMany({
            where: refundWhere,
            orderBy: { created_at: 'asc' }
        });

        // 6. Fetch Audit Logs for Payment Cashier resolution
        const receiptNumbers = payments.map(p => p.receipt_number);
        const paymentLogs = receiptNumbers.length
            ? await prisma.system_audit_logs.findMany({
                where: {
                    organizationId,
                    action: { in: ['RECORD_PAYMENT', 'SPLIT_PAYMENT'] },
                    entity_id: { in: receiptNumbers }
                },
                select: { entity_id: true, username: true }
            })
            : [];
        const paymentCashierMap = new Map(paymentLogs.map(log => [log.entity_id, log.username]));

        // 7. Process Data
        const allModes = new Set<string>();
        const cashierList = new Set<string>();

        interface CollectionItem {
            srNo: number;
            type: 'Receipt' | 'Refund';
            receiptNo: string;
            invoiceNo: string;
            patientName: string;
            mrn: string;
            mode: string;
            date: string;
            time: string;
            amount: number;
            cashier: string;
            cashierUsername: string;
            counter: string;
            department: 'Advance' | 'OP/ER' | 'IPD' | 'Walkin' | 'Pharmacy' | 'Voucher';
        }

        const itemsList: CollectionItem[] = [];

        // Helper to classify invoice type -> department
        function getDept(invoiceType: string): 'OP/ER' | 'IPD' | 'Walkin' | 'Pharmacy' | 'Voucher' {
            const t = (invoiceType || '').toUpperCase();
            if (t === 'IPD') return 'IPD';
            if (t === 'PHARMACY' || t === 'Pharmacy') return 'Pharmacy';
            if (t === 'LAB' || t === 'Walkin') return 'Walkin';
            if (t === 'Voucher') return 'Voucher';
            return 'OP/ER';
        }

        let sr = 1;

        // Process completed payments
        payments.forEach(p => {
            if (p.payment_method === 'Deposit') return; // Skip deposits applied to bills to avoid double counting

            const cashierUser = paymentCashierMap.get(p.receipt_number) || 'system';
            const cashierName = userMap.get(cashierUser.toLowerCase()) || cashierUser;
            const patientName = p.invoice?.patient?.full_name || '-';
            const patientId = p.invoice?.patient?.patient_id || '-';
            const dept = getDept(p.invoice?.invoice_type || 'OPD');
            const mode = p.payment_method || 'Unknown';
            allModes.add(mode);
            cashierList.add(cashierUser);

            const dt = new Date(p.created_at);
            const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            if (p.status === 'Completed') {
                itemsList.push({
                    srNo: sr++,
                    type: 'Receipt',
                    receiptNo: p.receipt_number,
                    invoiceNo: p.invoice?.invoice_number || '-',
                    patientName,
                    mrn: patientId,
                    mode,
                    date: dateStr,
                    time: timeStr,
                    amount: Number(p.amount),
                    cashier: cashierName,
                    cashierUsername: cashierUser,
                    counter: 'MAIN CASH COUNTER',
                    department: dept
                });
            } else if (p.status === 'Reversed') {
                itemsList.push({
                    srNo: sr++,
                    type: 'Refund',
                    receiptNo: p.receipt_number,
                    invoiceNo: p.invoice?.invoice_number || '-',
                    patientName,
                    mrn: patientId,
                    mode,
                    date: dateStr,
                    time: timeStr,
                    amount: Number(p.amount),
                    cashier: cashierName,
                    cashierUsername: cashierUser,
                    counter: 'MAIN CASH COUNTER',
                    department: dept
                });
            }
        });

        // Process deposits collected (Advances)
        deposits.forEach(d => {
            const cashierUser = d.collected_by || 'system';
            const cashierName = userMap.get(cashierUser.toLowerCase()) || cashierUser;
            const patientName = depositPatientMap.get(d.patient_id) || '-';
            const patientId = d.patient_id;
            const mode = d.payment_method || 'Unknown';
            allModes.add(mode);
            cashierList.add(cashierUser);

            const dt = new Date(d.created_at);
            const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            itemsList.push({
                srNo: sr++,
                type: 'Receipt',
                receiptNo: d.deposit_number,
                invoiceNo: '-',
                patientName,
                mrn: patientId,
                mode,
                date: dateStr,
                time: timeStr,
                amount: Number(d.amount),
                cashier: cashierName,
                cashierUsername: cashierUser,
                counter: 'MAIN CASH COUNTER',
                department: 'Advance'
            });
        });

        // Process refunds table
        refunds.forEach(r => {
            const cashierUser = r.processed_by || 'system';
            const cashierName = userMap.get(cashierUser.toLowerCase()) || cashierUser;
            const mode = 'Cash'; // Default to cash for refunded payouts if not explicitly defined
            allModes.add(mode);
            cashierList.add(cashierUser);

            const dt = new Date(r.created_at);
            const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            itemsList.push({
                srNo: sr++,
                type: 'Refund',
                receiptNo: `RF-${r.id}`,
                invoiceNo: r.invoice_id ? String(r.invoice_id) : '-',
                patientName: 'Refund Payout',
                mrn: '-',
                mode,
                date: dateStr,
                time: timeStr,
                amount: Number(r.amount),
                cashier: cashierName,
                cashierUsername: cashierUser,
                counter: 'MAIN CASH COUNTER',
                department: 'OP/ER' // Default refund to OP/ER if unknown
            });
        });

        // Fallback default modes if empty
        if (allModes.size === 0) {
            allModes.add('Cash');
            allModes.add('UPI');
        }

        const modeList = Array.from(allModes);
        const depts: Array<'Advance' | 'OP/ER' | 'IPD' | 'Walkin' | 'Pharmacy' | 'Voucher'> = ['Advance', 'OP/ER', 'IPD', 'Walkin', 'Pharmacy', 'Voucher'];

        // Helper function to build summary matrix
        function buildSummaryMatrix(filteredItems: CollectionItem[]) {
            const receipts: Record<string, Record<string, number>> = {};
            const refunds: Record<string, Record<string, number>> = {};

            modeList.forEach(m => {
                receipts[m] = {};
                refunds[m] = {};
                depts.forEach(d => {
                    receipts[m][d] = 0;
                    refunds[m][d] = 0;
                });
            });

            filteredItems.forEach(item => {
                const target = item.type === 'Receipt' ? receipts : refunds;
                if (target[item.mode] === undefined) {
                    target[item.mode] = {};
                    depts.forEach(d => { target[item.mode][d] = 0; });
                }
                target[item.mode][item.department] += item.amount;
            });

            return { receipts, refunds };
        }

        const overallMatrix = buildSummaryMatrix(itemsList);

        // Helper to format matrix row
        function renderMatrixRows(matrix: ReturnType<typeof buildSummaryMatrix>) {
            let html = '';
            
            // Receipts
            modeList.forEach(m => {
                const row = matrix.receipts[m];
                let rowSum = 0;
                depts.forEach(d => { rowSum += row[d] || 0; });
                if (rowSum === 0) return; // Skip empty rows

                html += `<tr>
                    <td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Receipt ${m}</td>
                    ${depts.map(d => `<td style="padding:6px;border:1px solid #ddd;text-align:right;">${(row[d] || 0).toFixed(2)}</td>`).join('')}
                    <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${rowSum.toFixed(2)}</td>
                </tr>`;
            });

            // Total Receipt
            let totalReceipt = 0;
            const deptTotals: Record<string, number> = {};
            depts.forEach(d => { deptTotals[d] = 0; });

            modeList.forEach(m => {
                depts.forEach(d => {
                    const val = matrix.receipts[m]?.[d] || 0;
                    deptTotals[d] += val;
                    totalReceipt += val;
                });
            });

            html += `<tr style="background:#f9f9f9;font-weight:bold;">
                <td style="padding:6px;border:1px solid #ddd;">Total Receipt</td>
                ${depts.map(d => `<td style="padding:6px;border:1px solid #ddd;text-align:right;">${deptTotals[d].toFixed(2)}</td>`).join('')}
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${totalReceipt.toFixed(2)}</td>
            </tr>`;

            // Refunds
            modeList.forEach(m => {
                const row = matrix.refunds[m];
                let rowSum = 0;
                depts.forEach(d => { rowSum += row[d] || 0; });
                if (rowSum === 0) return; // Skip empty rows

                html += `<tr>
                    <td style="padding:6px;border:1px solid #ddd;color:#d32f2f;">Refund/Payment ${m}</td>
                    ${depts.map(d => `<td style="padding:6px;border:1px solid #ddd;text-align:right;color:#d32f2f;">${(row[d] || 0).toFixed(2)}</td>`).join('')}
                    <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;color:#d32f2f;">${rowSum.toFixed(2)}</td>
                </tr>`;
            });

            // Total Refund
            let totalRefund = 0;
            const deptRefundTotals: Record<string, number> = {};
            depts.forEach(d => { deptRefundTotals[d] = 0; });

            modeList.forEach(m => {
                depts.forEach(d => {
                    const val = matrix.refunds[m]?.[d] || 0;
                    deptRefundTotals[d] += val;
                    totalRefund += val;
                });
            });

            html += `<tr style="background:#f9f9f9;font-weight:bold;color:#d32f2f;">
                <td style="padding:6px;border:1px solid #ddd;">Total Refund</td>
                ${depts.map(d => `<td style="padding:6px;border:1px solid #ddd;text-align:right;">${deptRefundTotals[d].toFixed(2)}</td>`).join('')}
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${totalRefund.toFixed(2)}</td>
            </tr>`;

            // Net Amount
            const netTotals: Record<string, number> = {};
            let overallNet = 0;
            depts.forEach(d => {
                netTotals[d] = deptTotals[d] - deptRefundTotals[d];
                overallNet += netTotals[d];
            });

            html += `<tr style="background:#eef6ff;font-weight:bold;color:#0b4ea2;border-top:2px solid #0b4ea2;">
                <td style="padding:6px;border:1px solid #ddd;">Net Amount</td>
                ${depts.map(d => `<td style="padding:6px;border:1px solid #ddd;text-align:right;">${netTotals[d].toFixed(2)}</td>`).join('')}
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${overallNet.toFixed(2)}</td>
            </tr>`;

            return html;
        }

        // Mini Table Count helper
        function renderMiniTable(filteredItems: CollectionItem[]) {
            const countByMode: Record<string, { receipt: number; refund: number }> = {};
            modeList.forEach(m => { countByMode[m] = { receipt: 0, refund: 0 }; });

            let receiptsCount = 0;
            let refundsCount = 0;

            filteredItems.forEach(item => {
                if (countByMode[item.mode] === undefined) {
                    countByMode[item.mode] = { receipt: 0, refund: 0 };
                }
                if (item.type === 'Receipt') {
                    countByMode[item.mode].receipt += item.amount;
                    receiptsCount++;
                } else {
                    countByMode[item.mode].refund += item.amount;
                    refundsCount++;
                }
            });

            let rowsHtml = '';
            let totalReceiptSum = 0;
            let totalRefundSum = 0;

            Object.entries(countByMode).forEach(([m, val]) => {
                const total = val.receipt - val.refund;
                totalReceiptSum += val.receipt;
                totalRefundSum += val.refund;
                if (val.receipt === 0 && val.refund === 0) return;

                rowsHtml += `<tr>
                    <td style="padding:6px;border:1px solid #ddd;text-align:left;">${m}</td>
                    <td style="padding:6px;border:1px solid #ddd;text-align:right;">${val.receipt.toFixed(2)}</td>
                    <td style="padding:6px;border:1px solid #ddd;text-align:right;">${val.refund.toFixed(2)}</td>
                    <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${total.toFixed(2)}</td>
                </tr>`;
            });

            const totalSum = totalReceiptSum - totalRefundSum;

            return `
            <div style="margin-top:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="font-size:11px;font-weight:bold;color:#333;">
                    No Of Receipt : ${receiptsCount} &nbsp;&nbsp;&nbsp;&nbsp; No Of Refund : ${refundsCount}
                </div>
                <table style="width:300px;border-collapse:collapse;font-size:10px;border:1px solid #ddd;">
                    <thead>
                        <tr style="background:#f5f5f5;">
                            <th style="padding:5px;border:1px solid #ddd;text-align:left;">Type</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:right;">Receipt</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:right;">Refund</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        <tr style="background:#f9f9f9;font-weight:bold;">
                            <td style="padding:5px;border:1px solid #ddd;text-align:left;">Net Total</td>
                            <td style="padding:5px;border:1px solid #ddd;text-align:right;">${totalReceiptSum.toFixed(2)}</td>
                            <td style="padding:5px;border:1px solid #ddd;text-align:right;">${totalRefundSum.toFixed(2)}</td>
                            <td style="padding:5px;border:1px solid #ddd;text-align:right;">${totalSum.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        }

        // Render Cashier summaries
        let cashierSummariesHtml = '';
        const cashiersSorted = Array.from(cashierList).sort();

        cashiersSorted.forEach(cUser => {
            const cName = userMap.get(cUser.toLowerCase()) || cUser;
            const cItems = itemsList.filter(item => item.cashierUsername === cUser);
            if (cItems.length === 0) return;

            const cMatrix = buildSummaryMatrix(cItems);

            cashierSummariesHtml += `
            <div style="margin-top:20px;margin-bottom:30px;page-break-inside:avoid;">
                <div style="font-size:11px;font-weight:bold;background:#eee;padding:4px 8px;margin-bottom:8px;border-left:4px solid #4caf50;">
                    Cashier : ${cName.toUpperCase()} [${cUser}]
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px;">
                    <thead>
                        <tr style="background:#f5f5f5;">
                            <th style="padding:6px;border:1px solid #ddd;text-align:left;width:150px;">Payment Mode</th>
                            ${depts.map(d => `<th style="padding:6px;border:1px solid #ddd;text-align:right;">${d}</th>`).join('')}
                            <th style="padding:6px;border:1px solid #ddd;text-align:right;">Total Collection</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderMatrixRows(cMatrix)}
                    </tbody>
                </table>
                ${renderMiniTable(cItems)}
            </div>
            <hr style="border:none;border-top:1px dashed #ccc;margin:15px 0;" />`;
        });

        // Group details by department
        let detailsHtml = '';
        depts.forEach(dept => {
            const deptItems = itemsList.filter(item => item.department === dept);
            if (deptItems.length === 0) return;

            let deptReceiptAmt = 0;
            let deptRefundAmt = 0;
            deptItems.forEach(item => {
                if (item.type === 'Receipt') deptReceiptAmt += item.amount;
                else deptRefundAmt += item.amount;
            });
            const deptNetAmt = deptReceiptAmt - deptRefundAmt;

            let rowsHtml = '';
            deptItems.forEach((item, idx) => {
                rowsHtml += `<tr>
                    <td style="padding:5px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>
                    <td style="padding:5px;border:1px solid #ddd;font-family:monospace;font-size:9px;">
                        ${item.receiptNo}<br/>
                        <span style="color:#666;">${item.invoiceNo}</span>
                    </td>
                    <td style="padding:5px;border:1px solid #ddd;">
                        ${item.patientName}<br/>
                        <span style="color:#666;font-size:9px;">${item.mrn}</span>
                    </td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:center;">${item.mode}</td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:center;font-size:9px;">
                        ${item.date}<br/>
                        <span style="color:#666;">${item.time}</span>
                    </td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:right;">${item.type === 'Receipt' ? item.amount.toFixed(2) : '-'}</td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:right;color:#d32f2f;">${item.type === 'Refund' ? item.amount.toFixed(2) : '-'}</td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:center;">-</td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:center;">
                        ${item.cashier.split(' ')[0]}<br/>
                        <span style="color:#666;font-size:9px;">[${item.cashierUsername}]</span>
                    </td>
                    <td style="padding:5px;border:1px solid #ddd;text-align:center;font-size:9px;">MAIN CASH COUNTER</td>
                </tr>`;
            });

            detailsHtml += `
            <div style="margin-top:25px;page-break-inside:avoid;">
                <div style="font-size:11px;font-weight:bold;margin-bottom:8px;display:flex;justify-content:space-between;background:#f5f5f5;padding:6px;border-bottom:2px solid #333;">
                    <span>${dept.toUpperCase()} Collection :</span>
                    <span>Receipt Amount: ${deptReceiptAmt.toFixed(2)} &nbsp;&nbsp;&nbsp;&nbsp; Refund Amount: ${deptRefundAmt.toFixed(2)} &nbsp;&nbsp;&nbsp;&nbsp; Net Amount: ${deptNetAmt.toFixed(2)}</span>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:10px;">
                    <thead>
                        <tr style="background:#fafafa;">
                            <th style="padding:5px;border:1px solid #ddd;text-align:center;width:40px;">Sr.</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:left;">Receipt No. / Invoice No.</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:left;">Patient Name / MRN</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:center;">Mode</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:center;">Date / Time</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:right;">Receipt Amt</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:right;">Refund Amt</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:center;">Deleted Amt</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:center;">Cashier</th>
                            <th style="padding:5px;border:1px solid #ddd;text-align:center;">Counter</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>`;
        });

        const printedDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Collection Report - Detail</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; font-size: 11px; padding: 40px; }
        @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <!-- Print Button -->
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;border-radius:6px;border:1px solid #ddd;">
        <button onclick="window.print()" style="padding:8px 24px;background:#4caf50;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Print / Download PDF</button>
    </div>

    <!-- Header Section -->
    <div style="text-align:center;margin-bottom:20px;line-height:1.4;">
        <h1 style="font-size:16px;font-weight:bold;text-transform:uppercase;">${branding.hospitalName}</h1>
        ${branding.gstin && branding.gstin !== 'N/A' ? `<p style="font-size:10px;font-weight:bold;">GST NO.-${branding.gstin}</p>` : ''}
        <p style="font-size:10px;color:#555;">${branding.hospitalAddress}</p>
    </div>

    <div style="border-top:2px solid #111;margin:10px 0;"></div>

    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-bottom:15px;">
        <span>Collection Report - Detail</span>
        <span>${fromStr} 00:00 AM to ${toStr} 11:59 PM</span>
        <span>Counter : ALL COUNTERS</span>
    </div>

    <div style="border-top:1px solid #ccc;margin-bottom:20px;"></div>

    <!-- 1. Summary Section -->
    <div style="margin-bottom:30px;">
        <h2 style="font-size:12px;font-weight:bold;margin-bottom:10px;color:#333;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:3px;display:inline-block;">1. Summary</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:5px;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="padding:6px;border:1px solid #ddd;text-align:left;width:150px;">Payment Mode</th>
                    ${depts.map(d => `<th style="padding:6px;border:1px solid #ddd;text-align:right;">${d}</th>`).join('')}
                    <th style="padding:6px;border:1px solid #ddd;text-align:right;">Total Collection</th>
                </tr>
            </thead>
            <tbody>
                ${renderMatrixRows(overallMatrix)}
            </tbody>
        </table>
        ${renderMiniTable(itemsList)}
    </div>

    <hr style="border:none;border-top:2px solid #333;margin:25px 0;" />

    <!-- 2. Cashier Wise Summary Section -->
    <div style="margin-bottom:30px;">
        <h2 style="font-size:12px;font-weight:bold;margin-bottom:10px;color:#333;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:3px;display:inline-block;">2. Cashier Wise Summary</h2>
        ${cashierSummariesHtml}
    </div>

    <hr style="border:none;border-top:2px solid #333;margin:25px 0;page-break-before:always;" />

    <!-- 3. Details Section -->
    <div style="margin-bottom:30px;">
        <h2 style="font-size:12px;font-weight:bold;margin-bottom:10px;color:#333;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:3px;display:inline-block;">3. Details</h2>
        ${detailsHtml}
    </div>

    <!-- Footer Remarks -->
    <div style="margin-top:40px;font-size:10px;color:#555;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
            <p>Remarks: Credit Payment Mode is not considered.</p>
            <p style="margin-top:15px;">Printed By : SYSTEM &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Printed On : ${printedDateStr}</p>
        </div>
        <div style="text-align:center;width:150px;border-top:1px solid #333;padding-top:5px;font-weight:bold;">
            [Signing Authority]
        </div>
    </div>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    } catch (error: any) {
        console.error('Collections PDF Report Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate Collections PDF' }, { status: 500 });
    }
}
