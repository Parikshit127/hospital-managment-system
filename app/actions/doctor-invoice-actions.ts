'use server';

/**
 * Doctor invoices — list, detail, edit, and the payment ledger.
 *
 * Raising an invoice lives in doctor-commission-actions (createDoctorInvoiceForBills).
 * Everything after that — reviewing it, changing amounts, recording part-payments
 * with their exact time, voiding a wrong entry — lives here.
 *
 * DoctorCommission / DoctorPayoutStatement / DoctorPayoutPayment are not in the
 * tenant extension's scoped list, so every query filters organizationId by hand.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRoleAndTenant } from '@/backend/tenant';
import { applyBillEdit, invoiceTotals, paymentState, r2, type LineBreakdown } from '@/app/lib/doctor-invoice-calc';
import { insertDoctorPayment, recomputeDoctorStatement, releaseDoctorLines } from '@/app/lib/doctor-invoice-server';

const MANAGE_ROLES = ['admin', 'finance'];

function num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

function revalidateDoctor(doctorId: string, statementId?: string) {
    for (const base of ['/admin/doctor-invoicing', '/finance/doctor-invoicing']) {
        revalidatePath(base);
        revalidatePath(`${base}/${doctorId}`);
        revalidatePath(`${base}/${doctorId}/statement`);
        revalidatePath(`${base}/${doctorId}/invoices`);
        if (statementId) revalidatePath(`${base}/${doctorId}/invoices/${statementId}`);
    }
}

/** Amount due on a statement. Pre-TDS legacy rows have net_payable = 0 → use gross. */
function dueOf(s: { net_payable: unknown; total_commission: unknown }) {
    return num(s.net_payable) > 0 ? num(s.net_payable) : num(s.total_commission);
}

// ── List ────────────────────────────────────────────────────────────────────

export type DoctorInvoiceListRow = {
    id: string;
    statement_number: string | null;
    status: string;
    invoice_date: Date;
    created_at: Date;
    created_by: string | null;
    period_start: Date;
    period_end: Date;
    bill_count: number;
    gross: number;
    tds: number;
    tds_rate: number;
    net: number;
    paid: number;
    balance: number;
    payment_count: number;
    last_paid_at: Date | null;
};

export type DoctorPaymentRow = {
    id: string;
    statement_id: string;
    statement_number: string | null;
    amount: number;
    paid_at: Date;
    payment_mode: string | null;
    reference: string | null;
    notes: string | null;
    recorded_by: string | null;
    voided_at: Date | null;
    void_reason: string | null;
};

export type DoctorInvoiceLine = {
    id: string;
    invoice_id: number;
    invoice_number: string;
    invoice_type: string;
    bill_date: Date;
    patient_id: string;
    patient_name: string;
    bill_net: number;
    bill_paid: number;
    collected: number;
    rate: number;
    amount: number;
    computed_amount: number;
    is_adjusted: boolean;
    adjust_note: string | null;
    attribution: string | null;
    services: Array<{
        item_id: number | null;
        name: string;
        net: number;
        collected: number;
        rate: number;
        amount: number;
        base_rate: number | null;
    }>;
};

export type DoctorInvoicePaymentRow = {
    id: string;
    amount: number;
    paid_at: Date;
    payment_mode: string | null;
    reference: string | null;
    notes: string | null;
    recorded_by: string | null;
    created_at: Date;
    voided_at: Date | null;
    void_reason: string | null;
    voided_by: string | null;
};

export type DoctorInvoiceListFilters = {
    /** all | unpaid (incl. part-paid) | paid */
    status?: string;
    from?: string;
    to?: string;
    search?: string;
};

