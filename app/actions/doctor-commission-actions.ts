'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { backfillDoctorCommissions } from '@/app/lib/doctor-commission';
import { DOCTOR_SERVICE_TYPES, DOCTOR_COMMISSION_TYPES } from '@/app/lib/doctor-commission-constants';

const MANAGE_ROLES = ['admin', 'finance'];

function num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

// ── List with aggregates ───────────────────────────────────────────────────

export async function getDoctorCommissionOverview() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const doctors = await db.user.findMany({
            where: { organizationId, role: 'doctor' },
            select: { id: true, name: true, username: true, specialty: true, is_active: true },
            orderBy: { name: 'asc' },
        });

        const configs = await (db as any).doctorCommissionConfig.findMany({
            where: { organizationId },
            include: { service_rates: true },
        });
        const configMap = new Map<string, any>(configs.map((c: any) => [c.doctor_id, c]));

        const commissionRows = await (db as any).doctorCommission.groupBy({
            by: ['doctor_id', 'status'],
            where: { organizationId, status: { not: 'void' } },
            _count: { _all: true },
            _sum: { commission_amount: true, eligible_base: true },
        });

        type Agg = { bills: number; business: number; accrued: number; paid: number };
        const aggMap = new Map<string, Agg>();
        for (const row of commissionRows) {
            const a = aggMap.get(row.doctor_id) || { bills: 0, business: 0, accrued: 0, paid: 0 };
            a.bills += row._count._all;
            a.business += num(row._sum.eligible_base);
            const amt = num(row._sum.commission_amount);
            if (row.status === 'paid') a.paid += amt;
            else a.accrued += amt;
            aggMap.set(row.doctor_id, a);
        }

        const data = doctors.map((d: any) => {
            const cfg = configMap.get(d.id);
            const a = aggMap.get(d.id) || { bills: 0, business: 0, accrued: 0, paid: 0 };
            return {
                id: d.id,
                name: d.name || d.username,
                specialty: d.specialty,
                is_active: d.is_active,
                configured: !!cfg,
                commission_type: cfg?.commission_type ?? null,
                flat_percent: cfg?.flat_percent ?? null,
                fixed_amount_per_bill: cfg?.fixed_amount_per_bill ?? null,
                config_active: cfg?.is_active ?? false,
                service_rates: cfg?.service_rates ?? [],
                bill_count: a.bills,
                total_business: a.business,
                commission_accrued: a.accrued,
                commission_paid: a.paid,
                outstanding: a.accrued,
            };
        });

        return { success: true, data };
    } catch (error) {
        console.error('getDoctorCommissionOverview error:', error);
        return { success: false, data: [], error: 'Failed to load doctor commissions' };
    }
}

// ── Config CRUD ─────────────────────────────────────────────────────────────

type ConfigInput = {
    commission_type: string;
    flat_percent?: number | string | null;
    fixed_amount_per_bill?: number | string | null;
    pan_number?: string;
    bank_account?: string;
    ifsc?: string;
    service_rates?: Array<{ service_type: string; percent: number | string }>;
};

function sanitizeConfig(input: ConfigInput) {
    const commission_type = (DOCTOR_COMMISSION_TYPES as readonly string[]).includes(input.commission_type)
        ? input.commission_type
        : 'flat_percent';
    return {
        commission_type,
        flat_percent: commission_type === 'flat_percent' ? num(input.flat_percent) : null,
        fixed_amount_per_bill: commission_type === 'fixed_per_bill' ? num(input.fixed_amount_per_bill) : null,
        pan_number: input.pan_number?.trim() || null,
        bank_account: input.bank_account?.trim() || null,
        ifsc: input.ifsc?.trim() || null,
    };
}

function buildRateRows(input: ConfigInput) {
    if (input.commission_type !== 'per_service' || !Array.isArray(input.service_rates)) return [];
    return input.service_rates
        .filter((r) => (DOCTOR_SERVICE_TYPES as readonly string[]).includes(r.service_type))
        .map((r) => ({ service_type: r.service_type, percent: num(r.percent) }));
}

