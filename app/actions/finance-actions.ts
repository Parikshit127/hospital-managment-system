'use server';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { prisma } from '@/backend/db';
import { logAudit } from '@/app/lib/audit';
import { sendWhatsAppMessage, formatPhoneNumber } from '@/app/lib/whatsapp';
import { billingInvoiceMsg, paymentReceiptMsg } from '@/app/lib/whatsapp-templates';
import { postInvoiceToGL, postPaymentToGL, reverseJournalEntry } from './gl-actions';
import { getCashThresholds, validateCashCompliance, normalizePan, CASH_METHOD } from '@/app/lib/cash-compliance';
import { generateInvoiceNumber as genInvNum, generateReceiptNumber as genRcpNum } from '@/app/lib/sequence-generator';


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

// Legacy fallback (only used if sequential generator fails)
function generateInvoiceNumberLegacy() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `INV-${dateStr}-${seq}`;
}

function generateReceiptNumberLegacy() {
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
    // Consulting doctor (OPD bills) — captured at billing time so the bill header shows it
    doctor_name?: string;
    doctor_id?: string;
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
                invoice_number: await genInvNum(organizationId, data.invoice_type, !!data.admission_id, db),
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
                doctor_name: data.doctor_name || null,
                doctor_id: data.doctor_id || null,
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

// Suggest the consulting doctor for an OPD bill from the patient's latest
// appointment, so the billing UI can pre-fill it (biller can still override).
export async function getSuggestedOpdDoctor(patientId: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const apt = await db.appointments.findFirst({
            where: { patient_id: patientId, organizationId },
            orderBy: { appointment_date: 'desc' },
            select: { doctor_name: true, doctor_id: true },
        });
        return {
            success: true,
            data: { doctor_name: apt?.doctor_name || '', doctor_id: apt?.doctor_id || '' },
        };
    } catch (error: any) {
        return { success: false, error: error.message, data: { doctor_name: '', doctor_id: '' } };
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
    exclude_pharmacy?: boolean;
    date_from?: Date;
    date_to?: Date;
}) {
    try {
        const { db, session } = await requireTenantContext();

        const limit = filters?.limit || 100;

        // Reception roles should not see pharmacy OPD invoices
        const receptionRoles = ['receptionist', 'reception', 'front_desk', 'ipd_recep'];
        const isReception = receptionRoles.includes((session?.role || '').toLowerCase());
        const excludePharmacy = filters?.exclude_pharmacy || isReception;

        // Determine which sources to fetch based on invoice_type filter
        const fetchStandard = !filters?.invoice_type || ['OPD', 'IPD'].includes(filters.invoice_type);
        const fetchLab = !filters?.invoice_type || filters.invoice_type === 'LAB';
        const fetchPharm = !excludePharmacy && (!filters?.invoice_type || filters.invoice_type === 'PHARMACY');

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

        // 3. Fetch Pharmacy Invoices (OPD pharmacy invoices + IPD invoices with pharmacy items)
        let pharmacyOrders: any[] = [];
        if (fetchPharm) {
            // 3a. OPD pharmacy invoices (invoice_type = 'Pharmacy')
            const where: any = { invoice_type: 'Pharmacy' };
            if (filters?.status) where.status = filters.status;
            if (filters?.patient_id) where.patient_id = filters.patient_id;
            if (filters?.mobile_number) {
                where.patient = { phone: { contains: filters.mobile_number } };
            }
            if (filters?.date_from || filters?.date_to) {
                where.created_at = {};
                if (filters.date_from) where.created_at.gte = filters.date_from;
                if (filters.date_to) where.created_at.lte = filters.date_to;
            }

            const opdPharmInvoices = await db.invoices.findMany({
                where,
                include: {
                    patient: { select: { full_name: true, phone: true } },
                },
                orderBy: { created_at: 'desc' },
                take: limit,
            });

            // 3b. IPD invoices that have pharmacy line items
            const ipdPharmWhere: any = {
                invoice_type: 'IPD',
                items: { some: { service_category: 'Pharmacy' } },
            };
            if (filters?.status) ipdPharmWhere.status = filters.status;
            if (filters?.patient_id) ipdPharmWhere.patient_id = filters.patient_id;
            if (filters?.mobile_number) {
                ipdPharmWhere.patient = { phone: { contains: filters.mobile_number } };
            }
            if (filters?.date_from || filters?.date_to) {
                ipdPharmWhere.created_at = {};
                if (filters.date_from) ipdPharmWhere.created_at.gte = filters.date_from;
                if (filters.date_to) ipdPharmWhere.created_at.lte = filters.date_to;
            }

            const ipdPharmInvoices = await db.invoices.findMany({
                where: ipdPharmWhere,
                include: {
                    patient: { select: { full_name: true, phone: true } },
                    items: { where: { service_category: 'Pharmacy' } },
                    admission: { select: { status: true, admission_id: true } },
                },
                orderBy: { created_at: 'desc' },
                take: limit,
            });

            // Map IPD invoices to show only pharmacy totals
            const ipdPharmMapped = ipdPharmInvoices.map((inv: any) => {
                const pharmTotal = inv.items.reduce((s: number, it: any) => s + Number(it.net_price || 0), 0);
                const pharmTax = inv.items.reduce((s: number, it: any) => s + Number(it.tax_amount || 0), 0);
                return {
                    ...inv,
                    _isIpdPharmacy: true,
                    _pharmTotal: pharmTotal + pharmTax,
                    _pharmItemCount: inv.items.length,
                    _admissionStatus: inv.admission?.status || null,
                    items: undefined, // don't carry heavy items array
                };
            });

            pharmacyOrders = [...opdPharmInvoices, ...ipdPharmMapped];
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
            ...pharmacyOrders.map((pharm: any) => ({
                id: pharm.id,
                invoice_number: pharm.invoice_number,
                patient_id: pharm.patient_id,
                patient: pharm.patient,
                invoice_type: 'PHARMACY',
                net_amount: pharm._isIpdPharmacy ? pharm._pharmTotal : pharm.net_amount,
                total_amount: pharm._isIpdPharmacy ? pharm._pharmTotal : pharm.total_amount,
                balance_due: pharm.balance_due,
                status: pharm.status,
                created_at: pharm.created_at,
                source: pharm._isIpdPharmacy ? 'IPD-PHARMACY' : 'PHARMACY',
                admission_id: pharm.admission_id || null,
                admission_status: pharm._admissionStatus || null,
                doctor_name: pharm.doctor_name || null,
            }))
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

// Cancel invoice (soft cancellation — never deletes)
/**
 * Cancel an invoice with a MANDATORY reason. Sets status = "Cancelled" and
 * records the cancellation on dedicated audit columns (cancelled_by /
 * cancelled_at / cancellation_reason) so the cancelled-invoice banner can read
 * them directly. Also keeps the legacy formatted note and writes a
 * system_audit_logs entry (action = CANCEL_INVOICE) — the immutable trail.
 *
 * Rejects: empty / sub-10-char reasons, already-cancelled invoices, and — for
 * safety — invoices that already have money collected (paid_amount > 0). Such
 * invoices must be reversed via Refund / Credit Note, not cancelled, so the
 * recorded payments are never silently orphaned.
 */
export async function cancelInvoice(invoiceId: number, reason: string) {
    try {
        const trimmed = (reason || '').trim();
        if (!trimmed) {
            return { success: false, error: 'Cancellation reason is required.' };
        }
        if (trimmed.length < 10) {
            return { success: false, error: 'Cancellation reason must be at least 10 characters.' };
        }

        const { db, session, organizationId } = await requireTenantContext();

        // Don't allow double-cancellation
        const existing = await db.invoices.findUnique({
            where: { id: invoiceId },
            select: { status: true, invoice_number: true, paid_amount: true },
        });
        if (!existing) return { success: false, error: 'Invoice not found.' };
        if (existing.status === 'Cancelled') {
            return { success: false, error: 'Invoice is already cancelled.' };
        }

        // Safety: never cancel an invoice that already has money collected against
        // it. Payments must be reversed via Refund / Credit Note first (separate
        // audited flows) — cancellation does not touch paid_amount or payments.
        const paid = Number(existing.paid_amount ?? 0);
        if (paid > 0) {
            return {
                success: false,
                error: `Cannot cancel: ₹${paid.toLocaleString('en-IN')} already collected on this invoice. Reverse the payment via Refund or issue a Credit Note first.`,
            };
        }

        const now = new Date();
        const stamp = now.toISOString().slice(0, 10);
        const actor = (session as any)?.username || (session as any)?.name || (session as any)?.id || 'system';
        const formattedNote = `[CANCELLED ${stamp} by ${actor}] ${trimmed}`;

        const invoice = await db.invoices.update({
            where: { id: invoiceId },
            data: {
                status: 'Cancelled',
                notes: formattedNote,
                cancelled_at: now,
                cancelled_by: actor,
                cancellation_reason: trimmed,
                version: { increment: 1 },
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CANCEL_INVOICE',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({
                    reason: trimmed,
                    cancelled_by: actor,
                    cancelled_at: now.toISOString(),
                    previous_status: existing.status,
                }),
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
                // Clear cancellation audit fields so the cancelled banner stops showing
                cancelled_at: null,
                cancelled_by: null,
                cancellation_reason: null,
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
    payer_pan_number?: string;
    payer_pan_name?: string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Phase 4: Period Locking
        await checkPeriodLock(db);

        // Cash compliance (Rule 1 PAN / Rule 2 limit) — only the cash portion.
        const isCash = data.payment_method === CASH_METHOD;
        const cashTotal = isCash ? Number(data.amount) || 0 : 0;
        if (cashTotal > 0) {
            const thresholds = await getCashThresholds(db);
            const compliance = validateCashCompliance({
                thresholds,
                cashTotal,
                panNumber: data.payer_pan_number,
                panName: data.payer_pan_name,
            });
            if (!compliance.ok) {
                await logAudit({
                    action: 'CASH_COMPLIANCE_BLOCK',
                    module: 'finance',
                    entity_type: 'payment',
                    entity_id: String(data.invoice_id),
                    details: JSON.stringify({ rule: compliance.rule, cash_amount: cashTotal, ...thresholds }),
                }).catch(() => {});
                return { success: false, error: compliance.error };
            }
        }

        const payment = await db.payments.create({
            data: {
                receipt_number: await genRcpNum(organizationId, db),
                invoice_id: data.invoice_id,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_type: data.payment_type,
                razorpay_order_id: data.razorpay_order_id || null,
                razorpay_payment_id: data.razorpay_payment_id || null,
                payer_pan_number: isCash ? (normalizePan(data.payer_pan_number) || null) : null,
                payer_pan_name: isCash ? ((data.payer_pan_name || '').trim() || null) : null,
                status: 'Completed',
                notes: data.notes || null,
                organizationId,
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
    payer_pan_number?: string;
    payer_pan_name?: string;
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

        // Cash compliance — validate the SUMMED cash portion (so splitting cash
        // across multiple lines cannot dodge the threshold / limit).
        const cashTotal = data.splits
            .filter((s) => s.payment_method === CASH_METHOD)
            .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        if (cashTotal > 0) {
            const thresholds = await getCashThresholds(db);
            const compliance = validateCashCompliance({
                thresholds,
                cashTotal,
                panNumber: data.payer_pan_number,
                panName: data.payer_pan_name,
            });
            if (!compliance.ok) {
                await logAudit({
                    action: 'CASH_COMPLIANCE_BLOCK',
                    module: 'finance',
                    entity_type: 'payment',
                    entity_id: String(data.invoice_id),
                    details: JSON.stringify({ rule: compliance.rule, cash_amount: cashTotal, ...thresholds }),
                }).catch(() => {});
                return { success: false, error: compliance.error };
            }
        }

        const panNumber = normalizePan(data.payer_pan_number) || null;
        const panName = (data.payer_pan_name || '').trim() || null;

        const transactionGroupId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const payments: any[] = [];

        // Create one payment record per split
        for (const split of data.splits) {
            const splitIsCash = split.payment_method === CASH_METHOD;
            const payment = await db.payments.create({
                data: {
                    receipt_number: await genRcpNum(organizationId, db),
                    invoice_id: data.invoice_id,
                    amount: split.amount,
                    payment_method: split.payment_method,
                    payment_type: 'Settlement',
                    transaction_group_id: transactionGroupId,
                    reference: split.reference || null,
                    payer_pan_number: splitIsCash ? panNumber : null,
                    payer_pan_name: splitIsCash ? panName : null,
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

export async function getFinanceDashboardStats(params?: {
    period?: 'today' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    startDate?: string;
    endDate?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Resolve filter range from custom dates or period preset
        let filterStart: Date | undefined;
        let filterEnd: Date | undefined;

        if (params?.startDate && params?.endDate) {
            filterStart = new Date(params.startDate);
            filterStart.setHours(0, 0, 0, 0);
            filterEnd = new Date(params.endDate);
            filterEnd.setHours(23, 59, 59, 999);
        } else if (params?.period) {
            const ps = new Date();
            ps.setHours(0, 0, 0, 0);
            if (params.period === 'today') {
                filterStart = ps;
            } else if (params.period === 'weekly') {
                ps.setDate(ps.getDate() - ps.getDay());
                filterStart = ps;
            } else if (params.period === 'monthly') {
                ps.setDate(1);
                filterStart = ps;
            } else if (params.period === 'quarterly') {
                const qm = Math.floor(ps.getMonth() / 3) * 3;
                ps.setMonth(qm, 1);
                filterStart = ps;
            } else if (params.period === 'yearly') {
                ps.setMonth(0, 1);
                filterStart = ps;
            }
        }

        const dateFilter = filterStart
            ? { gte: filterStart, ...(filterEnd ? { lte: filterEnd } : {}) }
            : undefined;

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
            todayCollection,
            totalCollection,
            periodCollection,
            totalPaymentsToday,
            outstandingInvoices,
            revenueByDept,
            revenueByDoctorRaw,
            aging0to30,
            aging30to60,
            aging60plus,
            ipdRevenue,
            opdRevenue,
            todayRevenueInv,
            totalRevenueInv,
            periodRevenueInv,
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
            db.payments.aggregate({
                _sum: { amount: true },
                where: {
                    status: 'Completed',
                    ...(dateFilter ? { created_at: dateFilter } : {}),
                },
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
                where: dateFilter ? { created_at: dateFilter } : undefined,
            }),
            db.invoice_items.groupBy({
                by: ['ref_id'],
                _sum: { net_price: true },
                where: {
                    service_category: 'Consultation',
                    ref_id: { not: null },
                    ...(dateFilter ? { created_at: dateFilter } : {}),
                },
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
            db.invoices.aggregate({
                _sum: { net_amount: true },
                _count: { _all: true },
                where: { invoice_type: 'IPD', status: { not: 'Cancelled' }, ...(dateFilter ? { created_at: dateFilter } : {}) },
            }),
            db.invoices.aggregate({
                _sum: { net_amount: true },
                _count: { _all: true },
                where: { invoice_type: 'OPD', status: { not: 'Cancelled' }, ...(dateFilter ? { created_at: dateFilter } : {}) },
            }),
            db.invoices.aggregate({
                _sum: { net_amount: true },
                where: { status: { not: 'Cancelled' }, created_at: { gte: today } },
            }),
            db.invoices.aggregate({
                _sum: { net_amount: true },
                where: { status: { not: 'Cancelled' } },
            }),
            db.invoices.aggregate({
                _sum: { net_amount: true },
                where: { status: { not: 'Cancelled' }, ...(dateFilter ? { created_at: dateFilter } : {}) },
            }),
        ]);

        // Resolve doctor names for revenue-by-doctor
        const doctorIds = revenueByDoctorRaw
            .map((r: any) => r.ref_id)
            .filter(Boolean) as string[];
        const doctors = doctorIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: doctorIds } },
                select: { id: true, name: true, specialty: true },
            })
            : [];
        const doctorMap = Object.fromEntries(doctors.map((d: any) => [d.id, d]));

        return {
            success: true,
            data: {
                totalInvoices,
                draftInvoices,
                pendingBalance: Number(pendingBalance._sum.balance_due || 0),
                todayRevenue: Number(todayRevenueInv._sum.net_amount || 0),
                totalRevenue: Number(totalRevenueInv._sum.net_amount || 0),
                periodRevenue: Number(periodRevenueInv._sum.net_amount || 0),
                todayCollection: Number(todayCollection._sum.amount || 0),
                totalCollection: Number(totalCollection._sum.amount || 0),
                periodCollection: Number(periodCollection._sum.amount || 0),
                totalPaymentsToday,
                outstandingInvoices,
                revenueByDepartment: revenueByDept.map((d: any) => ({
                    department: d.department,
                    amount: Number(d._sum.net_price || 0),
                })),
                revenueByDoctor: revenueByDoctorRaw
                    .map((r: any) => ({
                        doctorId: r.ref_id,
                        doctorName: doctorMap[r.ref_id]?.name || 'Unknown Doctor',
                        specialty: doctorMap[r.ref_id]?.specialty || '',
                        amount: Number(r._sum.net_price || 0),
                    }))
                    .sort((a: any, b: any) => b.amount - a.amount),
                aging: {
                    days0to30: Number(aging0to30._sum.balance_due || 0),
                    days30to60: Number(aging30to60._sum.balance_due || 0),
                    days60plus: Number(aging60plus._sum.balance_due || 0),
                },
                ipdRevenue: Number(ipdRevenue._sum.net_amount || 0),
                ipdCount: ipdRevenue._count._all,
                opdRevenue: Number(opdRevenue._sum.net_amount || 0),
                opdCount: opdRevenue._count._all,
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
                        invoice_number: await genInvNum(organizationId, 'OPD', false, db),
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
                },
                admissions: {
                    where: { status: 'Admitted' },
                    orderBy: { admission_date: 'desc' },
                    take: 1,
                    select: {
                        admission_id: true,
                        status: true,
                        bed_id: true,
                        ward_id: true,
                    }
                }
            }
        });

        // Flatten active admission for easy access
        const enriched = patients.map((p: any) => ({
            ...p,
            active_admission: p.admissions?.[0] || null,
            is_admitted: (p.admissions?.length || 0) > 0,
        }));
        return { success: true, data: serialize(enriched) };
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

// ============================================
// INVOICE EDITING — Draft + Final-unpaid invoices
// Allows in-place edits with GL reversal/repost on Final.
// Cancelled invoices and invoices with collected payments remain locked.
// ============================================

type InvoiceEditableCheck = {
    editable: boolean;
    reason?: string;
};

function evaluateInvoiceEditable(invoice: any, expectedVersion?: number): InvoiceEditableCheck {
    if (!invoice) return { editable: false, reason: 'Invoice not found.' };
    if (invoice.status === 'Cancelled') {
        return { editable: false, reason: 'Cancelled invoices cannot be edited. Revert first if needed.' };
    }
    // Fully paid check: block edits if there is no outstanding balance and a payment has been collected
    if (Number(invoice.balance_due ?? 0) <= 0 && Number(invoice.paid_amount ?? 0) > 0) {
        return {
            editable: false,
            reason: 'Cannot edit: This invoice is fully paid.',
        };
    }
    if (expectedVersion !== undefined && Number(invoice.version) !== Number(expectedVersion)) {
        return {
            editable: false,
            reason: 'Invoice was modified by another user. Please reload and try again.',
        };
    }
    return { editable: true };
}

// Public read: check whether an invoice is editable from the UI without mutating anything.
export async function checkInvoiceEditable(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();
        const invoice = await db.invoices.findUnique({
            where: { id: invoiceId },
            select: { id: true, status: true, paid_amount: true, balance_due: true, version: true, created_at: true },
        });
        const check = evaluateInvoiceEditable(invoice);
        if (!check.editable) return { success: true, editable: false, reason: check.reason };
        // Period lock check (read-only — we throw the same error message the mutation would)
        try {
            await checkPeriodLock(db, invoice!.created_at as any);
        } catch (e: any) {
            return { success: true, editable: false, reason: e.message };
        }
        return { success: true, editable: true, version: invoice!.version };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// Update a single invoice line item. Recalculates derived fields and invoice totals.
// Use saveInvoiceEdits for batched edits — this is the one-shot helper.
export async function updateInvoiceItem(itemId: number, patch: {
    department?: string;
    description?: string;
    quantity?: number;
    unit_price?: number;
    discount?: number;
    tax_rate?: number;
    hsn_sac_code?: string | null;
    service_category?: string | null;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const item = await db.invoice_items.findUnique({
            where: { id: itemId },
            include: { invoice: true },
        });
        if (!item) return { success: false, error: 'Invoice item not found' };

        const check = evaluateInvoiceEditable(item.invoice);
        if (!check.editable) return { success: false, error: check.reason };

        await checkPeriodLock(db, item.invoice.created_at as any);

        const quantity = patch.quantity !== undefined ? Number(patch.quantity) : Number(item.quantity);
        const unit_price = patch.unit_price !== undefined ? Number(patch.unit_price) : Number(item.unit_price);
        const discount = patch.discount !== undefined ? Number(patch.discount) : Number(item.discount);
        const tax_rate = patch.tax_rate !== undefined ? Number(patch.tax_rate) : Number(item.tax_rate || 0);

        const total_price = quantity * unit_price;
        const net_price = total_price - discount;
        const tax_amount = (net_price * tax_rate) / 100;

        await db.invoice_items.update({
            where: { id: itemId },
            data: {
                department: patch.department ?? item.department,
                description: patch.description ?? item.description,
                quantity,
                unit_price,
                discount,
                tax_rate,
                hsn_sac_code: patch.hsn_sac_code !== undefined ? patch.hsn_sac_code : item.hsn_sac_code,
                service_category: patch.service_category !== undefined ? patch.service_category : item.service_category,
                total_price,
                net_price,
                tax_amount,
            },
        });

        await recalculateInvoice(item.invoice_id);
        await handleGLRepost(item.invoice_id, item.invoice.status);

        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_INVOICE_ITEM',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: item.invoice.invoice_number,
                details: JSON.stringify({ item_id: itemId, patch }),
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        console.error('updateInvoiceItem error:', error);
        return { success: false, error: error.message };
    }
}

// Update header-only fields (no item changes, no totals impact).
export async function updateInvoiceHeader(invoiceId: number, patch: {
    notes?: string;
    billing_patient_type?: string;
    corporate_id?: string | null;
    tpa_provider_id?: number | null;
    pre_auth_id?: string | null;
    patient_payable?: number;
    corporate_payable?: number;
    tpa_payable?: number;
    concession_amount?: number;
    concession_reason?: string;
    is_inter_state?: boolean;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
        if (!invoice) return { success: false, error: 'Invoice not found' };

        const check = evaluateInvoiceEditable(invoice);
        if (!check.editable) return { success: false, error: check.reason };

        await checkPeriodLock(db, invoice.created_at as any);

        const data: any = {};
        if (patch.notes !== undefined) data.notes = patch.notes;
        if (patch.billing_patient_type !== undefined) data.billing_patient_type = patch.billing_patient_type;
        if (patch.corporate_id !== undefined) data.corporate_id = patch.corporate_id;
        if (patch.tpa_provider_id !== undefined) data.tpa_provider_id = patch.tpa_provider_id;
        if (patch.pre_auth_id !== undefined) data.pre_auth_id = patch.pre_auth_id;
        if (patch.patient_payable !== undefined) data.patient_payable = patch.patient_payable;
        if (patch.corporate_payable !== undefined) data.corporate_payable = patch.corporate_payable;
        if (patch.tpa_payable !== undefined) data.tpa_payable = patch.tpa_payable;
        if (patch.concession_amount !== undefined) data.concession_amount = patch.concession_amount;
        if (patch.concession_reason !== undefined) data.concession_reason = patch.concession_reason;
        if (patch.is_inter_state !== undefined) data.is_inter_state = patch.is_inter_state;
        data.version = { increment: 1 };

        await db.invoices.update({ where: { id: invoiceId }, data });

        // If tax split toggle changed, the CGST/SGST vs IGST allocation must be refreshed.
        if (patch.is_inter_state !== undefined) {
            await recalculateInvoice(invoiceId);
            await handleGLRepost(invoiceId, invoice.status);
        }

        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_INVOICE_HEADER',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({ patch }),
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        console.error('updateInvoiceHeader error:', error);
        return { success: false, error: error.message };
    }
}

// Reverse the existing GL journal for an invoice and re-post fresh.
// Called after totals change on a Final invoice. Safe to call on Draft (no-op).
async function handleGLRepost(invoiceId: number, status: string) {
    if (status !== 'Final') return; // Draft has no GL entry to reverse
    try {
        const { db, session } = await requireTenantContext();
        const existing = await db.gL_JournalEntry.findFirst({
            where: {
                reference_type: 'Invoice',
                reference_id: invoiceId.toString(),
                status: { not: 'Reversed' },
            },
        });
        if (existing) {
            const actor = (session as any)?.username || (session as any)?.name || undefined;
            await reverseJournalEntry(existing.id, 'Invoice edit — totals changed', actor);
        }
        // postInvoiceToGL is idempotent on non-reversed entries — after reversal it posts fresh
        await postInvoiceToGL(invoiceId).catch(err => console.error('GL repost failed:', err));
    } catch (err) {
        console.error('handleGLRepost error:', err);
    }
}

/**
 * Opt-in: re-post existing Final invoices to the GL so historical vouchers adopt
 * the new (receivable-by-type + departmental-revenue + GST-split + bill-wise)
 * structure. SAFE: reuses handleGLRepost (reverse + re-post, full audit trail, no
 * deletes, idempotency guarded). Skips locked financial periods and (by default)
 * invoices whose GL voucher is already synced to Tally. dryRun reports eligibility
 * only. Admin / finance only. NEVER run as an automatic migration.
 */
export async function repostInvoicesGL(opts: { from?: string; to?: string; dryRun?: boolean; skipSynced?: boolean } = {}) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(['admin', 'finance']);

        const where: any = { status: 'Final' };
        if (opts.from || opts.to) {
            where.created_at = {};
            if (opts.from) where.created_at.gte = new Date(opts.from);
            if (opts.to) where.created_at.lte = new Date(opts.to + 'T23:59:59.999');
        }
        const invoices = await db.invoices.findMany({ where, select: { id: true, invoice_number: true, created_at: true } });

        // Live (non-reversed) Invoice GL entries for these invoices.
        const refIds = invoices.map((i: any) => String(i.id));
        const liveEntries = refIds.length
            ? await db.gL_JournalEntry.findMany({ where: { reference_type: 'Invoice', reference_id: { in: refIds }, status: { not: 'Reversed' } }, select: { id: true, reference_id: true } })
            : [];
        const liveRefs = new Set(liveEntries.map((e: any) => e.reference_id));

        // Invoices whose voucher is already synced to Tally (skip by default).
        const skipSynced = opts.skipSynced !== false;
        const syncedRefs = new Set<string>();
        if (skipSynced && liveEntries.length) {
            const refByJournal = new Map<string, string>(liveEntries.map((e: any) => [e.id, e.reference_id]));
            const synced = await db.tallyVoucherMapping.findMany({ where: { gl_journal_entry_id: { in: liveEntries.map((e: any) => e.id) }, sync_status: 'synced' }, select: { gl_journal_entry_id: true } });
            for (const m of synced) { const r = refByJournal.get(m.gl_journal_entry_id); if (r) syncedRefs.add(r); }
        }

        const eligible: any[] = [];
        let skippedNoEntry = 0, skippedLocked = 0, skippedSynced = 0;
        for (const inv of invoices) {
            const ref = String(inv.id);
            if (!liveRefs.has(ref)) { skippedNoEntry++; continue; }
            if (skipSynced && syncedRefs.has(ref)) { skippedSynced++; continue; }
            try { await checkPeriodLock(db, new Date(inv.created_at)); } catch { skippedLocked++; continue; }
            eligible.push(inv);
        }

        if (opts.dryRun) {
            return { success: true, dryRun: true, eligible: eligible.length, total: invoices.length, skippedNoEntry, skippedLocked, skippedSynced, sample: eligible.slice(0, 10).map((i: any) => i.invoice_number) };
        }

        let reposted = 0, failed = 0;
        const warnings: string[] = [];
        for (const inv of eligible) {
            try { await handleGLRepost(inv.id, 'Final'); reposted++; }
            catch (e: any) { failed++; if (warnings.length < 5) warnings.push(`${inv.invoice_number}: ${e?.message || 'repost failed'}`); }
        }
        await logAudit({ action: 'REPOST_INVOICES_GL', module: 'finance', entity_type: 'gl', entity_id: organizationId, details: JSON.stringify({ reposted, failed, from: opts.from, to: opts.to }) });
        return { success: failed === 0, reposted, failed, eligible: eligible.length, skippedNoEntry, skippedLocked, skippedSynced, warnings: warnings.length ? warnings : undefined };
    } catch (e: any) {
        return { success: false, error: e?.name === 'ForbiddenError' ? 'Only finance/admin can re-post the GL.' : e.message };
    }
}

// Batched save used by EditInvoiceModal. Applies item updates / adds / removes
// + header diff atomically, then refreshes GL once.
export async function saveInvoiceEdits(invoiceId: number, payload: {
    expected_version: number;
    header?: Parameters<typeof updateInvoiceHeader>[1];
    items_to_update?: Array<{
        id: number;
        department?: string;
        description?: string;
        quantity?: number;
        unit_price?: number;
        discount?: number;
        tax_rate?: number;
        hsn_sac_code?: string | null;
        service_category?: string | null;
    }>;
    items_to_add?: Array<{
        department: string;
        description: string;
        quantity: number;
        unit_price: number;
        discount?: number;
        tax_rate?: number;
        hsn_sac_code?: string | null;
        service_category?: string | null;
        ref_id?: string;
    }>;
    items_to_remove?: number[];
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
        if (!invoice) return { success: false, error: 'Invoice not found' };

        const check = evaluateInvoiceEditable(invoice, payload.expected_version);
        if (!check.editable) return { success: false, error: check.reason };

        await checkPeriodLock(db, invoice.created_at as any);

        const originalStatus = invoice.status;

        // Apply all mutations in a single transaction so a mid-save failure rolls back.
        await db.$transaction(async (tx: any) => {
            // Removes first — frees up IDs / decouples references
            if (payload.items_to_remove?.length) {
                await tx.invoice_items.deleteMany({
                    where: { id: { in: payload.items_to_remove }, invoice_id: invoiceId },
                });
            }

            // Updates
            for (const u of payload.items_to_update ?? []) {
                const existing = await tx.invoice_items.findUnique({ where: { id: u.id } });
                if (!existing || existing.invoice_id !== invoiceId) continue;

                const quantity = u.quantity !== undefined ? Number(u.quantity) : Number(existing.quantity);
                const unit_price = u.unit_price !== undefined ? Number(u.unit_price) : Number(existing.unit_price);
                const discount = u.discount !== undefined ? Number(u.discount) : Number(existing.discount);
                const tax_rate = u.tax_rate !== undefined ? Number(u.tax_rate) : Number(existing.tax_rate || 0);

                const total_price = quantity * unit_price;
                const net_price = total_price - discount;
                const tax_amount = (net_price * tax_rate) / 100;

                await tx.invoice_items.update({
                    where: { id: u.id },
                    data: {
                        department: u.department ?? existing.department,
                        description: u.description ?? existing.description,
                        quantity,
                        unit_price,
                        discount,
                        tax_rate,
                        hsn_sac_code: u.hsn_sac_code !== undefined ? u.hsn_sac_code : existing.hsn_sac_code,
                        service_category: u.service_category !== undefined ? u.service_category : existing.service_category,
                        total_price,
                        net_price,
                        tax_amount,
                    },
                });
            }

            // Adds
            for (const a of payload.items_to_add ?? []) {
                const quantity = Number(a.quantity);
                const unit_price = Number(a.unit_price);
                const discount = Number(a.discount || 0);
                const tax_rate = Number(a.tax_rate || 0);
                const total_price = quantity * unit_price;
                const net_price = total_price - discount;
                const tax_amount = (net_price * tax_rate) / 100;

                await tx.invoice_items.create({
                    data: {
                        invoice_id: invoiceId,
                        department: a.department,
                        description: a.description,
                        quantity,
                        unit_price,
                        discount,
                        tax_rate,
                        total_price,
                        net_price,
                        tax_amount,
                        hsn_sac_code: a.hsn_sac_code || null,
                        service_category: a.service_category || null,
                        ref_id: a.ref_id || null,
                    },
                });
            }

            // Header diff
            if (payload.header) {
                const h: any = {};
                const p = payload.header;
                if (p.notes !== undefined) h.notes = p.notes;
                if (p.billing_patient_type !== undefined) h.billing_patient_type = p.billing_patient_type;
                if (p.corporate_id !== undefined) h.corporate_id = p.corporate_id;
                if (p.tpa_provider_id !== undefined) h.tpa_provider_id = p.tpa_provider_id;
                if (p.pre_auth_id !== undefined) h.pre_auth_id = p.pre_auth_id;
                if (p.patient_payable !== undefined) h.patient_payable = p.patient_payable;
                if (p.corporate_payable !== undefined) h.corporate_payable = p.corporate_payable;
                if (p.tpa_payable !== undefined) h.tpa_payable = p.tpa_payable;
                if (p.concession_amount !== undefined) h.concession_amount = p.concession_amount;
                if (p.concession_reason !== undefined) h.concession_reason = p.concession_reason;
                if (p.is_inter_state !== undefined) h.is_inter_state = p.is_inter_state;
                if (Object.keys(h).length) {
                    await tx.invoices.update({ where: { id: invoiceId }, data: h });
                }
            }
        });

        // Recalculate totals from the new line items + GL refresh outside the tx
        // (gl-actions use the top-level prisma client, not our tx).
        await recalculateInvoice(invoiceId);
        await handleGLRepost(invoiceId, originalStatus);

        const updated = await db.invoices.findUnique({ where: { id: invoiceId } });

        await db.system_audit_logs.create({
            data: {
                action: 'UPDATE_INVOICE',
                module: 'finance',
                entity_type: 'invoice',
                entity_id: invoice.invoice_number,
                details: JSON.stringify({
                    expected_version: payload.expected_version,
                    new_version: updated?.version,
                    status: originalStatus,
                    updated_count: payload.items_to_update?.length ?? 0,
                    added_count: payload.items_to_add?.length ?? 0,
                    removed_count: payload.items_to_remove?.length ?? 0,
                    header_changed: !!payload.header && Object.keys(payload.header).length > 0,
                    totals_after: {
                        total_amount: Number(updated?.total_amount ?? 0),
                        total_discount: Number(updated?.total_discount ?? 0),
                        total_tax: Number(updated?.total_tax ?? 0),
                        net_amount: Number(updated?.net_amount ?? 0),
                        balance_due: Number(updated?.balance_due ?? 0),
                    },
                }),
                organizationId,
            },
        });

        return { success: true, data: serialize(updated) };
    } catch (error: any) {
        console.error('saveInvoiceEdits error:', error);
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

export type DrillDownType =
    | 'today-revenue' | 'total-revenue' | 'expenses' | 'outstanding' | 'drafts' | 'deposits'
    | 'department' | 'doctor' | 'ipd' | 'opd';

export async function getDrillDownData(type: DrillDownType, filters: Record<string, any>) {
    try {
        const { db } = await requireTenantContext();
        const INR = '₹';
        const fmt = (n: number) => `${INR}${Number(n).toLocaleString('en-IN')}`;

        if (type === 'today-revenue') {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const payments = await db.payments.findMany({
                where: { status: 'Completed', created_at: { gte: today } },
                include: { invoice: { select: { invoice_number: true, patient: { select: { full_name: true } } } } },
                orderBy: { created_at: 'desc' },
                take: 200,
            });
            return {
                success: true, data: {
                    title: "Today's Payments",
                    columns: ['Receipt #', 'Patient', 'Method', 'Amount', 'Time'],
                    rows: serialize(payments).map((p: any) => ({
                        receipt: p.receipt_number,
                        patient: p.invoice?.patient?.full_name || '-',
                        method: p.payment_method,
                        amount: fmt(Number(p.amount)),
                        time: new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    })),
                },
            };
        }

        if (type === 'total-revenue') {
            const invoices = await db.invoices.findMany({
                where: { status: { not: 'Cancelled' } },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: 'All Revenue — Invoices',
                    columns: ['Invoice #', 'Patient', 'Type', 'Net Amount', 'Status'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(Number(inv.net_amount)),
                        status: inv.status,
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'expenses') {
            const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
            const expenses = await db.expense.findMany({
                where: { created_at: { gte: firstOfMonth } },
                include: { category: { select: { name: true } }, vendor: { select: { vendor_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 200,
            });
            return {
                success: true, data: {
                    title: "This Month's Expenses",
                    columns: ['Expense #', 'Category', 'Description', 'Amount', 'Status', 'Date'],
                    rows: serialize(expenses).map((e: any) => ({
                        expense: e.expense_number,
                        category: e.category?.name || '-',
                        description: e.description,
                        amount: fmt(Number(e.total_amount)),
                        status: e.status,
                        date: new Date(e.created_at).toLocaleDateString('en-IN'),
                    })),
                },
            };
        }

        if (type === 'outstanding') {
            const now = new Date();
            const invoices = await db.invoices.findMany({
                where: { status: { in: ['Final', 'Partial'] }, balance_due: { gt: 0 } },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'asc' },
                take: 200,
            });
            return {
                success: true, data: {
                    title: 'Pending / Outstanding Invoices',
                    columns: ['Invoice #', 'Patient', 'Net Amount', 'Balance Due', 'Age (days)'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        amount: fmt(Number(inv.net_amount)),
                        balance: fmt(Number(inv.balance_due)),
                        age: Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 'd',
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'drafts') {
            const invoices = await db.invoices.findMany({
                where: { status: 'Draft' },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 200,
            });
            return {
                success: true, data: {
                    title: 'Draft Bills — Awaiting Finalization',
                    columns: ['Invoice #', 'Patient', 'Type', 'Amount', 'Created'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(Number(inv.net_amount)),
                        created: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'deposits') {
            const deposits = await db.patientDeposit.findMany({
                where: { status: 'Active' },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 200,
            });
            return {
                success: true, data: {
                    title: 'Active Patient Deposits',
                    columns: ['Patient', 'Collected', 'Applied', 'Balance', 'Date'],
                    rows: serialize(deposits).map((d: any) => ({
                        patient: d.patient?.full_name || d.patient_id,
                        collected: fmt(Number(d.amount)),
                        applied: fmt(Number(d.applied_amount || 0)),
                        balance: fmt(Number(d.amount) - Number(d.applied_amount || 0)),
                        date: new Date(d.created_at).toLocaleDateString('en-IN'),
                    })),
                },
            };
        }

        if (type === 'department') {
            const dept = filters.department;
            if (typeof dept !== 'string' || !dept.trim()) {
                return { success: false, error: 'Department filter is required' };
            }
            const invoices = await db.invoices.findMany({
                where: {
                    status: { not: 'Cancelled' },
                    items: { some: { department: dept } },
                },
                include: {
                    patient: { select: { full_name: true } },
                    items: { where: { department: dept }, select: { net_price: true, description: true } },
                },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: `Revenue — ${dept}`,
                    columns: ['Invoice #', 'Patient', 'Type', 'Dept Revenue', 'Status', 'Date'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(inv.items.reduce((s: number, it: any) => s + Number(it.net_price), 0)),
                        status: inv.status,
                        date: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'doctor') {
            const doctorId = filters.doctorId;
            const doctorName = filters.doctorName || 'Unknown Doctor';
            if (typeof doctorId !== 'string' || !doctorId.trim()) {
                return { success: false, error: 'Doctor ID filter is required' };
            }
            const invoices = await db.invoices.findMany({
                where: {
                    status: { not: 'Cancelled' },
                    items: { some: { ref_id: doctorId, service_category: 'Consultation' } },
                },
                include: {
                    patient: { select: { full_name: true } },
                    items: { where: { ref_id: doctorId, service_category: 'Consultation' }, select: { net_price: true } },
                },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: `Consultation Revenue — ${doctorName}`,
                    columns: ['Invoice #', 'Patient', 'Type', 'Consultation Fee', 'Status', 'Date'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        type: inv.invoice_type,
                        amount: fmt(inv.items.reduce((s: number, it: any) => s + Number(it.net_price), 0)),
                        status: inv.status,
                        date: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        if (type === 'ipd' || type === 'opd') {
            const invoiceType = type.toUpperCase();
            const invoices = await db.invoices.findMany({
                where: { invoice_type: invoiceType, status: { not: 'Cancelled' } },
                include: { patient: { select: { full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: 100,
            });
            return {
                success: true, data: {
                    title: `${invoiceType} Invoices`,
                    columns: ['Invoice #', 'Patient', 'Net Amount', 'Paid', 'Balance', 'Status', 'Date'],
                    rows: serialize(invoices).map((inv: any) => ({
                        invoice: inv.invoice_number,
                        patient: inv.patient?.full_name || inv.patient_id,
                        amount: fmt(Number(inv.net_amount)),
                        paid: fmt(Number(inv.paid_amount)),
                        balance: fmt(Number(inv.balance_due)),
                        status: inv.status,
                        date: new Date(inv.created_at).toLocaleDateString('en-IN'),
                        invoiceId: inv.id,
                    })),
                },
            };
        }

        return { success: false, error: 'Unknown drill-down type' };
    } catch (error: any) {
        console.error('getDrillDownData error:', error);
        return { success: false, error: error.message };
    }
}

