'use server';

import { z } from 'zod';
import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { backfillDoctorCommissions, computeDoctorNetShares, computeCommission, doctorLineShares } from '@/app/lib/doctor-commission';
import { DOCTOR_SERVICE_TYPES, DOCTOR_COMMISSION_TYPES } from '@/app/lib/doctor-commission-constants';
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
                    status: 'paid',
                    paid_at: new Date(),
                    paid_amount: total.toFixed(2),
                    payment_mode: payment_mode || null,
                    payment_reference: payment_reference || null,
                    notes: notes || null,
                    created_by: session?.username ?? null,
                },
            });

            await tx.doctorCommission.updateMany({
                where: { id: { in: lines.map((l: any) => l.id) } },
                data: { status: 'paid', statement_id: statement.id },
            });

            // Reconcile the drafts we just emptied/shrunk (never touch a paid statement).
            for (const sid of releasedStatementIds) {
                const remaining = await tx.doctorCommission.findMany({
                    where: { statement_id: sid },
                    select: { commission_amount: true },
                });
                if (remaining.length === 0) {
                    await tx.doctorPayoutStatement.deleteMany({ where: { id: sid, status: { not: 'paid' } } });
                } else {
                    const remTotal = remaining.reduce((s: number, l: any) => s + num(l.commission_amount), 0);
                    await tx.doctorPayoutStatement.updateMany({
                        where: { id: sid, status: { not: 'paid' } },
                        data: { total_commission: remTotal.toFixed(2) },
                    });
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
    services: Array<{ name: string; net: number; collected: number; rate: number; amount: number }>;
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
                    select: { net_price: true, rendered_by_doctor_id: true, description: true },
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

            const attendingId = inv.doctor_id ?? inv.admission?.attending_doctor_id ?? null;
            const { shares, netAmount } = computeDoctorNetShares(inv.items, inv.net_amount, attendingId);
            const doctorNet = shares.get(doctorId) ?? 0;
            if (doctorNet <= 0) continue;

            const paid = num(inv.paid_amount);
            const doctorCollected = netAmount > 0 ? paid * (doctorNet / netAmount) : 0;
            // Per-line so a named-service rate can override the invoice_type rate.
            const lineShares = doctorLineShares(inv.items, netAmount, paid, attendingId, doctorId);
            const activeConfig = config && config.is_active ? config : null;
            const { rate, amount } = computeCommission(
                activeConfig,
                inv.invoice_type,
                doctorCollected,
                defaultPercent,
                lineShares,
            );

            // Every service on this doctor's share of the bill, with the rate that
            // actually applied to each — shown on the statement and its printout.
            const services = lineShares.map((ln) => {
                const lineRate = activeConfig
                    ? computeCommission(activeConfig, inv.invoice_type, ln.collected, defaultPercent, [ln]).rate
                    : defaultPercent;
                return {
                    name: ln.description || '—',
                    net: ln.net,
                    collected: ln.collected,
                    rate: lineRate,
                    amount: (ln.collected * lineRate) / 100,
                };
            });

            const renderedServices = inv.items
                .filter((it: any) => it.rendered_by_doctor_id === doctorId)
                .map((it: any) => it.description)
                .filter(Boolean);
            const isAttending = attendingId === doctorId;
            const attribution: WorkloadBill['attribution'] =
                renderedServices.length && isAttending ? 'both' : renderedServices.length ? 'rendered' : 'attending';

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
            },
        };
    } catch (error) {
        console.error('getDoctorStatementWorkload error:', error);
        return { success: false, error: 'Failed to load doctor workload' };
    }
}

const doctorInvoiceSchema = z.object({
    doctorId: z.string().min(1, 'Doctor is required'),
    invoiceIds: z.array(z.number().int().positive()).min(1, 'Select at least one patient').max(2000),
    payment_mode: z.string().trim().max(40).optional(),
    payment_reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    /** true → raise and settle in one step; false → leave as a draft to approve later. */
    mark_paid: z.boolean().optional(),
});

export type DoctorInvoiceInput = z.input<typeof doctorInvoiceSchema>;

/**
 * Raise a doctor invoice for an explicitly chosen set of bills.
 *
 * Unlike settleDoctorCommissions (which requires ledger rows to already exist),
 * this recomputes each bill's doctor share on the spot and upserts the ledger row,
 * so it works even when nothing has accrued yet — including at a 0% rate, where
 * the invoice documents the work done without claiming any payout.
 */
export async function createDoctorInvoiceForBills(input: DoctorInvoiceInput) {
    try {
        const parsed = doctorInvoiceSchema.safeParse(input);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' };
        }
        const { doctorId, invoiceIds, payment_mode, payment_reference, notes, mark_paid } = parsed.data;
        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);

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
                    items: { select: { net_price: true, rendered_by_doctor_id: true, description: true } },
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
                    status: mark_paid ? 'paid' : 'draft',
                    ...(mark_paid
                        ? { paid_at: new Date(), payment_mode: payment_mode || null, payment_reference: payment_reference || null }
                        : {}),
                    notes: notes || null,
                    created_by: session?.username ?? null,
                },
            });

            let total = 0;
            for (const inv of eligible) {
                const attendingId = inv.doctor_id ?? inv.admission?.attending_doctor_id ?? null;
                const { shares, netAmount } = computeDoctorNetShares(inv.items, inv.net_amount, attendingId);
                const doctorNet = shares.get(doctorId) ?? 0;
                if (doctorNet <= 0) continue;

                const doctorCollected = netAmount > 0 ? num(inv.paid_amount) * (doctorNet / netAmount) : 0;
                const { rate, amount } = computeCommission(
                    config && config.is_active ? config : null,
                    inv.invoice_type,
                    doctorCollected,
                    defaultPercent,
                    doctorLineShares(inv.items, netAmount, num(inv.paid_amount), attendingId, doctorId),
                );
                total += amount;

                const row = {
                    organizationId,
                    doctor_id: doctorId,
                    patient_id: inv.patient_id,
                    invoice_id: inv.id,
                    invoice_type: inv.invoice_type,
                    eligible_base: doctorCollected.toFixed(2),
                    rate_applied: rate,
                    commission_amount: amount.toFixed(2),
                    status: mark_paid ? 'paid' : 'included_in_statement',
                    statement_id: statement.id,
                };
                await tx.doctorCommission.upsert({
                    where: { invoice_id_doctor_id: { invoice_id: inv.id, doctor_id: doctorId } },
                    create: row,
                    update: {
                        eligible_base: row.eligible_base,
                        rate_applied: row.rate_applied,
                        commission_amount: row.commission_amount,
                        invoice_type: row.invoice_type,
                        status: row.status,
                        statement_id: statement.id,
                    },
                });
            }

            await tx.doctorPayoutStatement.update({
                where: { id: statement.id },
                data: {
                    total_commission: total.toFixed(2),
                    ...(mark_paid ? { paid_amount: total.toFixed(2) } : {}),
                },
            });

            return {
                statementId: statement.id,
                statementNumber,
                billCount: eligible.length,
                skipped: invoices.length - eligible.length,
                total,
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
