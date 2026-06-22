'use server';

import { requireTenantContext, requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { backfillReferralCommissions } from '@/app/lib/referral-commission';
import { REFERRAL_SERVICE_TYPES, REFERRER_CATEGORIES, COMMISSION_TYPES } from '@/app/lib/referral-constants';

const MANAGE_ROLES = ['admin', 'finance'];

function num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

// ── Reception: dropdown + quick-add ────────────────────────────────────────

/** Active referrers for the registration "Referred By" dropdown (any staff). */
export async function getActiveReferrers() {
    try {
        const { db, organizationId } = await requireTenantContext();
        const referrers = await (db as any).referrer.findMany({
            where: { organizationId, is_active: true },
            select: { id: true, name: true, category: true, phone: true },
            orderBy: { name: 'asc' },
        });
        return { success: true, data: referrers };
    } catch (error) {
        console.error('getActiveReferrers error:', error);
        return { success: false, data: [], error: 'Failed to load referrers' };
    }
}

/** Quick-add a referrer from the registration page (name + category + phone). */
export async function quickAddReferrer(input: { name: string; category: string; phone?: string }) {
    try {
        const { db, session, organizationId } = await requireTenantContext();
        const name = (input.name || '').trim();
        if (!name) return { success: false, error: 'Name is required' };
        const category = (REFERRER_CATEGORIES as readonly string[]).includes(input.category)
            ? input.category
            : 'others';

        const referrer = await (db as any).referrer.create({
            data: {
                organizationId,
                name,
                category,
                phone: input.phone?.trim() || null,
                commission_type: 'flat_percent',
                created_by: session?.username ?? null,
            },
            select: { id: true, name: true, category: true, phone: true },
        });

        revalidatePath('/admin/referrals');
        revalidatePath('/finance/referrals');
        return { success: true, data: referrer };
    } catch (error) {
        console.error('quickAddReferrer error:', error);
        return { success: false, error: 'Failed to add referrer' };
    }
}

// ── Admin/Finance: referrer CRUD ───────────────────────────────────────────

type ReferrerInput = {
    name: string;
    category: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    pan_number?: string;
    bank_account?: string;
    ifsc?: string;
    commission_type: string;
    flat_percent?: number | string | null;
    fixed_amount_per_patient?: number | string | null;
    service_rates?: Array<{ service_type: string; percent: number | string }>;
};

function sanitizeReferrerInput(input: ReferrerInput) {
    const name = (input.name || '').trim();
    if (!name) throw new Error('Name is required');
    const category = (REFERRER_CATEGORIES as readonly string[]).includes(input.category)
        ? input.category
        : 'others';
    const commission_type = (COMMISSION_TYPES as readonly string[]).includes(input.commission_type)
        ? input.commission_type
        : 'flat_percent';

    return {
        name,
        category,
        commission_type,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        pan_number: input.pan_number?.trim() || null,
        bank_account: input.bank_account?.trim() || null,
        ifsc: input.ifsc?.trim() || null,
        flat_percent: commission_type === 'flat_percent' ? num(input.flat_percent) : null,
        fixed_amount_per_patient:
            commission_type === 'fixed_per_patient' ? num(input.fixed_amount_per_patient) : null,
    };
}

function buildServiceRateRows(input: ReferrerInput) {
    if (input.commission_type !== 'per_service' || !Array.isArray(input.service_rates)) return [];
    return input.service_rates
        .filter((r) => (REFERRAL_SERVICE_TYPES as readonly string[]).includes(r.service_type))
        .map((r) => ({ service_type: r.service_type, percent: num(r.percent) }));
}

export async function createReferrer(input: ReferrerInput) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const data = sanitizeReferrerInput(input);
        const rates = buildServiceRateRows(input);

        const referrer = await (db as any).referrer.create({
            data: {
                organizationId,
                ...data,
                created_by: session?.username ?? null,
                service_rates: rates.length
                    ? { create: rates.map((r) => ({ organizationId, ...r })) }
                    : undefined,
            },
        });

        revalidatePath('/admin/referrals');
        revalidatePath('/finance/referrals');
        return { success: true, data: { id: referrer.id } };
    } catch (error) {
        console.error('createReferrer error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create referrer' };
    }
}

export async function updateReferrer(id: string, input: ReferrerInput) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const data = sanitizeReferrerInput(input);
        const rates = buildServiceRateRows(input);

        await (db as any).$transaction(async (tx: any) => {
            await tx.referrer.update({
                where: { id },
                data,
            });
            // Replace service rates wholesale (simplest consistent behaviour)
            await tx.referrerServiceRate.deleteMany({ where: { referrer_id: id } });
            if (rates.length) {
                await tx.referrerServiceRate.createMany({
                    data: rates.map((r) => ({ organizationId, referrer_id: id, ...r })),
                });
            }
        });

        revalidatePath('/admin/referrals');
        revalidatePath('/finance/referrals');
        revalidatePath(`/admin/referrals/${id}`);
        revalidatePath(`/finance/referrals/${id}`);
        return { success: true };
    } catch (error) {
        console.error('updateReferrer error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update referrer' };
    }
}

