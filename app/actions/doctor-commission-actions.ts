'use server';

import { z } from 'zod';
import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { backfillDoctorCommissions, computeDoctorBillLine } from '@/app/lib/doctor-commission';
import { applyBillEdit, invoiceTotals, r2, type LineBreakdown } from '@/app/lib/doctor-invoice-calc';
import { recomputeDoctorStatement, insertDoctorPayment, releaseDoctorLines } from '@/app/lib/doctor-invoice-server';
import { DOCTOR_SERVICE_TYPES, DOCTOR_COMMISSION_TYPES, DEFAULT_DOCTOR_TDS_PERCENT } from '@/app/lib/doctor-commission-constants';
import { generateDoctorInvoiceNumber } from '@/app/lib/sequence-generator';

const MANAGE_ROLES = ['admin', 'finance'];

function num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

// ── List with aggregates ───────────────────────────────────────────────────

export async function getDoctorCommissionOverview(opts?: { includeInactive?: boolean; from?: string; to?: string }) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        // Optional period window — finance usually wants "this month", not all-time.
        // Applies to when the bill was raised (invoice.created_at) and when the payout
        // accrued (doctorCommission.accrued_at). Both null = all-time (previous default).
        const from = opts?.from ? new Date(opts.from) : null;
        const to = opts?.to ? new Date(opts.to) : null;
        if (to) to.setHours(23, 59, 59, 999);
        const ledgerDateFilter =
            from || to ? { accrued_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

        // Fetch every doctor including inactive ones — the decision to hide a row is
        // made below, AFTER bill/commission aggregates are known, so that a
        // deactivated doctor who still has real billing history is never hidden.
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

        // Org-wide fallback rate applied to doctors with no per-doctor config.
        const orgConfig = await (db as any).organizationConfig.findUnique({
            where: { organizationId },
            select: { default_doctor_commission_percent: true },
        });
        const defaultPercent = num(orgConfig?.default_doctor_commission_percent);

        // Commission ledger drives the Accrued / Paid columns only.
        const commissionRows = await (db as any).doctorCommission.groupBy({
            by: ['doctor_id', 'status'],
            where: { organizationId, status: { not: 'void' }, ...ledgerDateFilter },
            _count: { _all: true },
            _sum: { commission_amount: true },
        });

        type Agg = { accrued: number; paid: number };
        const aggMap = new Map<string, Agg>();
        for (const row of commissionRows) {
            const a = aggMap.get(row.doctor_id) || { accrued: 0, paid: 0 };
            const amt = num(row._sum.commission_amount);
            if (row.status === 'paid') a.paid += amt;
            else a.accrued += amt;
            aggMap.set(row.doctor_id, a);
        }

        // Bills & collected business come from the invoices themselves — independent
        // of whether a commission config exists — so doctors with no commission
        // setup still show their real bill volume instead of 0. Cancelled bills are
        // excluded. For IPD invoices where invoice.doctor_id is null, fall back to
        // the admission's attending_doctor_id so those bills are not lost.
        // Bound the same window on the invoice side (created_at). Passing NULLs makes
        // each comparison a no-op, so all-time still works with one query shape.
        const invoiceRows = await (db as any).$queryRaw<Array<{
            resolved_doctor_id: string | null;
            bills: bigint;
            business: any;
        }>>`
            SELECT
                COALESCE(i.doctor_id, adm.attending_doctor_id) AS "resolved_doctor_id",
                COUNT(*) AS "bills",
                COALESCE(SUM(i.paid_amount), 0) AS "business"
            FROM invoices i
            LEFT JOIN "admissions" adm ON i.admission_id = adm.admission_id
            WHERE i."organizationId" = ${organizationId}
                AND LOWER(COALESCE(i.status, '')) <> 'cancelled'
                AND COALESCE(i.doctor_id, adm.attending_doctor_id) IS NOT NULL
                AND (${from}::timestamp IS NULL OR i.created_at >= ${from}::timestamp)
                AND (${to}::timestamp IS NULL OR i.created_at <= ${to}::timestamp)
            GROUP BY COALESCE(i.doctor_id, adm.attending_doctor_id)
        `;
        const invoiceAggMap = new Map<string, { bills: number; business: number }>();
        for (const row of invoiceRows) {
            if (!row.resolved_doctor_id) continue;
            invoiceAggMap.set(row.resolved_doctor_id, {
                bills: Number(row.bills),
                business: num(row.business),
            });
        }

        // Hide duplicate/retired rows so one doctor never appears twice:
        //  · "[MERGED] X" — a duplicate already merged into the surviving record.
        //  · a deactivated doctor with NO bills and NO commission history.
        // A deactivated doctor who still has billing history is kept (flagged
        // is_active: false) — hiding it would silently drop real money from the list.
        const isNoise = (d: any) => {
            if (opts?.includeInactive) return false;
            if (/^\s*\[MERGED\]/i.test(d.name || '')) return true;
            if (d.is_active) return false;
            const a = aggMap.get(d.id) || { accrued: 0, paid: 0 };
            const inv = invoiceAggMap.get(d.id) || { bills: 0, business: 0 };
            return inv.bills === 0 && a.accrued === 0 && a.paid === 0;
        };

        const data = doctors.filter((d: any) => !isNoise(d)).map((d: any) => {
            const cfg = configMap.get(d.id);
            const a = aggMap.get(d.id) || { accrued: 0, paid: 0 };
            const inv = invoiceAggMap.get(d.id) || { bills: 0, business: 0 };
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
                // Unconfigured doctors fall back to the org default rate (0 = none).
                uses_default: !cfg && defaultPercent > 0,
                bill_count: inv.bills,
                total_business: inv.business,
                commission_accrued: a.accrued,
                commission_paid: a.paid,
                outstanding: a.accrued,
            };
        });

        return {
            success: true,
            data,
            default_percent: defaultPercent,
            period: { from: opts?.from ?? null, to: opts?.to ?? null },
        };
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
    // service_name omitted/'' => the rate covers the whole service_type bucket;
    // a name => a rate for that one service, overriding the bucket on matching lines.
    service_rates?: Array<{ service_type: string; service_name?: string; percent: number | string }>;
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
    const seen = new Set<string>();
    return input.service_rates
        .filter((r) => (DOCTOR_SERVICE_TYPES as readonly string[]).includes(r.service_type))
        .map((r) => ({
            service_type: r.service_type,
            service_name: (r.service_name ?? '').trim(),
            percent: num(r.percent),
        }))
        // Drop duplicates up front — the unique index is (doctor, type, name) and a
        // repeated pair would otherwise abort the whole createMany.
        .filter((r) => {
            const k = `${r.service_type}::${r.service_name.toLowerCase()}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
}

/**
 * Named services a rate can target — the full service master, in the order the
 * config screen shows them: the ones this doctor has ACTUALLY billed first
 * (`performed: true`), then everything else.
 *
 * Names come from the service master so they match what lands in
 * invoice_items.description, which is what the rate is matched against at billing
 * time. The "performed" flag is derived from real bill lines the doctor is
 * attributed for — their own bills, bills where they are the admission's attending
 * doctor, and individual lines they are the rendered-by doctor on.
 */
export async function getCommissionServiceOptions(doctorId?: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const services = await (db as any).ipdServiceMaster.findMany({
            where: { organizationId, is_active: true },
            select: { service_name: true, service_category: true, default_rate: true },
            orderBy: [{ service_category: 'asc' }, { service_name: 'asc' }],
        });

        // Distinct service names appearing on bill lines credited to this doctor.
        const performed = new Set<string>();
        if (doctorId) {
            const lines = await db.invoice_items.findMany({
                where: {
                    organizationId,
                    OR: [
                        { rendered_by_doctor_id: doctorId },
                        {
                            rendered_by_doctor_id: null,
                            invoice: {
                                OR: [
                                    { doctor_id: doctorId },
                                    { doctor_id: null, admission: { attending_doctor_id: doctorId } },
                                ],
                            },
                        },
                    ],
                },
                select: { description: true },
                distinct: ['description'],
                take: 2000,
            });
            for (const l of lines) performed.add(String(l.description ?? '').trim().toLowerCase());
        }

        const data = services.map((s: any) => ({
            name: s.service_name,
            category: s.service_category ?? 'Other',
            rate: num(s.default_rate),
            performed: performed.has(String(s.service_name ?? '').trim().toLowerCase()),
        }));
        // Performed-by-this-doctor first; stable alphabetical within each group.
        data.sort((a: any, b: any) =>
            a.performed === b.performed ? a.name.localeCompare(b.name) : a.performed ? -1 : 1,
        );

        return { success: true, data, performed_count: data.filter((d: any) => d.performed).length };
    } catch (error) {
        console.error('getCommissionServiceOptions error:', error);
        return { success: false, data: [], error: 'Failed to load services' };
    }
}

/**
 * Copy one config to EVERY doctor in the org ("apply for all").
 * Doctors already carrying a manually-set config are overwritten too — the caller
 * confirms in the UI first, since that is the point of the button.
 */
export async function applyDoctorConfigToAll(input: ConfigInput) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const data = sanitizeConfig(input);
        const rates = buildRateRows(input);

        const doctors = await db.user.findMany({
            where: { organizationId, role: 'doctor', is_active: true },
            select: { id: true },
        });
        if (!doctors.length) return { success: false, error: 'No active doctors found' };

        await (db as any).$transaction(async (tx: any) => {
            for (const d of doctors) {
                await tx.doctorCommissionConfig.upsert({
                    where: { organizationId_doctor_id: { organizationId, doctor_id: d.id } },
                    create: { organizationId, doctor_id: d.id, ...data, created_by: session?.username ?? null },
                    update: data,
                });
                await tx.doctorServiceRate.deleteMany({ where: { organizationId, doctor_id: d.id } });
                if (rates.length) {
                    await tx.doctorServiceRate.createMany({
                        data: rates.map((r) => ({ organizationId, doctor_id: d.id, ...r })),
                    });
                }
            }
        });

        revalidatePath('/admin/doctor-invoicing');
        revalidatePath('/finance/doctor-invoicing');
        return { success: true, data: { applied: doctors.length } };
    } catch (error) {
        console.error('applyDoctorConfigToAll error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to apply to all doctors' };
    }
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

/**
 * Set the org-wide default commission % for doctors with no per-doctor config,
 * then re-accrue so every unconfigured doctor's collected bills earn at the new
 * rate immediately. Setting it to 0 disables the fallback and the backfill drops
 * those doctors' (still-accrued) projections.
 */
export async function setDefaultDoctorCommission(percent: number | string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const pct = num(percent);
        if (pct < 0 || pct > 100) return { success: false, error: 'Percent must be between 0 and 100' };

        await (db as any).organizationConfig.upsert({
            where: { organizationId },
            create: { organizationId, default_doctor_commission_percent: pct },
            update: { default_doctor_commission_percent: pct },
        });

        // Re-accrue every doctor-attributed paid bill at the new fallback rate.
        const result = await backfillDoctorCommissions(db, organizationId);

        revalidatePath('/admin/doctor-invoicing');
        revalidatePath('/finance/doctor-invoicing');
        return { success: true, data: { default_percent: pct, processed: result.processed } };
    } catch (error) {
        console.error('setDefaultDoctorCommission error:', error);
        return { success: false, error: 'Failed to update default commission' };
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

        const commissions = await (db as any).doctorCommission.findMany({
            where: { organizationId, doctor_id: doctorId },
            orderBy: { accrued_at: 'desc' },
        });
        const commissionByInvoice = new Map<number, any>(commissions.map((c: any) => [c.invoice_id, c]));

        // Bills where this doctor is either the bill-level attending doctor, OR
        // earned commission via a rendered-by line item on someone else's bill.
        const commissionInvoiceIds = commissions.map((c: any) => c.invoice_id);
        const bills = await db.invoices.findMany({
            where: {
                organizationId,
                OR: [
                    { doctor_id: doctorId },
                    ...(commissionInvoiceIds.length ? [{ id: { in: commissionInvoiceIds } }] : []),
                ],
            },
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
                    tds_amount: num(c.tds_amount),
                })),
                statements: statements.map((s: any) => ({
                    ...s,
                    total_commission: num(s.total_commission),
                    total_tds: num(s.total_tds),
                    net_payable: num(s.net_payable) > 0 ? num(s.net_payable) : num(s.total_commission),
                    paid_amount: s.paid_amount == null ? null : num(s.paid_amount),
                })),
            },
        };
    } catch (error) {
        console.error('getDoctorCommissionDetail error:', error);
        // Return the real message — a swallowed error here surfaced to the user as
        // "Doctor not found", which sent debugging down entirely the wrong path.
        const msg = error instanceof Error ? error.message.split('\n').filter(Boolean).slice(-2).join(' ') : 'Failed to load doctor';
        return { success: false, error: msg };
    }
}

// ── Payout statements ─────────────────────────────────────────────────────────

export async function createDoctorPayoutStatement(input: {
    doctor_id: string;
    period_start: string;
    period_end: string;
    tds_rate_percent?: number;
}) {
    try {
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const start = new Date(input.period_start);
        const end = new Date(input.period_end);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { success: false, error: 'Invalid date range' };
        }
        end.setHours(23, 59, 59, 999);
        const tdsRate = input.tds_rate_percent ?? DEFAULT_DOCTOR_TDS_PERCENT;

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
            const totalTds = (total * tdsRate) / 100;
            const netPayable = total - totalTds;

            const statement = await tx.doctorPayoutStatement.create({
                data: {
                    organizationId,
                    doctor_id: input.doctor_id,
                    period_start: start,
                    period_end: end,
                    total_commission: total.toFixed(2),
                    tds_rate_percent: tdsRate,
                    total_tds: totalTds.toFixed(2),
                    net_payable: netPayable.toFixed(2),
                    status: 'draft',
                    created_by: session?.username ?? null,
                },
            });

            for (const l of lines) {
                const lineTds = (num(l.commission_amount) * tdsRate) / 100;
                await tx.doctorCommission.update({
                    where: { id: l.id },
                    data: { status: 'included_in_statement', statement_id: statement.id, tds_rate_percent: tdsRate, tds_amount: lineTds.toFixed(2) },
                });
            }
            return { id: statement.id, lineCount: lines.length, total, tdsRate, totalTds, netPayable };
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

        const live = await (db as any).doctorPayoutPayment.count({
            where: { statement_id: statementId, organizationId, voided_at: null },
        });
        if (live > 0) {
            return { success: false, error: 'This invoice has payments recorded. Void them first, then discard.' };
        }

        await (db as any).$transaction(async (tx: any) => {
            const lines = await tx.doctorCommission.findMany({
                where: { statement_id: statementId, organizationId },
                select: { id: true },
            });
            await releaseDoctorLines(tx, organizationId, lines.map((l: any) => l.id));
            await tx.doctorPayoutStatement.delete({ where: { id: statementId } });
        });

        revalidateStatement(stmt.doctor_id);
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
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const stmt = await (db as any).doctorPayoutStatement.findFirst({
            where: { id: input.statementId, organizationId },
        });
        if (!stmt) return { success: false, error: 'Statement not found' };
        if (stmt.status === 'paid') return { success: false, error: 'Already paid' };

        await (db as any).$transaction(async (tx: any) => {
            // Re-derive first so a legacy statement's balance is right before paying it.
            const cur = await recomputeDoctorStatement(tx, organizationId, input.statementId);
            const amount = input.paid_amount != null ? num(input.paid_amount) : cur.balance;
            if (amount <= 0) throw new Error('Nothing left to pay on this invoice');
            if (amount > cur.balance + 0.005) throw new Error(`Amount exceeds the balance of ₹${cur.balance}`);
            await insertDoctorPayment(tx, {
                organizationId,
                statementId: input.statementId,
                doctorId: stmt.doctor_id,
                amount,
                mode: input.payment_mode,
                reference: input.payment_reference,
                notes: input.notes,
                recordedBy: session?.username ?? null,
            });
        });

        revalidateStatement(stmt.doctor_id);
        return { success: true };
    } catch (error) {
        console.error('markDoctorStatementPaid error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to mark statement paid' };
    }
}

// ── Payout statement (per-invoice batch settle) ───────────────────────────────
// Lighter-weight flow than createDoctorPayoutStatement: the admin picks individual
// pending (accrued) commission lines via checkboxes and clears them in one batch,
// rather than sweeping an entire date range. Settled lines are folded into a single
// paid DoctorPayoutStatement for audit/traceability.

function revalidateStatement(doctorId: string) {
    for (const base of ['/admin/doctor-invoicing', '/finance/doctor-invoicing']) {
        revalidatePath(base);
        revalidatePath(`${base}/${doctorId}`);
        revalidatePath(`${base}/${doctorId}/statement`);
    }
}

/** Pending (unpaid) commission lines for a doctor, enriched with invoice + patient info. */
export async function getDoctorPayoutPending(doctorId: string) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        if (!doctorId) return { success: false, error: 'Doctor is required' };

        const doctor = await db.user.findFirst({
            where: { id: doctorId, organizationId, role: 'doctor' },
            select: { id: true, name: true, username: true, specialty: true },
        });
        if (!doctor) return { success: false, error: 'Doctor not found' };

        // Organization header details for the printed statement (Organization is not
        // tenant-scoped by the db extension, so query by id directly).
        const org = await db.organization.findUnique({
            where: { id: organizationId },
            select: { name: true, address: true, phone: true, license_no: true },
        });

        const config = await (db as any).doctorCommissionConfig.findFirst({
            where: { organizationId, doctor_id: doctorId },
            select: { commission_type: true, flat_percent: true, is_active: true },
        });

        // "Unpaid invoices" = any commission line not yet paid (and not void). This
        // deliberately includes `included_in_statement` lines: those are parked in a
        // DRAFT statement (via the date-range flow) but are still genuinely unpaid, so
        // they must appear here too — otherwise the page would claim "everything is
        // settled" while the list still shows them as outstanding.
        const pending = await (db as any).doctorCommission.findMany({
            where: { organizationId, doctor_id: doctorId, status: { in: ['accrued', 'included_in_statement'] } },
            orderBy: { accrued_at: 'desc' },
        });

        const invoiceIds = pending.map((c: any) => c.invoice_id);
        const invoices = invoiceIds.length
            ? await db.invoices.findMany({
                  where: { organizationId, id: { in: invoiceIds } },
                  select: {
                      id: true,
                      invoice_number: true,
                      net_amount: true,
                      paid_amount: true,
                      status: true,
                      patient: { select: { full_name: true } },
                  },
              })
            : [];
        const invoiceById = new Map<number, any>(invoices.map((i: any) => [i.id, i]));

        const lines = pending.map((c: any) => {
            const inv = invoiceById.get(c.invoice_id);
            return {
                id: c.id,
                invoice_id: c.invoice_id,
                invoice_number: inv?.invoice_number ?? `#${c.invoice_id}`,
                invoice_type: c.invoice_type,
                patient_name: inv?.patient?.full_name ?? '',
                eligible_base: num(c.eligible_base),
                rate_applied: c.rate_applied,
                commission_amount: num(c.commission_amount),
                accrued_at: c.accrued_at,
                in_draft: !!c.statement_id, // already parked in a draft statement
            };
        });

        return {
            success: true,
            data: {
                doctor: { id: doctor.id, name: doctor.name || doctor.username, specialty: doctor.specialty },
                org: {
                    name: org?.name ?? 'Hospital OS',
                    address: org?.address ?? null,
                    phone: org?.phone ?? null,
                    license_no: org?.license_no ?? null,
                },
                config,
                lines,
                pending_total: lines.reduce((s: number, l: any) => s + l.commission_amount, 0),
            },
        };
    } catch (error) {
        console.error('getDoctorPayoutPending error:', error);
        return { success: false, error: 'Failed to load pending payouts' };
    }
}

