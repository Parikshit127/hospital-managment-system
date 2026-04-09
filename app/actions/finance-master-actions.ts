'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

function serialize(obj: any) {
    return JSON.parse(JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    ));
}

export async function getMasterBillingData(params: {
    page?: number;
    limit?: number;
    search?: string;
    filter?: 'ALL' | 'ACTIVE' | 'SETTLED';
}) {
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
                { phone: { contains: params.search } },
            ];
        }

        // We will fetch the patients, and then fetch their invoices
        // If they want ACTIVE only, we might need a more complex join,
        // but for now, we'll fetch patients and filter in-memory if needed,
        // OR we can just fetch invoices group by patient_id if filter is ACTIVE.

        let patientIdsToFetch: string[] | undefined = undefined;

        if (params.filter === 'ACTIVE') {
            // Find patients with at least one active invoice
            const activeInvoices = await db.invoices.groupBy({
                by: ['patient_id'],
                where: {
                    balance_due: { gt: 0 },
                    status: { not: 'Cancelled' },
                    organizationId
                }
            });
            patientIdsToFetch = activeInvoices.map((inv: any) => inv.patient_id as string);
        } else if (params.filter === 'SETTLED') {
            // This could be complex, let's just fetch all and rely on the UI/API to sort it out
        }

        if (patientIdsToFetch) {
            where.patient_id = { in: patientIdsToFetch };
        }

        const [total, patients] = await Promise.all([
            db.oPD_REG.count({ where }),
            db.oPD_REG.findMany({
                where,
                orderBy: { created_at: 'desc' },
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

        // Map invoices to patients
        const mappedPatients = patients.map((patient: any) => {
            const patientInvoices = invoices.filter((inv: any) => inv.patient_id === patient.patient_id);
            const totalBalance = patientInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0);
            const totalPaid = patientInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paid_amount || 0), 0);
            
            return {
                ...patient,
                total_balance: totalBalance,
                total_paid: totalPaid,
                status: totalBalance > 0 ? 'Pending' : 'Settled',
                invoices: patientInvoices
            };
        });

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