export async function setReferrerActive(id: string, is_active: boolean) {
    try {
        const { db } = await requireRoleAndTenant(MANAGE_ROLES);
        await (db as any).referrer.update({ where: { id }, data: { is_active } });
        revalidatePath('/admin/referrals');
        revalidatePath('/finance/referrals');
        return { success: true };
    } catch (error) {
        console.error('setReferrerActive error:', error);
        return { success: false, error: 'Failed to update referrer' };
    }
}

// ── Admin/Finance: list with aggregates ────────────────────────────────────

export async function getReferralsOverview() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const referrers = await (db as any).referrer.findMany({
            where: { organizationId },
            include: { service_rates: true },
            orderBy: { name: 'asc' },
        });

        // Patient counts per referrer
        const patientCounts = await (db as any).oPD_REG.groupBy({
            by: ['referrer_id'],
            where: { organizationId, referrer_id: { not: null } },
            _count: { _all: true },
        });
        const patientCountMap = new Map<string, number>(
            patientCounts.map((p: any) => [p.referrer_id, p._count._all]),
        );

        // Self count (no referrer)
        const selfCount = await (db as any).oPD_REG.count({
            where: { organizationId, referrer_id: null },
        });

        // Commission aggregates per referrer (exclude void)
        const commissionRows = await (db as any).referralCommission.groupBy({
            by: ['referrer_id', 'status'],
            where: { organizationId, status: { not: 'void' } },
            _count: { _all: true },
            _sum: { commission_amount: true, eligible_base: true },
        });

        type Agg = { bills: number; business: number; accrued: number; paid: number };
        const aggMap = new Map<string, Agg>();
        for (const row of commissionRows) {
            const a = aggMap.get(row.referrer_id) || { bills: 0, business: 0, accrued: 0, paid: 0 };
            a.bills += row._count._all;
            a.business += num(row._sum.eligible_base);
            const amt = num(row._sum.commission_amount);
            if (row.status === 'paid') a.paid += amt;
            else a.accrued += amt; // accrued | included_in_statement
            aggMap.set(row.referrer_id, a);
        }

        const data = referrers.map((r: any) => {
            const a = aggMap.get(r.id) || { bills: 0, business: 0, accrued: 0, paid: 0 };
            return {
                id: r.id,
                name: r.name,
                category: r.category,
                phone: r.phone,
                is_active: r.is_active,
                commission_type: r.commission_type,
                flat_percent: r.flat_percent,
                fixed_amount_per_patient: r.fixed_amount_per_patient,
                service_rates: r.service_rates,
                patient_count: patientCountMap.get(r.id) || 0,
                bill_count: a.bills,
                total_business: a.business,
                commission_accrued: a.accrued,
                commission_paid: a.paid,
                outstanding: a.accrued, // not yet paid
            };
        });

        return { success: true, data, selfCount };
    } catch (error) {
        console.error('getReferralsOverview error:', error);
        return { success: false, data: [], selfCount: 0, error: 'Failed to load referrals' };
    }
}

// ── Admin/Finance: referrer detail ─────────────────────────────────────────

