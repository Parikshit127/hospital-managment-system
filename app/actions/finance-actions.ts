'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';
import { sendWhatsAppMessage, formatPhoneNumber } from '@/app/lib/whatsapp';
import { billingInvoiceMsg, paymentReceiptMsg } from '@/app/lib/whatsapp-templates';
import { postInvoiceToGL, postPaymentToGL } from './gl-actions';


// Convert Prisma Decimal/Date objects to plain JS for client serialization
function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

// Check if a given date falls into a locked financial period
async function checkPeriodLock(db: any, date: Date = new Date()) {
    const period = await db.financialPeriod.findFirst({
        where: {
            start_date: { lte: date },
            end_date: { gte: date }
        }
    });
    if (period && period.status === 'Locked') {
        throw new Error(`Financial period '${period.period_name}' is locked. Cannot process transaction.`);
    }
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
    // Phase 2 — billing engine fields
    billing_patient_type?: string;
    corporate_id?: string;
    tpa_provider_id?: number;
    pre_auth_id?: string;
    patient_payable?: number;
    corporate_payable?: number;
    tpa_payable?: number;
    concession_amount?: number;
    concession_reason?: string;
    concession_approved_by?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Phase 4: Period Locking
        await checkPeriodLock(db);

        // Phase 4: Duplicate Detection — only block truly empty drafts within 5 minutes
        const duplicateWindow = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
        const existingDraft = await db.invoices.findFirst({
            where: {
                patient_id: data.patient_id,
                invoice_type: data.invoice_type,
                status: 'Draft',
                created_at: { gte: duplicateWindow },
                organizationId
            },
            include: { items: { take: 1 } }
        });

        // Only block if the existing draft has no items (truly accidental duplicate)
        if (existingDraft && existingDraft.items.length === 0) {
            return { success: false, error: `Duplicate invoice detected. A Draft invoice (${existingDraft.invoice_number}) was created for this patient recently.` };
        }

        const invoice = await db.invoices.create({
            data: {
                invoice_number: generateInvoiceNumber(),
                patient_id: data.patient_id,
                admission_id: data.admission_id || null,
                invoice_type: data.invoice_type,
                status: 'Draft',
                notes: data.notes || null,
                organizationId,
                // Phase 2
                billing_patient_type: data.billing_patient_type || 'cash',
                corporate_id: data.corporate_id || null,
                tpa_provider_id: data.tpa_provider_id || null,
                pre_auth_id: data.pre_auth_id || null,
                patient_payable: data.patient_payable ?? 0,
                corporate_payable: data.corporate_payable ?? 0,
                tpa_payable: data.tpa_payable ?? 0,
                concession_amount: data.concession_amount ?? 0,
                concession_reason: data.concession_reason || null,
                concession_approved_by: data.concession_approved_by || null,
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

        // Auto-post to General Ledger
        await postInvoiceToGL(invoice.id).catch(err => 
            console.error("GL posting failed for invoice:", invoice.id, err)
        );


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
    tax_rate?: number;
    hsn_sac_code?: string;
    service_category?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const discount = data.discount || 0;
        const total_price = data.quantity * data.unit_price;
        const net_price = total_price - discount;
        const taxRate = data.tax_rate || 0;
        const tax_amount = net_price * taxRate / 100;

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
                tax_rate: taxRate,
                tax_amount,
                hsn_sac_code: data.hsn_sac_code || null,
                service_category: data.service_category || null,
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
    const net_items = items.reduce((sum: any, item: any) => sum + Number(item.net_price), 0);
    const total_tax = items.reduce((sum: any, item: any) => sum + Number(item.tax_amount || 0), 0);

    const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
    const isInterState = invoice?.is_inter_state || false;
    const paid_amount = Number(invoice?.paid_amount || 0);
    const net_amount = net_items + total_tax;
    const balance_due = net_amount - paid_amount;

    await db.invoices.update({
        where: { id: invoiceId },
        data: {
            total_amount,
            total_discount,
            net_amount,
            total_tax,
            cgst_amount: isInterState ? 0 : total_tax / 2,
            sgst_amount: isInterState ? 0 : total_tax / 2,
            igst_amount: isInterState ? total_tax : 0,
            balance_due: balance_due > 0 ? balance_due : 0,
            status: balance_due <= 0 && net_amount > 0 ? 'Paid' : invoice?.status,
            version: { increment: 1 },
        },
    });
}

// Get all invoices with filters (Aggregates IPD, OPD, Lab, and Pharmacy)
export async function getInvoices(filters?: {
    status?: string;
    patient_id?: string;
    invoice_type?: string;
    mobile_number?: string;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();

        const limit = filters?.limit || 100;

        // Determine which sources to fetch based on invoice_type filter
        const fetchStandard = !filters?.invoice_type || ['OPD', 'IPD'].includes(filters.invoice_type);
        const fetchLab = !filters?.invoice_type || filters.invoice_type === 'LAB';
        const fetchPharm = !filters?.invoice_type || filters.invoice_type === 'PHARMACY';

        // 1. Fetch Standard Invoices (IPD/OPD)
        let standardInvoices: any[] = [];
        if (fetchStandard) {
            const where: any = {};
            if (filters?.status) where.status = filters.status;
            if (filters?.patient_id) where.patient_id = filters.patient_id;
            if (filters?.invoice_type) where.invoice_type = filters.invoice_type;
            if (filters?.mobile_number) {
                where.patient = { phone: { contains: filters.mobile_number } };
            }

            standardInvoices = await db.invoices.findMany({
                where,
                include: {
                    patient: { select: { full_name: true, phone: true } },
                },
                orderBy: { created_at: 'desc' },
                take: limit,
            });
        }

        // 2. Fetch Lab Orders
        let labOrders: any[] = [];
        if (fetchLab) {
            const where: any = {};
            if (filters?.status) {
                // Map status if needed, but Lab uses Pendning/Completed
                if (filters.status === 'Draft') where.status = 'Pending';
                else if (filters.status === 'Paid') where.status = 'Completed';
                else where.status = filters.status;
            }
            if (filters?.patient_id) where.patient_id = filters.patient_id;
            if (filters?.mobile_number) {
                const patients = await db.oPD_REG.findMany({
                    where: { phone: { contains: filters.mobile_number } },
                    select: { patient_id: true }
                });
                where.patient_id = { in: patients.map((p: any) => p.patient_id) };
            }

            labOrders = await db.lab_orders.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit,
            });
        }

        // 3. Fetch Pharmacy Orders
        let pharmacyOrders: any[] = [];
        if (fetchPharm) {
            const where: any = {};
            if (filters?.status) {
                if (filters.status === 'Draft') where.status = 'Pending';
                else if (filters.status === 'Paid') where.status = 'Completed';
                else where.status = filters.status;
            }
            if (filters?.patient_id) where.patient_id = filters.patient_id;
            if (filters?.mobile_number) {
                const patients = await db.oPD_REG.findMany({
                    where: { phone: { contains: filters.mobile_number } },
                    select: { patient_id: true }
                });
                where.patient_id = { in: patients.map((p: any) => p.patient_id) };
            }

            pharmacyOrders = await db.pharmacy_orders.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit,
            });
        }

        // 4. Enrich Lab/Pharmacy with Patient Names & Lab pricing
        const allPatientIds = Array.from(new Set([
            ...labOrders.map((o: any) => o.patient_id),
            ...pharmacyOrders.map((o: any) => o.patient_id)
        ]));

        const [patients, testInventory] = await Promise.all([
            db.oPD_REG.findMany({
                where: { patient_id: { in: allPatientIds } },
                select: { patient_id: true, full_name: true, phone: true }
            }),
            db.lab_test_inventory.findMany({
                select: { test_name: true, price: true }
            })
        ]);

        const patientMap = new Map<string, any>(patients.map((p: any) => [p.patient_id, p]));
        const priceMap = new Map<string, any>(testInventory.map((t: any) => [t.test_name.toLowerCase(), t.price]));

        // 5. Unify Results
        const unified = [
            ...standardInvoices.map((inv: any) => ({
                id: inv.id,
                invoice_number: inv.invoice_number,
                patient_id: inv.patient_id,
                patient: inv.patient,
                invoice_type: inv.invoice_type,
                net_amount: inv.net_amount,
                balance_due: inv.balance_due,
                status: inv.status,
                created_at: inv.created_at,
                source: inv.invoice_type
            })),
            ...labOrders.map((lab: any) => {
                const p = patientMap.get(lab.patient_id);
                const price = priceMap.get(lab.test_type.toLowerCase()) || 0;
                return {
                    id: lab.id,
                    invoice_number: lab.barcode,
                    patient_id: lab.patient_id,
                    patient: {
                        full_name: p?.full_name || 'Unknown',
                        phone: p?.phone || 'N/A'
                    },
                    invoice_type: 'LAB',
                    net_amount: price,
                    balance_due: lab.status === 'Completed' ? 0 : price,
                    status: lab.status === 'Pending' ? 'Draft' : lab.status === 'Completed' ? 'Paid' : lab.status,
                    created_at: lab.created_at,
                    source: 'LAB'
                };
            }),
            ...pharmacyOrders.map((pharm: any) => {
                const p = patientMap.get(pharm.patient_id);
                return {
                    id: pharm.id,
                    invoice_number: `PHARM-${pharm.id}`,
                    patient_id: pharm.patient_id,
                    patient: {
                        full_name: p?.full_name || 'Unknown',
                        phone: p?.phone || 'N/A'
                    },
                    invoice_type: 'PHARMACY',
                    net_amount: pharm.total_amount,
                    balance_due: pharm.status === 'Completed' ? 0 : pharm.total_amount,
                    status: pharm.status === 'Pending' ? 'Draft' : pharm.status === 'Completed' ? 'Paid' : pharm.status,
                    created_at: pharm.created_at,
                    source: 'PHARMACY'
                };
            })
        ];

        // Sort by date DESC
        unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return { success: true, data: serialize(unified.slice(0, limit)) };
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
                version: { increment: 1 },
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

        // WhatsApp: Invoice notification
        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: invoice.patient_id },
            select: { phone: true, full_name: true }
        });
        if (patient?.phone) {
            await sendWhatsAppMessage({
                to: formatPhoneNumber(patient.phone),
                message: billingInvoiceMsg({
                    patientName: patient.full_name,
                    invoiceNumber: invoice.invoice_number,
                    amount: Number(invoice.net_amount),
                    hospitalName: "Hospital"
                })
            }).catch(waErr => console.error('Invoice WA failed:', waErr));
        }

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
            data: { 
                status: 'Cancelled', 
                notes: reason || 'Cancelled by admin',
                version: { increment: 1 }
            },
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

