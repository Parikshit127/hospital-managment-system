/**
 * Server-side helpers for doctor invoices. Plain util (not a server action) —
 * called inside a $transaction with the tenant db's `tx`.
 *
 * DoctorCommission / DoctorPayoutStatement / DoctorPayoutPayment are not in the
 * tenant extension's scoped list, so every query here filters organizationId by hand.
 */

import { Prisma } from '@prisma/client';
import { invoiceTotals, paymentState, r2 } from '@/app/lib/doctor-invoice-calc';

type Tx = any;

const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Re-derive everything stored on a statement from its lines + payments:
 * gross (incl. adjustment), TDS, net, paid, status, last-payment fields.
 * Idempotent — call after any line, TDS, adjustment or payment change.
 */
export async function recomputeDoctorStatement(tx: Tx, organizationId: string, statementId: string) {
    const stmt = await tx.doctorPayoutStatement.findFirst({ where: { id: statementId, organizationId } });
    if (!stmt) throw new Error('Doctor invoice not found');

    const lines = await tx.doctorCommission.findMany({
        where: { statement_id: statementId, organizationId, status: { not: 'void' } },
        select: { id: true, commission_amount: true },
    });
    const tdsRate = toNum(stmt.tds_rate_percent);
    const totals = invoiceTotals(
        lines.map((l: any) => toNum(l.commission_amount)),
        toNum(stmt.adjustment_amount),
        tdsRate,
    );

    const payments = await tx.doctorPayoutPayment.findMany({
        where: { statement_id: statementId, organizationId, voided_at: null },
        orderBy: { paid_at: 'asc' },
    });
    const paid = payments.reduce((s: number, p: any) => s + toNum(p.amount), 0);
    const state = paymentState(totals.net, paid, stmt.status);
    const last = payments[payments.length - 1];

    // Each line carries its own TDS share for audit; the statement total is the truth.
    for (const l of lines) {
        await tx.doctorCommission.update({
            where: { id: l.id },
            data: {
                tds_rate_percent: tdsRate,
                tds_amount: r2((toNum(l.commission_amount) * tdsRate) / 100).toFixed(2),
                // Lines are only 'paid' once the whole invoice is.
                status: state.status === 'paid' ? 'paid' : 'included_in_statement',
            },
        });
    }

    await tx.doctorPayoutStatement.update({
        where: { id: statementId },
        data: {
            total_commission: totals.gross.toFixed(2),
            total_tds: totals.tds.toFixed(2),
            net_payable: totals.net.toFixed(2),
            status: state.status,
            paid_amount: payments.length ? state.paid.toFixed(2) : null,
            paid_at: last ? last.paid_at : null,
            payment_mode: last ? last.payment_mode : null,
            payment_reference: last ? last.reference : null,
        },
    });

    return { ...totals, ...state, paymentCount: payments.length };
}

/** Insert one payment and re-derive the invoice. Caller validates the amount. */
export async function insertDoctorPayment(
    tx: Tx,
    p: {
        organizationId: string;
        statementId: string;
        doctorId: string;
        amount: number;
        paidAt?: Date;
        mode?: string | null;
        reference?: string | null;
        notes?: string | null;
        recordedBy?: string | null;
    },
) {
    await tx.doctorPayoutPayment.create({
        data: {
            organizationId: p.organizationId,
            statement_id: p.statementId,
            doctor_id: p.doctorId,
            amount: r2(p.amount).toFixed(2),
            paid_at: p.paidAt ?? new Date(),
            payment_mode: p.mode || null,
            reference: p.reference || null,
            notes: p.notes || null,
            recorded_by: p.recordedBy ?? null,
        },
    });
    return recomputeDoctorStatement(tx, p.organizationId, p.statementId);
}

/**
 * Take lines OFF a doctor invoice and hand them back to the accrual pool,
 * undoing any manual edit so the engine's figure is what reappears.
 */
export async function releaseDoctorLines(tx: Tx, organizationId: string, lineIds: string[]) {
    if (!lineIds.length) return;
    const rows = await tx.doctorCommission.findMany({ where: { id: { in: lineIds }, organizationId } });
    for (const r of rows) {
        await tx.doctorCommission.update({
            where: { id: r.id },
            data: {
                status: 'accrued',
                statement_id: null,
                commission_amount: r.computed_amount ?? r.commission_amount,
                tds_amount: 0,
                is_adjusted: false,
                adjust_note: null,
                computed_amount: null,
                line_breakdown: Prisma.DbNull,
            },
        });
    }
}
