'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function getFinancialPeriods() {
    try {
        const { db } = await requireTenantContext();
        const periods = await db.financialPeriod.findMany({
            orderBy: { start_date: 'desc' },
            take: 50,
        });
        return { success: true, data: serialize(periods) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createFinancialPeriod(data: {
    period_name: string;
    period_type: string;
    start_date: string;
    end_date: string;
}) {
    try {
        const { db } = await requireTenantContext();

        // Check for overlapping periods
        const overlap = await db.financialPeriod.findFirst({
            where: {
                OR: [
                    { start_date: { lte: new Date(data.end_date) }, end_date: { gte: new Date(data.start_date) } },
                ],
                status: { not: 'Locked' },
            },
        });
        if (overlap) return { success: false, error: `Overlaps with period: ${overlap.period_name}` };

        const period = await db.financialPeriod.create({
            data: {
                period_name: data.period_name,
                period_type: data.period_type,
                start_date: new Date(data.start_date),
                end_date: new Date(data.end_date),
                status: 'Open',
            },
        });
        return { success: true, data: serialize(period) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function closeFinancialPeriod(id: number) {
    try {
        const { db, session } = await requireTenantContext();

        const period = await db.financialPeriod.findUnique({ where: { id } });
        if (!period) return { success: false, error: 'Period not found' };
        if (period.status !== 'Open') return { success: false, error: 'Only open periods can be closed' };

        // Calculate revenue for the period
        const payments = await db.payments.findMany({
            where: {
                status: 'Completed',
                created_at: { gte: period.start_date, lte: period.end_date },
            },
        });
        const totalRevenue = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

        // Calculate expenses for the period
        const expenses = await db.expense.findMany({
            where: {
                status: 'Paid',
                payment_date: { gte: period.start_date, lte: period.end_date },
            },
        });
        const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.total_amount), 0);

        const netResult = totalRevenue - totalExpenses;

        const updated = await db.financialPeriod.update({
            where: { id },
            data: {
                status: 'Closed',
                closed_by: session.username,
                total_revenue: totalRevenue,
                total_expenses: totalExpenses,
                net_result: netResult,
            },
        });

        return { success: true, data: serialize(updated) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function lockFinancialPeriod(id: number) {
    try {
        const { db } = await requireTenantContext();

        const period = await db.financialPeriod.findUnique({ where: { id } });
        if (!period) return { success: false, error: 'Period not found' };
        if (period.status !== 'Closed') return { success: false, error: 'Only closed periods can be locked' };

        const updated = await db.financialPeriod.update({
            where: { id },
            data: { status: 'Locked' },
        });
        return { success: true, data: serialize(updated) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPeriodPreview(id: number) {
    try {
        const { db } = await requireTenantContext();

        const period = await db.financialPeriod.findUnique({ where: { id } });
        if (!period) return { success: false, error: 'Period not found' };

        const [payments, expenses] = await Promise.all([
            db.payments.findMany({
                where: { status: 'Completed', created_at: { gte: period.start_date, lte: period.end_date } },
            }),
            db.expense.findMany({
                where: { status: 'Paid', payment_date: { gte: period.start_date, lte: period.end_date } },
            }),
        ]);

        const totalRevenue = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
        const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.total_amount), 0);

        return {
            success: true,
            data: {
                totalRevenue,
                totalExpenses,
                netResult: totalRevenue - totalExpenses,
                paymentCount: payments.length,
                expenseCount: expenses.length,
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
