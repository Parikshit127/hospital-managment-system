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

        // 1. Standard Invoices balances (from `invoices` table)
        const invoices = await db.invoices.findMany({
            where: {
                patient_id: { in: patientIds },
                status: { not: 'Cancelled' }, // Not cancelled
            },
            select: { patient_id: true, balance_due: true, invoice_type: true }
        });

        // 2. Lab Orders balances
        // If a lab order is not completed/cancelled, it still owes its price.
        // Once paid, its invoice balance should be handled by standard if it was billed there,
        // but `finance-actions.ts` implies lab status='Completed' means Paid implicitly without invoice.
        const labOrders = await db.lab_orders.findMany({
            where: {
                patient_id: { in: patientIds },
                status: { notIn: ['Cancelled', 'Completed'] }
            },
            select: { patient_id: true, test_type: true, status: true }
        });
        
        let priceMap = new Map<string, number>();
        if (labOrders.length > 0) {
            const tests = await db.lab_test_inventory.findMany({
                select: { test_name: true, price: true }
            });
            priceMap = new Map(tests.map((t: any) => [t.test_name.toLowerCase(), Number(t.price)]));
        }

        // 3. Pharmacy Orders balances
        // Same implicit paid status mapping as Lab
        const pharmacyOrders = await db.pharmacy_orders.findMany({
            where: {
                patient_id: { in: patientIds },
                status: { notIn: ['Cancelled', 'Completed'] }
            },
            select: { patient_id: true, total_amount: true, status: true }
        });

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