const settleSchema = z.object({
    doctorId: z.string().min(1, 'Doctor is required'),
    commissionIds: z.array(z.string().min(1)).min(1, 'Select at least one invoice').max(1000),
    payment_mode: z.string().trim().max(40).optional(),
    payment_reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
});

export type SettleInput = z.input<typeof settleSchema>;

/** Batch-settle selected accrued commission lines into one paid statement. */
export async function settleDoctorCommissions(input: SettleInput) {
    try {
        const parsed = settleSchema.safeParse(input);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' };
        }
        const { doctorId, commissionIds, payment_mode, payment_reference, notes } = parsed.data;

        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const result = await (db as any).$transaction(async (tx: any) => {
            // Re-fetch under the tenant + doctor scope so a tampered/foreign id can never
            // settle. Eligible = any unpaid line (accrued OR already parked in a draft).
            const lines = await tx.doctorCommission.findMany({
                where: {
                    id: { in: commissionIds },
                    organizationId,
                    doctor_id: doctorId,
                    status: { in: ['accrued', 'included_in_statement'] },
                },
            });
            if (!lines.length) {
                throw new Error('No eligible invoices to settle (they may already be paid)');
            }

            const total = lines.reduce((s: number, l: any) => s + num(l.commission_amount), 0);
            const dates = lines.map((l: any) => new Date(l.accrued_at).getTime());
            const periodStart = new Date(Math.min(...dates));
            const periodEnd = new Date(Math.max(...dates));

            // Draft statements these lines are being pulled OUT of — they must be
            // recomputed (or deleted if emptied) so no stale draft keeps claiming
            // money that has now been paid via this settlement.
            const releasedStatementIds = [
                ...new Set(lines.map((l: any) => l.statement_id).filter((id: string | null): id is string => !!id)),
            ];

            const statement = await tx.doctorPayoutStatement.create({
                data: {
                    organizationId,
                    doctor_id: doctorId,
                    period_start: periodStart,
                    period_end: periodEnd,
                    total_commission: total.toFixed(2),
                    // Legacy quick-settle withholds no TDS — say so explicitly rather
                    // than inherit the column's 10% default.
                    tds_rate_percent: 0,
                    total_tds: '0',
                    net_payable: total.toFixed(2),
                    status: 'draft',
                    notes: notes || null,
                    created_by: session?.username ?? null,
                },
            });

            await tx.doctorCommission.updateMany({
                where: { id: { in: lines.map((l: any) => l.id) } },
                data: { status: 'included_in_statement', statement_id: statement.id, tds_rate_percent: 0, tds_amount: '0' },
            });
            await insertDoctorPayment(tx, {
                organizationId,
                statementId: statement.id,
                doctorId,
                amount: total,
                mode: payment_mode,
                reference: payment_reference,
                notes,
                recordedBy: session?.username ?? null,
            });

            // Reconcile the drafts we just emptied/shrunk (never touch a paid statement).
            for (const sid of releasedStatementIds as string[]) {
                const remaining = await tx.doctorCommission.count({ where: { statement_id: sid, organizationId } });
                if (remaining === 0) {
                    await tx.doctorPayoutStatement.deleteMany({ where: { id: sid, organizationId, status: { not: 'paid' } } });
                } else {
                    const open = await tx.doctorPayoutStatement.findFirst({
                        where: { id: sid, organizationId, status: { not: 'paid' } },
                        select: { id: true },
                    });
                    if (open) await recomputeDoctorStatement(tx, organizationId, sid);
                }
            }

            return { statementId: statement.id, settledCount: lines.length, total };
        });

        revalidateStatement(doctorId);
        return { success: true, data: result };
    } catch (error) {
        console.error('settleDoctorCommissions error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to settle invoices' };
    }
}

