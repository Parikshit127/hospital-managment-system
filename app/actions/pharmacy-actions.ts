'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { checkDrugInteractions } from '@/app/lib/drug-safety';
import { getPatientBalances } from '@/app/actions/balance-actions';
import { postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';
import { postInvoiceToGL } from '@/app/actions/gl-actions';
import { syncInvoiceToGSTRegister } from '@/app/actions/gst-compliance-actions';

function generatePharmacyInvoiceNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `PINV-${dateStr}-${seq}`;
}

function generatePharmacyReceiptNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `PRCP-${dateStr}-${seq}`;
}

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
        const { db, organizationId } = await requireTenantContext();

        let totalAmount = 0;
        let totalTax = 0;
        const invoiceItems: any[] = [];

        // 1. Deduct stock & build line items with GST
        for (const item of items) {
            const batch = await db.pharmacy_batch_inventory.findFirst({
                where: { batch_no: item.batch_no, medicine_id: item.medicine_id },
                include: { medicine: true }
            });

            if (batch && batch.current_stock >= item.quantity) {
                await db.pharmacy_batch_inventory.update({
                    where: { id: batch.id },
                    data: { current_stock: { decrement: item.quantity } }
                });

                const unitPrice = Number(batch.medicine.selling_price) || Number(batch.medicine.price_per_unit) || 0;
                const netPrice = unitPrice * item.quantity;
                const taxRate = Number(batch.medicine.gst_percent) || Number(batch.medicine.tax_rate) || 0;
                const taxAmount = netPrice * taxRate / 100;

                totalAmount += netPrice;
                totalTax += taxAmount;

                invoiceItems.push({
                    medicine_name: batch.medicine.brand_name,
                    medicine_id: batch.medicine.id,
                    qty: item.quantity,
                    unit_price: unitPrice,
                    net_price: netPrice,
                    tax_rate: taxRate,
                    tax_amount: taxAmount,
                    hsn_sac_code: batch.medicine.hsn_sac_code || '3004',
                    mrp: Number(batch.medicine.mrp) || unitPrice,
                    batch_no: item.batch_no
                });
            }
        }

        if (invoiceItems.length === 0) {
            return { success: false, error: 'No items could be dispensed — check stock levels and batch numbers' };
        }

        // 2. Ensure walk-in patient record exists (for OTC/counter sales without registered patient)
        if (patientId === 'WALKIN') {
            await db.oPD_REG.upsert({
                where: { patient_id: 'WALKIN' },
                create: {
                    patient_id: 'WALKIN',
                    full_name: 'Walk-in Patient (OTC)',
                    organizationId,
                },
                update: {}
            });
        }

        // 3. Create formal invoice in finance system
        const netAmount = totalAmount + totalTax;
        const cgst = totalTax / 2;
        const sgst = totalTax / 2;

        const invoice = await db.invoices.create({
            data: {
                invoice_number: generatePharmacyInvoiceNumber(),
                patient_id: patientId,
                invoice_type: 'Pharmacy',
                status: 'Final',
                total_amount: totalAmount,
                total_discount: 0,
                net_amount: netAmount,
                paid_amount: 0,
                balance_due: netAmount,
                total_tax: totalTax,
                cgst_amount: cgst,
                sgst_amount: sgst,
                igst_amount: 0,
                is_inter_state: false,
                organizationId,
            }
        });

        // 3. Create invoice line items with GST
        for (const item of invoiceItems) {
            await db.invoice_items.create({
                data: {
                    invoice_id: invoice.id,
                    department: 'Pharmacy',
                    description: `${item.medicine_name} (Batch: ${item.batch_no})`,
                    quantity: item.qty,
                    unit_price: item.unit_price,
                    total_price: item.unit_price * item.qty,
                    discount: 0,
                    net_price: item.net_price,
                    tax_rate: item.tax_rate,
                    tax_amount: item.tax_amount,
                    hsn_sac_code: item.hsn_sac_code,
                    service_category: 'Pharmacy',
                    organizationId,
                }
            });
        }

        // 4. Post to GL and GST register
        await postInvoiceToGL(invoice.id).catch(err =>
            console.error('GL posting failed for pharmacy invoice:', invoice.id, err)
        );
        await syncInvoiceToGSTRegister(invoice.id).catch(err =>
            console.error('GST sync failed for pharmacy invoice:', invoice.id, err)
        );

        // 5. Audit log
        await logAudit({
            action: 'PHARMACY_INVOICE_CREATED',
            module: 'Pharmacy',
            entity_type: 'invoice',
            entity_id: invoice.invoice_number,
            details: JSON.stringify({ total: netAmount, itemCount: invoiceItems.length, patientId }),
        });

        revalidatePath('/pharmacy/billing');
        return {
            success: true,
            total: netAmount,
            subtotal: totalAmount,
            tax: totalTax,
            cgst, sgst,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            items: invoiceItems
        };
    } catch (error: any) {
        console.error('Invoice Error:', error?.message || error);
        return { success: false, error: error?.message || 'Failed to generate invoice' };
    }
}

