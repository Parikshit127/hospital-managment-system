'use server';

import { requireTenantContext } from '@/backend/tenant';
import { generateDepositNumber as genDepNum } from '@/app/lib/sequence-generator';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

function generateCreditNoteNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `CN-${dateStr}-${seq}`;
}

// ============================================
// DEPOSITS / ADVANCES
// ============================================

export async function collectDeposit(data: {
    patient_id: string;
    admission_id?: string;
    amount: number;
    payment_method: string;
    payment_ref?: string;
    notes?: string;
}) {
    try {
        const { db, session, organizationId } = await requireTenantContext();

        // The deposit form takes a free-typed UHID, so normalize and validate it before
        // saving. Trim stray whitespace (a trailing tab once broke the receipt's name
        // lookup) and reject anything that isn't a real patient — invoice/deposit numbers
        // were being saved into patient_id, leaving receipts with an ID but no name.
        const patientId = (data.patient_id || '').trim();
        const admissionId = (data.admission_id || '').trim() || null;
        if (!patientId) return { success: false, error: 'Patient UHID is required' };
        const patient = await db.OPD_REG.findFirst({
            where: { patient_id: patientId, organizationId },
            select: { patient_id: true },
        });
        if (!patient) {
            return { success: false, error: `No patient found with UHID "${patientId}". Enter a valid patient UHID (e.g. AVS-2026-00001).` };
        }

        const deposit = await db.patientDeposit.create({
            data: {
                deposit_number: await genDepNum(organizationId, db),
                patient_id: patientId,
                admission_id: admissionId,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_ref: data.payment_ref || null,
                collected_by: session.username,
                notes: data.notes || null,
                status: 'Active',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'COLLECT_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ patient_id: patientId, amount: data.amount }),
                organizationId,
            },
        });

        return { success: true, data: serialize(deposit) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPatientDeposits(patientId?: string) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (patientId) where.patient_id = patientId;
        const deposits = await db.patientDeposit.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 200,
        });

        // Attach patient name (PatientDeposit has no relation, so resolve by patient_id)
        const patientIds = [...new Set(deposits.map((d: any) => d.patient_id))];
        const patients = patientIds.length
            ? await db.oPD_REG.findMany({
                where: { patient_id: { in: patientIds } },
                select: { patient_id: true, full_name: true },
            })
            : [];
        const nameById = new Map(patients.map((p: any) => [p.patient_id, p.full_name]));
        const enriched = deposits.map((d: any) => ({
            ...d,
            patient_name: nameById.get(d.patient_id) || null,
        }));

        return { success: true, data: serialize(enriched) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getActiveDeposits() {
    try {
        const { db } = await requireTenantContext();
        const deposits = await db.patientDeposit.findMany({
            where: { status: 'Active' },
            orderBy: { created_at: 'desc' },
        });
        return { success: true, data: serialize(deposits) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function applyDepositToInvoice(depositId: number, invoiceId: number, amount: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const deposit = await db.patientDeposit.findFirst({ where: { id: depositId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };

        const available = Number(deposit.amount) - Number(deposit.applied_amount) - Number(deposit.refunded_amount);
        if (available <= 0) return { success: false, error: 'No balance available in this deposit' };

        // Apply only what's available — don't exceed deposit balance
        const applyAmount = Math.min(available, amount);

        // Create a payment on the invoice
        const receiptNum = `RCP-DEP-${Date.now()}`;
        await db.payments.create({
            data: {
                receipt_number: receiptNum,
                invoice_id: invoiceId,
                amount: applyAmount,
                payment_method: 'Deposit',
                payment_type: 'Settlement',
                status: 'Completed',
                notes: `Applied from deposit ${deposit.deposit_number}`,
                // Money was received when the deposit was collected — keep that date
                // on the receipt, not the (later) date it was applied to the bill.
                created_at: deposit.created_at,
            },
        });

        // Update deposit
        const newApplied = Number(deposit.applied_amount) + applyAmount;
        const newStatus = newApplied >= Number(deposit.amount) ? 'Applied' : 'Active';
        await db.patientDeposit.update({
            where: { id: depositId },
            data: { applied_to_invoice: invoiceId, applied_amount: newApplied, status: newStatus },
        });

        // Recalculate invoice
        const allPayments = await db.payments.findMany({ where: { invoice_id: invoiceId, status: 'Completed' } });
        const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
        const invoice = await db.invoices.findUnique({ where: { id: invoiceId } });
        const netAmount = Number(invoice?.net_amount || 0);
        const balance = netAmount - totalPaid;

        await db.invoices.update({
            where: { id: invoiceId },
            data: {
                paid_amount: totalPaid,
                balance_due: balance > 0 ? balance : 0,
                status: balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : invoice?.status,
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'APPLY_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ invoiceId, amount: applyAmount }),
                organizationId,
            },
        });

        return { success: true, applied: applyAmount };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function refundDeposit(depositId: number, amount: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const deposit = await db.patientDeposit.findFirst({ where: { id: depositId } });
        if (!deposit) return { success: false, error: 'Deposit not found' };

        const available = Number(deposit.amount) - Number(deposit.applied_amount) - Number(deposit.refunded_amount);
        if (amount > available) return { success: false, error: `Only ${available} available to refund` };

        const newRefunded = Number(deposit.refunded_amount) + amount;
        const totalUsed = Number(deposit.applied_amount) + newRefunded;
        const newStatus = totalUsed >= Number(deposit.amount) ? 'Refunded' : 'Active';

        await db.patientDeposit.update({
            where: { id: depositId },
            data: { refunded_amount: newRefunded, status: newStatus },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'REFUND_DEPOSIT',
                module: 'finance',
                entity_type: 'deposit',
                entity_id: deposit.deposit_number,
                details: JSON.stringify({ amount }),
                organizationId,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDepositStats() {
    try {
        const { db } = await requireTenantContext();
        const [activeDeposits, totalCollected, totalApplied, totalRefunded] = await Promise.all([
            db.patientDeposit.count({ where: { status: 'Active' } }),
            db.patientDeposit.aggregate({ _sum: { amount: true } }),
            db.patientDeposit.aggregate({ _sum: { applied_amount: true } }),
            db.patientDeposit.aggregate({ _sum: { refunded_amount: true } }),
        ]);
        return {
            success: true,
            data: {
                activeDeposits,
                totalCollected: Number(totalCollected._sum.amount || 0),
                totalApplied: Number(totalApplied._sum.applied_amount || 0),
                totalRefunded: Number(totalRefunded._sum.refunded_amount || 0),
                activeBalance: Number(totalCollected._sum.amount || 0) - Number(totalApplied._sum.applied_amount || 0) - Number(totalRefunded._sum.refunded_amount || 0),
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// CREDIT NOTES
// ============================================

export async function createCreditNote(data: {
    original_invoice_id: number;
    reason: string;
    items?: string;
    total_amount: number;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const cn = await db.creditNote.create({
            data: {
                credit_note_number: generateCreditNoteNumber(),
                original_invoice_id: data.original_invoice_id,
                reason: data.reason,
                items: data.items || null,
                total_amount: data.total_amount,
                notes: data.notes || null,
                status: 'Draft',
            },
        });

        await db.system_audit_logs.create({
            data: {
                action: 'CREATE_CREDIT_NOTE',
                module: 'finance',
                entity_type: 'credit_note',
                entity_id: cn.credit_note_number,
                details: JSON.stringify({ invoice_id: data.original_invoice_id, amount: data.total_amount }),
                organizationId,
            },
        });

        return { success: true, data: serialize(cn) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

function decToNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof (value as any)?.toNumber === 'function') {
    return Number((value as any).toNumber());
  }
  return Number(value) || 0;
}

export async function approveCreditNote(id: number) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        
        const result = await db.$transaction(async (tx: any) => {
            const cn = await tx.creditNote.findUnique({
                where: { id },
            });
            if (!cn) throw new Error('Credit note not found');
            if (cn.status !== 'Draft') throw new Error(`Cannot approve credit note in status ${cn.status}`);

            const amount = decToNum(cn.total_amount);

            // Fetch original invoice
            const invoice = await tx.invoices.findUnique({
                where: { id: cn.original_invoice_id },
            });
            if (!invoice) throw new Error('Original invoice not found');

            // Calculate GST proportionally
            const invoiceTotal = decToNum(invoice.total_amount);
            const invoiceCgst = decToNum(invoice.cgst_amount);
            const invoiceSgst = decToNum(invoice.sgst_amount);
            const invoiceIgst = decToNum(invoice.igst_amount);
            const invoiceGst = invoiceCgst + invoiceSgst + invoiceIgst;
            const invoiceTaxable = invoiceTotal - invoiceGst;

            let cnTaxable = amount;
            let cnCgst = 0;
            let cnSgst = 0;
            let cnIgst = 0;

            if (invoiceTotal > 0) {
                const ratio = amount / invoiceTotal;
                cnTaxable = ratio * invoiceTaxable;
                cnCgst = ratio * invoiceCgst;
                cnSgst = ratio * invoiceSgst;
                cnIgst = ratio * invoiceIgst;
            }

            // Find GL accounts
            const [receivableAccount, revenueAccount, cgstAccount, sgstAccount, igstAccount] = await Promise.all([
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '1130', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '6000', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '3120', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '3121', is_active: true } }),
                tx.gL_Account.findFirst({ where: { organizationId, account_code: '3122', is_active: true } }),
            ]);

            if (!receivableAccount || !revenueAccount) {
                throw new Error('Required receivable (1130) or revenue (6000) GL accounts not found. Ensure Chart of Accounts is seeded.');
            }

            // Update credit note status to Applied (approve + apply in one step)
            const updatedCn = await tx.creditNote.update({
                where: { id },
                data: { status: 'Applied', approved_by: session.username },
            });

            // Update original invoice balance
            const newBalance = Math.max(0, decToNum(invoice.balance_due) - amount);
            const isFullyPaid = newBalance <= 0.01;
            await tx.invoices.update({
                where: { id: cn.original_invoice_id },
                data: {
                    balance_due: newBalance,
                    status: isFullyPaid ? 'Paid' : invoice.status,
                },
            });

            // Generate unique journal number
            const year = new Date().getFullYear();
            const prefix = `JV-CN-${year}-`;
            const count = await tx.gL_JournalEntry.count({
                where: { organizationId, journal_number: { startsWith: prefix } },
            });
            const journalNumber = `${prefix}${String(count + 1).padStart(4, "0")}`;

            // Create Journal Lines list
            const journalLines = [];
            let lineNum = 1;

            // 1. DR: Revenue Account (Taxable component)
            if (cnTaxable > 0) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: revenueAccount.id,
                    debit_amount: cnTaxable,
                    credit_amount: 0,
                    description: `Credit Note - Revenue Reversal`,
                });
            }

            // 2. DR: CGST Account
            if (cnCgst > 0 && cgstAccount) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: cgstAccount.id,
                    debit_amount: cnCgst,
                    credit_amount: 0,
                    description: `Credit Note - CGST Reversal`,
                });
            }

            // 3. DR: SGST Account
            if (cnSgst > 0 && sgstAccount) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: sgstAccount.id,
                    debit_amount: cnSgst,
                    credit_amount: 0,
                    description: `Credit Note - SGST Reversal`,
                });
            }

            // 4. DR: IGST Account
            if (cnIgst > 0 && igstAccount) {
                journalLines.push({
                    organizationId,
                    line_number: lineNum++,
                    account_id: igstAccount.id,
                    debit_amount: cnIgst,
                    credit_amount: 0,
                    description: `Credit Note - IGST Reversal`,
                });
            }

            // 5. CR: Receivable Account (Total credit note amount)
            journalLines.push({
                organizationId,
                line_number: lineNum++,
                account_id: receivableAccount.id,
                debit_amount: 0,
                credit_amount: amount,
                description: `Receivable adjustment via credit note`,
            });

            // Create GL Journal Entry
            await tx.gL_JournalEntry.create({
                data: {
                    organizationId,
                    journal_number: journalNumber,
                    entry_date: new Date(),
                    entry_type: 'Adjustment',
                    reference_type: 'CreditNote',
                    reference_id: String(cn.id),
                    reference_number: cn.credit_note_number,
                    narration: `Credit Note ${cn.credit_note_number} approved — ${cn.reason}`,
                    total_debit: amount,
                    total_credit: amount,
                    status: 'Posted',
                    created_by: session.username ?? null,
                    lines: {
                        create: journalLines,
                    },
                },
            });

            // Update GL Account balances
            for (const line of journalLines) {
                const isDebitLine = line.debit_amount > 0;
                const lineAmount = isDebitLine ? line.debit_amount : line.credit_amount;
                const glAcc = await tx.gL_Account.findUnique({ where: { id: line.account_id } });
                if (glAcc) {
                    const balanceChange = glAcc.normal_balance === 'Debit'
                        ? (isDebitLine ? lineAmount : -lineAmount)
                        : (isDebitLine ? -lineAmount : lineAmount);
                    await tx.gL_Account.update({
                        where: { id: line.account_id },
                        data: {
                            current_balance: {
                                increment: balanceChange,
                            },
                        },
                    });
                }
            }

            return updatedCn;
        });

        return { success: true, data: serialize(result) };
    } catch (error: any) {
        console.error('approveCreditNote error:', error);
        return { success: false, error: error.message };
    }
}

export async function getCreditNotes(filters?: { status?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        const notes = await db.creditNote.findMany({
            where,
            include: {
                original_invoice: { select: { invoice_number: true, patient_id: true, net_amount: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
        return { success: true, data: serialize(notes) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