// Revert a cancelled invoice back to Final
export async function revertInvoice(invoiceId: number, reason?: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const existing = await db.invoices.findUnique({ where: { id: invoiceId } });
        if (!existing) return { success: false, error: 'Invoice not found' };
        if (existing.status !== 'Cancelled') return { success: false, error: 'Only cancelled invoices can be reverted' };

        const balanceDue = Number(existing.net_amount) - Number(existing.paid_amount);
        const newStatus = balanceDue <= 0 ? 'Paid' : Number(existing.paid_amount) > 0 ? 'Partial' : 'Final';

        const invoice = await db.invoices.update({
            where: { id: invoiceId },
            data: {
                status: newStatus,
                balance_due: balanceDue > 0 ? balanceDue : 0,
                notes: reason ? `Reverted: ${reason}` : 'Reverted by admin',
                version: { increment: 1 },
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'REVERT_INVOICE',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({ reason, newStatus }),
                organizationId,
            },
        });

        return { success: true, data: serialize(invoice) };
    } catch (error: any) {
        console.error('revertInvoice error:', error);
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

        // Phase 4: Period Locking
        await checkPeriodLock(db);

        // Phase 4: Duplicate Payment Detection
        const duplicateWindow = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
        const existingPayment = await db.payments.findFirst({
            where: {
                invoice_id: data.invoice_id,
                amount: data.amount,
                payment_method: data.payment_method,
                created_at: { gte: duplicateWindow },
                organizationId
            }
        });
        if (existingPayment) {
            return { success: false, error: 'Duplicate payment detected. An identical payment was recorded recently.' };
        }

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
                version: { increment: 1 },
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

        // WhatsApp: Payment receipt
        const paymentPatient = await db.oPD_REG.findUnique({
            where: { patient_id: invoice?.patient_id },
            select: { phone: true, full_name: true }
        });
        if (paymentPatient?.phone) {
            await sendWhatsAppMessage({
                to: formatPhoneNumber(paymentPatient.phone),
                message: paymentReceiptMsg({
                    patientName: paymentPatient.full_name,
                    amount: Number(data.amount),
                    transactionId: payment.receipt_number,
                    date: new Date().toLocaleDateString("en-IN"),
                    hospitalName: "Hospital"
                })
            }).catch(waErr => console.error('Payment Receipt WA failed:', waErr));
        }


        // Auto-post to General Ledger
        await postPaymentToGL(payment.id).catch(err => 
            console.error("GL posting failed for payment:", payment.id, err)
        );

        return { success: true, data: serialize(payment) };
    } catch (error: any) {
        console.error('recordPayment error:', error);
        return { success: false, error: error.message };
    }
}