export async function processDoctorOrder(orderId: number, paymentMethod: string = 'Cash') {
    try {
        const { db } = await requireTenantContext();

        // 1. Fetch order details
        const order = await db.pharmacy_orders.findUnique({
            where: { id: orderId },
            include: { items: true }
        });
        if (!order) return { success: false, error: 'Order not found' };
        if (order.status === 'Completed') return { success: false, error: 'Order already processed' };

        // 2. Map items to best available batches (FEFO)
        const dispenseItems = [];
        for (const item of order.items) {
            const batches = await db.pharmacy_batch_inventory.findMany({
                where: { medicine_id: item.medicine_id, current_stock: { gt: 0 } },
                orderBy: { expiry_date: 'asc' }
            });

            if (batches.length === 0) {
                return { success: false, error: `Medicine ${item.medicine_name} is out of stock` };
            }

            // Simple allocation: take from first batch that has enough, or split?
            // For now, take from the earliest expiring batch.
            const batch = batches[0];
            if (batch.current_stock < item.quantity_requested) {
                return { success: false, error: `Insufficient stock for ${item.medicine_name}` };
            }

            dispenseItems.push({
                order_item_id: item.id,
                medicine_id: item.medicine_id,
                batch_no: batch.batch_no,
                quantity: item.quantity_requested
            });
        }

        // 3. Call dispenseMedicine (Atomic)
        const dispenseRes = await dispenseMedicine(orderId, dispenseItems);
        if (!dispenseRes.success) return dispenseRes;

        // 4. Mark as paid if it's an OPD patient (IPD is handled by dispenseMedicine → postChargeToIpdBill)
        if (!order.is_ipd_linked) {
            await markOrderAsPaid(orderId, paymentMethod);
        }

        revalidatePath('/pharmacy/orders');
        revalidatePath('/pharmacy/billing');
        return { success: true };
    } catch (error: any) {
        console.error('Process Doctor Order Error:', error);
        return { success: false, error: error.message };
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
        const patientIds = Array.from(new Set(orders.map((o: any) => o.patient_id))) as string[];
        const patients = await db.oPD_REG.findMany({
            where: { patient_id: { in: patientIds } }
        });
        
        const balances = await getPatientBalances(patientIds);

        // Collect all medicine names from order items to check stock
        const allMedicineNames = Array.from(new Set(
            orders.flatMap((o: any) => o.items.map((i: any) => i.medicine_name))
        ));

        // Fetch stock info for all medicines in these orders
        const medicines = await db.pharmacy_medicine_master.findMany({
            where: { brand_name: { in: allMedicineNames as string[] } },
            include: { batches: { where: { current_stock: { gt: 0 } } } },
        });

        const stockMap = new Map<string, { totalStock: number; status: 'In Stock' | 'Low Stock' | 'Out of Stock' }>();
        for (const med of medicines) {
            const totalStock = (med.batches as any[]).reduce((sum: number, b: any) => sum + b.current_stock, 0);
            stockMap.set(med.brand_name, {
                totalStock,
                status: totalStock === 0 ? 'Out of Stock' : totalStock <= med.min_threshold ? 'Low Stock' : 'In Stock',
            });
        }

        const ordersWithPatient = orders.map((order: any) => {
            const itemsWithStock = order.items.map((item: any) => ({
                ...item,
                stock: stockMap.get(item.medicine_name) || { totalStock: 0, status: 'Out of Stock' },
            }));
            const hasOutOfStock = itemsWithStock.some((i: any) => i.stock.status === 'Out of Stock');
            const hasLowStock = itemsWithStock.some((i: any) => i.stock.status === 'Low Stock');
            return {
                ...order,
                items: itemsWithStock,
                patient: patients.find((p: any) => p.patient_id === order.patient_id) || null,
                stockWarning: hasOutOfStock ? 'Out of Stock' : hasLowStock ? 'Low Stock' : null,
                pharmacyBalance: balances[order.patient_id]?.pharmacyBalance || 0,
            };
        });

        return { success: true, data: ordersWithPatient };
    } catch (error) {
        console.error('Pharmacy Queue Error:', error);
        return { success: false, data: [] };
    }
}

