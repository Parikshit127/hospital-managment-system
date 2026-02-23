'use server';

import { prisma } from '@/app/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { checkDrugInteractions } from '@/app/lib/drug-safety';
const WEBHOOK_INVOICE = 'https://n8n.srv1336142.hstgr.cloud/webhook-test/dispense-medicine';

export async function getInventory() {
    try {
        const inventory = await prisma.pharmacy_batch_inventory.findMany({
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
        let total = 0;
        const invoiceItems = [];

        // 1. Transaction: Deduct Stock & Calculate Total
        for (const item of items) {
            const batch = await prisma.pharmacy_batch_inventory.findUnique({
                where: { batch_no: item.batch_no },
                include: { medicine: true }
            });

            if (batch && batch.current_stock >= item.quantity) {
                await prisma.pharmacy_batch_inventory.update({
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

        // 2. Send to Webhook (Generates PDF Invoice)
        // The Agent 'Pharmacy.json' expects: { batch_id, qty_to_deduct } in a loop? 
        // Actually looking at 'Pharmacy.json' node 'Check Stock', it takes 'body.medicines.name'.
        // And 'Split Out1' takes 'updates'. 
        // This agent seems complex. For MVP, we send the "Bill Data" to generate the invoice.

        // We will send a simplified payload that matched the "Report" node logic if possible, 
        // or just trigger it to get a PDF back.

        await fetch(WEBHOOK_INVOICE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient_id: patientId,
                medicines: invoiceItems,
                total_amount: total,
                date: new Date()
            }),
        }).catch(err => console.error(err));

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
        const orders = await prisma.pharmacy_orders.findMany({
            where: { status: { in: ['Pending', 'Processed'] } },
            orderBy: { created_at: 'desc' },
            include: { items: true }
        });

        // Manual Join for Patient Details (since relation is missing in schema)
        const patientIds = Array.from(new Set(orders.map(o => o.patient_id)));
        const patients = await prisma.oPD_REG.findMany({
            where: { patient_id: { in: patientIds } }
        });

        const ordersWithPatient = orders.map(order => ({
            ...order,
            patient: patients.find(p => p.patient_id === order.patient_id) || null
        }));

        return { success: true, data: ordersWithPatient };
    } catch (error) {
        console.error('Pharmacy Queue Error:', error);
        return { success: false, data: [] };
    }
}

export async function markOrderAsPaid(orderId: number) {
    try {
        await prisma.pharmacy_orders.update({
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
        let medicineId = data.medicine_id;

        // If new medicine, create master entry first
        if (!medicineId && data.brand_name) {
            const newMed = await prisma.pharmacy_medicine_master.create({
                data: {
                    brand_name: data.brand_name,
                    generic_name: data.generic_name || '',
                    price_per_unit: data.price,
                }
            });
            medicineId = newMed.id;
        }

        if (!medicineId) return { success: false, error: 'Invalid Medicine ID' };

        // Create Batch
        await prisma.pharmacy_batch_inventory.create({
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
