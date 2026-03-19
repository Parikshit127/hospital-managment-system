'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function getCollectionsReport(filters: { from: string; to: string; method?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {
            status: 'Completed',
            created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
        };
        if (filters.method) where.payment_method = filters.method;

        const payments = await db.payments.findMany({
            where,
            include: { invoice: { select: { invoice_number: true, patient: { select: { full_name: true } } } } },
            orderBy: { created_at: 'desc' },
        });

        const totals = payments.reduce((acc: any, p: any) => {
            const method = p.payment_method;
            acc[method] = (acc[method] || 0) + Number(p.amount);
            acc.total = (acc.total || 0) + Number(p.amount);
            return acc;
        }, {});

        return { success: true, data: { payments: serialize(payments), totals } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getARAgingReport() {
    try {
        const { db } = await requireTenantContext();
        const invoices = await db.invoices.findMany({
            where: { status: { in: ['Final', 'Partial'] }, balance_due: { gt: 0 } },
            include: { patient: { select: { full_name: true, phone: true } } },
            orderBy: { created_at: 'asc' },
        });

        const now = new Date();
        const aged = invoices.map((inv: any) => {
            const days = Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24));
            let bucket = '0-30';
            if (days > 60) bucket = '60+';
            else if (days > 30) bucket = '30-60';
            return { ...inv, days_overdue: days, aging_bucket: bucket };
        });

        const summary = {
            '0-30': aged.filter((i: any) => i.aging_bucket === '0-30').reduce((s: number, i: any) => s + Number(i.balance_due), 0),
            '30-60': aged.filter((i: any) => i.aging_bucket === '30-60').reduce((s: number, i: any) => s + Number(i.balance_due), 0),
            '60+': aged.filter((i: any) => i.aging_bucket === '60+').reduce((s: number, i: any) => s + Number(i.balance_due), 0),
        };

        return { success: true, data: { invoices: serialize(aged), summary } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getCashFlowReport(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };

        const [inflows, outflows] = await Promise.all([
            db.payments.findMany({
                where: { status: 'Completed', created_at: dateFilter },
                select: { amount: true, created_at: true, payment_method: true },
            }),
            db.expense.findMany({
                where: { status: { in: ['Approved', 'Paid'] }, created_at: dateFilter },
                select: { total_amount: true, created_at: true, payment_method: true },
            }),
        ]);

        // Group by date
        const dailyMap: Record<string, { inflow: number; outflow: number }> = {};
        inflows.forEach((p: any) => {
            const day = new Date(p.created_at).toISOString().slice(0, 10);
            if (!dailyMap[day]) dailyMap[day] = { inflow: 0, outflow: 0 };
            dailyMap[day].inflow += Number(p.amount);
        });
        outflows.forEach((e: any) => {
            const day = new Date(e.created_at).toISOString().slice(0, 10);
            if (!dailyMap[day]) dailyMap[day] = { inflow: 0, outflow: 0 };
            dailyMap[day].outflow += Number(e.total_amount);
        });

        const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, vals]) => ({
            date, ...vals, net: vals.inflow - vals.outflow,
        }));

        const totalInflow = inflows.reduce((s: number, p: any) => s + Number(p.amount), 0);
        const totalOutflow = outflows.reduce((s: number, e: any) => s + Number(e.total_amount), 0);

        return { success: true, data: { daily, totalInflow, totalOutflow, netFlow: totalInflow - totalOutflow } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getProfitLossReport(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };

        const [revenueByDept, expensesByCat] = await Promise.all([
            db.invoice_items.groupBy({
                by: ['department'],
                _sum: { net_price: true },
                where: { created_at: dateFilter },
            }),
            db.expense.groupBy({
                by: ['category_id'],
                _sum: { total_amount: true },
                where: { status: { in: ['Approved', 'Paid'] }, created_at: dateFilter },
            }),
        ]);

        // Get category names
        const categoryIds = expensesByCat.map((e: any) => e.category_id);
        const categories = categoryIds.length > 0
            ? await db.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
            : [];
        const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

        const income = revenueByDept.map((d: any) => ({ label: d.department, amount: Number(d._sum.net_price || 0) }));
        const expenses = expensesByCat.map((e: any) => ({ label: catMap[e.category_id] || `Category ${e.category_id}`, amount: Number(e._sum.total_amount || 0) }));

        const totalIncome = income.reduce((s: number, i: any) => s + i.amount, 0);
        const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);

        return {
            success: true,
            data: { income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getRevenueByDepartment(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };

        const [byDept, byType] = await Promise.all([
            db.invoice_items.groupBy({
                by: ['department'],
                _sum: { net_price: true },
                _count: { _all: true },
                where: { created_at: dateFilter },
            }),
            db.invoices.groupBy({
                by: ['invoice_type'],
                _sum: { net_amount: true },
                _count: { _all: true },
                where: { status: { not: 'Cancelled' }, created_at: dateFilter },
            }),
        ]);

        return {
            success: true,
            data: {
                byDepartment: byDept.map((d: any) => ({
                    department: d.department,
                    amount: Number(d._sum.net_price || 0),
                    count: d._count._all,
                })),
                byType: byType.map((t: any) => ({
                    type: t.invoice_type,
                    amount: Number(t._sum.net_amount || 0),
                    count: t._count._all,
                })),
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getInsuranceCollectionReport(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const dateFilter = { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') };

        const claims = await db.insurance_claims.findMany({
            where: { submitted_at: dateFilter },
            include: {
                policy: { include: { provider: { select: { provider_name: true } } } },
                invoice: { select: { invoice_number: true, net_amount: true } },
            },
            orderBy: { submitted_at: 'desc' },
        });

        const summary = {
            totalClaims: claims.length,
            totalClaimed: claims.reduce((s: number, c: any) => s + Number(c.claimed_amount), 0),
            totalApproved: claims.filter((c: any) => c.approved_amount).reduce((s: number, c: any) => s + Number(c.approved_amount || 0), 0),
            totalRejected: claims.filter((c: any) => c.rejected_amount).reduce((s: number, c: any) => s + Number(c.rejected_amount || 0), 0),
            pending: claims.filter((c: any) => c.status === 'Submitted').length,
            approved: claims.filter((c: any) => c.status === 'Approved').length,
            settled: claims.filter((c: any) => c.status === 'Settled').length,
            rejected: claims.filter((c: any) => c.status === 'Rejected').length,
        };

        return { success: true, data: { claims: serialize(claims), summary } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDailyCollectionSummary(filters: { from: string; to: string }) {
    try {
        const { db } = await requireTenantContext();
        const payments = await db.payments.findMany({
            where: {
                status: 'Completed',
                created_at: { gte: new Date(filters.from), lte: new Date(filters.to + 'T23:59:59') },
            },
            select: { amount: true, payment_method: true, created_at: true },
        });

        const dailyMap: Record<string, Record<string, number>> = {};
        payments.forEach((p: any) => {
            const day = new Date(p.created_at).toISOString().slice(0, 10);
            if (!dailyMap[day]) dailyMap[day] = { Cash: 0, Card: 0, UPI: 0, BankTransfer: 0, Razorpay: 0, total: 0 };
            dailyMap[day][p.payment_method] = (dailyMap[day][p.payment_method] || 0) + Number(p.amount);
            dailyMap[day].total += Number(p.amount);
        });

        const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, vals]) => ({ date, ...vals }));

        return { success: true, data: daily };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
