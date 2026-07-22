'use server';

/**
 * Single Patient Report — everything on one patient (UHID) in one place:
 * demographics, OPD visits, IPD admissions, invoices, payments, refunds,
 * deposits, lab orders and pharmacy indents.
 *
 * The existing Reception "Patient Reports" are list reports across many
 * patients for a date range. Staff kept asking for the opposite view — one
 * patient, whole history — which did not exist anywhere in the system.
 */

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(v: T): T {
    return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? Number(val) : val)));
}

export async function searchPatientsForReport(query: string) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const q = (query || '').trim();
        if (q.length < 2) return { success: true, data: [] };

        const patients = await db.oPD_REG.findMany({
            where: {
                organizationId,
                OR: [
                    { patient_id: { contains: q, mode: 'insensitive' } },
                    { full_name: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q } },
                ],
            },
            select: { patient_id: true, full_name: true, phone: true, age: true, gender: true },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        return { success: true, data: serialize(patients) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getSinglePatientReport(patientId: string) {
    const { organizationId } = await requireTenantContext();
    return getSinglePatientReportFor(patientId, organizationId);
}

/**
 * Same report, but for a caller that has already resolved the organisation
 * (the printable route authenticates via resolveRouteAuth rather than the
 * server-action tenant context).
 */
export async function getSinglePatientReportFor(patientId: string, organizationId: string) {
    try {
        const { db } = await requireTenantContext();
        const id = (patientId || '').trim();
        if (!id) return { success: false, error: 'Patient UHID is required.' };

        const patient = await db.oPD_REG.findFirst({
            where: { patient_id: id, organizationId },
        });
        if (!patient) return { success: false, error: `No patient found with UHID "${id}".` };

        const [invoices, admissions, appointments, deposits, labOrders, indents] = await Promise.all([
            db.invoices.findMany({
                where: { patient_id: id, organizationId },
                orderBy: { created_at: 'desc' },
                include: {
                    payments: {
                        select: {
                            id: true, receipt_number: true, amount: true,
                            payment_method: true, status: true, created_at: true,
                        },
                        orderBy: { created_at: 'desc' },
                    },
                },
                take: 200,
            }),
            db.admissions.findMany({
                where: { patient_id: id, organizationId },
                orderBy: { admission_date: 'desc' },
                take: 50,
            }).catch(() => []),
            db.appointments.findMany({
                where: { patient_id: id, organizationId },
                orderBy: { appointment_date: 'desc' },
                take: 100,
            }).catch(() => []),
            db.patientDeposit.findMany({
                where: { patient_id: id, organizationId },
                orderBy: { created_at: 'desc' },
                take: 100,
            }).catch(() => []),
            db.lab_orders.findMany({
                where: { patient_id: id, organizationId },
                orderBy: { created_at: 'desc' },
                take: 100,
            }).catch(() => []),
            db.pharmacy_orders.findMany({
                where: { patient_id: id, organizationId },
                orderBy: { created_at: 'desc' },
                take: 100,
                include: { items: { select: { medicine_name: true, quantity_requested: true, quantity_dispensed: true } } },
            }).catch(() => []),
        ]);

        // Refunds have no relation to the patient — reach them through this
        // patient's payment ids.
        const paymentIds = invoices.flatMap((i: any) => i.payments.map((p: any) => String(p.id)));
        const refunds = paymentIds.length
            ? await db.refund.findMany({
                where: { organizationId, payment_id: { in: paymentIds } },
                orderBy: { created_at: 'desc' },
            })
            : [];

        const activeInvoices = invoices.filter((i: any) => String(i.status).toLowerCase() !== 'cancelled');
        const billed = activeInvoices.reduce((s: number, i: any) => s + Number(i.net_amount || 0), 0);
        const paid = activeInvoices.reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0);
        const outstanding = activeInvoices.reduce((s: number, i: any) => s + Number(i.balance_due || 0), 0);
        const refunded = refunds
            .filter((r: any) => ['Processed', 'Approved'].includes(r.status))
            .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const depositCollected = deposits
            .filter((d: any) => d.status !== 'Cancelled')
            .reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
        const depositAvailable = deposits
            .filter((d: any) => d.status === 'Active')
            .reduce((s: number, d: any) => s + (Number(d.amount || 0) - Number(d.applied_amount || 0) - Number(d.refunded_amount || 0)), 0);

        return {
            success: true,
            data: serialize({
                patient,
                summary: {
                    total_billed: billed,
                    total_paid: paid,
                    outstanding,
                    refunded,
                    deposit_collected: depositCollected,
                    deposit_available: depositAvailable,
                    invoice_count: invoices.length,
                    visit_count: appointments.length,
                    admission_count: admissions.length,
                },
                invoices,
                admissions,
                appointments,
                deposits,
                refunds,
                labOrders,
                indents,
            }),
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