/** Create or update a doctor's commission config (upsert by doctor). */
export async function saveDoctorConfig(doctorId: string, input: ConfigInput) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        if (!doctorId) return { success: false, error: 'Doctor is required' };

        const data = sanitizeConfig(input);
        const rates = buildRateRows(input);

        await (db as any).$transaction(async (tx: any) => {
            await tx.doctorCommissionConfig.upsert({
                where: { organizationId_doctor_id: { organizationId, doctor_id: doctorId } },
                create: { organizationId, doctor_id: doctorId, ...data, created_by: session?.username ?? null },
                update: data,
            });
            await tx.doctorServiceRate.deleteMany({ where: { organizationId, doctor_id: doctorId } });
            if (rates.length) {
                await tx.doctorServiceRate.createMany({
                    data: rates.map((r) => ({ organizationId, doctor_id: doctorId, ...r })),
                });
            }
        });

        revalidatePath('/admin/doctor-invoicing');
        revalidatePath('/finance/doctor-invoicing');
        revalidatePath(`/admin/doctor-invoicing/${doctorId}`);
        revalidatePath(`/finance/doctor-invoicing/${doctorId}`);
        return { success: true };
    } catch (error) {
        console.error('saveDoctorConfig error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save config' };
    }
}

export async function setDoctorConfigActive(doctorId: string, is_active: boolean) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        await (db as any).doctorCommissionConfig.update({
            where: { organizationId_doctor_id: { organizationId, doctor_id: doctorId } },
            data: { is_active },
        });
        revalidatePath('/admin/doctor-invoicing');
        revalidatePath('/finance/doctor-invoicing');
        return { success: true };
    } catch (error) {
        console.error('setDoctorConfigActive error:', error);
        return { success: false, error: 'Failed to update config' };
    }
}

// ── Doctor detail ────────────────────────────────────────────────────────────

export async function getDoctorCommissionDetail(doctorId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const doctor = await db.user.findFirst({
            where: { id: doctorId, organizationId, role: 'doctor' },
            select: { id: true, name: true, username: true, specialty: true, phone: true, email: true },
        });
        if (!doctor) return { success: false, error: 'Doctor not found' };

        const config = await (db as any).doctorCommissionConfig.findFirst({
            where: { organizationId, doctor_id: doctorId },
            include: { service_rates: true },
        });

        const bills = await db.invoices.findMany({
            where: { organizationId, doctor_id: doctorId },
            select: {
                id: true,
                invoice_number: true,
                invoice_type: true,
                patient_id: true,
                net_amount: true,
                paid_amount: true,
                status: true,
                created_at: true,
                patient: { select: { full_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        const commissions = await (db as any).doctorCommission.findMany({
            where: { organizationId, doctor_id: doctorId },
            orderBy: { accrued_at: 'desc' },
        });
        const commissionByInvoice = new Map<number, any>(commissions.map((c: any) => [c.invoice_id, c]));

        const statements = await (db as any).doctorPayoutStatement.findMany({
            where: { organizationId, doctor_id: doctorId },
            orderBy: { created_at: 'desc' },
        });

        return {
            success: true,
            data: {
                doctor: { ...doctor, name: doctor.name || doctor.username },
                config,
                bills: bills.map((b: any) => {
                    const c = commissionByInvoice.get(b.id);
                    return {
                        id: b.id,
                        invoice_number: b.invoice_number,
                        invoice_type: b.invoice_type,
                        patient_id: b.patient_id,
                        patient_name: b.patient?.full_name ?? '',
                        net_amount: num(b.net_amount),
                        paid_amount: num(b.paid_amount),
                        status: b.status,
                        created_at: b.created_at,
                        commission_amount: c && c.status !== 'void' ? num(c.commission_amount) : 0,
                        commission_status: c?.status ?? null,
                    };
                }),
                commissions: commissions.map((c: any) => ({
                    ...c,
                    eligible_base: num(c.eligible_base),
                    commission_amount: num(c.commission_amount),
                })),
                statements: statements.map((s: any) => ({
                    ...s,
                    total_commission: num(s.total_commission),
                    paid_amount: s.paid_amount == null ? null : num(s.paid_amount),
                })),
            },
        };
    } catch (error) {
        console.error('getDoctorCommissionDetail error:', error);
        return { success: false, error: 'Failed to load doctor' };
    }
}

// ── Payout statements ─────────────────────────────────────────────────────────

export async function createDoctorPayoutStatement(input: {
    doctor_id: string;
    period_start: string;
    period_end: string;
}) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const start = new Date(input.period_start);
        const end = new Date(input.period_end);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { success: false, error: 'Invalid date range' };
        }
        end.setHours(23, 59, 59, 999);

        const result = await (db as any).$transaction(async (tx: any) => {
            const lines = await tx.doctorCommission.findMany({
                where: {
                    organizationId,
                    doctor_id: input.doctor_id,
                    status: 'accrued',
                    accrued_at: { gte: start, lte: end },
                },
            });
            const total = lines.reduce((s: number, l: any) => s + num(l.commission_amount), 0);

            const statement = await tx.doctorPayoutStatement.create({
                data: {
                    organizationId,
                    doctor_id: input.doctor_id,
                    period_start: start,
                    period_end: end,
                    total_commission: total.toFixed(2),
                    status: 'draft',
                    created_by: session?.username ?? null,
                },
            });

            if (lines.length) {
                await tx.doctorCommission.updateMany({
                    where: { id: { in: lines.map((l: any) => l.id) } },
                    data: { status: 'included_in_statement', statement_id: statement.id },
                });
            }
            return { id: statement.id, lineCount: lines.length, total };
        });

        revalidatePath(`/admin/doctor-invoicing/${input.doctor_id}`);
        revalidatePath(`/finance/doctor-invoicing/${input.doctor_id}`);
        return { success: true, data: result };
    } catch (error) {
        console.error('createDoctorPayoutStatement error:', error);
        return { success: false, error: 'Failed to create statement' };
    }
}

export async function discardDoctorStatement(statementId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const stmt = await (db as any).doctorPayoutStatement.findFirst({
            where: { id: statementId, organizationId },
        });
        if (!stmt) return { success: false, error: 'Statement not found' };
        if (stmt.status === 'paid') return { success: false, error: 'Paid statement cannot be discarded' };

        await (db as any).$transaction(async (tx: any) => {
            await tx.doctorCommission.updateMany({
                where: { statement_id: statementId },
                data: { status: 'accrued', statement_id: null },
            });
            await tx.doctorPayoutStatement.delete({ where: { id: statementId } });
        });

        revalidatePath(`/admin/doctor-invoicing/${stmt.doctor_id}`);
        revalidatePath(`/finance/doctor-invoicing/${stmt.doctor_id}`);
        return { success: true };
    } catch (error) {
        console.error('discardDoctorStatement error:', error);
        return { success: false, error: 'Failed to discard statement' };
    }
}

