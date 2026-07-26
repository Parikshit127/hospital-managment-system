'use server';

import { guardAction } from '@/app/lib/action-guard';

/**
 * Consultant charges — bill/patient driven worksheet.
 *
 * The referrer/consultant counterpart of the doctor-invoicing worksheet: every
 * patient this consultant brought in is listed with their bills, the biller ticks
 * the ones to include, and a consultant-charge invoice is raised for exactly that
 * subset. Driven by the BILLS (patients whose OPD_REG.referrer_id is this
 * consultant) rather than by the commission ledger, so patients still appear when
 * no rate has been configured yet — the ledger only ever holds rows that already
 * earned money, which made the old screen look empty.
 */

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { generateConsultantInvoiceNumber } from '@/app/lib/sequence-generator';

const MANAGE_ROLES = ['admin', 'finance'];

function num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** Rate for one bill line — a named-service rate beats the invoice_type bucket. */
function rateForLine(referrer: any, invoiceType: string, description: unknown): number {
    const rates: any[] = referrer?.service_rates ?? [];
    const key = String(description ?? '').trim().toLowerCase();
    const named = rates.find((r) => r.service_name && String(r.service_name).trim().toLowerCase() === key);
    if (named) return num(named.percent);
    const bucket = rates.find((r) => !r.service_name && r.service_type === invoiceType);
    return bucket ? num(bucket.percent) : 0;
}

/**
 * Consultant charge for one bill, evaluated line by line so a named-service rate
 * can differ from the bill-type rate. fixed_per_patient is credited once per
 * patient and is therefore resolved by the caller, which can see all the bills.
 */
function billCharge(referrer: any, invoice: any, items: any[]) {
    const collected = String(invoice.status || '').toLowerCase() === 'cancelled' ? 0 : num(invoice.paid_amount);
    const net = num(invoice.net_amount) || items.reduce((s: number, it: any) => s + num(it.net_price), 0);
    const ratio = net > 0 ? collected / net : 0;

    if (referrer?.commission_type === 'flat_percent') {
        const rate = num(referrer.flat_percent);
        const services = items.map((it: any) => {
            const c = num(it.net_price) * ratio;
            return { name: it.description || '-', net: num(it.net_price), collected: c, rate, amount: (c * rate) / 100 };
        });
        return { rate, amount: (collected * rate) / 100, collected, services };
    }

    if (referrer?.commission_type === 'per_service') {
        let amount = 0;
        const services = items.map((it: any) => {
            const c = num(it.net_price) * ratio;
            const rate = rateForLine(referrer, invoice.invoice_type, it.description);
            const amt = (c * rate) / 100;
            amount += amt;
            return { name: it.description || '-', net: num(it.net_price), collected: c, rate, amount: amt };
        });
        return { rate: collected > 0 ? (amount / collected) * 100 : 0, amount, collected, services };
    }

    return { rate: 0, amount: 0, collected, services: [] as any[] };
}

export type ConsultantWorkloadFilters = {
    from?: string;
    to?: string;
    invoice_type?: string;
    settlement?: string;
    search?: string;
};

