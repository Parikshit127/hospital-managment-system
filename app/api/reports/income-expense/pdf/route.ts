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

        const allTimeRevenue = Math.round(Number(revenueStats?.totalRevenue || 0));
        const allTimeExpenses = Math.round(Number(expenseStats?.totalExpenses || 0));
        const allTimeNetIncome = allTimeRevenue - allTimeExpenses;

        const totalRevenue = Math.round(Number(revenueStats?.periodRevenue || 0));
        const totalCollection = Math.round(Number(revenueStats?.periodCollection || 0));
        const totalExpenses = Math.round(Number(expenseStats?.periodExpenses || 0));
        const netIncome = totalRevenue - totalExpenses;

        const categoryMap = new Map((categories || []).map((c: CategoryItem) => [c.id, c.name]));
        const rawRevByDept = (revenueStats?.revenueByDepartment || []) as { department: string | null; amount: number }[];
        const revByDept: DepartmentRevenue[] = rawRevByDept
            .map((d: { department: string | null; amount: number }): DepartmentRevenue => ({ department: d.department, amount: Math.round(Number(d.amount || 0)) }))
            .sort((a: DepartmentRevenue, b: DepartmentRevenue) => b.amount - a.amount);

        const rawExpByCategory = (expenseStats?.byCategory || []) as { category_id: number; amount: number }[];
        const expByCategory: ExpenseCategoryStat[] = rawExpByCategory
            .map((c: { category_id: number; amount: number }): ExpenseCategoryStat => ({ category_id: c.category_id, amount: Math.round(Number(c.amount || 0)) }))
            .sort((a: ExpenseCategoryStat, b: ExpenseCategoryStat) => b.amount - a.amount);

        const fmt = (n: number) => {
            const val = Math.round(Number(n || 0));
            return `&#8377; ${val.toLocaleString('en-IN')}`;
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

        // Revenue Breakdown Table Rows
        const deptRowsHtml = revByDept.length > 0
            ? revByDept.map((dept, idx) => {
                const pct = totalRevenue > 0 ? ((dept.amount / totalRevenue) * 100).toFixed(1) : '0.0';
                return `
                    <tr style="${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 10px; width: 35px;">${idx + 1}</td>
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">${dept.department || 'Other / General'}</td>
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #0f172a; width: 140px;">${fmt(dept.amount)}</td>
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569; font-size: 10px; width: 80px;">${pct}%</td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">No revenue records in this period</td></tr>`;

        // Expense Breakdown Table Rows
        const expRowsHtml = expByCategory.length > 0
            ? expByCategory.map((cat, idx) => {
                const catName = categoryMap.get(cat.category_id) || `Category ${cat.category_id}`;
                const pct = totalExpenses > 0 ? ((cat.amount / totalExpenses) * 100).toFixed(1) : '0.0';
                return `
                    <tr style="${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 10px; width: 35px;">${idx + 1}</td>
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">${catName}</td>
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #0f172a; width: 140px;">${fmt(cat.amount)}</td>
                        <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569; font-size: 10px; width: 80px;">${pct}%</td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">No expense records in this period</td></tr>`;

        // P&L Statement breakdown lines
        const pnlRevRowsHtml = revByDept.map((dept) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 8px 4px 24px; color: #475569; font-size: 10.5px;">&bull; ${dept.department || 'Other'}</td>
                <td style="padding: 4px 8px; text-align: right; color: #334155; font-size: 10.5px; font-weight: 500;">${fmt(dept.amount)}</td>
            </tr>
        `).join('');

        const pnlExpRowsHtml = expByCategory.map((cat) => {
            const catName = categoryMap.get(cat.category_id) || `Category ${cat.category_id}`;
            return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 4px 8px 4px 24px; color: #475569; font-size: 10.5px;">&bull; ${catName}</td>
                    <td style="padding: 4px 8px; text-align: right; color: #334155; font-size: 10.5px; font-weight: 500;">${fmt(cat.amount)}</td>
                </tr>
            `;
        }).join('');

        const primaryColor = branding.accentColor || '#059669';

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Income & Expense Report - ${periodLabel}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif; color: #1e293b; background: #fff; font-size: 11px; padding: 24px; max-width: 900px; margin: 0 auto; line-height: 1.35; }
        
        @page {
            size: A4 portrait;
            margin: 10mm 12mm;
        }

        @media print {
            body { margin: 0; padding: 0; max-width: 100%; font-size: 10px; color: #0f172a; }
            .no-print { display: none !important; }
            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
            .avoid-break-after { break-after: avoid; page-break-after: avoid; }
            table { width: 100%; border-collapse: collapse; page-break-inside: auto; break-inside: auto; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; break-inside: avoid; }
        }

        .header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 10px; }
        .header h1 { font-size: 17px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
        .header .meta { font-size: 9.5px; color: #475569; margin-top: 2px; }
        .header .report-title { font-size: 13px; font-weight: 800; color: ${primaryColor}; margin-top: 4px; letter-spacing: 0.3px; }
        .header .period-badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 12px; padding: 1px 10px; font-size: 9.5px; font-weight: 700; margin-top: 3px; }

        .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 16px; }
        .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 6px; text-align: center; }
        .kpi label { font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; display: block; }
        .kpi .value { font-size: 13.5px; font-weight: 900; margin-top: 2px; }
        .kpi .sub { font-size: 8px; color: #94a3b8; margin-top: 1px; }

        .section-box { margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #fff; }
        .section-header { background: #f1f5f9; padding: 6px 10px; font-size: 10.5px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; }
        
        table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
        th { font-size: 9px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.4px; background: #f8fafc; padding: 5px 8px; text-align: left; border-bottom: 1px solid #cbd5e1; }
        td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10.5px; }

        .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9px; color: #64748b; }
        .sign-box { text-align: center; width: 150px; border-top: 1px solid #0f172a; padding-top: 3px; font-weight: 700; color: #0f172a; }
    </style>
</head>
<body>
    <!-- Top Action Bar (Hidden in Print) -->
    <div class="no-print" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:10px 14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div style="font-size:11.5px; font-weight:600; color:#334155;">
            Income &amp; Expense Print Preview &middot; <span style="color:#059669; font-weight:700;">${periodLabel}</span>
        </div>
        <div style="display:flex; gap:8px;">
            <button onclick="window.print()" style="padding:6px 18px; background:#059669; color:#fff; border:none; border-radius:6px; font-weight:700; font-size:11.5px; cursor:pointer;">
                Print / Download PDF
            </button>
            <button onclick="window.close()" style="padding:6px 14px; background:#fff; color:#334155; border:1px solid #cbd5e1; border-radius:6px; font-weight:600; font-size:11.5px; cursor:pointer;">
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
    <div class="kpi-grid avoid-break">
        <div class="kpi">
            <label>Revenue (Billed)</label>
            <div class="value" style="color:#15803d;">${fmt(totalRevenue)}</div>
            <div class="sub">Bills created incl. dues</div>
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
            <div class="sub">Period net result</div>
        </div>
    </div>

    <!-- 1. Profit & Loss Summary Statement -->
    <div class="section-box">
        <div class="section-header avoid-break-after">
            <span>1. Profit &amp; Loss Summary Statement</span>
            <span style="font-size:9.5px; font-weight:600; color:#64748b;">${periodLabel}</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="padding:5px 8px;">Particulars</th>
                    <th style="padding:5px 8px; text-align:right; width:140px;">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom: 1.5px solid #cbd5e1; font-weight: 700; color: #15803d; background: #f0fdf4;">
                    <td style="padding: 5px 8px;">A. Total Revenue (Collections)</td>
                    <td style="padding: 5px 8px; text-align: right;">${fmt(totalRevenue)}</td>
                </tr>
                ${pnlRevRowsHtml}
                <tr style="border-bottom: 1.5px solid #cbd5e1; font-weight: 700; color: #b91c1c; background: #fef2f2;">
                    <td style="padding: 5px 8px;">B. Total Expenses</td>
                    <td style="padding: 5px 8px; text-align: right;">${fmt(totalExpenses)}</td>
                </tr>
                ${pnlExpRowsHtml}
                <tr style="font-weight: 900; font-size: 11.5px; border-top: 2px solid #0f172a; ${netIncome >= 0 ? 'background:#dcfce7; color:#14532d;' : 'background:#fee2e2; color:#7f1d1d;'}">
                    <td style="padding: 7px 8px;">C. Net Income (A &minus; B)</td>
                    <td style="padding: 7px 8px; text-align: right;">${fmt(netIncome)}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- 2. Revenue by Department Breakdown -->
    <div class="section-box">
        <div class="section-header avoid-break-after">
            <span style="color:#15803d;">2. Revenue Breakdown by Department</span>
            <span style="font-size:9.5px; font-weight:600; color:#64748b;">${revByDept.length} Departments</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="text-align:center; width:35px;">#</th>
                    <th>Department Name</th>
                    <th style="text-align:right; width:140px;">Amount (₹)</th>
                    <th style="text-align:right; width:80px;">Share (%)</th>
                </tr>
            </thead>
            <tbody>
                ${deptRowsHtml}
            </tbody>
            <tfoot>
                <tr style="background:#f0fdf4; font-weight:700; border-top:1.5px solid #cbd5e1; color:#15803d;">
                    <td colspan="2" style="padding:5px 8px;">TOTAL REVENUE</td>
                    <td style="padding:5px 8px; text-align:right;">${fmt(totalRevenue)}</td>
                    <td style="padding:5px 8px; text-align:right;">100.0%</td>
                </tr>
            </tfoot>
        </table>
    </div>

    <!-- 3. Expenses by Category Breakdown -->
    <div class="section-box">
        <div class="section-header avoid-break-after">
            <span style="color:#b91c1c;">3. Expenses Breakdown by Category</span>
            <span style="font-size:9.5px; font-weight:600; color:#64748b;">${expByCategory.length} Categories</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="text-align:center; width:35px;">#</th>
                    <th>Expense Category</th>
                    <th style="text-align:right; width:140px;">Amount (₹)</th>
                    <th style="text-align:right; width:80px;">Share (%)</th>
                </tr>
            </thead>
            <tbody>
                ${expRowsHtml}
            </tbody>
            <tfoot>
                <tr style="background:#fef2f2; font-weight:700; border-top:1.5px solid #cbd5e1; color:#b91c1c;">
                    <td colspan="2" style="padding:5px 8px;">TOTAL EXPENSES</td>
                    <td style="padding:5px 8px; text-align:right;">${fmt(totalExpenses)}</td>
                    <td style="padding:5px 8px; text-align:right;">100.0%</td>
                </tr>
            </tfoot>
        </table>
    </div>

    <!-- 4. Operational Metrics & Receivables Aging -->
    <div class="avoid-break" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
        <!-- Operational Metrics Box -->
        <div class="section-box" style="margin-bottom:0;">
            <div class="section-header">
                <span>Operational Cash Flow</span>
            </div>
            <table>
                <tbody>
                    <tr>
                        <td style="color:#475569;">Today's Collections</td>
                        <td style="text-align:right; font-weight:700;">${fmt(revenueStats?.todayRevenue || 0)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="color:#475569;">Payments Recorded Today</td>
                        <td style="text-align:right; font-weight:700;">${revenueStats?.totalPaymentsToday || 0}</td>
                    </tr>
                    <tr>
                        <td style="color:#475569;">Outstanding Dues Balance</td>
                        <td style="text-align:right; font-weight:700; color:#b91c1c;">${fmt(revenueStats?.pendingBalance || 0)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="color:#475569;">Today's Expenses</td>
                        <td style="text-align:right; font-weight:700;">${fmt(expenseStats?.todayTotal || 0)}</td>
                    </tr>
                    <tr>
                        <td style="color:#475569;">Period Expenses</td>
                        <td style="text-align:right; font-weight:700;">${fmt(expenseStats?.periodExpenses || 0)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="color:#475569;">Expenses Pending Approval</td>
                        <td style="text-align:right; font-weight:700; color:#d97706;">${expenseStats?.pendingApproval || 0}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Receivables Aging Box -->
        <div class="section-box" style="margin-bottom:0;">
            <div class="section-header">
                <span>Receivables Aging Analysis</span>
            </div>
            ${revenueStats?.aging ? `
            <table>
                <thead>
                    <tr>
                        <th>Aging Bucket</th>
                        <th style="text-align:right;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="color:#15803d; font-weight:600;">0–30 Days (Current)</td>
                        <td style="text-align:right; font-weight:700; color:#15803d;">${fmt(revenueStats.aging.days0to30)}</td>
                    </tr>
                    <tr style="background:#fffbeb;">
                        <td style="color:#b45309; font-weight:600;">30–60 Days (Moderate)</td>
                        <td style="text-align:right; font-weight:700; color:#b45309;">${fmt(revenueStats.aging.days30to60)}</td>
                    </tr>
                    <tr style="background:#fef2f2;">
                        <td style="color:#b91c1c; font-weight:600;">60+ Days (High Risk)</td>
                        <td style="text-align:right; font-weight:700; color:#b91c1c;">${fmt(revenueStats.aging.days60plus)}</td>
                    </tr>
                    <tr style="background:#f8fafc; font-weight:700; border-top:1.5px solid #cbd5e1;">
                        <td>TOTAL OUTSTANDING</td>
                        <td style="text-align:right; font-weight:800; color:#b91c1c;">${fmt(revenueStats?.pendingBalance || 0)}</td>
                    </tr>
                </tbody>
            </table>
            ` : `
            <div style="padding:20px; text-align:center; color:#94a3b8;">No aging data available</div>
            `}
        </div>
    </div>

    <!-- Footer & Signature Block -->
    <div class="footer avoid-break">
        <div>
            <p><strong>${branding.hospitalName || 'HospitalOS'}</strong> &middot; Financial Management &amp; MIS</p>
            <p style="margin-top: 2px;">Generated: ${printedDateStr} &middot; Confidential</p>
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