export async function getDoctorInvoices(doctorId: string, filters?: DoctorInvoiceListFilters) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        if (!doctorId) return { success: false, error: 'Doctor is required' };

        const doctor = await db.user.findFirst({
            where: { id: doctorId, organizationId, role: 'doctor' },
            select: { id: true, name: true, username: true, specialty: true, phone: true, email: true },
        });
        if (!doctor) return { success: false, error: 'Doctor not found' };

        const from = filters?.from ? new Date(filters.from) : null;
        const to = filters?.to ? new Date(filters.to) : null;
        if (to) to.setHours(23, 59, 59, 999);

        const where: any = { organizationId, doctor_id: doctorId };
        if (from || to) where.created_at = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
        if (filters?.status === 'paid') where.status = 'paid';
        else if (filters?.status === 'unpaid') where.status = { not: 'paid' };
        const term = (filters?.search || '').trim();
        if (term) where.statement_number = { contains: term, mode: 'insensitive' };

        const statements = await (db as any).doctorPayoutStatement.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 500,
            include: {
                payments: {
                    where: { voided_at: null },
                    select: { amount: true, paid_at: true },
                    orderBy: { paid_at: 'desc' },
                },
                _count: { select: { lines: true } },
            },
        });

        const rows: DoctorInvoiceListRow[] = statements.map((s: any) => {
            const due = dueOf(s);
            const paid = r2(s.payments.reduce((sum: number, p: any) => sum + num(p.amount), 0));
            return {
                id: s.id,
                statement_number: s.statement_number as string | null,
                status: s.status as string,
                invoice_date: (s.invoice_date ?? s.created_at) as Date,
                created_at: s.created_at as Date,
                created_by: s.created_by as string | null,
                period_start: s.period_start as Date,
                period_end: s.period_end as Date,
                bill_count: s._count.lines as number,
                gross: num(s.total_commission),
                tds: num(s.total_tds),
                tds_rate: num(s.tds_rate_percent),
                net: due,
                paid,
                balance: r2(Math.max(0, due - paid)),
                payment_count: s.payments.length as number,
                last_paid_at: (s.payments[0]?.paid_at ?? null) as Date | null,
            };
        });

        return {
            success: true,
            data: {
                doctor: { ...doctor, name: doctor.name || doctor.username },
                invoices: rows,
                totals: {
                    count: rows.length,
                    net: r2(rows.reduce((s: number, r: any) => s + r.net, 0)),
                    paid: r2(rows.reduce((s: number, r: any) => s + r.paid, 0)),
                    balance: r2(rows.reduce((s: number, r: any) => s + r.balance, 0)),
                },
            },
        };
    } catch (error) {
        console.error('getDoctorInvoices error:', error);
        return { success: false, error: 'Failed to load doctor invoices' };
    }
}

/** Every payment made to a doctor across all invoices, newest first. */
export async function getDoctorPayments(doctorId: string, opts?: { from?: string; to?: string; includeVoided?: boolean }) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        if (!doctorId) return { success: false, error: 'Doctor is required' };

        const from = opts?.from ? new Date(opts.from) : null;
        const to = opts?.to ? new Date(opts.to) : null;
        if (to) to.setHours(23, 59, 59, 999);

        const payments = await (db as any).doctorPayoutPayment.findMany({
            where: {
                organizationId,
                doctor_id: doctorId,
                ...(opts?.includeVoided ? {} : { voided_at: null }),
                ...(from || to ? { paid_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
            },
            orderBy: { paid_at: 'desc' },
            take: 1000,
            include: { statement: { select: { id: true, statement_number: true } } },
        });

        const data: DoctorPaymentRow[] = payments.map((p: any) => ({
            id: p.id,
            statement_id: p.statement_id,
            statement_number: p.statement?.statement_number ?? null,
            amount: num(p.amount),
            paid_at: p.paid_at as Date,
            payment_mode: p.payment_mode as string | null,
            reference: p.reference as string | null,
            notes: p.notes as string | null,
            recorded_by: p.recorded_by as string | null,
            voided_at: p.voided_at as Date | null,
            void_reason: p.void_reason as string | null,
        }));
        const live = data.filter((p: any) => !p.voided_at);
        return {
            success: true,
            data: { payments: data, total: r2(live.reduce((s: number, p: any) => s + p.amount, 0)), count: live.length },
        };
    } catch (error) {
        console.error('getDoctorPayments error:', error);
        return { success: false, error: 'Failed to load payments' };
    }
}

// ── Detail ──────────────────────────────────────────────────────────────────