export async function markDoctorStatementPaid(input: {
    statementId: string;
    payment_mode?: string;
    payment_reference?: string;
    paid_amount?: number | string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const stmt = await (db as any).doctorPayoutStatement.findFirst({
            where: { id: input.statementId, organizationId },
        });
        if (!stmt) return { success: false, error: 'Statement not found' };
        if (stmt.status === 'paid') return { success: false, error: 'Already paid' };

        const paidAmount = input.paid_amount != null ? num(input.paid_amount) : num(stmt.total_commission);

        await (db as any).$transaction(async (tx: any) => {
            await tx.doctorPayoutStatement.update({
                where: { id: input.statementId },
                data: {
                    status: 'paid',
                    paid_at: new Date(),
                    paid_amount: paidAmount.toFixed(2),
                    payment_mode: input.payment_mode || null,
                    payment_reference: input.payment_reference || null,
                    notes: input.notes || stmt.notes || null,
                },
            });
            await tx.doctorCommission.updateMany({
                where: { statement_id: input.statementId },
                data: { status: 'paid' },
            });
        });

        revalidatePath(`/admin/doctor-invoicing/${stmt.doctor_id}`);
        revalidatePath(`/finance/doctor-invoicing/${stmt.doctor_id}`);
        return { success: true };
    } catch (error) {
        console.error('markDoctorStatementPaid error:', error);
        return { success: false, error: 'Failed to mark statement paid' };
    }
}

export async function backfillDoctorCommissionsAction() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const result = await backfillDoctorCommissions(db, organizationId);
        revalidatePath('/admin/doctor-invoicing');
        revalidatePath('/finance/doctor-invoicing');
        return { success: true, data: result };
    } catch (error) {
        console.error('backfillDoctorCommissionsAction error:', error);
        return { success: false, error: 'Backfill failed' };
    }
}
