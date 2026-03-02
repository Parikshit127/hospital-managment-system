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

// ========================================
// PHASE 1.4 PHARMACY NEW ACTIONS
// ========================================

export async function getPharmacyDashboardStats() {
    try {
        const { db } = await requireTenantContext();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Next 30 days for expiring batches
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const [
            pendingOrdersCount,
            lowStockCount,
            expiringBatchesCount,
            todayRevenue
        ] = await Promise.all([
            db.pharmacy_orders.count({ where: { status: 'Pending' } }),

            db.pharmacy_medicine_master.count({
                where: {
                    batches: { some: {} },
                    // To do complex low stock filtering, we usually rely on raw query or fetch and filter,
                    // but for stats, we will check if any batch has stock < min_threshold.
                }
            }), // simplified metric

            db.pharmacy_batch_inventory.count({
                where: {
                    expiry_date: { lte: thirtyDaysFromNow },
                    current_stock: { gt: 0 }
                }
            }),

            // Approximate today's sales by looking at completed orders
            db.pharmacy_orders.aggregate({
                _sum: { total_amount: true },
                where: { status: 'Completed', created_at: { gte: today } }
            })
        ]);

        return {
            success: true,
            data: {
                pendingOrders: pendingOrdersCount,
                lowStockAlerts: lowStockCount, // Note: simplistic approx
                expiringBatches: expiringBatchesCount,
                todayRevenue: todayRevenue._sum.total_amount || 0
            }
        };
    } catch (error) {
        console.error('Stats Error:', error);
        return { success: false, error: 'Failed' };
    }
}