export async function getDoctorInvoiceDetail(statementId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const stmt = await (db as any).doctorPayoutStatement.findFirst({ where: { id: statementId, organizationId } });
        if (!stmt) return { success: false, error: 'Doctor invoice not found' };

        const [doctor, config, org, lines, payments] = await Promise.all([
            db.user.findFirst({
                where: { id: stmt.doctor_id, organizationId },
                select: { id: true, name: true, username: true, specialty: true, phone: true, email: true },
            }),
            (db as any).doctorCommissionConfig.findFirst({
                where: { organizationId, doctor_id: stmt.doctor_id },
                select: { pan_number: true, bank_account: true, ifsc: true },
            }),
            db.organization.findUnique({
                where: { id: organizationId },
                select: { name: true, address: true, phone: true, license_no: true },
            }),
            (db as any).doctorCommission.findMany({
                where: { organizationId, statement_id: statementId, status: { not: 'void' } },
            }),
            (db as any).doctorPayoutPayment.findMany({
                where: { organizationId, statement_id: statementId },
                orderBy: { paid_at: 'asc' },
            }),
        ]);
        if (!doctor) return { success: false, error: 'Doctor not found' };

        const invoices = lines.length
            ? await db.invoices.findMany({
                  where: { organizationId, id: { in: lines.map((l: any) => l.invoice_id) } },
                  select: {
                      id: true, invoice_number: true, created_at: true, net_amount: true, paid_amount: true,
                      patient_id: true, patient: { select: { full_name: true, phone: true } },
                  },
              })
            : [];
        const invById = new Map<number, any>(invoices.map((i: any) => [i.id, i]));

        const lineRows: DoctorInvoiceLine[] = lines
            .map((l: any) => {
                const inv = invById.get(l.invoice_id);
                const bd = (l.line_breakdown ?? null) as LineBreakdown | null;
                return {
                    id: l.id as string,
                    invoice_id: l.invoice_id as number,
                    invoice_number: (inv?.invoice_number ?? `#${l.invoice_id}`) as string,
                    invoice_type: l.invoice_type as string,
                    bill_date: (inv?.created_at ?? l.accrued_at) as Date,
                    patient_id: l.patient_id as string,
                    patient_name: (inv?.patient?.full_name ?? '') as string,
                    bill_net: bd ? num(bd.bill_net) : num(inv?.net_amount),
                    bill_paid: bd ? num(bd.bill_paid) : num(inv?.paid_amount),
                    collected: num(l.eligible_base),
                    rate: num(l.rate_applied),
                    amount: num(l.commission_amount),
                    computed_amount: l.computed_amount == null ? num(l.commission_amount) : num(l.computed_amount),
                    is_adjusted: !!l.is_adjusted,
                    adjust_note: (l.adjust_note ?? null) as string | null,
                    attribution: (bd?.attribution ?? null) as string | null,
                    // Frozen at raise/edit time — the invoice must not drift if the bill changes later.
                    services: (bd?.services ?? []).map((s) => ({
                        item_id: s.item_id ?? null,
                        name: s.name,
                        net: num(s.net),
                        collected: num(s.collected),
                        rate: num(s.rate),
                        amount: num(s.amount),
                        base_rate: s.base_rate == null ? null : num(s.base_rate),
                    })),
                };
            })
            .sort((a: any, b: any) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());

        const paymentRows: DoctorInvoicePaymentRow[] = payments.map((p: any) => ({
            id: p.id as string,
            amount: num(p.amount),
            paid_at: p.paid_at as Date,
            payment_mode: (p.payment_mode ?? null) as string | null,
            reference: (p.reference ?? null) as string | null,
            notes: (p.notes ?? null) as string | null,
            recorded_by: (p.recorded_by ?? null) as string | null,
            created_at: p.created_at as Date,
            voided_at: (p.voided_at ?? null) as Date | null,
            void_reason: (p.void_reason ?? null) as string | null,
            voided_by: (p.voided_by ?? null) as string | null,
        }));

        const live = paymentRows.filter((p: any) => !p.voided_at);
        const totals = invoiceTotals(
            lineRows.map((l: any) => l.amount),
            num(stmt.adjustment_amount),
            num(stmt.tds_rate_percent),
        );
        const net = totals.net;
        const state = paymentState(net, live.reduce((s: number, p: any) => s + p.amount, 0), stmt.status);

        return {
            success: true,
            data: {
                statement: {
                    id: stmt.id as string,
                    doctor_id: stmt.doctor_id as string,
                    statement_number: (stmt.statement_number ?? null) as string | null,
                    status: state.status as string,
                    invoice_date: (stmt.invoice_date ?? stmt.created_at) as Date,
                    created_at: stmt.created_at as Date,
                    created_by: (stmt.created_by ?? null) as string | null,
                    period_start: stmt.period_start as Date,
                    period_end: stmt.period_end as Date,
                    notes: (stmt.notes ?? null) as string | null,
                    tds_rate_percent: num(stmt.tds_rate_percent),
                    adjustment_amount: num(stmt.adjustment_amount),
                    adjustment_note: (stmt.adjustment_note ?? null) as string | null,
                },
                totals: {
                    lines: totals.lines,
                    adjustment: totals.adjustment,
                    gross: totals.gross,
                    tds: totals.tds,
                    net,
                    paid: state.paid,
                    balance: state.balance,
                },
                editable: state.status !== 'paid',
                doctor: {
                    id: doctor.id,
                    name: (doctor.name || doctor.username) as string,
                    specialty: (doctor.specialty ?? null) as string | null,
                    phone: (doctor.phone ?? null) as string | null,
                    email: (doctor.email ?? null) as string | null,
                    pan: (config?.pan_number ?? null) as string | null,
                    bank_account: (config?.bank_account ?? null) as string | null,
                    ifsc: (config?.ifsc ?? null) as string | null,
                },
                org: {
                    name: org?.name ?? 'Hospital OS',
                    address: org?.address ?? null,
                    phone: org?.phone ?? null,
                    license_no: org?.license_no ?? null,
                },
                lines: lineRows,
                payments: paymentRows,
            },
        };
    } catch (error) {
        console.error('getDoctorInvoiceDetail error:', error);
        return { success: false, error: 'Failed to load doctor invoice' };
    }
}

