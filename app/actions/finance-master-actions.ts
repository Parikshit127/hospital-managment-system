'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

function serialize(obj: any) {
    return JSON.parse(JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    ));
}

export type MasterBillingFilters = {
    page?: number;
    limit?: number;
    search?: string;
    filter?: 'ALL' | 'ACTIVE' | 'SETTLED';
    patientType?: 'ALL' | 'OPD' | 'IPD' | 'WALKIN';
    tpaStatus?: 'ALL' | 'NONE' | 'PENDING' | 'APPROVED' | 'SETTLED';
    dateFrom?: string;
    dateTo?: string;
    minBalance?: number;
    maxBalance?: number;
    sortBy?: 'recent' | 'oldest' | 'balance_desc' | 'balance_asc' | 'name_asc';
};

export async function getMasterBillingData(params: MasterBillingFilters) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const page = params.page || 1;
        const limit = params.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = { organizationId };

        if (params.search) {
            where.OR = [
                { full_name: { contains: params.search, mode: 'insensitive' } },
                { patient_id: { contains: params.search, mode: 'insensitive' } },
                { phone: { contains: params.search, mode: 'insensitive' } },
            ];
        }

        // ---- Invoice-level criteria -------------------------------------------------
        // We narrow the patient set by deriving the patient_ids whose invoices match
        // every active filter. This is one indexed groupBy regardless of how many
        // filter dimensions are on, which keeps the dashboard snappy even when the
        // hospital has tens of thousands of bills.
        const invoiceWhere: any = { organizationId };
        let invoiceFilterActive = false;

        if (params.filter === 'ACTIVE') {
            invoiceWhere.balance_due = { gt: 0 };
            invoiceWhere.status = { not: 'Cancelled' };
            invoiceFilterActive = true;
        }

        if (params.patientType && params.patientType !== 'ALL') {
            // invoice_type column stores the originating workflow string —
            // exact-match because the column is short-form (OPD/IPD/PHARMACY/WALKIN).
            const typeMap: Record<string, string> = {
                OPD: 'OPD',
                IPD: 'IPD',
                WALKIN: 'WALKIN',
            };
            invoiceWhere.invoice_type = typeMap[params.patientType];
            invoiceFilterActive = true;
        }

        if (params.tpaStatus && params.tpaStatus !== 'ALL') {
            switch (params.tpaStatus) {
                case 'NONE':
                    invoiceWhere.billing_patient_type = { not: 'tpa_insurance' };
                    break;
                case 'PENDING':
                    invoiceWhere.billing_patient_type = 'tpa_insurance';
                    invoiceWhere.tpa_claim_status = {
                        in: ['not_submitted', 'submitted', 'under_review']
                    };
                    break;
                case 'APPROVED':
                    invoiceWhere.tpa_claim_status = { in: ['approved', 'partially_settled'] };
                    break;
                case 'SETTLED':
                    invoiceWhere.tpa_claim_status = 'settled';
                    break;
            }
            invoiceFilterActive = true;
        }

        if (params.dateFrom || params.dateTo) {
            invoiceWhere.created_at = {};
            if (params.dateFrom) invoiceWhere.created_at.gte = new Date(params.dateFrom);
            if (params.dateTo) {
                // Inclusive end-of-day so a user picking "today" gets bills generated
                // up to 23:59:59.999 — matches the visible calendar expectation.
                const end = new Date(params.dateTo);
                end.setHours(23, 59, 59, 999);
                invoiceWhere.created_at.lte = end;
            }
            invoiceFilterActive = true;
        }

        if (invoiceFilterActive) {
            const matchingInvoices = await db.invoices.groupBy({
                by: ['patient_id'],
                where: invoiceWhere,
            });
            const ids = matchingInvoices.map((inv: any) => inv.patient_id as string);
            // Empty match → short-circuit; no point hitting OPD_REG.
            if (ids.length === 0) {
                return {
                    success: true,
                    data: [],
                    meta: { total: 0, page, limit, totalPages: 0 }
                };
            }
            where.patient_id = { in: ids };
        }

        // SETTLED filter — patients whose every non-cancelled bill is zero-balance.
        // Handled post-fetch because it's a NOT-EXISTS shape Prisma doesn't expose
        // cleanly on groupBy. Cost is bounded by the page limit.

        // Sort handling — name + recency are cheap on OPD_REG; balance sorts need
        // the post-aggregation result so we sort in-memory at the end.
        let orderBy: any = { created_at: 'desc' };
        if (params.sortBy === 'oldest') orderBy = { created_at: 'asc' };
        if (params.sortBy === 'name_asc') orderBy = { full_name: 'asc' };

        const [total, patients] = await Promise.all([
            db.oPD_REG.count({ where }),
            db.oPD_REG.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                select: {
                    id: true,
                    patient_id: true,
                    full_name: true,
                    phone: true,
                    age: true,
                    gender: true,
                    created_at: true,
                    department: true
                }
            })
        ]);

        const patientIds = patients.map((p: any) => p.patient_id);

        const invoices = await db.invoices.findMany({
            where: { patient_id: { in: patientIds }, organizationId },
            include: {
                items: true,
                payments: { orderBy: { created_at: 'desc' } }
            },
            orderBy: { created_at: 'desc' }
        });

        let mappedPatients = patients.map((patient: any) => {
            const patientInvoices = invoices.filter((inv: any) => inv.patient_id === patient.patient_id);
            const activeInvoices = patientInvoices.filter((inv: any) => inv.status !== 'Cancelled');
            const totalBalance = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0);
            const totalPaid = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paid_amount || 0), 0);

            return {
                ...patient,
                total_balance: totalBalance,
                total_paid: totalPaid,
                status: totalBalance > 0 ? 'Pending' : 'Settled',
                invoices: patientInvoices
            };
        });

        // Post-aggregation filters (SETTLED + balance range)
        if (params.filter === 'SETTLED') {
            mappedPatients = mappedPatients.filter((p: any) => p.total_balance <= 0 && p.invoices.length > 0);
        }
        if (typeof params.minBalance === 'number') {
            mappedPatients = mappedPatients.filter((p: any) => p.total_balance >= params.minBalance!);
        }
        if (typeof params.maxBalance === 'number') {
            mappedPatients = mappedPatients.filter((p: any) => p.total_balance <= params.maxBalance!);
        }

        // Post-aggregation sort options
        if (params.sortBy === 'balance_desc') {
            mappedPatients.sort((a: any, b: any) => b.total_balance - a.total_balance);
        } else if (params.sortBy === 'balance_asc') {
            mappedPatients.sort((a: any, b: any) => a.total_balance - b.total_balance);
        }

        return {
            success: true,
            data: serialize(mappedPatients),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };

    } catch (error: any) {
        console.error('getMasterBillingData Error:', error);
        return { success: false, error: error.message };
    }
}
