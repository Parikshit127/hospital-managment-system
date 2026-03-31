"use server";

import { requireTenantContext } from "@/backend/tenant";

export async function getReceptionDashboardStats() {
    try {
        const { db, organizationId } = await requireTenantContext();

        // 1. Total Patients
        const totalPatients = await db.oPD_REG.count({
            where: { organizationId }
        });

        // 2. Total Invoices Generated
        const totalInvoices = await db.invoices.count({
            where: { organizationId, invoice_type: "OPD_FEE" }
        });

        // 3. Total Revenue
        const allInvoices = await db.invoices.findMany({
            where: { organizationId, invoice_type: "OPD_FEE" },
            select: { total_amount: true, created_at: true, items: true }
        });

        const totalRevenue = allInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0);

        // 4. Group Revenue and Visits by Date (Last 7 Days exactly)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const dailyRevenue = Object.fromEntries(last7Days.map(date => [date, 0]));
        const dailyVisits = Object.fromEntries(last7Days.map(date => [date, 0]));

        allInvoices.forEach((inv: any) => {
            const dateStr = new Date(inv.created_at || new Date()).toISOString().split('T')[0];
            if (dailyRevenue[dateStr] !== undefined) {
                dailyRevenue[dateStr] += Number(inv.total_amount);
                dailyVisits[dateStr] += 1;
            }
        });

        // 5. Aggregate Top Services
        const serviceCounts: Record<string, number> = {};
        allInvoices.forEach((inv: any) => {
            inv.items?.forEach((item: any) => {
                const desc = item.description || "Unknown Service";
                serviceCounts[desc] = (serviceCounts[desc] || 0) + (Number(item.quantity) || 1);
            });
        });

        const topServices = Object.entries(serviceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

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