// ── Doctor invoicing — bill/patient driven ────────────────────────────────────
// The legacy statement above reads the doctor_commissions ledger, so it can only
// ever show bills that already ACCRUED money. With no commission % configured
// (the common case) that ledger is empty and the statement claims "everything is
// settled" while the doctor has hundreds of real patients. The flow below is
// driven by the BILLS instead: every patient the doctor attended (invoices.doctor_id
// or the admission's attending doctor) or personally rendered a line item for
// (invoice_items.rendered_by_doctor_id) is listed, grouped per patient, so the
// biller can tick the patients to include and raise a doctor invoice for exactly
// that subset. Commission is shown when configured but never gates visibility.

export type DoctorWorkloadFilters = {
    from?: string;
    to?: string;
    invoice_type?: string;
    /** all | pending (not yet on any doctor invoice) | invoiced */
    settlement?: string;
    search?: string;
};

type WorkloadBill = {
    invoice_id: number;
    invoice_number: string;
    invoice_type: string;
    status: string;
    created_at: Date;
    bill_net: number;
    bill_paid: number;
    /** Portion of the bill's net attributed to THIS doctor. */
    doctor_net: number;
    /** Portion of the money actually collected attributed to this doctor. */
    doctor_collected: number;
    attribution: 'attending' | 'rendered' | 'both';
    rendered_services: string[];
    /** Per-service breakdown of this doctor's share, with the rate applied to each. */
    services: Array<{ item_id: number | null; name: string; net: number; collected: number; rate: number; amount: number }>;
    rate_applied: number;
    commission_amount: number;
    commission_status: string | null;
    /** Already pulled onto a doctor invoice (draft or paid) — not selectable again. */
    locked: boolean;
};

