'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function generateExpenseNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `EXP-${dateStr}-${seq}`;
}

// ============================================
// EXPENSE CATEGORIES
// ============================================

export async function getExpenseCategories() {
    try {
        const { db } = await requireTenantContext();
        const categories = await db.expenseCategory.findMany({
            where: { is_active: true },
            include: { parent: { select: { name: true } }, _count: { select: { expenses: true } } },
            orderBy: { name: 'asc' },
        });
        return { success: true, data: serialize(categories) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addExpenseCategory(data: { name: string; code: string; parent_id?: number }) {
    try {
        const { db } = await requireTenantContext();
        const category = await db.expenseCategory.create({
            data: {
                name: data.name,
                code: data.code.toUpperCase(),
                parent_id: data.parent_id || null,
            },
        });
        return { success: true, data: serialize(category) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateExpenseCategory(id: number, data: { name?: string; code?: string; is_active?: boolean }) {
    try {
        const { db } = await requireTenantContext();
        const category = await db.expenseCategory.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.code && { code: data.code.toUpperCase() }),
                ...(data.is_active !== undefined && { is_active: data.is_active }),
            },
        });
        return { success: true, data: serialize(category) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// VENDORS
// ============================================

export async function getVendors(activeOnly = true) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (activeOnly) where.is_active = true;
        const vendors = await db.vendor.findMany({
            where,
            include: { _count: { select: { expenses: true } } },
            orderBy: { vendor_name: 'asc' },
        });
        return { success: true, data: serialize(vendors) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addVendor(data: {
    vendor_name: string;
    vendor_code: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    pan_number?: string;
    bank_name?: string;
    bank_account?: string;
    bank_ifsc?: string;
    address?: string;
}) {
    try {
        const { db } = await requireTenantContext();
        const vendor = await db.vendor.create({
            data: {
                vendor_name: data.vendor_name,
                vendor_code: data.vendor_code.toUpperCase(),
                contact_person: data.contact_person || null,
                phone: data.phone || null,
                email: data.email || null,
                gst_number: data.gst_number || null,
                pan_number: data.pan_number || null,
                bank_name: data.bank_name || null,
                bank_account: data.bank_account || null,
                bank_ifsc: data.bank_ifsc || null,
                address: data.address || null,
            },
        });
        return { success: true, data: serialize(vendor) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateVendor(id: number, data: {
    vendor_name?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    pan_number?: string;
    bank_name?: string;
    bank_account?: string;
    bank_ifsc?: string;
    address?: string;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();
        const vendor = await db.vendor.update({ where: { id }, data });
        return { success: true, data: serialize(vendor) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// EXPENSES
// ============================================

export async function getExpenses(filters?: {
    status?: string;
    category_id?: number;
    vendor_id?: number;
    from_date?: string;
    to_date?: string;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.category_id) where.category_id = filters.category_id;
        if (filters?.vendor_id) where.vendor_id = filters.vendor_id;
        if (filters?.from_date || filters?.to_date) {
            where.created_at = {};
            if (filters.from_date) where.created_at.gte = new Date(filters.from_date);
            if (filters.to_date) where.created_at.lte = new Date(filters.to_date + 'T23:59:59');
        }

        const expenses = await db.expense.findMany({
            where,
            include: {
                category: { select: { name: true, code: true } },
                vendor: { select: { vendor_name: true, vendor_code: true } },
            },
            orderBy: { created_at: 'desc' },
            take: filters?.limit || 100,
        });
        return { success: true, data: serialize(expenses) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createExpense(data: {
    category_id: number;
    vendor_id?: number;
    description: string;
    amount: number;
    tax_amount?: number;
    payment_method?: string;
    payment_date?: string;
    reference_no?: string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const taxAmount = data.tax_amount || 0;
        const totalAmount = data.amount + taxAmount;

        const expense = await db.expense.create({
            data: {
                expense_number: generateExpenseNumber(),
                category_id: data.category_id,
                vendor_id: data.vendor_id || null,
                description: data.description,
                amount: data.amount,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                payment_method: data.payment_method || null,
                payment_date: data.payment_date ? new Date(data.payment_date) : null,
                reference_no: data.reference_no || null,
                notes: data.notes || null,
                status: 'Pending',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CREATE_EXPENSE',
                module: 'finance',
                entity_type: 'expense',
                entity_id: expense.expense_number,
                details: JSON.stringify({ amount: totalAmount, category_id: data.category_id }),
                organizationId,
            },
        });

        return { success: true, data: serialize(expense) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function approveExpense(id: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const expense = await db.expense.update({
            where: { id },
            data: { status: 'Approved', approved_by: session.username },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'APPROVE_EXPENSE',
                module: 'finance',
                entity_type: 'expense',
                entity_id: expense.expense_number,
                details: JSON.stringify({ approved_by: session.username }),
                organizationId,
            },
        });

        return { success: true, data: serialize(expense) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function markExpensePaid(id: number, paymentData: {
    payment_method: string;
    payment_date?: string;
    reference_no?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const expense = await db.expense.update({
            where: { id },
            data: {
                status: 'Paid',
                payment_method: paymentData.payment_method,
                payment_date: paymentData.payment_date ? new Date(paymentData.payment_date) : new Date(),
                reference_no: paymentData.reference_no || null,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'PAY_EXPENSE',
                module: 'finance',
                entity_type: 'expense',
                entity_id: expense.expense_number,
                details: JSON.stringify({ method: paymentData.payment_method, amount: Number(expense.total_amount) }),
                organizationId,
            },
        });

        return { success: true, data: serialize(expense) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function rejectExpense(id: number, reason: string) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const expense = await db.expense.update({
            where: { id },
            data: { status: 'Rejected', notes: reason, approved_by: session.username },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'REJECT_EXPENSE',
                module: 'finance',
                entity_type: 'expense',
                entity_id: expense.expense_number,
                details: JSON.stringify({ reason, rejected_by: session.username }),
                organizationId,
            },
        });

        return { success: true, data: serialize(expense) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getExpenseDashboardStats() {
    try {
        const { db } = await requireTenantContext();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const [totalExpenses, pendingApproval, thisMonthTotal, todayTotal, byCategory] = await Promise.all([
            db.expense.aggregate({
                _sum: { total_amount: true },
                where: { status: { in: ['Approved', 'Paid'] } },
            }),
            db.expense.count({ where: { status: 'Pending' } }),
            db.expense.aggregate({
                _sum: { total_amount: true },
                where: { status: { in: ['Approved', 'Paid'] }, created_at: { gte: firstOfMonth } },
            }),
            db.expense.aggregate({
                _sum: { total_amount: true },
                where: { status: { in: ['Approved', 'Paid'] }, created_at: { gte: today } },
            }),
            db.expense.groupBy({
                by: ['category_id'],
                _sum: { total_amount: true },
                where: { status: { in: ['Approved', 'Paid'] }, created_at: { gte: firstOfMonth } },
            }),
        ]);

        return {
            success: true,
            data: {
                totalExpenses: Number(totalExpenses._sum.total_amount || 0),
                pendingApproval,
                thisMonthTotal: Number(thisMonthTotal._sum.total_amount || 0),
                todayTotal: Number(todayTotal._sum.total_amount || 0),
                byCategory: byCategory.map((c: any) => ({
                    category_id: c.category_id,
                    amount: Number(c._sum.total_amount || 0),
                })),
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
