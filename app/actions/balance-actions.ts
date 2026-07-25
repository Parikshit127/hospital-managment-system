'use server';

import { requireTenantContext } from '@/backend/tenant';

export type PatientBalances = {
    totalBalance: number;
    labBalance: number;
    pharmacyBalance: number;
    standardBalance: number;
};

export async function getPatientBalances(patientIds: string[]): Promise<Record<string, PatientBalances>> {
    if (!patientIds || patientIds.length === 0) return {};
    
    try {
        const { db } = await requireTenantContext();

        // These four reads are independent, and were issued one after another —
        // four sequential round trips to a pooled remote database on a path that
        // every IPD list load goes through. Issued together instead.
        //
        // 1. Standard invoice balances.
        // 2. Lab orders that are neither cancelled nor completed still owe their price.
        // 3. Pharmacy orders, same rule.
        // 4. The lab price list, used to value (2).
        const [invoices, labOrders, pharmacyOrders, tests] = await Promise.all([
            db.invoices.findMany({
                where: {
                    patient_id: { in: patientIds },
                    status: { not: 'Cancelled' },
                },
                select: { patient_id: true, balance_due: true, invoice_type: true },
            }),
            db.lab_orders.findMany({
                where: {
                    patient_id: { in: patientIds },
                    status: { notIn: ['Cancelled', 'Completed'] },
                },
                select: { patient_id: true, test_type: true, status: true },
            }),
            db.pharmacy_orders.findMany({
                where: {
                    patient_id: { in: patientIds },
                    status: { notIn: ['Cancelled', 'Completed'] },
                },
                select: { patient_id: true, total_amount: true, status: true },
            }),
            db.lab_test_inventory.findMany({ select: { test_name: true, price: true } }),
        ]);

        const priceMap = new Map<string, number>(
            tests.map((t: any) => [String(t.test_name).toLowerCase(), Number(t.price)]),
        );

        // Aggregate
        const balances: Record<string, PatientBalances> = {};
        for (const pid of patientIds) {
            balances[pid] = { totalBalance: 0, labBalance: 0, pharmacyBalance: 0, standardBalance: 0 };
        }

        for (const inv of invoices) {
            const bal = Math.max(0, Number(inv.balance_due || 0));
            balances[inv.patient_id].standardBalance += bal;
            balances[inv.patient_id].totalBalance += bal;
            
            // Sometimes in the system hybrid invoices happen
            if (inv.invoice_type === 'LAB') balances[inv.patient_id].labBalance += bal;
            if (inv.invoice_type === 'PHARMACY') balances[inv.patient_id].pharmacyBalance += bal;
        }

        for (const lab of labOrders) {
            const price = priceMap.get(lab.test_type.toLowerCase()) || 0;
            const bal = Math.max(0, price);
            balances[lab.patient_id].labBalance += bal;
            balances[lab.patient_id].totalBalance += bal;
        }

        for (const pharm of pharmacyOrders) {
            const bal = Math.max(0, Number(pharm.total_amount || 0));
            balances[pharm.patient_id].pharmacyBalance += bal;
            balances[pharm.patient_id].totalBalance += bal;
        }

        return balances;
    } catch (error) {
        console.error('getPatientBalances Error:', error);
        return {};
    }
}
