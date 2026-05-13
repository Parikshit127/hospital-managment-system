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