export async function getConsultantWorkload(referrerId: string, filters?: ConsultantWorkloadFilters) {
    try {
        const { db, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        if (!referrerId) return { success: false, error: 'Consultant is required' };

        const referrer = await (db as any).referrer.findFirst({
            where: { id: referrerId, organizationId },
            include: { service_rates: true },
        });
        if (!referrer) return { success: false, error: 'Consultant not found' };

        const org = await db.organization.findUnique({
            where: { id: organizationId },
            select: { name: true, address: true, phone: true, license_no: true },
        });

        const from = filters?.from ? new Date(filters.from) : null;
        const to = filters?.to ? new Date(filters.to) : null;
        if (to) to.setHours(23, 59, 59, 999);

        const where: any = {
            organizationId,
            patient: { referrer_id: referrerId },
            ...(from || to ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        };
        if (filters?.invoice_type && filters.invoice_type !== 'all') where.invoice_type = filters.invoice_type;

        const invoices = await db.invoices.findMany({
            where,
            select: {
                id: true, invoice_number: true, invoice_type: true, patient_id: true,
                net_amount: true, paid_amount: true, status: true, created_at: true,
                patient: { select: { full_name: true, phone: true } },
                items: { select: { net_price: true, description: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 2000,
        });

        const existing = await (db as any).referralCommission.findMany({
            where: { organizationId, referrer_id: referrerId, invoice_id: { in: invoices.map((i: any) => i.id) } },
            select: { invoice_id: true, status: true },
        });
        const ledger = new Map<number, any>(existing.map((c: any) => [c.invoice_id, c]));

        const term = (filters?.search || '').trim().toLowerCase();
        const fixedPerPatient = referrer.commission_type === 'fixed_per_patient';
        const fixedAmount = num(referrer.fixed_amount_per_patient);
        const paidFixedFor = new Set<string>();

        const patients = new Map<string, any>();
        for (const inv of invoices) {
            if (String(inv.status || '').toLowerCase() === 'cancelled') continue;

            const calc = billCharge(referrer, inv, inv.items);
            let { rate, amount } = calc;
            let services = calc.services;
            const collected = calc.collected;

            // A fixed per-patient fee is earned once — on that patient's first bill.
            if (fixedPerPatient) {
                if (collected > 0 && !paidFixedFor.has(inv.patient_id)) {
                    amount = fixedAmount;
                    paidFixedFor.add(inv.patient_id);
                } else {
                    amount = 0;
                }
                rate = 0;
                services = [];
            }

            const l = ledger.get(inv.id);
            const locked = !!l && l.status !== 'accrued' && l.status !== 'void';
            if (filters?.settlement === 'pending' && locked) continue;
            if (filters?.settlement === 'invoiced' && !locked) continue;

            const name = inv.patient?.full_name ?? '';
            if (
                term &&
                !(
                    name.toLowerCase().includes(term) ||
                    String(inv.patient_id).toLowerCase().includes(term) ||
                    String(inv.invoice_number).toLowerCase().includes(term)
                )
            ) {
                continue;
            }

            if (!patients.has(inv.patient_id)) {
                patients.set(inv.patient_id, {
                    patient_id: inv.patient_id,
                    patient_name: name,
                    phone: inv.patient?.phone ?? null,
                    bills: [] as any[],
                });
            }
            patients.get(inv.patient_id).bills.push({
                invoice_id: inv.id,
                invoice_number: inv.invoice_number,
                invoice_type: inv.invoice_type,
                status: inv.status,
                created_at: inv.created_at,
                bill_net: num(inv.net_amount),
                bill_paid: num(inv.paid_amount),
                collected,
                services,
                rate_applied: rate,
                commission_amount: amount,
                commission_status: l?.status ?? null,
                locked,
            });
        }

        const list = [...patients.values()].map((p: any) => ({
            ...p,
            visit_count: p.bills.length,
            last_visit: p.bills[0]?.created_at ?? null,
            total_collected: p.bills.reduce((s: number, b: any) => s + b.collected, 0),
            total_commission: p.bills.reduce((s: number, b: any) => s + b.commission_amount, 0),
            selectable_count: p.bills.filter((b: any) => !b.locked).length,
        }));
        list.sort((a: any, b: any) => new Date(b.last_visit ?? 0).getTime() - new Date(a.last_visit ?? 0).getTime());

        const allBills = list.flatMap((p: any) => p.bills);
        const configured =
            (referrer.commission_type === 'flat_percent' && num(referrer.flat_percent) > 0) ||
            (referrer.commission_type === 'per_service' &&
                (referrer.service_rates || []).some((r: any) => num(r.percent) > 0)) ||
            (referrer.commission_type === 'fixed_per_patient' && fixedAmount > 0);

        return {
            success: true,
            data: {
                referrer: { id: referrer.id, name: referrer.name, category: referrer.category },
                org: {
                    name: org?.name ?? 'Hospital OS',
                    address: org?.address ?? null,
                    phone: org?.phone ?? null,
                    license_no: org?.license_no ?? null,
                },
                commission_type: referrer.commission_type,
                commission_configured: configured,
                patients: list,
                totals: {
                    patients: list.length,
                    bills: allBills.length,
                    collected: allBills.reduce((s: number, b: any) => s + b.collected, 0),
                    commission: allBills.reduce((s: number, b: any) => s + b.commission_amount, 0),
                },
            },
        };
    } catch (error) {
        console.error('getConsultantWorkload error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load consultant workload' };
    }
}

/** Raise a consultant-charge invoice for an explicitly chosen set of bills. */
export async function createConsultantInvoiceForBills(input: {
    referrerId: string;
    invoiceIds: number[];
    payment_mode?: string;
    payment_reference?: string;
    notes?: string;
    mark_paid?: boolean;
}) {
    const __denied = await guardAction('consultant-charge-actions', 'createConsultantInvoiceForBills');
    if (__denied) return __denied;
    try {
        const { referrerId, invoiceIds, payment_mode, payment_reference, notes, mark_paid } = input;
        if (!referrerId) return { success: false, error: 'Consultant is required' };
        if (!Array.isArray(invoiceIds) || !invoiceIds.length) {
            return { success: false, error: 'Select at least one patient' };
        }

        const { db, session, organizationId } = await requireRoleAndTenant(MANAGE_ROLES);
        const statementNumber = await generateConsultantInvoiceNumber(organizationId, db);

        const result = await (db as any).$transaction(async (tx: any) => {
            const referrer = await tx.referrer.findFirst({
                where: { id: referrerId, organizationId },
                include: { service_rates: true },
            });
            if (!referrer) throw new Error('Consultant not found');

            const invoices = await tx.invoices.findMany({
                where: { id: { in: invoiceIds }, organizationId },
                select: {
                    id: true, patient_id: true, invoice_type: true, net_amount: true,
                    paid_amount: true, status: true, created_at: true,
                    items: { select: { net_price: true, description: true } },
                },
                orderBy: { created_at: 'asc' },
            });
            if (!invoices.length) throw new Error('None of the selected bills are available');

            const already = await tx.referralCommission.findMany({
                where: {
                    organizationId,
                    referrer_id: referrerId,
                    invoice_id: { in: invoices.map((i: any) => i.id) },
                    status: { in: ['included_in_statement', 'paid'] },
                },
                select: { invoice_id: true },
            });
            const lockedIds = new Set(already.map((a: any) => a.invoice_id));
            const eligible = invoices.filter(
                (i: any) => !lockedIds.has(i.id) && String(i.status || '').toLowerCase() !== 'cancelled',
            );
            if (!eligible.length) throw new Error('Every selected bill is already on a consultant invoice');

            const dates = eligible.map((i: any) => new Date(i.created_at).getTime());
            const statement = await tx.referralPayoutStatement.create({
                data: {
                    organizationId,
                    referrer_id: referrerId,
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
            const fixedPerPatient = referrer.commission_type === 'fixed_per_patient';
            const paidFixedFor = new Set<string>();
            for (const inv of eligible) {
                const calc = billCharge(referrer, inv, inv.items);
                let { rate, amount } = calc;
                if (fixedPerPatient) {
                    amount = calc.collected > 0 && !paidFixedFor.has(inv.patient_id) ? num(referrer.fixed_amount_per_patient) : 0;
                    if (amount > 0) paidFixedFor.add(inv.patient_id);
                    rate = 0;
                }
                total += amount;

                const row = {
                    organizationId,
                    referrer_id: referrerId,
                    patient_id: inv.patient_id,
                    invoice_id: inv.id,
                    invoice_type: inv.invoice_type,
                    eligible_base: calc.collected.toFixed(2),
                    rate_applied: rate,
                    commission_amount: amount.toFixed(2),
                    status: mark_paid ? 'paid' : 'included_in_statement',
                    statement_id: statement.id,
                };
                await tx.referralCommission.upsert({
                    where: { invoice_id: inv.id },
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

            await tx.referralPayoutStatement.update({
                where: { id: statement.id },
                data: { total_commission: total.toFixed(2), ...(mark_paid ? { paid_amount: total.toFixed(2) } : {}) },
            });

            return {
                statementId: statement.id,
                statementNumber,
                billCount: eligible.length,
                skipped: invoices.length - eligible.length,
                total,
            };
        });

        for (const base of ['/admin/referrals', '/finance/referrals']) {
            revalidatePath(base);
            revalidatePath(`${base}/${referrerId}`);
            revalidatePath(`${base}/${referrerId}/statement`);
        }
        return { success: true, data: result };
    } catch (error) {
        console.error('createConsultantInvoiceForBills error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to raise consultant invoice' };
    }
}
