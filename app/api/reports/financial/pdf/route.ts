import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';

const ALLOWED_STAFF_ROLES = ['admin', 'finance'];

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: false,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const period = req.nextUrl.searchParams.get('period') || '30'; // days
        const periodDays = Number.parseInt(period, 10);
        const safePeriodDays = Number.isNaN(periodDays) ? 30 : Math.min(Math.max(periodDays, 1), 365);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - safePeriodDays);
        startDate.setHours(0, 0, 0, 0);

        const invoices = await prisma.invoices.findMany({
            where: {
                organizationId: auth.context.organizationId,
                created_at: { gte: startDate },
            },
            orderBy: { created_at: 'desc' },
            include: { patient: { select: { full_name: true } } },
        });

        const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
        const totalPaid = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount_paid) || 0), 0);
        const totalOutstanding = totalRevenue - totalPaid;
        const invoiceCount = invoices.length;

        const periodLabel = `${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} - ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

        // Group by department
        const deptRevenue: Record<string, number> = {};
        for (const inv of invoices) {
            const items = (inv as any).items || [];
            for (const item of items) {
                const dept = item.department || 'General';
                deptRevenue[dept] = (deptRevenue[dept] || 0) + (Number(item.net_price) || 0);
            }
        }
        if (Object.keys(deptRevenue).length === 0) {
            deptRevenue['All Departments'] = totalRevenue;
        }

        const deptRows = Object.entries(deptRevenue)
            .sort(([, a], [, b]) => b - a)
            .map(([dept, amount]) => `
                <tr>
                    <td style="font-weight:600;">${dept}</td>
                    <td style="text-align:right;font-weight:700;">&#8377; ${amount.toLocaleString('en-IN')}</td>
                    <td style="text-align:right;color:#6b7280;">${totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0}%</td>
                </tr>
            `).join('');

        const recentInvoicesHTML = invoices.slice(0, 20).map((inv: any, idx: number) => `
            <tr>
                <td>${idx + 1}</td>
                <td style="font-weight:600;">${inv.patient?.full_name || 'N/A'}</td>
                <td>&#8377; ${Number(inv.total_amount || 0).toLocaleString('en-IN')}</td>
                <td>&#8377; ${Number(inv.amount_paid || 0).toLocaleString('en-IN')}</td>
                <td><span style="color:${inv.status === 'Paid' ? '#065f46' : '#92400e'};font-weight:700;">${inv.status}</span></td>
                <td style="color:#6b7280;">${new Date(inv.created_at).toLocaleDateString('en-IN')}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Financial Report - ${periodLabel}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; padding: 24px; max-width: 900px; margin: 0 auto; }
        @media print { body { margin: 0; padding: 16px; } .no-print { display: none !important; } @page { size: A4 landscape; } }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #059669; padding-bottom: 16px; }
        .header h1 { font-size: 18px; font-weight: 900; color: #059669; }
        .header p { font-size: 10px; color: #6b7280; margin-top: 4px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .kpi { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
        .kpi label { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
        .kpi .value { font-size: 20px; font-weight: 900; margin-top: 4px; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 9px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; background: #f9fafb; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;">
        <button onclick="window.print()" style="padding:8px 24px;background:#059669;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;">
            Print / Download PDF
        </button>
    </div>

    <div class="header">
        <h1>Financial Summary Report</h1>
        <p>Period: ${periodLabel}</p>
    </div>

    <div class="kpi-grid">
        <div class="kpi">
            <label>Total Revenue</label>
            <div class="value" style="color:#059669;">&#8377; ${totalRevenue.toLocaleString('en-IN')}</div>
        </div>
        <div class="kpi">
            <label>Amount Collected</label>
            <div class="value" style="color:#1f2937;">&#8377; ${totalPaid.toLocaleString('en-IN')}</div>
        </div>
        <div class="kpi">
            <label>Outstanding</label>
            <div class="value" style="color:#dc2626;">&#8377; ${totalOutstanding.toLocaleString('en-IN')}</div>
        </div>
        <div class="kpi">
            <label>Total Invoices</label>
            <div class="value" style="color:#1f2937;">${invoiceCount}</div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Revenue by Department</div>
        <table>
            <thead>
                <tr><th>Department</th><th style="text-align:right;">Revenue</th><th style="text-align:right;">Share</th></tr>
            </thead>
            <tbody>${deptRows}</tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Recent Invoices (Last ${Math.min(invoices.length, 20)})</div>
        <table>
            <thead>
                <tr><th>#</th><th>Patient</th><th>Amount</th><th>Paid</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>${recentInvoicesHTML || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;">No invoices in this period</td></tr>'}</tbody>
        </table>
    </div>

    <div class="footer">
        <p>Confidential - For internal use only. Generated on ${new Date().toLocaleString('en-IN')}</p>
    </div>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error) {
        console.error('Financial Report Error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
