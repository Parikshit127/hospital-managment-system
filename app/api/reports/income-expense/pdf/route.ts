import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding } from '@/app/lib/bill-branding';
import { getFinanceDashboardStats } from '@/app/actions/finance-actions';
import { getExpenseDashboardStats, getExpenseCategories } from '@/app/actions/expense-actions';

const ALLOWED_STAFF_ROLES = ['admin', 'finance'];

type ViewPeriod = 'monthly' | 'quarterly' | 'yearly';

interface CategoryItem {
    id: number;
    name: string;
}

interface DepartmentRevenue {
    department: string | null;
    amount: number;
}

interface ExpenseCategoryStat {
    category_id: number;
    amount: number;
}

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: false,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const { searchParams } = req.nextUrl;
        const rawPeriod = searchParams.get('period') || 'monthly';
        const period: ViewPeriod = ['monthly', 'quarterly', 'yearly'].includes(rawPeriod)
            ? (rawPeriod as ViewPeriod)
            : 'monthly';

        const [branding, revRes, expRes, catRes] = await Promise.all([
            getBillBranding(auth.context.organizationId),
            getFinanceDashboardStats({ period }),
            getExpenseDashboardStats(period),
            getExpenseCategories(),
        ]);

        const revenueStats = revRes.success ? revRes.data : null;
        const expenseStats = expRes.success ? expRes.data : null;
        const categories: CategoryItem[] = catRes.success ? (catRes.data as CategoryItem[]) : [];

        const allTimeRevenue = revenueStats?.totalRevenue || 0;
        const allTimeExpenses = expenseStats?.totalExpenses || 0;
        const allTimeNetIncome = allTimeRevenue - allTimeExpenses;

        const totalRevenue = revenueStats?.periodRevenue || 0;
        const totalCollection = revenueStats?.periodCollection || 0;
        const totalExpenses = expenseStats?.periodExpenses || 0;
        const netIncome = totalRevenue - totalExpenses;

        const categoryMap = new Map((categories || []).map(c => [c.id, c.name]));
        const revByDept: DepartmentRevenue[] = revenueStats?.revenueByDepartment || [];
        const expByCategory: ExpenseCategoryStat[] = expenseStats?.byCategory || [];

        const fmt = (n: number) => {
            const val = Number(n || 0);
            return `&#8377; ${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
        };

        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthName = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

        let periodLabel = '';
        if (period === 'monthly') {
            periodLabel = `This Month (${currentMonthName} ${currentYear})`;
        } else if (period === 'quarterly') {
            periodLabel = `This Quarter (Q${currentQuarter} ${currentYear})`;
        } else {
            periodLabel = `This Year (${currentYear})`;
        }

        const printedDateStr = now.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });

        // Revenue Rows
        const deptRowsHtml = revByDept.length > 0
            ? revByDept.map((dept) => {
                const pct = totalRevenue > 0 ? ((dept.amount / totalRevenue) * 100).toFixed(1) : '0.0';
                return `
                    <tr>
                        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; color: #374151;">${dept.department || 'Other'}</td>
                        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #111827;">${fmt(dept.amount)}</td>
                        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280; font-size: 11px;">${pct}%</td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #9ca3af;">No revenue data recorded</td></tr>`;

        // Expense Rows
        const expRowsHtml = expByCategory.length > 0
            ? expByCategory.map((cat) => {
                const catName = categoryMap.get(cat.category_id) || `Category ${cat.category_id}`;
                const pct = totalExpenses > 0 ? ((cat.amount / totalExpenses) * 100).toFixed(1) : '0.0';
                return `
                    <tr>
                        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; color: #374151;">${catName}</td>
                        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #111827;">${fmt(cat.amount)}</td>
                        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280; font-size: 11px;">${pct}%</td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #9ca3af;">No expense data recorded</td></tr>`;

        // P&L Statement breakdown lines
        const pnlRevRowsHtml = revByDept.map((dept) => `
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 5px 10px 5px 24px; color: #4b5563; font-size: 11px;">${dept.department || 'Other'}</td>
                <td style="padding: 5px 10px; text-align: right; color: #4b5563; font-size: 11px;">${fmt(dept.amount)}</td>
            </tr>
        `).join('');

        const pnlExpRowsHtml = expByCategory.map((cat) => {
            const catName = categoryMap.get(cat.category_id) || `Category ${cat.category_id}`;
            return `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 5px 10px 5px 24px; color: #4b5563; font-size: 11px;">${catName}</td>
                    <td style="padding: 5px 10px; text-align: right; color: #4b5563; font-size: 11px;">${fmt(cat.amount)}</td>
                </tr>
            `;
        }).join('');

        // Aging Section
        const agingHtml = revenueStats?.aging ? `
            <div style="margin-top: 20px; page-break-inside: avoid;">
                <div style="font-size: 11px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
                    Outstanding Receivables Aging
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; color: #15803d; text-transform: uppercase;">0–30 Days</div>
                        <div style="font-size: 15px; font-weight: 900; color: #166534; margin-top: 2px;">${fmt(revenueStats.aging.days0to30)}</div>
                    </div>
                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; color: #b45309; text-transform: uppercase;">30–60 Days</div>
                        <div style="font-size: 15px; font-weight: 900; color: #92400e; margin-top: 2px;">${fmt(revenueStats.aging.days30to60)}</div>
                    </div>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; color: #b91c1c; text-transform: uppercase;">60+ Days</div>
                        <div style="font-size: 15px; font-weight: 900; color: #991b1b; margin-top: 2px;">${fmt(revenueStats.aging.days60plus)}</div>
                    </div>
                </div>
            </div>
        ` : '';

        const primaryColor = branding.accentColor || '#059669';

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Income & Expense Report - ${periodLabel}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; padding: 28px; max-width: 960px; margin: 0 auto; line-height: 1.4; }
        @media print {
            body { margin: 0; padding: 12mm 15mm; max-width: none; font-size: 11px; }
            .no-print { display: none !important; }
            @page { size: A4 portrait; margin: 0; }
            .page-break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
        }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 12px; }
        .header h1 { font-size: 18px; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: 0.5px; }
        .header .meta { font-size: 10px; color: #4b5563; margin-top: 3px; }
        .header .report-title { font-size: 14px; font-weight: 800; color: ${primaryColor}; margin-top: 6px; }
        .header .period-badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 12px; padding: 2px 10px; font-size: 10px; font-weight: 700; margin-top: 4px; }
        
        .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
        .kpi { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 8px; text-align: center; }
        .kpi label { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; display: block; }
        .kpi .value { font-size: 15px; font-weight: 900; margin-top: 3px; }
        .kpi .sub { font-size: 8.5px; color: #9ca3af; margin-top: 2px; }

        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .box { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
        .box-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
        
        table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
        th { font-size: 9.5px; font-weight: 800; color: #4b5563; text-transform: uppercase; letter-spacing: 0.4px; background: #f9fafb; padding: 6px 10px; text-align: left; border-bottom: 1.5px solid #e5e7eb; }
        
        .summary-stats { border-top: 1px solid #e5e7eb; margin-top: 10px; padding-top: 8px; }
        .stat-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
        .stat-row .label { color: #6b7280; }
        .stat-row .val { font-weight: 700; color: #111827; }

        .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9.5px; color: #6b7280; }
        .sign-box { text-align: center; width: 160px; border-top: 1px solid #111827; padding-top: 4px; font-weight: 700; color: #111827; }
    </style>
</head>
<body>
    <!-- Action Bar (Hidden in Print) -->
    <div class="no-print" style="background:#f3f4f6; border:1px solid #d1d5db; padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <div style="font-size:12px; font-weight:600; color:#374151;">
            Income &amp; Expense Print Preview &middot; <span style="color:#059669;">${periodLabel}</span>
        </div>
        <div style="display:flex; gap:8px;">
            <button onclick="window.print()" style="padding:7px 20px; background:#059669; color:#fff; border:none; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;">
                Print / Download PDF
            </button>
            <button onclick="window.close()" style="padding:7px 16px; background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; font-weight:600; font-size:12px; cursor:pointer;">
                Close
            </button>
        </div>
    </div>

    <!-- Hospital Header -->
    <div class="header">
        <h1>${branding.hospitalName}</h1>
        <div class="meta">
            ${branding.hospitalAddress ? `${branding.hospitalAddress} &middot; ` : ''}
            ${branding.hospitalPhone ? `Phone: ${branding.hospitalPhone} &middot; ` : ''}
            ${branding.gstin && branding.gstin !== 'N/A' ? `GSTIN: ${branding.gstin}` : ''}
        </div>
        <div class="report-title">INCOME &amp; EXPENSE REPORT (PROFIT &amp; LOSS)</div>
        <div class="period-badge">${periodLabel}</div>
    </div>

    <!-- 5 Executive KPI Tiles -->
    <div class="kpi-grid">
        <div class="kpi">
            <label>Revenue (Billed)</label>
            <div class="value" style="color:#15803d;">${fmt(totalRevenue)}</div>
            <div class="sub">Bills created incl. outstanding</div>
        </div>
        <div class="kpi">
            <label>Collection (Received)</label>
            <div class="value" style="color:#0f766e;">${fmt(totalCollection)}</div>
            <div class="sub">Cash actually received</div>
        </div>
        <div class="kpi">
            <label>Total Expenses</label>
            <div class="value" style="color:#b91c1c;">${fmt(totalExpenses)}</div>
            <div class="sub">Approved &amp; paid expenses</div>
        </div>
        <div class="kpi" style="${allTimeNetIncome >= 0 ? 'background:#f0fdf4; border-color:#bbf7d0;' : 'background:#fef2f2; border-color:#fecaca;'}">
            <label>Net Income (All Time)</label>
            <div class="value" style="${allTimeNetIncome >= 0 ? 'color:#15803d;' : 'color:#b91c1c;'}">${fmt(allTimeNetIncome)}</div>
            <div class="sub">Cumulative net balance</div>
        </div>
        <div class="kpi" style="${netIncome >= 0 ? 'background:#f0fdf4; border-color:#bbf7d0;' : 'background:#fef2f2; border-color:#fecaca;'}">
            <label>Net Income (${period === 'monthly' ? 'Month' : period === 'quarterly' ? 'Quarter' : 'Year'})</label>
            <div class="value" style="${netIncome >= 0 ? 'color:#15803d;' : 'color:#b91c1c;'}">${fmt(netIncome)}</div>
            <div class="sub">Period profit / loss</div>
        </div>
    </div>

    <!-- 2 Columns: Revenue by Department & Expenses by Category -->
    <div class="two-col page-break-inside-avoid">
        <!-- Revenue Box -->
        <div class="box">
            <div class="box-title" style="color:#15803d;">Revenue by Department</div>
            <table>
                <thead>
                    <tr>
                        <th>Department</th>
                        <th style="text-align:right;">Amount</th>
                        <th style="text-align:right;">Share</th>
                    </tr>
                </thead>
                <tbody>
                    ${deptRowsHtml}
                </tbody>
            </table>
            <div class="summary-stats">
                <div class="stat-row">
                    <span class="label">Today's Collections</span>
                    <span class="val">${fmt(revenueStats?.todayRevenue || 0)}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Payments Today</span>
                    <span class="val">${revenueStats?.totalPaymentsToday || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Outstanding Balance</span>
                    <span class="val" style="color:#b91c1c;">${fmt(revenueStats?.pendingBalance || 0)}</span>
                </div>
            </div>
        </div>

        <!-- Expense Box -->
        <div class="box">
            <div class="box-title" style="color:#b91c1c;">Expenses by Category</div>
            <table>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th style="text-align:right;">Amount</th>
                        <th style="text-align:right;">Share</th>
                    </tr>
                </thead>
                <tbody>
                    ${expRowsHtml}
                </tbody>
            </table>
            <div class="summary-stats">
                <div class="stat-row">
                    <span class="label">Today's Expenses</span>
                    <span class="val">${fmt(expenseStats?.todayTotal || 0)}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Period Expenses</span>
                    <span class="val">${fmt(expenseStats?.periodExpenses || 0)}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Pending Approval</span>
                    <span class="val" style="color:#d97706;">${expenseStats?.pendingApproval || 0}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Profit & Loss Summary Statement -->
    <div class="box page-break-inside-avoid" style="margin-bottom: 20px;">
        <div class="box-title" style="color:#111827;">Profit &amp; Loss Summary Statement</div>
        <table>
            <thead>
                <tr style="background:#f9fafb;">
                    <th style="padding:7px 10px;">Particulars</th>
                    <th style="padding:7px 10px; text-align:right;">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom: 1.5px solid #e5e7eb; font-weight: 700; color: #15803d; background: #f0fdf4;">
                    <td style="padding: 7px 10px;">A. Total Revenue (Collections)</td>
                    <td style="padding: 7px 10px; text-align: right;">${fmt(totalRevenue)}</td>
                </tr>
                ${pnlRevRowsHtml}
                <tr style="border-bottom: 1.5px solid #e5e7eb; font-weight: 700; color: #b91c1c; background: #fef2f2;">
                    <td style="padding: 7px 10px;">B. Total Expenses</td>
                    <td style="padding: 7px 10px; text-align: right;">${fmt(totalExpenses)}</td>
                </tr>
                ${pnlExpRowsHtml}
                <tr style="font-weight: 900; font-size: 13px; border-top: 2px solid #111827; ${netIncome >= 0 ? 'background:#dcfce7; color:#14532d;' : 'background:#fee2e2; color:#7f1d1d;'}">
                    <td style="padding: 10px;">C. Net Income (A &minus; B)</td>
                    <td style="padding: 10px; text-align: right;">${fmt(netIncome)}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Outstanding Aging -->
    ${agingHtml}

    <!-- Footer & Signature Block -->
    <div class="footer page-break-inside-avoid">
        <div>
            <p><strong>HospitalOS</strong> &middot; Financial Management &amp; MIS</p>
            <p style="margin-top: 2px;">Generated on: ${printedDateStr} &middot; Confidential</p>
        </div>
        <div class="sign-box">
            Authorized Signatory
        </div>
    </div>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: unknown) {
        console.error('Income Expense PDF Report Error:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