/**
 * Every patient + bill attributable to a doctor, grouped per patient.
 * Independent of whether a commission row exists.
 */
export async function getDoctorStatementWorkload(doctorId: string, filters?: DoctorWorkloadFilters) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        if (!doctorId) return { success: false, error: 'Doctor is required' };

        const doctor = await db.user.findFirst({
            where: { id: doctorId, organizationId, role: 'doctor' },
            select: { id: true, name: true, username: true, specialty: true },
        });
        if (!doctor) return { success: false, error: 'Doctor not found' };

        const [org, config, orgConfig] = await Promise.all([
            db.organization.findUnique({
                where: { id: organizationId },
                select: { name: true, address: true, phone: true, license_no: true },
            }),
            (db as any).doctorCommissionConfig.findFirst({
                where: { organizationId, doctor_id: doctorId },
                include: { service_rates: true },
            }),
            (db as any).organizationConfig.findUnique({
                where: { organizationId },
                select: { default_doctor_commission_percent: true },
            }),
        ]);
        const defaultPercent = num(orgConfig?.default_doctor_commission_percent);

        // Date window (inclusive of the whole end day).
        const from = filters?.from ? new Date(filters.from) : null;
        const to = filters?.to ? new Date(filters.to) : null;
        if (to) to.setHours(23, 59, 59, 999);
        const createdFilter =
            from || to
                ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
                : {};

        const where: any = {
            organizationId,
            ...createdFilter,
            OR: [
                { doctor_id: doctorId },
                { items: { some: { rendered_by_doctor_id: doctorId } } },
                // IPD bills often carry no doctor_id — fall back to the admission's
                // attending doctor so those patients are not silently lost.
                { doctor_id: null, admission: { attending_doctor_id: doctorId } },
            ],
        };
        if (filters?.invoice_type && filters.invoice_type !== 'all') {
            where.invoice_type = filters.invoice_type;
        }

        const invoices = await db.invoices.findMany({
            where,
            select: {
                id: true,
                invoice_number: true,
                invoice_type: true,
                patient_id: true,
                net_amount: true,
                paid_amount: true,
                status: true,
                created_at: true,
                doctor_id: true,
                patient: { select: { full_name: true, phone: true } },
                admission: { select: { attending_doctor_id: true } },
                items: {
                    select: { id: true, net_price: true, rendered_by_doctor_id: true, description: true },
                    orderBy: { id: 'asc' },
                },
            },
            orderBy: { created_at: 'desc' },
            take: 2000,
        });

        // Existing ledger rows tell us what is already on a doctor invoice.
        const existing = await (db as any).doctorCommission.findMany({
            where: { organizationId, doctor_id: doctorId, invoice_id: { in: invoices.map((i: any) => i.id) } },
            select: { invoice_id: true, status: true, statement_id: true },
        });
        const ledgerByInvoice = new Map<number, any>(existing.map((c: any) => [c.invoice_id, c]));

        const term = (filters?.search || '').trim().toLowerCase();

        const patients = new Map<string, any>();
        for (const inv of invoices) {
            if (String(inv.status || '').toLowerCase() === 'cancelled') continue;

            const billLine = computeDoctorBillLine(inv, doctorId, config, defaultPercent);
            if (!billLine) continue;
            const { netAmount, paid, doctorNet, doctorCollected, rate, amount, services, attribution } = billLine;

            const renderedServices = inv.items
                .filter((it: any) => it.rendered_by_doctor_id === doctorId)
                .map((it: any) => it.description)
                .filter(Boolean);

            const ledger = ledgerByInvoice.get(inv.id);
            const locked = !!ledger && ledger.status !== 'accrued' && ledger.status !== 'void';

            if (filters?.settlement === 'pending' && locked) continue;
            if (filters?.settlement === 'invoiced' && !locked) continue;

            const name = inv.patient?.full_name ?? '';
            if (term && !(name.toLowerCase().includes(term) || String(inv.patient_id).toLowerCase().includes(term) || String(inv.invoice_number).toLowerCase().includes(term))) {
                continue;
            }

            const bill: WorkloadBill = {
                invoice_id: inv.id,
                invoice_number: inv.invoice_number,
                invoice_type: inv.invoice_type,
                status: inv.status,
                created_at: inv.created_at,
                bill_net: netAmount,
                bill_paid: paid,
                doctor_net: doctorNet,
                doctor_collected: doctorCollected,
                attribution,
                rendered_services: renderedServices,
                services,
                rate_applied: rate,
                commission_amount: amount,
                commission_status: ledger?.status ?? null,
                locked,
            };

            const key = inv.patient_id;
            if (!patients.has(key)) {
                patients.set(key, {
                    patient_id: key,
                    patient_name: name,
                    phone: inv.patient?.phone ?? null,
                    bills: [] as WorkloadBill[],
                });
            }
            patients.get(key).bills.push(bill);
        }

        const list = [...patients.values()].map((p: any) => {
            const bills: WorkloadBill[] = p.bills;
            return {
                ...p,
                visit_count: bills.length,
                last_visit: bills[0]?.created_at ?? null,
                total_net: bills.reduce((s, b) => s + b.doctor_net, 0),
                total_collected: bills.reduce((s, b) => s + b.doctor_collected, 0),
                total_commission: bills.reduce((s, b) => s + b.commission_amount, 0),
                selectable_count: bills.filter((b) => !b.locked).length,
            };
        });
        list.sort((a, b) => new Date(b.last_visit ?? 0).getTime() - new Date(a.last_visit ?? 0).getTime());

        const allBills = list.flatMap((p: any) => p.bills as WorkloadBill[]);

        // Money already invoiced but not yet paid out — shown on the worksheet so the
        // biller sees what is owed before raising more.
        const openStatements = await (db as any).doctorPayoutStatement.findMany({
            where: { organizationId, doctor_id: doctorId, status: { not: 'paid' } },
            select: { id: true, total_commission: true, total_tds: true, net_payable: true },
        });
        const paidRows = openStatements.length
            ? await (db as any).doctorPayoutPayment.groupBy({
                  by: ['statement_id'],
                  where: { organizationId, statement_id: { in: openStatements.map((x: any) => x.id) }, voided_at: null },
                  _sum: { amount: true },
              })
            : [];
        const paidByStmt = new Map<string, number>(paidRows.map((r: any) => [r.statement_id, num(r._sum.amount)]));
        const awaiting = openStatements.reduce((sum: number, x: any) => {
            const due = num(x.net_payable) > 0 ? num(x.net_payable) : num(x.total_commission);
            return sum + Math.max(0, due - (paidByStmt.get(x.id) ?? 0));
        }, 0);

        return {
            success: true,
            data: {
                doctor: { id: doctor.id, name: doctor.name || doctor.username, specialty: doctor.specialty },
                org: {
                    name: org?.name ?? 'Hospital OS',
                    address: org?.address ?? null,
                    phone: org?.phone ?? null,
                    license_no: org?.license_no ?? null,
                },
                config: config
                    ? { commission_type: config.commission_type, flat_percent: config.flat_percent, is_active: config.is_active }
                    : null,
                default_percent: defaultPercent,
                default_tds_percent: DEFAULT_DOCTOR_TDS_PERCENT,
                // Surfaced so the UI can warn instead of silently showing ₹0 everywhere.
                commission_configured: !!(config && config.is_active) || defaultPercent > 0,
                patients: list,
                totals: {
                    patients: list.length,
                    bills: allBills.length,
                    net: allBills.reduce((s, b) => s + b.doctor_net, 0),
                    collected: allBills.reduce((s, b) => s + b.doctor_collected, 0),
                    commission: allBills.reduce((s, b) => s + b.commission_amount, 0),
                },
                awaiting_payment: { count: openStatements.length, amount: r2(awaiting) },
            },
        };
    } catch (error) {
        console.error('getDoctorStatementWorkload error:', error);
        return { success: false, error: 'Failed to load doctor workload' };
    }
}

