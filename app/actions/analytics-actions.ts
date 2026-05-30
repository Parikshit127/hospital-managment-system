'use server';

import { requireTenantContext } from "@/backend/tenant";

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function getRevenueLeakageInsights() {
    try {
        const { db, organizationId } = await requireTenantContext();
        
        // 1. Stale Draft Invoices (older than 2 days)
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const staleDrafts = await db.invoices.findMany({
            where: {
                organizationId,
                status: 'Draft',
                created_at: { lt: twoDaysAgo }
            },
            include: {
                patient: { select: { full_name: true, patient_id: true } }
            }
        });

        // 2. Unsettled Discharges (Discharged admissions with linked invoices that have balance > 0)
        const unsettledDischarges = await db.admissions.findMany({
            where: {
                organizationId,
                status: 'Discharged',
            },
            include: {
                patient: { select: { full_name: true, patient_id: true } }
            }
        });
        
        const unsettledAdmissions = [];
        for (const ad of unsettledDischarges) {
            const invoice = await db.invoices.findFirst({
                where: { admission_id: ad.admission_id, organizationId, balance_due: { gt: 0 } }
            });
            if (invoice) {
                unsettledAdmissions.push({
                    admission: ad,
                    invoice
                });
            }
        }

        // 3. Lab Orders without Invoices (orphan charges)
        const completedLabOrders = await db.lab_orders.findMany({
            where: { organizationId, status: 'Completed' },
            take: 100, // Limit to recent 100 for performance
            orderBy: { created_at: 'desc' },
            // Need patient info, actually lab_orders doesn't have a direct patient relation? 
            // Wait, patient_id is a String linking to OPD_REG.
            // Let's not include if it fails, or we can fetch manually.
        });
        
        const unbilledLabs = [];
        for (const lab of completedLabOrders) {
            const item = await db.invoice_items.findFirst({
                where: { organizationId, ref_id: lab.barcode }
            });
            if (!item) {
                unbilledLabs.push(lab);
            }
        }

        const totalLeakageRiskValue = staleDrafts.reduce((sum: any, inv: any) => sum + Number(inv.net_amount), 0) + 
                                     unsettledAdmissions.reduce((sum: any, item: any) => sum + Number(item.invoice.balance_due), 0);

        return {
            success: true,
            data: serialize({
                staleDrafts,
                unsettledAdmissions,
                unbilledLabs,
                totalLeakageRiskValue
            })
        };
    } catch (error: any) {
        console.error('getRevenueLeakageInsights error:', error);
        return { success: false, error: error.message };
    }
}