// ── Edit ────────────────────────────────────────────────────────────────────

const lineEditSchema = z.object({
    id: z.string().min(1),
    /** number = override this bill's payable, null = reset to the computed figure, absent = leave. */
    amount: z.number().min(0).max(1e9).nullable().optional(),
    rates: z.record(z.string(), z.number().min(0).max(100)).optional(),
    note: z.string().trim().max(200).optional(),
});

const updateSchema = z.object({
    statementId: z.string().min(1),
    tds_rate_percent: z.number().min(0).max(100).optional(),
    adjustment_amount: z.number().min(-1e8).max(1e8).optional(),
    adjustment_note: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(500).optional(),
    invoice_date: z.string().optional(),
    lines: z.array(lineEditSchema).max(2000).optional(),
    removeLineIds: z.array(z.string().min(1)).max(2000).optional(),
});
export type UpdateDoctorInvoiceInput = z.input<typeof updateSchema>;

/**
 * Edit an unpaid (or part-paid) doctor invoice: per-bill amounts / service rates,
 * remove bills, TDS %, invoice-level adjustment, notes, date. Totals are re-derived
 * from the lines, never trusted from the client. A paid invoice is read-only until
 * a payment is voided.
 */
export async function updateDoctorInvoice(input: UpdateDoctorInvoiceInput) {
    try {
        const parsed = updateSchema.safeParse(input);
        if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' };
        const d = parsed.data;
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const out = await (db as any).$transaction(async (tx: any) => {
            const stmt = await tx.doctorPayoutStatement.findFirst({ where: { id: d.statementId, organizationId } });
            if (!stmt) throw new Error('Doctor invoice not found');
            if (stmt.status === 'paid') throw new Error('This invoice is fully paid. Void a payment to edit it.');

            // Release removed bills first so the remaining-lines check is accurate.
            if (d.removeLineIds?.length) {
                const mine = await tx.doctorCommission.findMany({
                    where: { id: { in: d.removeLineIds }, organizationId, statement_id: d.statementId },
                    select: { id: true },
                });
                await releaseDoctorLines(tx, organizationId, mine.map((m: any) => m.id));
            }
            const remaining = await tx.doctorCommission.count({
                where: { statement_id: d.statementId, organizationId, status: { not: 'void' } },
            });
            if (remaining === 0) throw new Error('An invoice needs at least one bill. Discard it instead.');

            const removed = new Set(d.removeLineIds ?? []);
            for (const edit of d.lines ?? []) {
                if (removed.has(edit.id)) continue;
                const line = await tx.doctorCommission.findFirst({
                    where: { id: edit.id, organizationId, statement_id: d.statementId },
                });
                if (!line) continue;

                const current = num(line.commission_amount);
                const computed = line.computed_amount == null ? current : num(line.computed_amount);
                const bd = (line.line_breakdown ?? null) as LineBreakdown | null;
                const services = bd?.services ?? [];

                // Note-only edit must not throw away an earlier manual amount.
                const keep = edit.amount === undefined && !edit.rates;
                const applied = applyBillEdit(computed, services, keep ? undefined : { amount: edit.amount, rates: edit.rates });
                const final = keep ? current : applied.final;

                await tx.doctorCommission.update({
                    where: { id: line.id },
                    data: {
                        commission_amount: final.toFixed(2),
                        computed_amount: computed.toFixed(2),
                        is_adjusted: Math.abs(final - computed) > 0.004,
                        adjust_note: edit.note !== undefined ? edit.note || null : line.adjust_note,
                        ...(bd ? { line_breakdown: { ...bd, services: keep ? services : applied.services } as any } : {}),
                    },
                });
            }

            await tx.doctorPayoutStatement.update({
                where: { id: d.statementId },
                data: {
                    ...(d.tds_rate_percent !== undefined ? { tds_rate_percent: d.tds_rate_percent } : {}),
                    ...(d.adjustment_amount !== undefined ? { adjustment_amount: r2(d.adjustment_amount).toFixed(2) } : {}),
                    ...(d.adjustment_note !== undefined ? { adjustment_note: d.adjustment_note || null } : {}),
                    ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
                    ...(d.invoice_date ? (() => { const t = new Date(d.invoice_date!); return isNaN(t.getTime()) ? {} : { invoice_date: t }; })() : {}),
                },
            });

            const state = await recomputeDoctorStatement(tx, organizationId, d.statementId);
            if (state.net < 0) throw new Error('These changes make the net payable negative');
            if (state.paid > state.net + 0.005) {
                throw new Error(`₹${state.paid} is already paid against this invoice — the net cannot drop below that. Void a payment first.`);
            }
            return { doctorId: stmt.doctor_id as string, net: state.net, gross: state.gross, tds: state.tds };
        });

        revalidateDoctor(out.doctorId, d.statementId);
        return { success: true, data: out };
    } catch (error) {
        console.error('updateDoctorInvoice error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update doctor invoice' };
    }
}