const billEditSchema = z.object({
    invoiceId: z.number().int().positive(),
    /** number = override the bill's payable, null = reset to the engine figure. */
    amount: z.number().min(0).max(1e9).nullable().optional(),
    /** New rate per service, keyed by invoice_items.id. */
    rates: z.record(z.string(), z.number().min(0).max(100)).optional(),
    note: z.string().trim().max(200).optional(),
});

const doctorInvoiceSchema = z.object({
    doctorId: z.string().min(1, 'Doctor is required'),
    invoiceIds: z.array(z.number().int().positive()).min(1, 'Select at least one patient').max(2000),
    payment_mode: z.string().trim().max(40).optional(),
    payment_reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    /** true → also record a payment right away; false → leave unpaid to pay later. */
    mark_paid: z.boolean().optional(),
    /** Amount of that first payment. Defaults to the full net. */
    paid_amount: z.number().positive().max(1e9).optional(),
    /** When the money actually moved (ISO). Defaults to now. */
    paid_at: z.string().optional(),
    /** TDS % withheld from the gross commission. Defaults to DEFAULT_DOCTOR_TDS_PERCENT. */
    tds_rate_percent: z.number().min(0).max(100).optional(),
    /** Per-bill edits made on the worksheet before raising. */
    edits: z.array(billEditSchema).max(2000).optional(),
    /** Invoice-level +/- line (bonus, advance recovery, round-off). */
    adjustment_amount: z.number().min(-1e8).max(1e8).optional(),
    adjustment_note: z.string().trim().max(200).optional(),
    invoice_date: z.string().optional(),
});