// Record a split payment (multiple methods in one transaction)
export async function recordSplitPayment(data: {
    invoice_id: number;
    splits: Array<{
        amount: number;
        payment_method: string;
        reference?: string;
    }>;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Phase 4: Period Locking
        await checkPeriodLock(db);

        // Validate splits total
        const totalSplit = data.splits.reduce((sum, s) => sum + s.amount, 0);
        if (totalSplit <= 0) return { success: false, error: 'Total split amount must be greater than 0' };

        // Validate each split has positive amount
        for (const split of data.splits) {
            if (split.amount <= 0) return { success: false, error: 'Each split must have a positive amount' };
        }

        const transactionGroupId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const payments: any[] = [];

        // Create one payment record per split
        for (const split of data.splits) {
            const payment = await db.payments.create({
                data: {
                    receipt_number: generateReceiptNumber(),
                    invoice_id: data.invoice_id,
                    amount: split.amount,
                    payment_method: split.payment_method,
                    payment_type: 'Settlement',
                    transaction_group_id: transactionGroupId,
                    reference: split.reference || null,
                    status: 'Completed',
                    notes: data.notes || null,
                    organizationId,
                },
            });
            payments.push(payment);
        }

        // Recalculate invoice balance once after all splits
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
                version: { increment: 1 },
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'SPLIT_PAYMENT',
                module: 'finance',
                entity_type: 'payment',
                entity_id: transactionGroupId,
                details: JSON.stringify({
                    invoice_id: data.invoice_id,
                    total: totalSplit,
                    splits: data.splits.length,
                    methods: data.splits.map(s => `${s.payment_method}:${s.amount}`),
                }),
                organizationId,
            },
        });

        // WhatsApp: Payment receipt
        const paymentPatient = await db.oPD_REG.findUnique({
            where: { patient_id: invoice?.patient_id },
            select: { phone: true, full_name: true }
        });
        if (paymentPatient?.phone) {
            await sendWhatsAppMessage({
                to: formatPhoneNumber(paymentPatient.phone),
                message: paymentReceiptMsg({
                    patientName: paymentPatient.full_name,
                    amount: totalSplit,
                    transactionId: transactionGroupId,
                    date: new Date().toLocaleDateString("en-IN"),
                    hospitalName: "Hospital"
                })
            }).catch(waErr => console.error('Split Payment WA failed:', waErr));
        }

        return { success: true, data: serialize({ transaction_group_id: transactionGroupId, payments }) };
    } catch (error: any) {
        console.error('recordSplitPayment error:', error);
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
                version: { increment: 1 },
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

// ============================================
// PHASE 2.2: ADVANCED FINANCE
// ============================================

export async function getPaymentLedger(filters?: { method?: string; limit?: number }) {
    try {
        const { db } = await requireTenantContext();
        const payments = await db.payments.findMany({
            where: filters?.method ? { payment_method: filters.method } : {},
            include: {
                invoice: { select: { invoice_number: true, patient: { select: { full_name: true } } } }
            },
            orderBy: { created_at: 'desc' },
            take: filters?.limit || 200
        });
        return { success: true, data: serialize(payments) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function performCashClosure(data: { notes?: string }) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // Find last closure date to calculate running totals
        const lastClosure = await db.cashClosure.findFirst({
            where: { organizationId },
            orderBy: { closure_date: 'desc' }
        });
        const since = lastClosure ? lastClosure.closure_date : new Date(0);

        // Calculate totals since last closure
        const payments = await db.payments.findMany({
            where: {
                status: 'Completed',
                created_at: { gt: since }
            }
        });

        let cash_total = 0; let card_total = 0; let online_total = 0;
        payments.forEach((p: any) => {
            const amt = Number(p.amount);
            if (p.payment_method === 'Cash') cash_total += amt;
            else if (p.payment_method === 'Card') card_total += amt;
            else online_total += amt;
        });

        const closure = await db.cashClosure.create({
            data: {
                cash_total,
                card_total,
                online_total,
                notes: data.notes,
                closed_by: session.username,
                organizationId
            }
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CASH_CLOSURE',
                module: 'finance',
                details: `Drawer closed by ${session.username}. Cash: ${cash_total}`,
                organizationId
            }
        });

        return { success: true, data: closure };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getCashClosures() {
    try {
        const { db } = await requireTenantContext();
        const closures = await db.cashClosure.findMany({
            orderBy: { closure_date: 'desc' },
            take: 50
        });
        return { success: true, data: closures };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function requestRefund(data: { invoice_id: string; payment_id?: string; amount: number; reason: string; }) {
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const refund = await db.refund.create({
            data: {
                invoice_id: data.invoice_id,
                payment_id: data.payment_id,
                amount: data.amount,
                reason: data.reason,
                processed_by: session.username,
                organizationId
            }
        });
        return { success: true, data: serialize(refund) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getRefunds() {
    try {
        const { db } = await requireTenantContext();
        const refunds = await db.refund.findMany({
            orderBy: { created_at: 'desc' },
            take: 100
        });
        return { success: true, data: serialize(refunds) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateRefundStatus(id: number, status: string) {
    try {
        const { db } = await requireTenantContext();
        const refund = await db.refund.update({
            where: { id },
            data: { status }
        });
        return { success: true, data: serialize(refund) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
export async function approveInvoice(id: string | number, source: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        if (source === 'OPD' || source === 'IPD') {
            // Only finalize the invoice — do NOT mark as Paid or zero balance_due
            // Payment must be collected separately via recordPayment
            const invoice = await db.invoices.findUnique({
                where: { id: Number(id) },
                select: { status: true, balance_due: true, net_amount: true, paid_amount: true }
            });
            if (invoice && invoice.status === 'Draft') {
                const balanceDue = Number(invoice.net_amount) - Number(invoice.paid_amount);
                await db.invoices.update({
                    where: { id: Number(id) },
                    data: {
                        status: balanceDue <= 0 ? 'Paid' : 'Final',
                        balance_due: balanceDue > 0 ? balanceDue : 0,
                        finalized_at: new Date(),
                    }
                });
            }
        } else if (source === 'LAB') {
            await db.lab_orders.update({
                where: { id: Number(id) },
                data: { status: 'Completed' }
            });
        } else if (source === 'PHARMACY') {
            await db.pharmacy_orders.update({
                where: { id: Number(id) },
                data: { status: 'Completed' }
            });
        }

        await db.system_audit_logs.create({
            data: {
                action: 'APPROVE_PAYMENT',
                module: 'finance',
                entity_type: source.toLowerCase(),
                entity_id: String(id),
                details: `Approved ${source} payment via registry`,
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        console.error('approveInvoice error:', error);
        return { success: false, error: error.message };
    }
}

// Search patients specifically for Reception Billing Generator
export async function searchPatientsForBilling(query: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        if (!query || query.length < 2) return { success: true, data: [] };

        const patients = await db.oPD_REG.findMany({
            where: {
                organizationId,
                OR: [
                    { full_name: { contains: query, mode: 'insensitive' } },
                    { patient_id: { contains: query, mode: 'insensitive' } },
                    { phone: { contains: query, mode: 'insensitive' } }
                ]
            },
            take: 10,
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                age: true,
                gender: true,
                patient_type: true,
                corporate_id: true,
                employee_id: true,
                corporate: {
                    select: {
                        id: true,
                        company_name: true,
                        company_code: true,
                        discount_percentage: true,
                        credit_limit: true,
                        current_balance: true,
                    }
                },
                insurance_policies: {
                    where: { status: 'Active' },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    include: {
                        provider: {
                            select: {
                                id: true,
                                provider_name: true,
                                provider_code: true,
                                pre_auth_required: true,
                                default_discount_percentage: true,
                            }
                        }
                    }
                }
            }
        });

        return { success: true, data: serialize(patients) };
    } catch (error: any) {
        console.error('searchPatientsForBilling error:', error);
        return { success: false, error: error.message };
    }
}

// Remove an invoice item
export async function removeInvoiceItem(itemId: number, invoiceId: number) {
    try {
        const { db } = await requireTenantContext();
        await db.invoice_items.delete({ where: { id: itemId } });
        await recalculateInvoice(invoiceId);
        return { success: true };
    } catch (error: any) {
        console.error('removeInvoiceItem error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PHASE 6 — BILLING ENHANCEMENTS
// ============================================

// Request a discount OTP for approver to authorise
export async function requestDiscountOTP(invoiceId: string, discountAmount: number, discountPercent?: number) {
    try {
        const { db, organizationId, session } = await requireTenantContext();
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const record = await (db.discountOTP as any).create({
            data: {
                organizationId,
                invoice_id: invoiceId,
                discount_amount: discountAmount,
                discount_percent: discountPercent ?? null,
                otp_code: otpCode,
                requested_by: session.username,
                expires_at: expiresAt,
                status: 'Pending',
            },
        });

        return { success: true, data: { otpId: record.id, otp: 'sent to approver' } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Validate entered OTP and apply discount to invoice
export async function approveDiscountOTP(otpId: string, enteredOtp: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const record = await (db.discountOTP as any).findFirst({
            where: { id: otpId, organizationId },
        });

        if (!record) return { success: false, error: 'OTP record not found' };
        if (record.status !== 'Pending') return { success: false, error: `OTP is already ${record.status}` };
        if (new Date() > new Date(record.expires_at)) {
            await (db.discountOTP as any).update({ where: { id: otpId }, data: { status: 'Expired' } });
            return { success: false, error: 'OTP has expired' };
        }
        if (record.otp_code !== enteredOtp) return { success: false, error: 'Invalid OTP' };

        await (db.discountOTP as any).update({
            where: { id: otpId },
            data: { status: 'Used', used_at: new Date(), approved_by: session.username },
        });

        // Apply discount as negative line item
        await addInvoiceItem({
            invoice_id: Number(record.invoice_id),
            department: 'Discount',
            description: `Approved Discount${record.discount_percent ? ` (${record.discount_percent}%)` : ''}`,
            quantity: 1,
            unit_price: -Math.abs(record.discount_amount),
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Get all active Billing Order Sets for org
export async function getBillingOrderSets() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const sets = await (db.billingOrderSet as any).findMany({
            where: { organizationId, is_active: true },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: serialize(sets) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Create a new Billing Order Set
export async function createBillingOrderSet(data: {
    name: string;
    category?: string;
    description?: string;
    items: any[];
    total_amount: number;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const set = await (db.billingOrderSet as any).create({
            data: {
                organizationId,
                name: data.name,
                category: data.category ?? null,
                description: data.description ?? null,
                items: data.items,
                total_amount: data.total_amount,
            },
        });
        return { success: true, data: serialize(set) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Apply a Billing Order Set to an invoice (adds each item as a line)
export async function applyOrderSetToInvoice(invoiceId: string, orderSetId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const set = await (db.billingOrderSet as any).findFirst({
            where: { id: orderSetId, organizationId },
        });
        if (!set) return { success: false, error: 'Order set not found' };

        const items: any[] = Array.isArray(set.items) ? set.items : JSON.parse(set.items as string);
        for (const item of items) {
            await addInvoiceItem({
                invoice_id: Number(invoiceId),
                department: set.category || 'General',
                description: item.name,
                quantity: item.quantity ?? 1,
                unit_price: item.unit_price,
            });
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Get all active Discount Schemes for org
export async function getDiscountSchemes() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const schemes = await (db.discountScheme as any).findMany({
            where: { organizationId, is_active: true },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: serialize(schemes) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Create a new Discount Scheme
export async function createDiscountScheme(data: {
    name: string;
    scheme_type: string;
    value: number;
    applicable_to?: string[];
    valid_from?: string;
    valid_to?: string;
    requires_otp?: boolean;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const scheme = await (db.discountScheme as any).create({
            data: {
                organizationId,
                name: data.name,
                scheme_type: data.scheme_type,
                value: data.value,
                applicable_to: data.applicable_to ?? null,
                valid_from: data.valid_from ? new Date(data.valid_from) : null,
                valid_to: data.valid_to ? new Date(data.valid_to) : null,
                requires_otp: data.requires_otp ?? false,
            },
        });
        return { success: true, data: serialize(scheme) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Create an addendum invoice linked to parent
export async function createAddendumInvoice(parentInvoiceId: string, reason: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const parent = await db.invoices.findFirst({
            where: { id: Number(parentInvoiceId), organizationId },
        });
        if (!parent) return { success: false, error: 'Parent invoice not found' };

        // Find existing addenda to determine suffix number
        const existingAddenda = await db.invoices.findMany({
            where: { organizationId, parent_invoice_id: parentInvoiceId } as any,
        });
        const suffix = `A${existingAddenda.length + 1}`;
        const addendumNumber = `${parent.invoice_number}-${suffix}`;

        const addendum = await db.invoices.create({
            data: {
                invoice_number: addendumNumber,
                patient_id: parent.patient_id,
                admission_id: parent.admission_id ?? undefined,
                invoice_type: parent.invoice_type,
                status: 'Draft',
                notes: reason,
                organizationId,
                billing_patient_type: parent.billing_patient_type,
                corporate_id: parent.corporate_id ?? undefined,
                tpa_provider_id: parent.tpa_provider_id ?? undefined,
                is_addendum: true,
                parent_invoice_id: parentInvoiceId,
                addendum_reason: reason,
            } as any,
        });

        return { success: true, data: serialize(addendum) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}