export async function getReferrerDetail(id: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const referrer = await (db as any).referrer.findFirst({
            where: { id, organizationId },
            include: { service_rates: true },
        });
        if (!referrer) return { success: false, error: 'Referrer not found' };

        // Patients referred
        const patients = await (db as any).oPD_REG.findMany({
            where: { organizationId, referrer_id: id },
            select: { patient_id: true, full_name: true, phone: true, created_at: true },
            orderBy: { created_at: 'desc' },
        });

        // Commission ledger
        const commissions = await (db as any).referralCommission.findMany({
            where: { organizationId, referrer_id: id },
            orderBy: { accrued_at: 'desc' },
        });

        // Per-patient commission totals
        const perPatient = new Map<string, number>();
        for (const c of commissions) {
            if (c.status === 'void') continue;
            perPatient.set(c.patient_id, (perPatient.get(c.patient_id) || 0) + num(c.commission_amount));
        }

        // Statements
        const statements = await (db as any).referralPayoutStatement.findMany({
            where: { organizationId, referrer_id: id },
            orderBy: { created_at: 'desc' },
        });

        const patientsWithCommission = patients.map((p: any) => ({
            ...p,
            commission_earned: perPatient.get(p.patient_id) || 0,
        }));

        return {
            success: true,
            data: {
                referrer,
                patients: patientsWithCommission,
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
        console.error('getReferrerDetail error:', error);
        return { success: false, error: 'Failed to load referrer' };
    }
}

// ── Payout statements ──────────────────────────────────────────────────────

export async function createPayoutStatement(input: {
    referrer_id: string;
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
        // include the whole end day
        end.setHours(23, 59, 59, 999);

        const result = await (db as any).$transaction(async (tx: any) => {
            const lines = await tx.referralCommission.findMany({
                where: {
                    organizationId,
                    referrer_id: input.referrer_id,
                    status: 'accrued',
                    accrued_at: { gte: start, lte: end },
                },
            });
            const total = lines.reduce((s: number, l: any) => s + num(l.commission_amount), 0);

            const statement = await tx.referralPayoutStatement.create({
                data: {
                    organizationId,
                    referrer_id: input.referrer_id,
                    period_start: start,
                    period_end: end,
                    total_commission: total.toFixed(2),
                    status: 'draft',
                    created_by: session?.username ?? null,
                },
            });

            if (lines.length) {
                await tx.referralCommission.updateMany({
                    where: { id: { in: lines.map((l: any) => l.id) } },
                    data: { status: 'included_in_statement', statement_id: statement.id },
                });
            }
            return { id: statement.id, lineCount: lines.length, total };
        });

        revalidatePath(`/admin/referrals/${input.referrer_id}`);
        revalidatePath(`/finance/referrals/${input.referrer_id}`);
        return { success: true, data: result };
    } catch (error) {
        console.error('createPayoutStatement error:', error);
        return { success: false, error: 'Failed to create statement' };
    }
}

/** Cancel a draft statement — release its lines back to accrued. */
export async function discardStatement(statementId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const stmt = await (db as any).referralPayoutStatement.findFirst({
            where: { id: statementId, organizationId },
        });
        if (!stmt) return { success: false, error: 'Statement not found' };
        if (stmt.status === 'paid') return { success: false, error: 'Paid statement cannot be discarded' };

        await (db as any).$transaction(async (tx: any) => {
            await tx.referralCommission.updateMany({
                where: { statement_id: statementId },
                data: { status: 'accrued', statement_id: null },
            });
            await tx.referralPayoutStatement.delete({ where: { id: statementId } });
        });

        revalidatePath(`/admin/referrals/${stmt.referrer_id}`);
        revalidatePath(`/finance/referrals/${stmt.referrer_id}`);
        return { success: true };
    } catch (error) {
        console.error('discardStatement error:', error);
        return { success: false, error: 'Failed to discard statement' };
    }
}

export async function markStatementPaid(input: {
    statementId: string;
    payment_mode?: string;
    payment_reference?: string;
    paid_amount?: number | string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const stmt = await (db as any).referralPayoutStatement.findFirst({
            where: { id: input.statementId, organizationId },
        });
        if (!stmt) return { success: false, error: 'Statement not found' };
        if (stmt.status === 'paid') return { success: false, error: 'Already paid' };

        const paidAmount = input.paid_amount != null ? num(input.paid_amount) : num(stmt.total_commission);

        await (db as any).$transaction(async (tx: any) => {
            await tx.referralPayoutStatement.update({
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
            await tx.referralCommission.updateMany({
                where: { statement_id: input.statementId },
                data: { status: 'paid' },
            });
        });

        revalidatePath(`/admin/referrals/${stmt.referrer_id}`);
        revalidatePath(`/finance/referrals/${stmt.referrer_id}`);
        return { success: true };
    } catch (error) {
        console.error('markStatementPaid error:', error);
        return { success: false, error: 'Failed to mark statement paid' };
    }
}

/** Backfill commissions for existing paid invoices of referred patients. */
export async function backfillCommissions() {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const result = await backfillReferralCommissions(db, organizationId);
        revalidatePath('/admin/referrals');
        revalidatePath('/finance/referrals');
        return { success: true, data: result };
    } catch (error) {
        console.error('backfillCommissions error:', error);
        return { success: false, error: 'Backfill failed' };
    }
}

/** Lines that make up a statement (for printing/export). */
export async function getStatementDetail(statementId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const statement = await (db as any).referralPayoutStatement.findFirst({
            where: { id: statementId, organizationId },
            include: { referrer: true, lines: true },
        });
        if (!statement) return { success: false, error: 'Statement not found' };
        return {
            success: true,
            data: {
                ...statement,
                total_commission: num(statement.total_commission),
                paid_amount: statement.paid_amount == null ? null : num(statement.paid_amount),
                lines: statement.lines.map((l: any) => ({
                    ...l,
                    eligible_base: num(l.eligible_base),
                    commission_amount: num(l.commission_amount),
                })),
            },
        };
    } catch (error) {
        console.error('getStatementDetail error:', error);
        return { success: false, error: 'Failed to load statement' };
    }
}