export async function markOrderAsPaid(orderId: number, paymentMethod: string = 'Cash') {
    try {
        const { db } = await requireTenantContext();

        const order = await db.pharmacy_orders.findUnique({ where: { id: orderId } });
        if (!order) return { success: false, error: 'Order not found' };

        // If order has a linked invoice, record payment against it
        if (order.invoice_id) {
            const invoice = await db.invoices.findUnique({ where: { id: order.invoice_id } });
            if (invoice && Number(invoice.balance_due) > 0) {
                const payAmount = Number(invoice.balance_due);
                const payment = await db.payments.create({
                    data: {
                        receipt_number: generatePharmacyReceiptNumber(),
                        invoice_id: invoice.id,
                        amount: payAmount,
                        payment_method: paymentMethod,
                        payment_type: 'Full',
                        status: 'Completed',
                    }
                });

                await db.invoices.update({
                    where: { id: invoice.id },
                    data: {
                        paid_amount: Number(invoice.paid_amount) + payAmount,
                        balance_due: 0,
                        status: 'Paid',
                    }
                });

                // Post payment to GL
                const { postPaymentToGL } = await import('@/app/actions/gl-actions');
                await postPaymentToGL(payment.id).catch(err =>
                    console.error('GL payment posting failed:', payment.id, err)
                );
            }
        }

        await db.pharmacy_orders.update({
            where: { id: orderId },
            data: { status: 'Completed' }
        });

        await logAudit({
            action: 'ORDER_MARKED_PAID',
            module: 'Pharmacy',
            entity_type: 'pharmacy_order',
            entity_id: String(orderId),
            details: JSON.stringify({ paymentMethod, invoice_id: order.invoice_id }),
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

            // Accurate low stock count: Sum stock across batches for each medicine
            (async () => {
                const meds = await db.pharmacy_medicine_master.findMany({
                    include: { batches: true }
                });
                return meds.filter((m: any) => {
                    const total = m.batches.reduce((s: number, b: any) => s + b.current_stock, 0);
                    return total <= m.min_threshold;
                }).length;
            })(),

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
        const { db, organizationId } = await requireTenantContext();

        let totalAmount = 0;
        let totalTax = 0;
        const dispensedDetails: any[] = [];

        // Using transaction strictly
        await db.$transaction(async (tx: any) => {
            for (const item of dispensedItems) {
                // Robust batch lookup: try medicine_id first, fallback to order_item_id resolution
                let medId = item.medicine_id;
                if (!medId && item.order_item_id) {
                    const orderItem = await tx.pharmacy_order_items.findUnique({
                        where: { id: item.order_item_id },
                        select: { medicine_id: true }
                    });
                    medId = orderItem?.medicine_id;
                }

                if (!medId) throw new Error("Could not resolve medicine ID for item");

                const batch = await tx.pharmacy_batch_inventory.findFirst({
                    where: { batch_no: item.batch_no, medicine_id: medId },
                    include: { medicine: true }
                });

                if (!batch || batch.current_stock < item.quantity) {
                    throw new Error(`Insufficient stock for batch ${item.batch_no} of ${batch?.medicine?.brand_name || 'requested medicine'}`);
                }

                await tx.pharmacy_batch_inventory.update({
                    where: { id: batch.id },
                    data: { current_stock: { decrement: item.quantity } }
                });

                const unitPrice = Number(batch.medicine.selling_price) || Number(batch.medicine.price_per_unit) || 0;
                const netPrice = unitPrice * item.quantity;
                const taxRate = Number(batch.medicine.gst_percent) || Number(batch.medicine.tax_rate) || 0;
                const taxAmount = netPrice * taxRate / 100;

                totalAmount += netPrice;
                totalTax += taxAmount;

                dispensedDetails.push({
                    medicine_name: batch.medicine.brand_name,
                    medicine_id: batch.medicine.id,
                    quantity: item.quantity,
                    unit_price: unitPrice,
                    net_price: netPrice,
                    tax_rate: taxRate,
                    tax_amount: taxAmount,
                    hsn_sac_code: batch.medicine.hsn_sac_code || '3004',
                    batch_no: item.batch_no,
                });

                // Update order item with tax info
                if (item.order_item_id) {
                    await tx.pharmacy_order_items.update({
                        where: { id: item.order_item_id },
                        data: {
                            quantity_dispensed: item.quantity,
                            unit_price: unitPrice,
                            total_price: netPrice,
                            batch_id: item.batch_no,
                            tax_rate: taxRate,
                            tax_amount: taxAmount,
                            hsn_sac_code: batch.medicine.hsn_sac_code || '3004',
                            status: 'Dispensed',
                        }
                    });
                }
            }

            const grandTotal = totalAmount + totalTax;
            await tx.pharmacy_orders.update({
                where: { id: orderId },
                data: {
                    status: 'Completed',
                    total_amount: grandTotal,
                    items_dispensed: dispensedItems.length,
                }
            });
        });

        const grandTotal = totalAmount + totalTax;

        await logAudit({ action: 'MEDICINE_DISPENSED', module: 'Pharmacy', entity_type: 'pharmacy_order', entity_id: orderId.toString(), details: `Items: ${dispensedItems.length}, Total: ${grandTotal}` });

        // Fetch order for integration routing
        const order = await db.pharmacy_orders.findUnique({
            where: { id: orderId },
            include: { items: true },
        });

        let invoiceId: number | null = null;

        if (order?.admission_id && order?.is_ipd_linked) {
            // IPD path: post charges to IPD bill
            for (const detail of dispensedDetails) {
                await postChargeToIpdBill({
                    admission_id: order.admission_id!,
                    source_module: 'pharmacy',
                    source_ref_id: `PHARM-${orderId}-${detail.medicine_id}`,
                    description: `Pharmacy: ${detail.medicine_name} x${detail.quantity}`,
                    quantity: detail.quantity,
                    unit_price: detail.unit_price,
                    tax_rate: detail.tax_rate,
                    hsn_sac_code: detail.hsn_sac_code,
                    service_category: 'Pharmacy',
                });
            }
        } else {
            // OPD path: create formal invoice with GST → GL → GST register
            const cgst = totalTax / 2;
            const sgst = totalTax / 2;

            const invoice = await db.invoices.create({
                data: {
                    invoice_number: generatePharmacyInvoiceNumber(),
                    patient_id: order!.patient_id,
                    invoice_type: 'Pharmacy',
                    status: 'Final',
                    total_amount: totalAmount,
                    total_discount: 0,
                    net_amount: grandTotal,
                    paid_amount: 0,
                    balance_due: grandTotal,
                    total_tax: totalTax,
                    cgst_amount: cgst,
                    sgst_amount: sgst,
                    igst_amount: 0,
                    is_inter_state: false,
                    organizationId,
                }
            });

            for (const detail of dispensedDetails) {
                await db.invoice_items.create({
                    data: {
                        invoice_id: invoice.id,
                        department: 'Pharmacy',
                        description: `${detail.medicine_name} (Batch: ${detail.batch_no})`,
                        quantity: detail.quantity,
                        unit_price: detail.unit_price,
                        total_price: detail.unit_price * detail.quantity,
                        discount: 0,
                        net_price: detail.net_price,
                        tax_rate: detail.tax_rate,
                        tax_amount: detail.tax_amount,
                        hsn_sac_code: detail.hsn_sac_code,
                        service_category: 'Pharmacy',
                        organizationId,
                    }
                });
            }

            // Link invoice to pharmacy order
            await db.pharmacy_orders.update({
                where: { id: orderId },
                data: { invoice_id: invoice.id }
            });

            invoiceId = invoice.id;

            // Post to GL and GST register
            await postInvoiceToGL(invoice.id).catch(err =>
                console.error('GL posting failed for pharmacy invoice:', invoice.id, err)
            );
            await syncInvoiceToGSTRegister(invoice.id).catch(err =>
                console.error('GST sync failed for pharmacy invoice:', invoice.id, err)
            );
        }

        revalidatePath('/pharmacy/orders');
        revalidatePath('/pharmacy/billing');
        return {
            success: true,
            total: grandTotal,
            subtotal: totalAmount,
            tax: totalTax,
            invoice_id: invoiceId,
            ipd_posted: !!(order?.admission_id && order?.is_ipd_linked),
        };
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

export async function createSupplier(data: {
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    gst_no?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const supplier = await db.pharmacySupplier.create({
            data: {
                name: data.name,
                contact_person: data.contact_person || null,
                phone: data.phone || null,
                email: data.email || null,
                gst_no: data.gst_no || null,
                is_active: true,
                organizationId,
            }
        });
        revalidatePath('/pharmacy/suppliers');
        return { success: true, data: supplier };
    } catch (error) {
        return { success: false, error: 'Failed to create supplier' };
    }
}

export async function updateSupplier(id: number, data: {
    name?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    gst_no?: string;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();
        const supplier = await db.pharmacySupplier.update({
            where: { id },
            data,
        });
        revalidatePath('/pharmacy/suppliers');
        return { success: true, data: supplier };
    } catch (error) {
        return { success: false, error: 'Failed to update supplier' };
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

export async function processReturn(data: {
    return_type: string,
    medicine_id: number,
    batch_id?: string,
    quantity: number,
    reason: string,
    invoice_id?: number, // link to original invoice for credit note
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        let creditNoteId: number | null = null;
        let refundAmount = 0;

        await db.$transaction(async (tx: any) => {
            // Get medicine details for value calculation
            const medicine = await tx.pharmacy_medicine_master.findUnique({
                where: { id: data.medicine_id }
            });
            const unitPrice = Number(medicine?.selling_price) || Number(medicine?.price_per_unit) || 0;
            const taxRate = Number(medicine?.gst_percent) || Number(medicine?.tax_rate) || 0;
            const netPrice = unitPrice * data.quantity;
            const taxAmount = netPrice * taxRate / 100;
            refundAmount = netPrice + taxAmount;

            await tx.pharmacyReturn.create({
                data: {
                    return_type: data.return_type,
                    medicine_id: data.medicine_id,
                    batch_id: data.batch_id,
                    quantity: data.quantity,
                    reason: data.reason,
                    processed_by: session.id,
                    organizationId
                }
            });

            if (data.batch_id && data.return_type === 'Patient') {
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
                    await tx.pharmacy_batch_inventory.update({
                        where: { id: existingBatch.id },
                        data: { current_stock: { decrement: data.quantity } }
                    });
                }
            }
        });

        // Create credit note if linked to an invoice (patient returns)
        if (data.invoice_id && data.return_type === 'Patient' && refundAmount > 0) {
            const { createCreditNote } = await import('@/app/actions/deposit-actions');
            const medicine = await db.pharmacy_medicine_master.findUnique({ where: { id: data.medicine_id } });

            const cnResult = await createCreditNote({
                original_invoice_id: data.invoice_id,
                reason: `Pharmacy return: ${medicine?.brand_name || 'Medicine'} x${data.quantity} — ${data.reason}`,
                items: JSON.stringify([{
                    medicine_id: data.medicine_id,
                    medicine_name: medicine?.brand_name,
                    quantity: data.quantity,
                    unit_price: Number(medicine?.selling_price) || 0,
                    amount: refundAmount,
                }]),
                total_amount: refundAmount,
                notes: `Return type: ${data.return_type}, Batch: ${data.batch_id || 'N/A'}`,
            });

            if (cnResult.success) {
                creditNoteId = cnResult.data?.id;
            }

            // Update invoice balance
            const invoice = await db.invoices.findUnique({ where: { id: data.invoice_id } });
            if (invoice) {
                const newNetAmount = Number(invoice.net_amount) - refundAmount;
                const newBalanceDue = newNetAmount - Number(invoice.paid_amount);
                await db.invoices.update({
                    where: { id: data.invoice_id },
                    data: {
                        net_amount: newNetAmount > 0 ? newNetAmount : 0,
                        balance_due: newBalanceDue > 0 ? newBalanceDue : 0,
                    }
                });
            }
        }

        // Audit log for expiry write-offs (finance impact)
        if (data.return_type === 'Expired') {
            await logAudit({
                action: 'PHARMACY_EXPIRY_WRITEOFF',
                module: 'Pharmacy',
                entity_type: 'pharmacy_return',
                details: JSON.stringify({
                    medicine_id: data.medicine_id,
                    quantity: data.quantity,
                    write_off_value: refundAmount,
                    batch: data.batch_id,
                }),
            });
        }

        revalidatePath('/pharmacy/returns');
        revalidatePath('/pharmacy/inventory');
        return { success: true, credit_note_id: creditNoteId, refund_amount: refundAmount };
    } catch (error) {
        console.error('Return processing error:', error);
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

        // Enrich each item with available batches & stock
        const medicineNames = order.items.map((i: any) => i.medicine_name);
        const medicines = await db.pharmacy_medicine_master.findMany({
            where: { brand_name: { in: medicineNames } },
            include: { batches: { where: { current_stock: { gt: 0 } }, orderBy: { expiry_date: 'asc' } } },
        });

        const itemsWithStock = order.items.map((item: any) => {
            const med = medicines.find((m: any) => m.brand_name === item.medicine_name);
            const batches = med?.batches || [];
            const totalStock = batches.reduce((sum: number, b: any) => sum + b.current_stock, 0);
            return {
                ...item,
                available_batches: batches.map((b: any) => ({ batch_no: b.batch_no, stock: b.current_stock, expiry: b.expiry_date })),
                total_stock: totalStock,
            };
        });

        return { success: true, data: { ...order, items: itemsWithStock, patient } };
    } catch (error) {
        return { success: false, error: 'Failed' };
    }
}

// ========================================
// PHARMACY KPI & ANALYTICS
// ========================================

// ========================================
// PHASE 5 PHARMACY ACTIONS
// ========================================

export async function verifyPharmacyOrder(orderId: number, notes?: string) {
    try {
        const { db } = await requireTenantContext();

        await (db.pharmacy_orders as any).update({
            where: { id: orderId },
            data: {
                status: 'Verified',
                verified_by: 'Pharmacist',
                verified_at: new Date(),
                verification_notes: notes || null,
            },
        });

        await logAudit({
            action: 'PHARMACY_ORDER_VERIFIED',
            module: 'Pharmacy',
            entity_type: 'pharmacy_order',
            entity_id: String(orderId),
            details: JSON.stringify({ notes }),
        });

        revalidatePath('/pharmacy/ip-orders');
        revalidatePath('/pharmacy/orders');
        return { success: true };
    } catch (error: any) {
        console.error('Verify Order Error:', error);
        return { success: false, error: error.message };
    }
}

export async function getNarcoticRegister(drugName?: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const entries = await (db.narcoticRegister as any).findMany({
            where: {
                organizationId,
                ...(drugName ? { drug_name: drugName } : {}),
            },
            orderBy: { created_at: 'desc' },
        });

        return { success: true, data: entries };
    } catch (error) {
        console.error('Get Narcotic Register Error:', error);
        return { success: false, data: [] };
    }
}

export async function addNarcoticEntry(data: {
    drug_name: string;
    batch_no?: string;
    patient_name?: string;
    prescriber_name?: string;
    witness_name?: string;
    quantity_in?: number;
    quantity_out?: number;
    transaction_type: string;
    notes?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        // Get last entry for this drug to calculate running balance
        const lastEntry = await (db.narcoticRegister as any).findFirst({
            where: { organizationId, drug_name: data.drug_name },
            orderBy: { created_at: 'desc' },
        });

        const prevBalance = lastEntry ? Number(lastEntry.balance) : 0;
        const qtyIn = Number(data.quantity_in || 0);
        const qtyOut = Number(data.quantity_out || 0);
        const balance = prevBalance + qtyIn - qtyOut;

        const entry = await (db.narcoticRegister as any).create({
            data: {
                organizationId,
                drug_name: data.drug_name,
                batch_no: data.batch_no || null,
                patient_name: data.patient_name || null,
                prescriber_name: data.prescriber_name || null,
                witness_name: data.witness_name || null,
                quantity_in: qtyIn,
                quantity_out: qtyOut,
                balance,
                transaction_type: data.transaction_type,
                notes: data.notes || null,
            },
        });

        await logAudit({
            action: 'NARCOTIC_ENTRY_ADDED',
            module: 'Pharmacy',
            entity_type: 'narcotic_register',
            entity_id: entry.id,
            details: JSON.stringify({ drug_name: data.drug_name, transaction_type: data.transaction_type, balance }),
        });

        revalidatePath('/pharmacy/narcotics');
        return { success: true, data: entry };
    } catch (error: any) {
        console.error('Add Narcotic Entry Error:', error);
        return { success: false, error: error.message };
    }
}

export async function generatePullSheet(wardId?: string) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const wardStockItems = await (db.ward_stock as any).findMany({
            where: {
                organizationId,
                ...(wardId ? { ward_id: Number(wardId) } : {}),
            },
        });

        const pullItems = wardStockItems
            .filter((item: any) => item.quantity < item.min_quantity)
            .map((item: any) => ({
                medicine_name: item.medicine_name,
                current_quantity: item.quantity,
                required_quantity: item.min_quantity - item.quantity,
                rack_location: item.rack_location || null,
            }))
            .sort((a: any, b: any) => a.medicine_name.localeCompare(b.medicine_name));

        return { success: true, data: pullItems };
    } catch (error: any) {
        console.error('Generate Pull Sheet Error:', error);
        return { success: false, data: [] };
    }
}

export async function getGenericAlternatives(genericName: string) {
    try {
        const { db } = await requireTenantContext();

        const alternatives = await db.pharmacy_medicine_master.findMany({
            where: {
                generic_name: genericName,
                is_active: true,
            },
            select: {
                id: true,
                brand_name: true,
                mrp: true,
                category: true,
            },
        });

        return {
            success: true,
            data: alternatives.map((m: any) => ({
                id: m.id,
                name: m.brand_name,
                mrp: m.mrp,
                category: m.category,
            })),
        };
    } catch (error) {
        console.error('Get Generic Alternatives Error:', error);
        return { success: false, data: [] };
    }
}

export async function getPharmacyAnalytics() {
    try {
        const { db } = await requireTenantContext();

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        // Parallel fetch all data
        const [
            allMedicines,
            allBatches,
            completedOrders30d,
            completedOrdersToday,
            pendingCount,
            returns30d,
            purchaseOrders30d,
        ] = await Promise.all([
            db.pharmacy_medicine_master.findMany({ include: { batches: true } }),
            db.pharmacy_batch_inventory.findMany({ include: { medicine: true } }),
            db.pharmacy_orders.findMany({
                where: { status: 'Completed', created_at: { gte: thirtyDaysAgo } },
                include: { items: true },
            }),
            db.pharmacy_orders.findMany({
                where: { status: 'Completed', created_at: { gte: today } },
            }),
            db.pharmacy_orders.count({ where: { status: 'Pending' } }),
            db.pharmacyReturn.findMany({
                where: { created_at: { gte: thirtyDaysAgo } },
            }),
            db.purchaseOrder.findMany({
                where: { created_at: { gte: thirtyDaysAgo }, status: 'Received' },
                include: { items: true },
            }),
        ]);

        // -- Revenue metrics --
        const todayRevenue = completedOrdersToday.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
        const revenue30d = completedOrders30d.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
        const avgDailyRevenue = revenue30d / 30;

        // -- Revenue by day (last 7 days) --
        const revenueByDay: { date: string; revenue: number; orders: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            const dayOrders = completedOrders30d.filter((o: any) => {
                const created = new Date(o.created_at);
                return created >= dayStart && created < dayEnd;
            });
            revenueByDay.push({
                date: dayStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
                revenue: dayOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0),
                orders: dayOrders.length,
            });
        }

        // -- Stock metrics --
        const totalStockValue = allBatches.reduce((sum: number, b: any) => {
            const price = Number(b.medicine?.selling_price) || Number(b.medicine?.price_per_unit) || 0;
            return sum + (price * b.current_stock);
        }, 0);

        const lowStockMedicines = allMedicines.filter((med: any) => {
            const totalStock = (med.batches as any[]).reduce((s: number, b: any) => s + b.current_stock, 0);
            return totalStock > 0 && totalStock <= med.min_threshold;
        });

        const outOfStockMedicines = allMedicines.filter((med: any) => {
            const totalStock = (med.batches as any[]).reduce((s: number, b: any) => s + b.current_stock, 0);
            return totalStock === 0;
        });

        // -- Expiry tiers --
        const activeBatches = allBatches.filter((b: any) => b.current_stock > 0);
        const expired = activeBatches.filter((b: any) => new Date(b.expiry_date) < now);
        const expiring30 = activeBatches.filter((b: any) => {
            const exp = new Date(b.expiry_date);
            return exp >= now && exp <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        });
        const expiring60 = activeBatches.filter((b: any) => {
            const exp = new Date(b.expiry_date);
            return exp > new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) && exp <= new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        });
        const expiring90 = activeBatches.filter((b: any) => {
            const exp = new Date(b.expiry_date);
            return exp > new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) && exp <= ninetyDays;
        });

        const expiryWriteOffValue = expired.reduce((sum: number, b: any) => {
            const price = Number(b.medicine?.selling_price) || Number(b.medicine?.price_per_unit) || 0;
            return sum + (price * b.current_stock);
        }, 0);

        // -- Top movers (by qty dispensed) --
        const medSales = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const order of completedOrders30d) {
            for (const item of (order as any).items) {
                const key = item.medicine_name;
                const existing = medSales.get(key) || { name: key, qty: 0, revenue: 0 };
                existing.qty += item.quantity_dispensed || item.quantity_requested || 0;
                existing.revenue += Number(item.total_price) || 0;
                medSales.set(key, existing);
            }
        }
        const topMovers = Array.from(medSales.values())
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10);

        // -- Returns summary --
        const patientReturns = returns30d.filter((r: any) => r.return_type === 'Patient' || r.return_type === 'patient_return');
        const expiryReturns = returns30d.filter((r: any) => r.return_type === 'Expired' || r.return_type === 'expired_stock');

        // -- Purchase cost (COGS proxy) --
        const purchaseCost30d = purchaseOrders30d.reduce((sum: number, po: any) => sum + Number(po.total_amount), 0);
        const grossMargin = revenue30d > 0 ? ((revenue30d - purchaseCost30d) / revenue30d * 100) : 0;

        return {
            success: true,
            data: {
                // Summary KPIs
                todayRevenue,
                revenue30d,
                avgDailyRevenue,
                pendingOrders: pendingCount,
                totalStockValue,
                grossMarginPct: Math.round(grossMargin * 10) / 10,

                // Stock health
                lowStockCount: lowStockMedicines.length,
                outOfStockCount: outOfStockMedicines.length,
                lowStockItems: lowStockMedicines.map((m: any) => ({
                    name: m.brand_name,
                    stock: (m.batches as any[]).reduce((s: number, b: any) => s + b.current_stock, 0),
                    threshold: m.min_threshold,
                })).slice(0, 10),

                // Expiry tiers
                expiredCount: expired.length,
                expiring30Count: expiring30.length,
                expiring60Count: expiring60.length,
                expiring90Count: expiring90.length,
                expiryWriteOffValue,

                // Revenue trend
                revenueByDay,

                // Top movers
                topMovers,

                // Returns
                patientReturnsCount: patientReturns.length,
                expiryWriteOffsCount: expiryReturns.length,
                totalReturns30d: returns30d.length,

                // Orders
                ordersCompleted30d: completedOrders30d.length,
            }
        };
    } catch (error) {
        console.error('Analytics Error:', error);
        return { success: false, error: 'Failed to load analytics' };
    }
}
