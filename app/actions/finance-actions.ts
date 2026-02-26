'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';

// Convert Prisma Decimal/Date objects to plain JS for client serialization
function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

// ============================================
// INVOICE MANAGEMENT
// ============================================

function generateInvoiceNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `INV-${dateStr}-${seq}`;
}

function generateReceiptNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `RCP-${dateStr}-${seq}`;
}

// Create a new invoice (Draft)
export async function createInvoice(data: {
    patient_id: string;
    admission_id?: string;
    invoice_type: string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const invoice = await db.invoices.create({
            data: {
                invoice_number: generateInvoiceNumber(),
                patient_id: data.patient_id,
                admission_id: data.admission_id || null,
                invoice_type: data.invoice_type,
                status: 'Draft',
                notes: data.notes || null,
                organizationId,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CREATE_INVOICE',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({ patient_id: data.patient_id, type: data.invoice_type }),
                organizationId,
            },
        });

        return { success: true, data: serialize(invoice) };
    } catch (error: any) {
        console.error('createInvoice error:', error);
        return { success: false, error: error.message };
    }
}

// Add a line item to an invoice
export async function addInvoiceItem(data: {
    invoice_id: number;
    department: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount?: number;
    ref_id?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const discount = data.discount || 0;
        const total_price = data.quantity * data.unit_price;
        const net_price = total_price - discount;

        const item = await db.invoice_items.create({
            data: {
                invoice_id: data.invoice_id,
                department: data.department,
                description: data.description,
                quantity: data.quantity,
                unit_price: data.unit_price,
                total_price,
                discount,
                net_price,
                ref_id: data.ref_id || null,
            },
        });

        // Recalculate invoice totals
        await recalculateInvoice(data.invoice_id);

        return { success: true, data: serialize(item) };
    } catch (error: any) {
        console.error('addInvoiceItem error:', error);
        return { success: false, error: error.message };
    }
}

// Recalculate invoice totals from items
async function recalculateInvoice(invoiceId: number) {
    const { db } = await requireTenantContext();

    const items = await db.invoice_items.findMany({
        where: { invoice_id: invoiceId },
    });

    const total_amount = items.reduce((sum: any, item: any) => sum + Number(item.total_price), 0);
    const total_discount = items.reduce((sum: any, item: any) => sum + Number(item.discount), 0);
    const net_amount = items.reduce((sum: any, item: any) => sum + Number(item.net_price), 0);

    const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
    const paid_amount = Number(invoice?.paid_amount || 0);
    const balance_due = net_amount - paid_amount;

    await db.invoices.update({
        where: { id: invoiceId },
        data: {
            total_amount,
            total_discount,
            net_amount,
            balance_due: balance_due > 0 ? balance_due : 0,
            status: balance_due <= 0 && net_amount > 0 ? 'Paid' : invoice?.status,
        },
    });
}

// Get all invoices with filters
export async function getInvoices(filters?: {
    status?: string;
    patient_id?: string;
    invoice_type?: string;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();

        const where: any = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.patient_id) where.patient_id = filters.patient_id;
        if (filters?.invoice_type) where.invoice_type = filters.invoice_type;

        const invoices = await db.invoices.findMany({
            where,
            include: {
                patient: { select: { full_name: true, phone: true } },
                items: true,
                payments: true,
                insurance_claims: { select: { claim_number: true, status: true, approved_amount: true } },
            },
            orderBy: { created_at: 'desc' },
            take: filters?.limit || 100,
        });

        return { success: true, data: serialize(invoices) };
    } catch (error: any) {
        console.error('getInvoices error:', error);
        return { success: false, error: error.message };
    }
}

// Get single invoice detail
export async function getInvoiceDetail(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();

        const invoice = await db.invoices.findUnique({
            where: { id: invoiceId },
            include: {
                patient: true,
                admission: true,
                items: { orderBy: { created_at: 'asc' } },
                payments: { orderBy: { created_at: 'desc' } },
                insurance_claims: true,
            },
        });

        if (!invoice) return { success: false, error: 'Invoice not found' };
        return { success: true, data: serialize(invoice) };
    } catch (error: any) {
        console.error('getInvoiceDetail error:', error);
        return { success: false, error: error.message };
    }
}

// Finalize invoice (Draft -> Final)
export async function finalizeInvoice(invoiceId: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const invoice = await db.invoices.update({
            where: { id: invoiceId },
            data: {
                status: 'Final',
                finalized_at: new Date(),
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'FINALIZE_INVOICE',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({ net_amount: Number(invoice.net_amount) }),
                organizationId,
            },
        });

        return { success: true, data: serialize(invoice) };
    } catch (error: any) {
        console.error('finalizeInvoice error:', error);
        return { success: false, error: error.message };
    }
}

