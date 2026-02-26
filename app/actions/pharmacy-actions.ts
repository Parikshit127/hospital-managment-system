'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { checkDrugInteractions } from '@/app/lib/drug-safety';

export async function getInventory() {
    try {
        const { db } = await requireTenantContext();

        const inventory = await db.pharmacy_batch_inventory.findMany({
            where: { current_stock: { gt: 0 } },
            include: { medicine: true }, // Include Master Data
            orderBy: { expiry_date: 'asc' },
        });
        return { success: true, data: inventory };
    } catch (error) {
        console.error('Inventory Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function generateInvoice(patientId: string, items: any[]) {
    try {
        const { db } = await requireTenantContext();

        let total = 0;
        const invoiceItems = [];

        // 1. Transaction: Deduct Stock & Calculate Total
        for (const item of items) {
            const batch = await db.pharmacy_batch_inventory.findUnique({
                where: { batch_no: item.batch_no },
                include: { medicine: true }
            });

            if (batch && batch.current_stock >= item.quantity) {
                await db.pharmacy_batch_inventory.update({
                    where: { batch_no: item.batch_no },
                    data: { current_stock: { decrement: item.quantity } }
                });

                const cost = batch.medicine.price_per_unit * item.quantity;
                total += cost;
                invoiceItems.push({
                    medicine_name: batch.medicine.brand_name,
                    qty: item.quantity,
                    price: cost,
                    batch_no: item.batch_no
                });
            }
        }


        await logAudit({
            action: 'MEDICINE_DISPENSED',
            module: 'Pharmacy',
            entity_type: 'pharmacy_order',
            entity_id: patientId,
            details: JSON.stringify({ total, itemCount: invoiceItems.length }),
        });

        revalidatePath('/pharmacy/billing');
        return { success: true, total, items: invoiceItems };
    } catch (error) {
        console.error('Invoice Error:', error);
        return { success: false, error: 'Failed to generate invoice' };
    }
}

export async function getPharmacyQueue() {
    try {
        const { db } = await requireTenantContext();

        const orders = await db.pharmacy_orders.findMany({
            where: { status: { in: ['Pending', 'Processed'] } },
            orderBy: { created_at: 'desc' },
            include: { items: true }
        });

        // Manual Join for Patient Details (since relation is missing in schema)
        const patientIds = Array.from(new Set(orders.map((o: any) => o.patient_id)));
        const patients = await db.oPD_REG.findMany({
            where: { patient_id: { in: patientIds } }
        });

        const ordersWithPatient = orders.map((order: any) => ({
            ...order,
            patient: patients.find((p: any) => p.patient_id === order.patient_id) || null
        }));

        return { success: true, data: ordersWithPatient };
    } catch (error) {
        console.error('Pharmacy Queue Error:', error);
        return { success: false, data: [] };
    }
}

export async function markOrderAsPaid(orderId: number) {
    try {
        const { db } = await requireTenantContext();

        await db.pharmacy_orders.update({
            where: { id: orderId },
            data: { status: 'Completed' }
        });

        await logAudit({
            action: 'ORDER_MARKED_PAID',
            module: 'Pharmacy',
            entity_type: 'pharmacy_order',
            entity_id: String(orderId),
        });

        revalidatePath('/pharmacy/billing');
        return { success: true };
    } catch (error) {
        console.error('Mark Paid Error:', error);
        return { success: false, error: 'Failed to update order' };
    }
}

export async function addInventoryBatch(data: {
    medicine_id?: number,
    brand_name?: string, // If new
    generic_name?: string,
    // category?: string, // Not in schema
    batch_no: string,
    stock: number,
    price: number,
    expiry: Date,
    rack: string
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        let medicineId = data.medicine_id;

        // If new medicine, create master entry first
        if (!medicineId && data.brand_name) {
            const newMed = await db.pharmacy_medicine_master.create({
                data: {
                    brand_name: data.brand_name,
                    generic_name: data.generic_name || '',
                    price_per_unit: data.price,
                    organizationId,
                }
            });
            medicineId = newMed.id;
        }

        if (!medicineId) return { success: false, error: 'Invalid Medicine ID' };

        // Create Batch
        await db.pharmacy_batch_inventory.create({
            data: {
                medicine_id: medicineId,
                batch_no: data.batch_no,
                current_stock: data.stock,
                expiry_date: data.expiry,
                rack_location: data.rack
            }
        });

        revalidatePath('/pharmacy/billing');
        return { success: true };
    } catch (error) {
        console.error('Add Inventory Error:', error);
        return { success: false, error: 'Failed to add inventory' };
    }
}

// Check drug interactions for a list of medicine names
export async function checkInteractions(drugNames: string[]) {
    try {
        const result = await checkDrugInteractions(drugNames);
        if (result.hasInteractions) {
            await logAudit({
                action: 'DRUG_INTERACTION_WARNING',
                module: 'Pharmacy',
                entity_type: 'drug_check',
                details: JSON.stringify({ drugs: drugNames, interactionCount: result.interactions.length }),
            });
        }
        return { success: true, data: result };
    } catch (error: any) {
        console.error('Drug interaction check error:', error);
        return { success: true, data: { hasInteractions: false, interactions: [] } };
    }
}
