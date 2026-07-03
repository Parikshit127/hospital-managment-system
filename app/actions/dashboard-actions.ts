"use server";

import { requireTenantContext } from "@/backend/tenant";

export async function getReceptionDashboardStats() {
    try {
        const { db, organizationId } = await requireTenantContext();

        // OPD/fee-receipt invoice filter, reused across the aggregations below.
        const opdWhere = { organizationId, OR: [{ is_fee_receipt: true }, { invoice_type: "OPD_FEE" }] };

        // 1. Total Patients
        const totalPatients = await db.oPD_REG.count({
            where: { organizationId }
        });

        // 2. Total Invoices Generated
        const totalInvoices = await db.invoices.count({ where: opdWhere });

        // 3. Total Revenue — summed in the DB, not by loading every invoice.
        const revenueAgg = await db.invoices.aggregate({
            where: opdWhere,
            _sum: { total_amount: true },
        });
        const totalRevenue = Number(revenueAgg._sum.total_amount || 0);

        // 4. Revenue & Visits per Date (Last 7 Days) — only load the 7-day slice, no line items.
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - 6);
        windowStart.setHours(0, 0, 0, 0);

        const recentInvoices = await db.invoices.findMany({
            where: { ...opdWhere, created_at: { gte: windowStart } },
            select: { total_amount: true, created_at: true },
        });

        const dailyRevenue = Object.fromEntries(last7Days.map(date => [date, 0]));
        const dailyVisits = Object.fromEntries(last7Days.map(date => [date, 0]));

        recentInvoices.forEach((inv: any) => {
            const dateStr = new Date(inv.created_at || new Date()).toISOString().split('T')[0];
            if (dailyRevenue[dateStr] !== undefined) {
                dailyRevenue[dateStr] += Number(inv.total_amount);
                dailyVisits[dateStr] += 1;
            }
        });

        // 5. Top Services — grouped/summed in the DB via invoice_items, then take top 5.
        const serviceGroups = await db.invoice_items.groupBy({
            by: ["description"],
            where: { organizationId, invoice: { OR: [{ is_fee_receipt: true }, { invoice_type: "OPD_FEE" }] } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: "desc" } },
            take: 5,
        });

        const topServices = serviceGroups.map((g: any) => ({
            name: g.description || "Unknown Service",
            count: Number(g._sum.quantity || 0),
        }));

        return {
            success: true,
            data: {
                totalPatients,
                totalInvoices,
                totalRevenue,
                chartLabels: last7Days,
                revenueData: last7Days.map(d => dailyRevenue[d]),
                visitsData: last7Days.map(d => dailyVisits[d]),
                topServices
            }
        };

    } catch (error) {
        console.error("Dashboard fetch error:", error);
        return { success: false, data: null };
    }
}