// ── Payments ────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
    statementId: z.string().min(1),
    amount: z.number().positive('Enter an amount').max(1e9),
    /** When the money actually moved (ISO). Defaults to now. */
    paid_at: z.string().optional(),
    payment_mode: z.string().trim().max(40).optional(),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
});
export type DoctorPaymentInput = z.input<typeof paymentSchema>;

export async function recordDoctorInvoicePayment(input: DoctorPaymentInput) {
    try {
        const parsed = paymentSchema.safeParse(input);
        if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' };
        const d = parsed.data;

        let paidAt = new Date();
        if (d.paid_at) {
            paidAt = new Date(d.paid_at);
            if (isNaN(paidAt.getTime())) return { success: false, error: 'Invalid payment date' };
            if (paidAt.getTime() > Date.now() + 5 * 60_000) return { success: false, error: 'Payment time cannot be in the future' };
        }

        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const out = await (db as any).$transaction(async (tx: any) => {
            const stmt = await tx.doctorPayoutStatement.findFirst({ where: { id: d.statementId, organizationId } });
            if (!stmt) throw new Error('Doctor invoice not found');

            // Fresh derive so the balance check is against truth, not a stale column.
            const cur = await recomputeDoctorStatement(tx, organizationId, d.statementId);
            if (cur.balance <= 0.004) throw new Error('This invoice is already fully paid');
            if (r2(d.amount) > cur.balance + 0.005) throw new Error(`Amount exceeds the balance due of ₹${cur.balance}`);

            const state = await insertDoctorPayment(tx, {
                organizationId,
                statementId: d.statementId,
                doctorId: stmt.doctor_id,
                amount: d.amount,
                paidAt,
                mode: d.payment_mode,
                reference: d.reference,
                notes: d.notes,
                recordedBy: session?.username ?? null,
            });
            return { doctorId: stmt.doctor_id as string, paid: state.paid, balance: state.balance, status: state.status };
        });

        revalidateDoctor(out.doctorId, d.statementId);
        return { success: true, data: out };
    } catch (error) {
        console.error('recordDoctorInvoicePayment error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to record payment' };
    }
}

/** Reverse a wrongly recorded payment. The row stays (struck through) for audit. */
export async function voidDoctorInvoicePayment(input: { paymentId: string; reason: string }) {
    try {
        const reason = (input.reason || '').trim();
        if (reason.length < 3) return { success: false, error: 'Give a short reason for voiding' };
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const out = await (db as any).$transaction(async (tx: any) => {
            const pay = await tx.doctorPayoutPayment.findFirst({ where: { id: input.paymentId, organizationId } });
            if (!pay) throw new Error('Payment not found');
            if (pay.voided_at) throw new Error('Payment is already voided');

            await tx.doctorPayoutPayment.update({
                where: { id: pay.id },
                data: { voided_at: new Date(), void_reason: reason.slice(0, 300), voided_by: session?.username ?? null },
            });
            const state = await recomputeDoctorStatement(tx, organizationId, pay.statement_id);
            return { doctorId: pay.doctor_id as string, statementId: pay.statement_id as string, status: state.status, balance: state.balance };
        });

        revalidateDoctor(out.doctorId, out.statementId);
        return { success: true, data: out };
    } catch (error) {
        console.error('voidDoctorInvoicePayment error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to void payment' };
    }
}