export async function getFinancialAnalytics() {
    try {
        const { db, organizationId } = await requireTenantContext();
        
        // 1. Month-to-Date Revenue vs Last Month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        const thisMonthInvoices = await db.invoices.aggregate({
            _sum: { net_amount: true, paid_amount: true },
            where: { organizationId, created_at: { gte: startOfMonth }, status: { not: 'Cancelled' } }
        });
        
        const lastMonthInvoices = await db.invoices.aggregate({
            _sum: { net_amount: true, paid_amount: true },
            where: { organizationId, created_at: { gte: startOfLastMonth, lt: startOfMonth }, status: { not: 'Cancelled' } }
        });

        // 2. Top Revenue Departments
        const items = await db.invoice_items.findMany({
            where: { organizationId, created_at: { gte: startOfMonth } }
        });
        
        const deptRevenue: Record<string, number> = {};
        items.forEach((i: any) => {
            const dept = i.department || 'General';
            deptRevenue[dept] = (deptRevenue[dept] || 0) + Number(i.net_price);
        });
        const topDepartments = Object.entries(deptRevenue).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));

        // 3. Collection Rate
        const totalInvoiced = Number(thisMonthInvoices._sum.net_amount || 0);
        const totalCollected = Number(thisMonthInvoices._sum.paid_amount || 0);
        const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

        // 4. MTD Forecast
        const today = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const runRate = totalInvoiced / today;
        const forecastedMtd = runRate * daysInMonth;

        return {
            success: true,
            data: serialize({
                mtdRevenue: totalInvoiced,
                lastMonthRevenue: Number(lastMonthInvoices._sum.net_amount || 0),
                mtdCollected: totalCollected,
                collectionRate,
                forecastedMtd,
                topDepartments
            })
        };
    } catch (error: any) {
        console.error('getFinancialAnalytics error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Multi-horizon revenue forecast for the Financial Intelligence dashboard.
 *
 * Replaces the old "current month only" projection with monthly (next 12),
 * quarterly (next 8), yearly (next 5) and a 5-year total outlook.
 *
 * Method: bucket up to 24 months of historical (non-cancelled) invoiced revenue
 * by calendar month, take a recent run-rate base (avg of the last ≤3 completed
 * months), estimate a monthly growth rate from a least-squares trend (clamped to
 * a sane band so 5-year compounding can't explode or go negative), then compound
 * the base forward 60 months. Quarterly/yearly buckets are sums of those months,
 * so every horizon is internally consistent. Degrades gracefully when history is
 * thin (falls back to the current month's run-rate with no assumed growth).
 */
export async function getRevenueForecast() {
    try {
        const { db, organizationId } = await requireTenantContext();

        const now = new Date();
        const historyStart = new Date(now.getFullYear(), now.getMonth() - 24, 1);

        const invoices = await db.invoices.findMany({
            where: {
                organizationId,
                status: { not: 'Cancelled' },
                created_at: { gte: historyStart },
            },
            select: { net_amount: true, created_at: true },
        });

        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
        const fmtMonth = (y: number, m: number) => `${MONTH_NAMES[m]} ${y}`;
        const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
        const round = (x: number) => Math.round(x);

        // Bucket actual invoiced revenue by calendar month.
        const buckets: Record<string, number> = {};
        for (const inv of invoices) {
            const d = new Date(inv.created_at);
            buckets[monthKey(d)] = (buckets[monthKey(d)] || 0) + Number(inv.net_amount || 0);
        }

        // Continuous series of the 12 COMPLETED months before the current (partial) month.
        const completedMonths: { year: number; month: number; label: string; revenue: number }[] = [];
        for (let i = 12; i >= 1; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            completedMonths.push({
                year: d.getFullYear(),
                month: d.getMonth(),
                label: fmtMonth(d.getFullYear(), d.getMonth()),
                revenue: buckets[monthKey(d)] || 0,
            });
        }
        // Drop leading pre-launch zero months so they don't drag the trend down.
        const firstNonZero = completedMonths.findIndex((m) => m.revenue > 0);
        const history = firstNonZero === -1 ? [] : completedMonths.slice(firstNonZero);
        const n = history.length;
        const series = history.map((h) => h.revenue);

        // Base monthly run-rate = average of the last ≤3 completed months.
        const recent = series.slice(Math.max(0, n - 3));
        let baseMonthly = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;

        // Fallback for thin history: annualise the current (partial) month's run-rate.
        let usedFallback = false;
        if (baseMonthly <= 0) {
            const mtd = buckets[monthKey(now)] || 0;
            const dayOfMonth = now.getDate();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            baseMonthly = dayOfMonth > 0 ? (mtd / dayOfMonth) * daysInMonth : 0;
            usedFallback = baseMonthly > 0;
        }

        // Monthly growth from least-squares slope relative to the mean, clamped.
        let monthlyGrowth = 0;
        if (n >= 3) {
            const mean = series.reduce((a, b) => a + b, 0) / n;
            const xMean = (n - 1) / 2;
            let num = 0, den = 0;
            series.forEach((y, x) => {
                num += (x - xMean) * (y - mean);
                den += (x - xMean) ** 2;
            });
            const slope = den > 0 ? num / den : 0;
            monthlyGrowth = mean > 0 ? clamp(slope / mean, -0.05, 0.10) : 0;
        }

        // Compound the base run-rate forward 60 months.
        const projMonths: { year: number; month: number; label: string; revenue: number }[] = [];
        for (let i = 1; i <= 60; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            projMonths.push({
                year: d.getFullYear(),
                month: d.getMonth(),
                label: fmtMonth(d.getFullYear(), d.getMonth()),
                revenue: Math.max(0, baseMonthly * Math.pow(1 + monthlyGrowth, i)),
            });
        }

        // Monthly: next 12 individual months.
        const monthly = projMonths.slice(0, 12).map((m) => ({ label: m.label, revenue: round(m.revenue) }));

        // Quarterly: next 8 rolling 3-month windows.
        const quarterly = [];
        for (let q = 0; q < 8; q++) {
            const chunk = projMonths.slice(q * 3, q * 3 + 3);
            const first = chunk[0], last = chunk[chunk.length - 1];
            quarterly.push({
                label: `Q${q + 1}`,
                range: `${MONTH_NAMES[first.month]} ${first.year} – ${MONTH_NAMES[last.month]} ${last.year}`,
                revenue: round(chunk.reduce((a, m) => a + m.revenue, 0)),
            });
        }

        // Yearly: next 5 rolling 12-month windows (the 5-year outlook).
        const yearly = [];
        for (let y = 0; y < 5; y++) {
            const chunk = projMonths.slice(y * 12, y * 12 + 12);
            const first = chunk[0], last = chunk[chunk.length - 1];
            yearly.push({
                label: `Year ${y + 1}`,
                range: `${fmtMonth(first.year, first.month)} – ${fmtMonth(last.year, last.month)}`,
                revenue: round(chunk.reduce((a, m) => a + m.revenue, 0)),
            });
        }

        const fiveYearTotal = round(projMonths.reduce((a, m) => a + m.revenue, 0));

        let method: string;
        if (n >= 3) {
            method = `Trend model — ${(monthlyGrowth * 100).toFixed(1)}%/mo growth compounded on a ₹${round(baseMonthly).toLocaleString('en-IN')}/mo base (last ${recent.length}-month average), from ${n} months of history.`;
        } else if (baseMonthly > 0) {
            method = usedFallback
                ? `Run-rate model — limited history; projecting the current month's run-rate (₹${round(baseMonthly).toLocaleString('en-IN')}/mo) flat with no assumed growth.`
                : `Run-rate model — only ${n} completed month(s) of history; projecting ₹${round(baseMonthly).toLocaleString('en-IN')}/mo flat with no assumed growth.`;
        } else {
            method = `No invoiced revenue recorded yet — the forecast will populate as billing data accrues.`;
        }

        return {
            success: true,
            data: serialize({
                history: history.map((h) => ({ label: h.label, revenue: round(h.revenue) })),
                baseMonthly: round(baseMonthly),
                monthlyGrowthRate: monthlyGrowth,
                annualGrowthRate: Math.pow(1 + monthlyGrowth, 12) - 1,
                monthly,
                quarterly,
                yearly,
                summary: {
                    nextMonth: monthly[0]?.revenue || 0,
                    nextQuarter: quarterly[0]?.revenue || 0,
                    nextYear: yearly[0]?.revenue || 0,
                    fiveYearTotal,
                },
                historyMonths: n,
                method,
            }),
        };
    } catch (error: any) {
        console.error('getRevenueForecast error:', error);
        return { success: false, error: error.message };
    }
}