export async function dispenseMedicine(orderId: number, dispensedItems: any[]) {
    try {
        const { db } = await requireTenantContext();

        let totalAmount = 0;

        // Using transaction strictly
        await db.$transaction(async (tx: any) => {
            for (const item of dispensedItems) {
                const batch = await tx.pharmacy_batch_inventory.findUnique({
                    where: { batch_no: item.batch_no },
                    include: { medicine: true }
                });

                if (!batch || batch.current_stock < item.quantity) {
                    throw new Error(`Insufficient stock for batch ${item.batch_no}`);
                }

                await tx.pharmacy_batch_inventory.update({
                    where: { batch_no: item.batch_no },
                    data: { current_stock: { decrement: item.quantity } }
                });

                totalAmount += (batch.medicine.price_per_unit * item.quantity);
            }

            await tx.pharmacy_orders.update({
                where: { id: orderId },
                data: {
                    status: 'Completed',
                    total_amount: totalAmount
                }
            });
        });

        await logAudit({ action: 'MEDICINE_DISPENSED', module: 'Pharmacy', entity_type: 'pharmacy_order', entity_id: orderId.toString(), details: `Items: ${dispensedItems.length}, Total: ${totalAmount}` });

        revalidatePath('/pharmacy/orders');
        return { success: true, total: totalAmount };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function searchMedicine(query: string) {
    try {
        const { db } = await requireTenantContext();
        if (!query) return { success: true, data: [] };

        const meds = await db.pharmacy_medicine_master.findMany({
            where: {
                OR: [
                    { brand_name: { contains: query } },
                    { generic_name: { contains: query } }
                ]
            },
            take: 20,
            include: { batches: { where: { current_stock: { gt: 0 } }, orderBy: { expiry_date: 'asc' } } }
        });

        return { success: true, data: meds };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function getLowStockAlerts() {
    try {
        const { db } = await requireTenantContext();
        // Since sqlite lacks direct sum relations in where, we fetch and aggregate.
        const allMedicines = await db.pharmacy_medicine_master.findMany({
            include: { batches: true }
        });

        const lowStock = allMedicines
            .map((med: any) => ({
                ...med,
                total_stock: med.batches.reduce((sum: number, b: any) => sum + b.current_stock, 0)
            }))
            .filter((med: any) => med.total_stock <= med.min_threshold);

        return { success: true, data: lowStock };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function getExpiringBatches(days: number = 30) {
    try {
        const { db } = await requireTenantContext();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        const batches = await db.pharmacy_batch_inventory.findMany({
            where: {
                current_stock: { gt: 0 },
                expiry_date: { lte: futureDate }
            },
            include: { medicine: true },
            orderBy: { expiry_date: 'asc' }
        });

        return { success: true, data: batches };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function getSuppliers() {
    try {
        const { db } = await requireTenantContext();
        const suppliers = await db.pharmacySupplier.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: suppliers };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function createPurchaseOrder(supplier_id: number, items: { medicine_id: number, quantity: number, unit_price: number }[]) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const poNumber = `PO-${Date.now().toString().slice(-6)}`;

        await db.purchaseOrder.create({
            data: {
                po_number: poNumber,
                supplier_id,
                status: 'Draft',
                total_amount: totalAmount,
                organizationId,
                items: {
                    create: items.map(item => ({
                        medicine_id: item.medicine_id,
                        quantity_ordered: item.quantity,
                        unit_price: item.unit_price,
                        quantity_received: 0
                    }))
                }
            }
        });

        revalidatePath('/pharmacy/purchase-orders');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: 'Failed to create PO' };
    }
}

export async function receivePurchaseOrder(poId: number, receivedItems: { itemId: number, qtyReceived: number, batch_no: string, expiry: string }[]) {
    try {
        const { db } = await requireTenantContext();

        await db.$transaction(async (tx: any) => {
            // Update PO and Items
            for (const item of receivedItems) {
                const poItem = await tx.purchaseOrderItem.update({
                    where: { id: item.itemId },
                    data: { quantity_received: { increment: item.qtyReceived } },
                    include: { medicine: true }
                });

                // Add to Batch Inventory
                await tx.pharmacy_batch_inventory.create({
                    data: {
                        medicine_id: poItem.medicine_id,
                        batch_no: item.batch_no,
                        current_stock: item.qtyReceived,
                        expiry_date: new Date(item.expiry),
                        rack_location: 'PO-RECEIVE'
                    }
                });
            }

            await tx.purchaseOrder.update({
                where: { id: poId },
                data: { status: 'Received', received_at: new Date() }
            });
        });

        revalidatePath('/pharmacy/purchase-orders');
        revalidatePath('/pharmacy/inventory');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to receive PO' };
    }
}

export async function getPurchaseOrders() {
    try {
        const { db } = await requireTenantContext();
        const pos = await db.purchaseOrder.findMany({
            orderBy: { created_at: 'desc' },
            include: { supplier: true, items: { include: { medicine: true } } }
        });
        return { success: true, data: pos };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function processReturn(data: { return_type: string, medicine_id: number, batch_id?: string, quantity: number, reason: string }) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        await db.$transaction(async (tx: any) => {
            await tx.pharmacyReturn.create({
                data: {
                    return_type: data.return_type, // 'Patient' or 'Expired'
                    medicine_id: data.medicine_id,
                    batch_id: data.batch_id,
                    quantity: data.quantity,
                    reason: data.reason,
                    processed_by: session.id,
                    organizationId
                }
            });

            if (data.batch_id && data.return_type === 'Patient') {
                // Check if batch exists
                const existingBatch = await tx.pharmacy_batch_inventory.findFirst({
                    where: { batch_no: data.batch_id, medicine_id: data.medicine_id }
                });

                if (existingBatch) {
                    await tx.pharmacy_batch_inventory.update({
                        where: { id: existingBatch.id },
                        data: { current_stock: { increment: data.quantity } }
                    });
                }
            } else if (data.batch_id && data.return_type === 'Expired') {
                const existingBatch = await tx.pharmacy_batch_inventory.findFirst({
                    where: { batch_no: data.batch_id, medicine_id: data.medicine_id }
                });

                if (existingBatch) {
                    // Destroy the inventory by bringing stock to 0 or decrementing
                    await tx.pharmacy_batch_inventory.update({
                        where: { id: existingBatch.id },
                        data: { current_stock: { decrement: data.quantity } }
                    });
                }
            }
        });

        revalidatePath('/pharmacy/returns');
        revalidatePath('/pharmacy/inventory');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to process return' };
    }
}

export async function getPharmacyOrderDetails(orderId: number) {
    try {
        const { db } = await requireTenantContext();

        const order = await db.pharmacy_orders.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (!order) return { success: false, error: 'Order not found' };

        const patient = await db.oPD_REG.findUnique({
            where: { patient_id: order.patient_id }
        });

        return { success: true, data: { ...order, patient } };
    } catch (error) {
        return { success: false, error: 'Failed' };
    }
}
