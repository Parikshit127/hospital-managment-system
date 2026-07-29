'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function importBankStatement(rows: {
    transaction_date: string;
    description: string;
    reference: string;
    debit: number;
    credit: number;
    balance: number;
    bank_account: string;
}[]) {
    try {
        const { db } = await requireTenantContext();

        const created = await db.bankTransaction.createMany({
            data: rows.map(r => ({
                transaction_date: new Date(r.transaction_date),
                description: r.description,
                reference: r.reference || '',
                debit: r.debit || 0,
                credit: r.credit || 0,
                balance: r.balance || 0,
                bank_account: r.bank_account || 'Primary',
                reconciled: false,
            })),
        });

        return { success: true, data: { count: created.count } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getBankTransactions(filters?: { reconciled?: boolean; bank_account?: string }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.reconciled !== undefined) where.reconciled = filters.reconciled;
        if (filters?.bank_account) where.bank_account = filters.bank_account;

        const txns = await db.bankTransaction.findMany({
            where,
            orderBy: { transaction_date: 'desc' },
            take: 500,
        });
        return { success: true, data: serialize(txns) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function matchBankTransaction(bankTxnId: number, match: { payment_id?: number; expense_id?: number }) {
    try {
        const { db } = await requireTenantContext();

        await db.bankTransaction.update({
            where: { id: bankTxnId },
            data: {
                matched_payment_id: match.payment_id || null,
                matched_expense_id: match.expense_id || null,
                reconciled: true,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function autoReconcile() {
    try {
        const { db } = await requireTenantContext();

        // Get unreconciled bank transactions
        const unmatched = await db.bankTransaction.findMany({
            where: { reconciled: false },
        });

        let matchedCount = 0;

        for (const txn of unmatched) {
            const amount = Number(txn.credit) > 0 ? Number(txn.credit) : Number(txn.debit);
            if (amount <= 0) continue;

            if (Number(txn.credit) > 0) {
                // Credit = incoming payment — match by amount and approximate date
                const payment = await db.payments.findFirst({
                    where: {
                        amount: { gte: amount - 0.01, lte: amount + 0.01 },
                        status: 'Completed',
                        created_at: {
                            gte: new Date(new Date(txn.transaction_date).getTime() - 3 * 86400000),
                            lte: new Date(new Date(txn.transaction_date).getTime() + 3 * 86400000),
                        },
                    },
                });

                if (payment) {
                    // Make sure this payment isn't already matched
                    const alreadyMatched = await db.bankTransaction.findFirst({
                        where: { matched_payment_id: payment.id, reconciled: true },
                    });
                    if (!alreadyMatched) {
                        await db.bankTransaction.update({
                            where: { id: txn.id },
                            data: { matched_payment_id: payment.id, reconciled: true },
                        });
                        matchedCount++;
                    }
                }
            } else {
                // Debit = outgoing expense
                const expense = await db.expense.findFirst({
                    where: {
                        total_amount: { gte: amount - 0.01, lte: amount + 0.01 },
                        status: 'Paid',
                        payment_date: {
                            gte: new Date(new Date(txn.transaction_date).getTime() - 3 * 86400000),
                            lte: new Date(new Date(txn.transaction_date).getTime() + 3 * 86400000),
                        },
                    },
                });

                if (expense) {
                    const alreadyMatched = await db.bankTransaction.findFirst({
                        where: { matched_expense_id: expense.id, reconciled: true },
                    });
                    if (!alreadyMatched) {
                        await db.bankTransaction.update({
                            where: { id: txn.id },
                            data: { matched_expense_id: expense.id, reconciled: true },
                        });
                        matchedCount++;
                    }
                }
            }
        }

        return { success: true, data: { matchedCount, totalUnmatched: unmatched.length } };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getReconciliationSummary() {
    try {
        const { db } = await requireTenantContext();

        const [total, reconciled, unreconciled] = await Promise.all([
            db.bankTransaction.count(),
            db.bankTransaction.count({ where: { reconciled: true } }),
            db.bankTransaction.count({ where: { reconciled: false } }),
        ]);

        const unreconciledTxns = await db.bankTransaction.findMany({
            where: { reconciled: false },
        });

        const totalUnreconciledAmount = unreconciledTxns.reduce(
            (s: number, t: any) => s + (Number(t.credit) > 0 ? Number(t.credit) : Number(t.debit)),
            0
        );

        return {
            success: true,
            data: {
                total,
                reconciled,
                unreconciled,
                totalUnreconciledAmount,
                reconciliationRate: total > 0 ? ((reconciled / total) * 100).toFixed(1) : '0',
            },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