// Cancel invoice (soft delete)
export async function cancelInvoice(invoiceId: number, reason?: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const invoice = await db.invoices.update({
            where: { id: invoiceId },
            data: { status: 'Cancelled', notes: reason || 'Cancelled by admin' },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CANCEL_INVOICE',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({ reason }),
                organizationId,
            },
        });

        return { success: true, data: serialize(invoice) };
    } catch (error: any) {
        console.error('cancelInvoice error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PAYMENT PROCESSING
// ============================================

// Record a payment (Advance, Settlement, etc.)
export async function recordPayment(data: {
    invoice_id: number;
    amount: number;
    payment_method: string;
    payment_type: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const payment = await db.payments.create({
            data: {
                receipt_number: generateReceiptNumber(),
                invoice_id: data.invoice_id,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_type: data.payment_type,
                razorpay_order_id: data.razorpay_order_id || null,
                razorpay_payment_id: data.razorpay_payment_id || null,
                status: 'Completed',
                notes: data.notes || null,
            },
        });

        // Update invoice paid_amount and balance
        const allPayments = await db.payments.findMany({
            where: { invoice_id: data.invoice_id, status: 'Completed' },
        });

        const totalPaid = allPayments.reduce((sum: any, p: any) => sum + Number(p.amount), 0);
        const invoice = await db.invoices.findUnique({ where: { id: data.invoice_id } });
        const netAmount = Number(invoice?.net_amount || 0);
        const balance = netAmount - totalPaid;

        let newStatus = invoice?.status || 'Draft';
        if (balance <= 0) newStatus = 'Paid';
        else if (totalPaid > 0) newStatus = 'Partial';

        await db.invoices.update({
            where: { id: data.invoice_id },
            data: {
                paid_amount: totalPaid,
                balance_due: balance > 0 ? balance : 0,
                status: newStatus,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'RECORD_PAYMENT',
                module: 'finance',
                entity_type: 'payment',
                entity_id: payment.receipt_number,
                details: JSON.stringify({
                    invoice_id: data.invoice_id,
                    amount: data.amount,
                    method: data.payment_method,
                    type: data.payment_type,
                }),
                organizationId,
            },
        });

        return { success: true, data: serialize(payment) };
    } catch (error: any) {
        console.error('recordPayment error:', error);
        return { success: false, error: error.message };
    }
}

// Reverse a payment (refund)
export async function reversePayment(paymentId: number, reason: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const payment = await db.payments.update({
            where: { id: paymentId },
            data: { status: 'Reversed', notes: reason },
        });

        // Recalculate invoice
        const allPayments = await db.payments.findMany({
            where: { invoice_id: payment.invoice_id, status: 'Completed' },
        });

        const totalPaid = allPayments.reduce((sum: any, p: any) => sum + Number(p.amount), 0);
        const invoice = await db.invoices.findUnique({ where: { id: payment.invoice_id } });
        const netAmount = Number(invoice?.net_amount || 0);
        const balance = netAmount - totalPaid;

        await db.invoices.update({
            where: { id: payment.invoice_id },
            data: {
                paid_amount: totalPaid,
                balance_due: balance > 0 ? balance : 0,
                status: totalPaid >= netAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Final',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'REVERSE_PAYMENT',
                module: 'finance',
                entity_type: 'payment',
                entity_id: payment.receipt_number,
                details: JSON.stringify({ reason, amount: Number(payment.amount) }),
                organizationId,
            },
        });

        return { success: true, data: serialize(payment) };
    } catch (error: any) {
        console.error('reversePayment error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CHARGE CATALOG
// ============================================

export async function getChargeCatalog(category?: string) {
    try {
        const { db } = await requireTenantContext();

        const where: any = { is_active: true };
        if (category) where.category = category;

        const catalog = await db.charge_catalog.findMany({
            where,
            orderBy: { category: 'asc' },
        });

        return { success: true, data: serialize(catalog) };
    } catch (error: any) {
        console.error('getChargeCatalog error:', error);
        return { success: false, error: error.message };
    }
}

export async function addCatalogItem(data: {
    category: string;
    item_code: string;
    item_name: string;
    default_price: number;
    department?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const item = await db.charge_catalog.create({
            data: {
                category: data.category,
                item_code: data.item_code,
                item_name: data.item_name,
                default_price: data.default_price,
                department: data.department || null,
                organizationId,
            },
        });

        return { success: true, data: serialize(item) };
    } catch (error: any) {
        console.error('addCatalogItem error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateCatalogItem(id: number, data: {
    item_name?: string;
    default_price?: number;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();

        const item = await db.charge_catalog.update({
            where: { id },
            data,
        });

        return { success: true, data: serialize(item) };
    } catch (error: any) {
        console.error('updateCatalogItem error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// FINANCE ANALYTICS
// ============================================

export async function getFinanceDashboardStats() {
    try {
        const { db } = await requireTenantContext();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Outstanding aging dates
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // Single Promise.all for ALL queries
        const [
            totalInvoices,
            draftInvoices,
            pendingBalance,
            todayRevenue,
            totalRevenue,
            totalPaymentsToday,
            outstandingInvoices,
            revenueByDept,
            aging0to30,
            aging30to60,
            aging60plus,
        ] = await Promise.all([
            db.invoices.count({ where: { status: { not: 'Cancelled' } } }),
            db.invoices.count({ where: { status: 'Draft' } }),
            db.invoices.aggregate({
                _sum: { balance_due: true },
                where: { status: { in: ['Final', 'Partial'] } },
            }),
            db.payments.aggregate({
                _sum: { amount: true },
                where: { status: 'Completed', created_at: { gte: today } },
            }),
            db.payments.aggregate({
                _sum: { amount: true },
                where: { status: 'Completed' },
            }),
            db.payments.count({
                where: { status: 'Completed', created_at: { gte: today } },
            }),
            db.invoices.count({
                where: { status: { in: ['Final', 'Partial'] }, balance_due: { gt: 0 } },
            }),
            db.invoice_items.groupBy({
                by: ['department'],
                _sum: { net_price: true },
            }),
            db.invoices.aggregate({
                _sum: { balance_due: true },
                where: {
                    status: { in: ['Final', 'Partial'] },
                    balance_due: { gt: 0 },
                    created_at: { gte: thirtyDaysAgo },
                },
            }),
            db.invoices.aggregate({
                _sum: { balance_due: true },
                where: {
                    status: { in: ['Final', 'Partial'] },
                    balance_due: { gt: 0 },
                    created_at: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
                },
            }),
            db.invoices.aggregate({
                _sum: { balance_due: true },
                where: {
                    status: { in: ['Final', 'Partial'] },
                    balance_due: { gt: 0 },
                    created_at: { lt: sixtyDaysAgo },
                },
            }),
        ]);

        return {
            success: true,
            data: {
                totalInvoices,
                draftInvoices,
                pendingBalance: Number(pendingBalance._sum.balance_due || 0),
                todayRevenue: Number(todayRevenue._sum.amount || 0),
                totalRevenue: Number(totalRevenue._sum.amount || 0),
                totalPaymentsToday,
                outstandingInvoices,
                revenueByDepartment: revenueByDept.map((d: any) => ({
                    department: d.department,
                    amount: Number(d._sum.net_price || 0),
                })),
                aging: {
                    days0to30: Number(aging0to30._sum.balance_due || 0),
                    days30to60: Number(aging30to60._sum.balance_due || 0),
                    days60plus: Number(aging60plus._sum.balance_due || 0),
                },
            },
        };
    } catch (error: any) {
        console.error('getFinanceDashboardStats error:', error);
        return { success: false, error: error.message };
    }
}

// Auto-create billing hooks for existing modules
export async function autoCreateBillingRecord(data: {
    patient_id: string;
    department: string;
    description: string;
    amount: number;
    invoice_id?: number;
    ref_id?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // If no invoice_id, try to find an existing Draft invoice or create new
        let invoiceId = data.invoice_id;

        if (!invoiceId) {
            const existingDraft = await db.invoices.findFirst({
                where: {
                    patient_id: data.patient_id,
                    status: 'Draft',
                },
                orderBy: { created_at: 'desc' },
            });

            if (existingDraft) {
                invoiceId = existingDraft.id;
            } else {
                const newInvoice = await db.invoices.create({
                    data: {
                        invoice_number: generateInvoiceNumber(),
                        patient_id: data.patient_id,
                        invoice_type: 'OPD',
                        status: 'Draft',
                        organizationId,
                    },
                });
                invoiceId = newInvoice.id;
            }
        }

        // Add line item
        await addInvoiceItem({
            invoice_id: invoiceId!,
            department: data.department,
            description: data.description,
            quantity: 1,
            unit_price: data.amount,
            ref_id: data.ref_id,
        });

        return { success: true, invoiceId };
    } catch (error: any) {
        console.error('autoCreateBillingRecord error:', error);
        return { success: false, error: error.message };
    }
}

// Get provisional bill for an admission (running total)
export async function getProvisionalBill(admissionId: string) {
    try {
        const { db } = await requireTenantContext();

        const invoice = await db.invoices.findFirst({
            where: { admission_id: admissionId, status: { not: 'Cancelled' } },
            include: {
                patient: { select: { full_name: true, patient_id: true } },
                items: { orderBy: { created_at: 'asc' } },
                payments: { where: { status: 'Completed' } },
            },
            orderBy: { created_at: 'desc' },
        });

        if (!invoice) return { success: false, error: 'No invoice found for this admission' };

        return { success: true, data: serialize(invoice) };
    } catch (error: any) {
        console.error('getProvisionalBill error:', error);
        return { success: false, error: error.message };
    }
}