export type DoctorInvoiceInput = z.input<typeof doctorInvoiceSchema>;

function parseWhen(v?: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Raise a doctor invoice for an explicitly chosen set of bills.
 *
 * Unlike settleDoctorCommissions (which requires ledger rows to already exist),
 * this recomputes each bill's doctor share on the spot and upserts the ledger row,
 * so it works even when nothing has accrued yet — including at a 0% rate, where
 * the invoice documents the work done without claiming any payout.
 *
 * Per-bill edits (a typed amount or changed service rates) are applied on top of
 * the engine figure and frozen with the engine figure beside them, so the invoice
 * always shows what was computed, what was paid, and that someone changed it.
 */
export async function createDoctorInvoiceForBills(input: DoctorInvoiceInput) {
    try {
        const parsed = doctorInvoiceSchema.safeParse(input);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' };
        }
        const {
            doctorId, invoiceIds, payment_mode, payment_reference, notes, mark_paid, paid_amount,
            paid_at, tds_rate_percent, edits, adjustment_amount, adjustment_note, invoice_date,
        } = parsed.data;
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

        const tdsRate = tds_rate_percent ?? DEFAULT_DOCTOR_TDS_PERCENT;
        const editByInvoice = new Map((edits ?? []).map((e) => [e.invoiceId, e]));
        const when = parseWhen(paid_at);
        if (when && when.getTime() > Date.now() + 5 * 60_000) {
            return { success: false, error: 'Payment time cannot be in the future' };
        }
        const statementNumber = await generateDoctorInvoiceNumber(organizationId, db);

        const result = await (db as any).$transaction(async (tx: any) => {
            const config = await tx.doctorCommissionConfig.findFirst({
                where: { organizationId, doctor_id: doctorId },
                include: { service_rates: true },
            });
            const orgConfig = await tx.organizationConfig.findUnique({
                where: { organizationId },
                select: { default_doctor_commission_percent: true },
            });
            const defaultPercent = num(orgConfig?.default_doctor_commission_percent);

            const invoices = await tx.invoices.findMany({
                where: { id: { in: invoiceIds }, organizationId },
                select: {
                    id: true, patient_id: true, invoice_type: true, net_amount: true,
                    paid_amount: true, status: true, doctor_id: true, created_at: true,
                    admission: { select: { attending_doctor_id: true } },
                    items: {
                        select: { id: true, net_price: true, rendered_by_doctor_id: true, description: true },
                        orderBy: { id: 'asc' },
                    },
                },
            });
            if (!invoices.length) throw new Error('None of the selected bills are available');

            // Never re-invoice a bill already sitting on a draft/paid doctor invoice.
            const already = await tx.doctorCommission.findMany({
                where: {
                    organizationId, doctor_id: doctorId,
                    invoice_id: { in: invoices.map((i: any) => i.id) },
                    status: { in: ['included_in_statement', 'paid'] },
                },
                select: { invoice_id: true },
            });
            const lockedIds = new Set(already.map((a: any) => a.invoice_id));

            const eligible = invoices.filter(
                (i: any) => !lockedIds.has(i.id) && String(i.status || '').toLowerCase() !== 'cancelled',
            );
            if (!eligible.length) {
                throw new Error('Every selected bill is already on a doctor invoice');
            }

            const dates = eligible.map((i: any) => new Date(i.created_at).getTime());
            const statement = await tx.doctorPayoutStatement.create({
                data: {
                    organizationId,
                    doctor_id: doctorId,
                    statement_number: statementNumber,
                    period_start: new Date(Math.min(...dates)),
                    period_end: new Date(Math.max(...dates)),
                    total_commission: '0',
                    tds_rate_percent: tdsRate,
                    adjustment_amount: r2(adjustment_amount ?? 0).toFixed(2),
                    adjustment_note: adjustment_note || null,
                    invoice_date: parseWhen(invoice_date) ?? new Date(),
                    status: 'draft',
                    notes: notes || null,
                    created_by: session?.username ?? null,
                },
            });

            let used = 0;
            const lineAmounts: number[] = [];
            for (const inv of eligible) {
                const line = computeDoctorBillLine(inv, doctorId, config, defaultPercent);
                if (!line) continue;

                const edit = editByInvoice.get(inv.id);
                const applied = applyBillEdit(line.amount, line.services.map((s) => ({ ...s, amount: r2(s.amount) })), edit);
                lineAmounts.push(applied.final);
                used++;

                const breakdown: LineBreakdown = {
                    services: applied.services,
                    bill_net: line.netAmount,
                    bill_paid: line.paid,
                    doctor_net: line.doctorNet,
                    doctor_collected: line.doctorCollected,
                    attribution: line.attribution,
                };
                const row = {
                    organizationId,
                    doctor_id: doctorId,
                    patient_id: inv.patient_id,
                    invoice_id: inv.id,
                    invoice_type: inv.invoice_type,
                    eligible_base: line.doctorCollected.toFixed(2),
                    rate_applied: line.rate,
                    commission_amount: applied.final.toFixed(2),
                    computed_amount: r2(line.amount).toFixed(2),
                    is_adjusted: applied.adjusted,
                    adjust_note: applied.adjusted ? edit?.note || null : null,
                    line_breakdown: breakdown as any,
                    tds_rate_percent: tdsRate,
                    status: 'included_in_statement',
                    statement_id: statement.id,
                };
                await tx.doctorCommission.upsert({
                    where: { invoice_id_doctor_id: { invoice_id: inv.id, doctor_id: doctorId } },
                    create: row,
                    update: {
                        eligible_base: row.eligible_base,
                        rate_applied: row.rate_applied,
                        commission_amount: row.commission_amount,
                        computed_amount: row.computed_amount,
                        is_adjusted: row.is_adjusted,
                        adjust_note: row.adjust_note,
                        line_breakdown: row.line_breakdown,
                        tds_rate_percent: row.tds_rate_percent,
                        invoice_type: row.invoice_type,
                        status: row.status,
                        statement_id: statement.id,
                    },
                });
            }
            if (!used) throw new Error('None of the selected bills carry a share for this doctor');

            const totals = invoiceTotals(lineAmounts, adjustment_amount ?? 0, tdsRate);
            if (totals.net < 0) throw new Error('The adjustment makes the net payable negative');

            let state = await recomputeDoctorStatement(tx, organizationId, statement.id);
            if (mark_paid && state.net > 0) {
                const amt = paid_amount ?? state.net;
                if (amt > state.net + 0.005) throw new Error(`Payment exceeds the net payable of ₹${state.net}`);
                state = await insertDoctorPayment(tx, {
                    organizationId,
                    statementId: statement.id,
                    doctorId,
                    amount: amt,
                    paidAt: when ?? new Date(),
                    mode: payment_mode,
                    reference: payment_reference,
                    recordedBy: session?.username ?? null,
                });
            }

            return {
                statementId: statement.id,
                statementNumber,
                billCount: used,
                skipped: invoices.length - eligible.length,
                total: state.gross,
                tdsRate,
                totalTds: state.tds,
                netPayable: state.net,
                paid: state.paid,
            };
        });

        revalidateStatement(doctorId);
        return { success: true, data: result };
    } catch (error) {
        console.error('createDoctorInvoiceForBills error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to raise doctor invoice' };
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
